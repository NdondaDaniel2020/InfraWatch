"""Testes unitários do cronograma em memória (InMemorySchedule)."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.workers.scheduler.in_memory_inventory import InMemorySchedule, ProbeTarget


@pytest.fixture
def schedule() -> InMemorySchedule:
    return InMemorySchedule()


@pytest.fixture
def target_factory():
    def _make(id_override=None, status="UP", is_paused=False, name="Router A"):
        return ProbeTarget(
            device_id=id_override or uuid4(),
            organization_id=uuid4(),
            name=name,
            ip_address="10.0.0.1",
            port=22,
            protocol="ssh",
            category="ROUTER",
            interval_seconds=60,
            status=status,
            is_paused=is_paused,
        )
    return _make


@pytest.mark.asyncio
async def test_add_and_get(schedule: InMemorySchedule, target_factory):
    target = target_factory()
    await schedule.add_or_update(target)
    
    retrieved = await schedule.get(target.device_id)
    assert retrieved is not None
    assert retrieved.name == target.name
    assert schedule.count == 1


@pytest.mark.asyncio
async def test_remove(schedule: InMemorySchedule, target_factory):
    target = target_factory()
    await schedule.add_or_update(target)
    
    removed = await schedule.remove(target.device_id)
    assert removed is True
    assert schedule.count == 0
    
    removed_again = await schedule.remove(target.device_id)
    assert removed_again is False


@pytest.mark.asyncio
async def test_pause_and_resume(schedule: InMemorySchedule, target_factory):
    target = target_factory()
    await schedule.add_or_update(target)
    
    await schedule.pause(target.device_id)
    retrieved = await schedule.get(target.device_id)
    assert retrieved.is_paused is True
    assert retrieved.status == "PAUSED"
    
    await schedule.resume(target.device_id)
    retrieved = await schedule.get(target.device_id)
    assert retrieved.is_paused is False
    assert retrieved.status == "UP"


@pytest.mark.asyncio
async def test_get_active_targets(schedule: InMemorySchedule, target_factory):
    t1 = target_factory(status="UP")
    t2 = target_factory(status="PAUSED", is_paused=True)
    t3 = target_factory(status="MAINTENANCE")
    t4 = target_factory(status="DEGRADED")
    
    await schedule.bulk_load([t1, t2, t3, t4])
    
    active = await schedule.get_active_targets()
    assert len(active) == 2
    active_ids = {t.device_id for t in active}
    assert t1.device_id in active_ids
    assert t4.device_id in active_ids


@pytest.mark.asyncio
async def test_reconcile_adds_missing(schedule: InMemorySchedule, target_factory):
    t1 = target_factory(name="In DB")
    db_targets = [t1]
    
    stats = await schedule.reconcile(db_targets)
    assert stats["added"] == 1
    assert stats["updated"] == 0
    assert stats["removed"] == 0
    assert schedule.count == 1


@pytest.mark.asyncio
async def test_reconcile_removes_stale(schedule: InMemorySchedule, target_factory):
    t1 = target_factory(name="In Mem")
    await schedule.add_or_update(t1)
    
    db_targets = []
    
    stats = await schedule.reconcile(db_targets)
    assert stats["added"] == 0
    assert stats["updated"] == 0
    assert stats["removed"] == 1
    assert schedule.count == 0


@pytest.mark.asyncio
async def test_reconcile_updates_outdated(schedule: InMemorySchedule, target_factory):
    dev_id = uuid4()
    old_time = datetime.now(UTC) - timedelta(minutes=10)
    new_time = datetime.now(UTC)
    
    # Target in memory is older
    t_mem = target_factory(id_override=dev_id, name="Old Name")
    t_mem.updated_at = old_time
    await schedule.add_or_update(t_mem)
    
    # Target in DB is newer
    t_db = target_factory(id_override=dev_id, name="New Name")
    t_db.updated_at = new_time
    
    stats = await schedule.reconcile([t_db])
    assert stats["added"] == 0
    assert stats["updated"] == 1
    assert stats["removed"] == 0
    
    retrieved = await schedule.get(dev_id)
    assert retrieved.name == "New Name"
