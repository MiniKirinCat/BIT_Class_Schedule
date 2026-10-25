import asyncio
import contextlib
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.config import AppConfig
from app.scheduler import SyncScheduler
from app.sync_service import SyncBusyError

TZ = ZoneInfo("Asia/Shanghai")
NOW = datetime(2026, 10, 26, 9, 0, tzinfo=TZ)


class FakeService:
    def __init__(self):
        self.configured = True
        self.due = True
        self.busy = False
        self.due_error = None
        self.sync_error = None
        self.calls = []

    def is_configured(self):
        return self.configured

    def is_due(self, now=None):
        if self.due_error is not None:
            raise self.due_error
        return self.due

    async def sync(self, trigger="scheduled", *, now=None):
        if self.busy:
            raise SyncBusyError("busy")
        if self.sync_error is not None:
            raise self.sync_error
        self.calls.append((trigger, now))
        return "success"


class BlockingService(FakeService):
    """Blocks the first sync until released, then behaves normally."""

    def __init__(self):
        super().__init__()
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.block_first = True

    async def sync(self, trigger="scheduled", *, now=None):
        if self.block_first:
            self.block_first = False
            self.entered.set()
            await self.release.wait()
        self.calls.append((trigger, now))
        return "success"


def make_scheduler(service, seconds=3600):
    return SyncScheduler(service, AppConfig(scheduler_check_seconds=seconds))


def test_tick_runs_due_sync():
    service = FakeService()
    scheduler = make_scheduler(service)

    assert asyncio.run(scheduler.tick(NOW)) is True
    assert service.calls == [("scheduled", NOW)]


def test_tick_skips_unconfigured_or_not_due():
    service = FakeService()
    service.configured = False
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False
    assert service.calls == []

    service = FakeService()
    service.due = False
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False
    assert service.calls == []


def test_tick_swallows_lock_conflict():
    service = FakeService()
    service.busy = True
    assert asyncio.run(make_scheduler(service).tick(NOW)) is False
    assert service.calls == []


def test_tick_propagates_unexpected_sync_errors():
    service = FakeService()
    service.sync_error = RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        asyncio.run(make_scheduler(service).tick(NOW))


def test_start_and_stop_loop():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=0.01)

    async def scenario():
        scheduler.start()
        await asyncio.sleep(0.04)
        await scheduler.stop()

    asyncio.run(scenario())
    assert len(service.calls) >= 1
    assert scheduler._task is None


def test_start_runs_first_tick_without_waiting_for_interval():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=3600)

    async def scenario():
        scheduler.start()
        await asyncio.sleep(0.03)
        assert service.calls == [("scheduled", None)]
        await scheduler.stop()

    asyncio.run(scenario())
    assert scheduler._task is None


def test_tick_accepts_custom_trigger():
    service = FakeService()
    scheduler = make_scheduler(service)

    assert asyncio.run(scheduler.tick(NOW, trigger="startup")) is True
    assert service.calls == [("startup", NOW)]


def test_start_uses_initial_trigger_only_for_first_tick():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=0.01)

    async def scenario():
        scheduler.start(initial_trigger="startup")
        await asyncio.sleep(0.08)
        await scheduler.stop()

    asyncio.run(scenario())
    triggers = [trigger for trigger, _ in service.calls]
    assert triggers[0] == "startup"
    assert len(triggers) >= 2
    assert all(trigger == "scheduled" for trigger in triggers[1:])
    assert scheduler._task is None


def test_restart_after_stop_ticks_again():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=3600)

    async def scenario():
        scheduler.start()
        await asyncio.sleep(0.03)
        await scheduler.stop()
        assert service.calls == [("scheduled", None)]

        scheduler.start()
        await asyncio.sleep(0.03)
        await scheduler.stop()

    asyncio.run(scenario())
    assert service.calls == [("scheduled", None), ("scheduled", None)]
    assert scheduler._task is None


def test_stop_waits_for_in_flight_sync():
    service = BlockingService()
    scheduler = make_scheduler(service, seconds=3600)

    async def scenario():
        scheduler.start()
        await asyncio.wait_for(service.entered.wait(), timeout=1.0)

        stop_task = asyncio.create_task(scheduler.stop())
        await asyncio.sleep(0)
        assert not stop_task.done()

        service.release.set()
        await asyncio.wait_for(stop_task, timeout=1.0)
        assert service.calls == [("scheduled", None)]
        assert scheduler._task is None

    asyncio.run(scenario())


def test_cancelled_stop_clears_task_and_allows_restart():
    service = BlockingService()
    scheduler = make_scheduler(service, seconds=3600)

    async def scenario():
        scheduler.start()
        runner = scheduler._task
        await asyncio.wait_for(service.entered.wait(), timeout=1.0)

        stop_task = asyncio.create_task(scheduler.stop())
        await asyncio.sleep(0)
        assert not stop_task.done()

        stop_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.wait_for(stop_task, timeout=1.0)

        assert scheduler._task is None
        assert runner.done()
        assert runner.cancelled()

        # The cancelled stop must not block a fresh start.
        scheduler.start()
        await asyncio.sleep(0.03)
        await scheduler.stop()

    asyncio.run(scenario())
    assert service.calls == [("scheduled", None)]
    assert scheduler._task is None


def test_stop_without_start_and_repeated_stop_are_safe():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=0.01)

    async def scenario():
        await scheduler.stop()
        await scheduler.stop()
        scheduler.start()
        await scheduler.stop()
        await scheduler.stop()

    asyncio.run(scenario())
    assert scheduler._task is None


def test_start_is_idempotent_while_running():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=60)

    async def scenario():
        scheduler.start()
        first = scheduler._task
        scheduler.start()
        assert scheduler._task is first
        await scheduler.stop()

    asyncio.run(scenario())
    assert scheduler._task is None


def test_stop_suppresses_cancelled_task():
    service = FakeService()
    scheduler = make_scheduler(service, seconds=60)

    async def scenario():
        scheduler.start()
        scheduler._task.cancel()
        await scheduler.stop()
        assert scheduler._task is None

    asyncio.run(scenario())


def test_run_logs_sanitized_failure_and_keeps_looping(caplog):
    service = FakeService()
    service.due_error = RuntimeError("boom password=supersecret")
    scheduler = make_scheduler(service, seconds=0.005)

    async def scenario():
        scheduler.start()
        await asyncio.sleep(0.05)
        await scheduler.stop()

    with caplog.at_level(logging.ERROR, logger="next_class.scheduler"):
        asyncio.run(scenario())

    messages = [record.getMessage() for record in caplog.records]
    failures = [message for message in messages if "scheduler tick failed" in message]
    assert len(failures) >= 2
    assert all("supersecret" not in message for message in messages)
    assert all(record.exc_info is None for record in caplog.records)
