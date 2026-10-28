import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from math import ceil
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .cloud import CloudError, build_archive_payload, normalize_pages_url
from .config import PROJECT_ROOT, AppConfig
from .container import Container, build_container
from .diagnostics import build_report, run_preflight, sync_run_payload
from .security import CredentialError, redact, safe_message
from .startup import (
    StartupError,
    disable_startup,
    enable_startup,
    startup_status,
)
from .sync_service import SyncBusyError

logger = logging.getLogger("next_class.api")
TZ = ZoneInfo("Asia/Shanghai")


class SchoolSetup(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class NotificationSetup(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    test: bool = False


class CloudSetup(BaseModel):
    token: str = Field(default="", max_length=512)
    pages_url: str = Field(default="", max_length=512)
    gist_id: str = Field(default="", max_length=128)


class SettingsUpdate(BaseModel):
    sync_interval_days: int | None = Field(default=None, ge=1, le=3)
    push_enabled: bool | None = None


class StartupUpdate(BaseModel):
    enabled: bool


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


def _cloud_fields(container: Container) -> dict:
    return {
        "cloud_configured": container.cloud.is_configured(),
        "cloud_pages_url": container.cloud.pages_url or None,
        "cloud_gist_id": container.settings.get("gist_id"),
        "cloud_last_publish_at": container.settings.get("last_cloud_publish_at"),
        "cloud_last_error": container.settings.get("last_cloud_error"),
        "cloud_qr_ready": container.cloud.qr_ready,
    }


def _status_payload(container: Container) -> dict:
    last_run = container.snapshots.latest_sync_run()
    next_due = container.sync_service.next_due_at()
    username = _credential(container, "school_username")
    password = _credential(container, "school_password")
    return {
        "configured": bool(username and password),
        "school_configured": bool(username and password),
        "school_username": username,
        "push_configured": bool(_credential(container, "serverchan_sendkey")),
        **_cloud_fields(container),
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
        "push_configured": bool(_credential(container, "serverchan_sendkey")),
        **_cloud_fields(container),
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
    records = container.snapshots.latest_per_term()
    payload = build_archive_payload(
        app_version=container.config.app_version,
        synced_at=snapshot.fetched_at,
        sync_interval_days=container.settings.get_int("sync_interval_days", 1),
        current_term=snapshot.term,
        records=records,
        changes_by_term={
            record.term: [
                _change_payload(row)
                for row in container.snapshots.changes_for_term(
                    record.term, limit=50
                )
            ]
            for record in records
        },
    )
    payload.update(
        {
            "sync_status": last_run["status"] if last_run else None,
            "last_attempt_at": container.settings.get("last_attempt_sync_at"),
            "next_due_at": next_due.isoformat(timespec="seconds"),
            "cloud_status": last_run["cloud_publish_status"] if last_run else "skipped",
            "last_error": container.settings.get("last_sync_error"),
            "configured": container.sync_service.is_configured(),
        }
    )
    return payload


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
        try:
            active.db.initialize()
            active.snapshots.fail_interrupted_runs(
                datetime.now(TZ).isoformat(timespec="seconds")
            )
            if active.settings.get("app_schema_version") is None:
                active.settings.set("app_schema_version", "1")
            if active.settings.get("sync_interval_days") is None:
                active.settings.set_int("sync_interval_days", 1)
            if config.scheduler_enabled:
                active.scheduler.start(initial_trigger="startup")
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

    @app.middleware("http")
    async def catch_unhandled(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.error("unhandled API error: %s", safe_message(exc))
            return JSONResponse(status_code=500, content={"detail": "服务内部错误"})

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
            active.credentials.get("school_username")
        except CredentialError as exc:
            raise HTTPException(
                status_code=503,
                detail="Windows 凭据管理器不可用，无法保存账号；请先修复后再登录",
            ) from exc
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

    @app.post("/api/setup/notifications")
    def setup_notifications(payload: NotificationSetup, request: Request) -> dict:
        active = _container(request)
        token = payload.token.strip()
        if not token:
            raise HTTPException(status_code=422, detail="Server酱 SendKey 不能为空")
        try:
            active.credentials.set("serverchan_sendkey", token)
        except CredentialError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        active.settings.set_bool("push_enabled", True)
        if payload.test:
            try:
                active.notifier.send(
                    "下一节测试提醒",
                    "如果你看到这条消息，Server酱 微信提醒已经配置成功。",
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=502,
                    detail=redact(str(exc)) or "测试提醒发送失败",
                ) from exc
        return {"configured": True, "tested": payload.test}

    @app.post("/api/setup/cloud")
    def setup_cloud(payload: CloudSetup, request: Request) -> dict:
        active = _container(request)
        token = payload.token.strip()
        if not token and not _credential(active, "github_token"):
            raise HTTPException(status_code=422, detail="请输入 GitHub token")
        if payload.pages_url.strip():
            try:
                normalize_pages_url(payload.pages_url)
            except CloudError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            return active.cloud.setup(
                token=token,
                pages_url=payload.pages_url,
                gist_id=payload.gist_id,
            )
        except CloudError as exc:
            status = 503 if "凭据管理器" in str(exc) else 502
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    @app.get("/api/setup/qr")
    def setup_qr(request: Request) -> Response:
        active = _container(request)
        try:
            svg = active.cloud.qr_svg()
        except CloudError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(
            content=svg,
            media_type="image/svg+xml",
            headers={"Cache-Control": "no-store"},
        )

    @app.post("/api/cloud/publish")
    def publish_cloud(request: Request) -> dict:
        active = _container(request)
        if not active.cloud.is_configured():
            raise HTTPException(status_code=400, detail="请先完成云端快照配置")
        if active.snapshots.latest() is None:
            raise HTTPException(status_code=400, detail="还没有课表快照，请先同步")
        try:
            published_at = active.cloud.publish_current()
        except CloudError as exc:
            status = 503 if "凭据管理器" in str(exc) else 502
            raise HTTPException(status_code=status, detail=str(exc)) from exc
        return {"status": "success", "published_at": published_at}

    @app.post("/api/cloud/reset-key")
    def reset_cloud_key(request: Request) -> dict:
        active = _container(request)
        if not active.cloud.is_configured():
            raise HTTPException(status_code=400, detail="请先完成云端快照配置")
        try:
            return active.cloud.reset_key()
        except CloudError as exc:
            status = 503 if "凭据管理器" in str(exc) else 502
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    @app.post("/api/sync")
    async def sync_now(request: Request) -> dict:
        active = _container(request)
        if not active.sync_service.is_configured():
            raise HTTPException(status_code=400, detail="请先在设置中连接教务账号")
        if active.sync_service.is_busy:
            raise HTTPException(status_code=409, detail="同步正在进行中，请稍候")
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

    @app.get("/api/system/startup")
    def get_startup() -> dict:
        return startup_status()

    @app.put("/api/system/startup")
    def update_startup(payload: StartupUpdate) -> dict:
        try:
            if payload.enabled:
                enable_startup(PROJECT_ROOT)
            else:
                disable_startup()
        except StartupError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return startup_status()

    @app.get("/api/sync-runs")
    def sync_runs(request: Request, limit: int = 5) -> dict:
        active = _container(request)
        return {
            "runs": [
                sync_run_payload(row)
                for row in active.snapshots.recent_sync_runs(limit)
            ]
        }

    @app.get("/api/diagnostics")
    def diagnostics(request: Request) -> dict:
        active = _container(request)
        return build_report(
            config=active.config,
            credentials=active.credentials,
            settings=active.settings,
            snapshots=active.snapshots,
        )

    @app.post("/api/diagnostics/preflight")
    def diagnostics_preflight(request: Request) -> dict:
        active = _container(request)
        return run_preflight(active.credentials)

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
            raise HTTPException(status_code=400, detail="请先配置 Server酱 SendKey")
        try:
            active.notifier.send(
                "下一节测试提醒",
                "如果你看到这条消息，Server酱 微信提醒已经配置成功。",
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
