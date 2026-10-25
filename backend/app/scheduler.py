import asyncio
import contextlib
import logging
from datetime import datetime

from .config import AppConfig
from .security import safe_message
from .sync_service import SyncBusyError, SyncService


class SyncScheduler:
    def __init__(
        self,
        service: SyncService,
        config: AppConfig,
        logger: logging.Logger | None = None,
    ):
        self._service = service
        self._config = config
        self._logger = logger or logging.getLogger("next_class.scheduler")
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None

    async def tick(self, now: datetime | None = None) -> bool:
        if not self._service.is_configured():
            return False
        if not self._service.is_due(now):
            return False
        try:
            await self._service.sync("scheduled", now=now)
        except SyncBusyError:
            return False
        return True

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception as exc:
                # Tracebacks can render raw exception text (possible secrets),
                # so log only a sanitized message.
                self._logger.error("scheduler tick failed: %s", safe_message(exc))
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=self._config.scheduler_check_seconds,
                )
            except TimeoutError:
                pass

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
