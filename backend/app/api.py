from fastapi import FastAPI

from .config import AppConfig


def create_app(config: AppConfig | None = None) -> FastAPI:
    app = FastAPI(title="下一节", version=(config or AppConfig()).app_version)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
