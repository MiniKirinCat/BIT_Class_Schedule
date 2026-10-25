import json
from contextlib import asynccontextmanager
from math import ceil

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import AppConfig
from .container import Container, build_container
from .schedule import PERIOD_TIMES
from .security import CredentialError, redact
from .sync_service import SyncBusyError


class SchoolSetup(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class PushSetup(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    test: bool = False


class SettingsUpdate(BaseModel):
    sync_interval_days: int | None = Field(default=None, ge=1, le=3)
    push_enabled: bool | None = None


def _container(request: Request) -> Container:
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise HTTPException(status_code=500, detail="服务尚未初始化")
    return container


def _credential(container: Container, key: str) -> str | None:
    try:
        return container.credentials.get(key)
    except CredentialError:
        return None


def _status_payload(container: Container) -> dict:
    last_run = container.snapshots.latest_sync_run()
    next_due = container.sync_service.next_due_at()
    username = _credential(container, "school_username")
    password = _credential(container, "school_password")
    return {
        "configured": bool(username and password),
        "school_configured": bool(username and password),
        "school_username": username,
        "push_configured": bool(_credential(container, "pushplus_token")),
        "cloud_configured": False,
        "last_sync_at": container.settings.get("last_success_sync_at"),
        "last_attempt_at": container.settings.get("last_attempt_sync_at"),
        "next_due_at": next_due.isoformat(timespec="seconds"),
        "sync_status": last_run["status"] if last_run else None,
        "last_error": container.settings.get("last_sync_error"),
        "notification_error": container.settings.get("last_notification_error"),
        "cloud_status": last_run["cloud_publish_status"] if last_run else "skipped",
        "version": container.config.app_version,
    }


def _settings_payload(container: Container) -> dict:
    return {
        "sync_interval_days": container.settings.get_int("sync_interval_days", 1),
        "push_enabled": container.settings.get_bool("push_enabled", False),
        "school_configured": bool(
            _credential(container, "school_username")
            and _credential(container, "school_password")
        ),
        "push_configured": bool(_credential(container, "pushplus_token")),
        "cloud_configured": False,
    }


def _change_payload(row: dict) -> dict:
    try:
        details = json.loads(row.get("details_json") or "{}")
    except ValueError:
        details = {}
    if not isinstance(details, dict):
        details = {}
    return {
        "id": row["id"],
        "detected_at": row["detected_at"],
        "type": row["type"],
        "course_code": row["course_code"],
        "course_name": row["course_name"],
        "summary": row["summary"],
        "before": details.get("before"),
        "after": details.get("after"),
    }


def _dashboard_payload(container: Container) -> dict:
    snapshot = container.snapshots.latest()
    if snapshot is None:
        raise HTTPException(status_code=404, detail="还没有课表快照，请先完成同步")

    last_run = container.snapshots.latest_sync_run()
    next_due = container.sync_service.next_due_at()
    return {
        "schema_version": 1,
        "app_version": container.config.app_version,
        "synced_at": snapshot.fetched_at,
        "sync_interval_days": container.settings.get_int("sync_interval_days", 1),
        "term": snapshot.term,
        "first_day": snapshot.first_day,
        "courses": [session.to_dict() for session in snapshot.sessions],
        "changes": [
            _change_payload(row)
            for row in container.snapshots.changes_for_term(snapshot.term, limit=50)
        ],
        "calendar": [entry.to_dict() for entry in snapshot.calendar],
        "period_times": [
            {"index": period.index, "start": period.start, "end": period.end}
            for period in PERIOD_TIMES
        ],
        "sync_status": last_run["status"] if last_run else None,
        "last_attempt_at": container.settings.get("last_attempt_sync_at"),
        "next_due_at": next_due.isoformat(timespec="seconds"),
        "cloud_status": last_run["cloud_publish_status"] if last_run else "skipped",
        "last_error": container.settings.get("last_sync_error"),
        "configured": container.sync_service.is_configured(),
    }


def _sync_result(result) -> dict:
    return {
        "status": result.status,
        "message": result.message,
        "course_count": result.course_count,
        "change_count": result.change_count,
        "cloud_status": result.cloud_status,
        "error_code": result.error_code,
    }


def create_app(
    config: AppConfig | None = None,
    container: Container | None = None,
) -> FastAPI:
    config = config or AppConfig()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active = getattr(app.state, "container", None) or build_container(config)
        app.state.container = active
        active.db.initialize()
        if active.settings.get("app_schema_version") is None:
            active.settings.set("app_schema_version", "1")
        if active.settings.get("sync_interval_days") is None:
            active.settings.set_int("sync_interval_days", 1)
        if config.scheduler_enabled:
            active.scheduler.start(initial_trigger="startup")
        try:
            yield
        finally:
            try:
                await active.scheduler.stop()
            finally:
                # Ownership is enforced by Container.close(); injected notifiers
                # are never closed here.
                active.close()

    app = FastAPI(title="下一节", version=config.app_version, lifespan=lifespan)
    if container is not None:
        app.state.container = container

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": "请求参数不正确"})

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/status")
    def status(request: Request) -> dict:
        return _status_payload(_container(request))

    @app.post("/api/setup/school")
    async def setup_school(payload: SchoolSetup, request: Request) -> dict:
        active = _container(request)
        username = payload.username.strip()
        if not username:
            raise HTTPException(status_code=422, detail="学号不能为空")
        try:
            result = await active.sync_service.sync(
                "manual",
                username=username,
                password=payload.password,
            )
        except SyncBusyError as exc:
            raise HTTPException(status_code=409, detail="同步正在进行中，请稍候") from exc
        if result.status == "failed":
            raise HTTPException(
                status_code=502,
                detail=result.message or "连接教务系统失败",
            )
        try:
            active.credentials.set("school_username", username)
            active.credentials.set("school_password", payload.password)
        except CredentialError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"status": result.status, "configured": True}

    @app.post("/api/setup/pushplus")
    def setup_pushplus(payload: PushSetup, request: Request) -> dict:
        active = _container(request)
        token = payload.token.strip()
        if not token:
            raise HTTPException(status_code=422, detail="PushPlus token 不能为空")
        try:
            active.credentials.set("pushplus_token", token)
        except CredentialError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        active.settings.set_bool("push_enabled", True)
        if payload.test:
            try:
                active.notifier.send(
                    "下一节测试提醒",
                    "如果你看到这条消息，微信提醒已经配置成功。",
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=redact(str(exc)) or "测试提醒发送失败",
                ) from exc
        return {"configured": True, "tested": payload.test}

    @app.post("/api/sync")
    async def sync_now(request: Request) -> dict:
        active = _container(request)
        if not active.sync_service.is_configured():
            raise HTTPException(status_code=400, detail="请先在设置中连接教务账号")
        remaining = active.sync_service.manual_cooldown_remaining()
        if remaining > 0:
            minutes = max(1, ceil(remaining / 60))
            raise HTTPException(
                status_code=429,
                detail=f"请等待 {minutes} 分钟后再同步",
            )
        try:
            result = await active.sync_service.sync("manual")
        except SyncBusyError as exc:
            raise HTTPException(status_code=409, detail="同步正在进行中，请稍候") from exc
        return _sync_result(result)

    @app.get("/api/dashboard")
    def dashboard(request: Request) -> dict:
        return _dashboard_payload(_container(request))

    @app.get("/api/settings")
    def get_settings(request: Request) -> dict:
        return _settings_payload(_container(request))

    @app.put("/api/settings")
    def update_settings(payload: SettingsUpdate, request: Request) -> dict:
        active = _container(request)
        if payload.sync_interval_days is not None:
            active.settings.set_int("sync_interval_days", payload.sync_interval_days)
        if payload.push_enabled is not None:
            active.settings.set_bool("push_enabled", payload.push_enabled)
        return _settings_payload(active)

    @app.post("/api/notifications/test")
    def test_notification(request: Request) -> dict:
        active = _container(request)
        if not active.notifier.is_configured():
            raise HTTPException(status_code=400, detail="请先配置 PushPlus token")
        try:
            active.notifier.send(
                "下一节测试提醒",
                "如果你看到这条消息，微信提醒已经配置成功。",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=redact(str(exc)) or "测试提醒发送失败",
            ) from exc
        return {"status": "sent"}

    @app.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    )
    def api_not_found(path: str) -> None:
        # Keep unknown API routes as JSON 404s instead of letting the static
        # frontend mount serve index.html for them.
        raise HTTPException(status_code=404, detail="接口不存在")

    if config.frontend_dir.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=str(config.frontend_dir), html=True),
            name="frontend",
        )

    return app
