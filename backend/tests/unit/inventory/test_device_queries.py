from datetime import UTC, datetime
from uuid import uuid4

from src.contexts.inventory.schemas.device_schemas import DeviceDetail, DeviceListItem
from src.contexts.inventory.schemas.filters import DeviceFilters
from src.core.web.pagination import PaginationParams


def test_mask_ip_address():
    from src.contexts.inventory.schemas.device_schemas import mask_ip_address
    assert mask_ip_address("192.168.1.10") == "***.***.1.10"
    assert mask_ip_address("10.0.0.1") == "***.***.0.1"
    assert mask_ip_address("invalid") == "***"

def test_sanitize_list_item():
    item = DeviceListItem(
        id=uuid4(),
        name="Router",
        category="ROUTER",
        status="UP",
        is_paused=False,
        ip_address="192.168.0.50",
        protocol="ssh",
    )
    # Testa factory for_viewer
    sanitized = DeviceListItem.for_viewer(item)
    assert sanitized is not item
    assert sanitized.ip_address == "***.***.0.50"
    assert sanitized.name == "Router"
    assert item.ip_address == "192.168.0.50"

    # Testa retrocompatibilidade de sanitize_for_viewer
    legacy_sanitized = DeviceListItem.sanitize_for_viewer(item)
    assert legacy_sanitized.ip_address == "***.***.0.50"


def test_sanitize_detail():
    detail = DeviceDetail(
        id=uuid4(),
        organization_id=uuid4(),
        name="Core Switch",
        hostname="core-sw",
        ip_address="10.10.10.254",
        port=22,
        protocol="ssh",
        category="SWITCH",
        interval_seconds=60,
        status="UP",
        is_paused=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    # Testa factory for_viewer
    sanitized = DeviceDetail.for_viewer(detail)
    assert sanitized is not detail
    assert sanitized.ip_address == "***.***.10.254"
    assert sanitized.port == 0
    assert detail.port == 22
    assert detail.ip_address == "10.10.10.254"

    # Testa retrocompatibilidade de sanitize_for_viewer
    legacy_sanitized = DeviceDetail.sanitize_for_viewer(detail)
    assert legacy_sanitized.ip_address == "***.***.10.254"
    assert legacy_sanitized.port == 0

def test_device_filters_creation():
    f = DeviceFilters(status="UP", category="ROUTER", protocol="snmp", is_paused=False)
    assert f.status == "UP"
    assert f.category == "ROUTER"
    
def test_pagination_params():
    p = PaginationParams(page=2, page_size=10)
    assert p.limit == 10
    assert p.offset == 10
