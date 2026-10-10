"""Módulo de integração com Zabbix JSON-RPC do InfraWatch."""

from src.integrations.zabbix.client import (
    ZabbixApiError,
    ZabbixAuthError,
    ZabbixClient,
    ZabbixConnectionError,
    ZabbixError,
)
from src.integrations.zabbix.notifier import ZabbixNotifier, get_zabbix_notifier
from src.integrations.zabbix.schemas import (
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
    ZabbixHost,
    ZabbixHostMetrics,
    ZabbixItem,
)

__all__ = [
    "JsonRpcError",
    "JsonRpcRequest",
    "JsonRpcResponse",
    "ZabbixApiError",
    "ZabbixAuthError",
    "ZabbixClient",
    "ZabbixConnectionError",
    "ZabbixError",
    "ZabbixHost",
    "ZabbixHostMetrics",
    "ZabbixItem",
    "ZabbixNotifier",
    "get_zabbix_notifier",
]