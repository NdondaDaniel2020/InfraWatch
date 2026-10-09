"""Testes de importação e compatibilidade reversa dos consumers nos Bounded Contexts (ADR-001)."""

from unittest.mock import MagicMock

# Módulos legados para compatibilidade reversa
import src.workers.consumers as legacy_workers_consumers
import src.workers.consumers.glpi_ticket_consumer as legacy_glpi_module
import src.workers.consumers.inventory_changes_consumer as legacy_inventory_module
from src.contexts.alerting.consumers import (
    CONSUMER_GROUP as ALERTING_CONSUMER_GROUP,
)
from src.contexts.alerting.consumers import (
    CRITICAL_SEVERITIES as ALERTING_CRITICAL_SEVERITIES,
)
from src.contexts.alerting.consumers import (
    STREAM_TOPIC as ALERTING_STREAM_TOPIC,
)
from src.contexts.alerting.consumers import (
    GlpiTicketConsumer,
)
from src.contexts.iam.consumers import IAM_EMAIL_TOPICS, IamEmailConsumer
from src.contexts.inventory.consumers import (
    CONSUMER_GROUP as INVENTORY_CONSUMER_GROUP,
)
from src.contexts.inventory.consumers import (
    STREAM_TOPIC as INVENTORY_STREAM_TOPIC,
)
from src.contexts.inventory.consumers import (
    InventoryChangesConsumer,
)


def test_inventory_changes_consumer_backward_compatibility():
    """Valida que o módulo legado em src.workers.consumers aponta para o bounded context inventory."""
    assert legacy_inventory_module.InventoryChangesConsumer is InventoryChangesConsumer
    assert legacy_inventory_module.STREAM_TOPIC == INVENTORY_STREAM_TOPIC
    assert legacy_inventory_module.CONSUMER_GROUP == INVENTORY_CONSUMER_GROUP
    assert legacy_workers_consumers.InventoryChangesConsumer is InventoryChangesConsumer


def test_glpi_ticket_consumer_backward_compatibility():
    """Valida que o módulo legado em src.workers.consumers aponta para o bounded context alerting."""
    assert legacy_glpi_module.GlpiTicketConsumer is GlpiTicketConsumer
    assert legacy_glpi_module.STREAM_TOPIC == ALERTING_STREAM_TOPIC
    assert legacy_glpi_module.CONSUMER_GROUP == ALERTING_CONSUMER_GROUP
    assert legacy_glpi_module.CRITICAL_SEVERITIES == ALERTING_CRITICAL_SEVERITIES
    assert legacy_workers_consumers.GlpiTicketConsumer is GlpiTicketConsumer


def test_iam_consumers_exports():
    """Valida as exportações do pacote consumers do contexto IAM."""
    assert issubclass(IamEmailConsumer, object)
    assert isinstance(IAM_EMAIL_TOPICS, set)
    assert "PasswordResetRequestedEvent" in IAM_EMAIL_TOPICS


def test_inventory_changes_consumer_initialization():
    """Valida instanciação do InventoryChangesConsumer."""
    mock_schedule = MagicMock()
    mock_event_bus = MagicMock()
    consumer = InventoryChangesConsumer(
        schedule=mock_schedule,
        event_bus=mock_event_bus,
        consumer_name="test-worker",
    )
    assert consumer.consumer_name == "test-worker"
    assert consumer.schedule is mock_schedule
    assert consumer.event_bus is mock_event_bus


def test_glpi_ticket_consumer_initialization():
    """Valida instanciação do GlpiTicketConsumer."""
    mock_event_bus = MagicMock()
    consumer = GlpiTicketConsumer(
        event_bus=mock_event_bus,
        glpi_base_url="https://glpi.example.com",
        glpi_app_token="app-tok",
        glpi_user_token="user-tok",
        consumer_name="glpi-test-worker",
    )
    assert consumer.consumer_name == "glpi-test-worker"
    assert consumer._glpi_base_url == "https://glpi.example.com"