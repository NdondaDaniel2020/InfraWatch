"""Testes unitários para o PartitionManager (ADR-009)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workers.maintenance.partition_manager import (
    PartitionManager,
    _next_month,
    _partition_name,
    _prev_months,
)


class AsyncContextManager:
    def __init__(self, return_obj=None):
        self.return_obj = return_obj

    async def __aenter__(self):
        return self.return_obj

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


def test_partition_name_helper():
    assert _partition_name(2026, 1) == "metrics_y2026m01"
    assert _partition_name(2026, 10) == "metrics_y2026m10"
    assert _partition_name(2026, 12) == "metrics_y2026m12"


def test_next_month_helper():
    assert _next_month(2026, 5) == (2026, 6)
    assert _next_month(2026, 12) == (2027, 1)


def test_prev_months_helper():
    prev = _prev_months(2026, 2, count=3)
    assert prev == [(2026, 1), (2025, 12), (2025, 11)]


@pytest.fixture
def mock_db_session():
    session = AsyncMock()
    session.begin = MagicMock(return_value=AsyncContextManager(session))
    return session


@pytest.fixture
def mock_session_factory(mock_db_session):
    factory = MagicMock(return_value=AsyncContextManager(mock_db_session))
    factory.mock_session = mock_db_session
    return factory


@pytest.mark.asyncio
async def test_ensure_partition_already_exists(mock_session_factory, mock_db_session):
    pm = PartitionManager(session_factory=mock_session_factory)

    mock_result = MagicMock()
    mock_result.scalar.return_value = 1
    mock_db_session.execute.return_value = mock_result

    created = await pm.ensure_partition(2026, 11)
    assert created is False
    assert mock_db_session.execute.await_count == 1


@pytest.mark.asyncio
async def test_ensure_partition_creates_when_missing(mock_session_factory, mock_db_session):
    pm = PartitionManager(session_factory=mock_session_factory)

    mock_result = MagicMock()
    mock_result.scalar.return_value = None
    mock_db_session.execute.return_value = mock_result

    created = await pm.ensure_partition(2026, 11)
    assert created is True
    # 1 para SELECT pg_class, 1 para CREATE TABLE
    assert mock_db_session.execute.await_count == 2


@pytest.mark.asyncio
async def test_ensure_upcoming_partitions(mock_session_factory):
    pm = PartitionManager(session_factory=mock_session_factory)

    with patch.object(pm, "ensure_partition", new_callable=AsyncMock) as mock_ensure:
        mock_ensure.side_effect = [True, False]
        created_count = await pm.ensure_upcoming_partitions(months_ahead=2)

        assert created_count == 1
        assert mock_ensure.await_count == 2


@pytest.mark.asyncio
async def test_purge_old_partitions(mock_session_factory, mock_db_session):
    pm = PartitionManager(session_factory=mock_session_factory, retention_months=2)

    mock_result_found = MagicMock()
    mock_result_found.scalar.return_value = 1
    mock_db_session.execute.return_value = mock_result_found

    dropped = await pm.purge_old_partitions()
    assert dropped > 0
    assert mock_db_session.execute.await_count > 0


@pytest.mark.asyncio
async def test_run_maintenance(mock_session_factory):
    pm = PartitionManager(session_factory=mock_session_factory)

    with (
        patch.object(pm, "ensure_upcoming_partitions", new_callable=AsyncMock) as mock_upcoming,
        patch.object(pm, "purge_old_partitions", new_callable=AsyncMock) as mock_purge,
    ):
        mock_upcoming.return_value = 2
        mock_purge.return_value = 1

        stats = await pm.run_maintenance()
        assert stats == {"created": 2, "dropped": 1}
        mock_upcoming.assert_awaited_once_with(months_ahead=2)
        mock_purge.assert_awaited_once()
