"""Testes unitários para montagem dinâmica de interface SNMP Zabbix e validação de schemas."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.contexts.inventory.schemas.requests import SnmpConfigSchema
from src.integrations.zabbix.client import ZabbixClient
from src.workers.daemons.zabbix_sync_worker import (
    ZabbixSyncWorker,
    build_zabbix_snmp_interface_details,
)

# ---------------------------------------------------------------------------
# Testes de build_zabbix_snmp_interface_details
# ---------------------------------------------------------------------------


def test_build_zabbix_snmp_details_fallback_none():
    """Valida fallback padrão para SNMPv2c public quando snmp_config é None."""
    details = build_zabbix_snmp_interface_details(None, port=161, ip_address="192.168.1.1")

    assert details["type"] == 2
    assert details["main"] == 1
    assert details["useip"] == 1
    assert details["ip"] == "192.168.1.1"
    assert details["port"] == "161"
    assert details["details"] == {"version": 2, "community": "public"}


def test_build_zabbix_snmp_details_snmp_v1():
    """Valida montagem de interface SNMPv1 com comunidade customizada."""
    config = {
        "version": "v1",
        "community": "empresa_v1_legacy",
        "port": 1161,
    }
    details = build_zabbix_snmp_interface_details(config, ip_address="10.0.0.1")

    assert details["type"] == 2
    assert details["ip"] == "10.0.0.1"
    assert details["port"] == "1161"
    assert details["details"] == {"version": 1, "community": "empresa_v1_legacy"}


def test_build_zabbix_snmp_details_snmp_v2c():
    """Valida montagem de interface SNMPv2c com comunidade customizada."""
    config = {
        "version": "v2c",
        "community": "noc_internal_sec",
    }
    details = build_zabbix_snmp_interface_details(config, port=161, ip_address="10.0.0.2")

    assert details["type"] == 2
    assert details["port"] == "161"
    assert details["details"] == {"version": 2, "community": "noc_internal_sec"}


def test_build_zabbix_snmp_details_snmp_v3_no_auth():
    """Valida montagem de interface SNMPv3 em modo noAuthNoPriv (securitylevel=0)."""
    config = {
        "version": "v3",
        "username": "snmp_user_read",
        "security_level": "noAuthNoPriv",
        "port": 161,
    }
    details = build_zabbix_snmp_interface_details(config, ip_address="10.0.0.3")

    assert details["details"]["version"] == 3
    assert details["details"]["securityname"] == "snmp_user_read"
    assert details["details"]["securitylevel"] == 0
    assert "authprotocol" not in details["details"]
    assert "privprotocol" not in details["details"]


def test_build_zabbix_snmp_details_snmp_v3_auth_no_priv():
    """Valida montagem de interface SNMPv3 em modo authNoPriv (securitylevel=1, authprotocol=3 SHA256)."""
    config = {
        "version": "v3",
        "security_name": "sec_admin",
        "security_level": "authNoPriv",
        "auth_protocol": "SHA256",
        "auth_passphrase": "auth_super_secret",
    }
    details = build_zabbix_snmp_interface_details(config, ip_address="10.0.0.4")

    assert details["details"]["version"] == 3
    assert details["details"]["securityname"] == "sec_admin"
    assert details["details"]["securitylevel"] == 1
    assert details["details"]["authprotocol"] == 3
    assert details["details"]["authpassphrase"] == "auth_super_secret"
    assert "privprotocol" not in details["details"]


def test_build_zabbix_snmp_details_snmp_v3_auth_priv():
    """Valida montagem de interface SNMPv3 em modo authPriv (securitylevel=2, SHA512 + AES256)."""
    config = {
        "version": "v3",
        "username": "corp_admin",
        "security_level": "authPriv",
        "auth_protocol": "SHA512",
        "auth_passphrase": "auth_pass_phrase_123",
        "priv_protocol": "AES256",
        "priv_passphrase": "priv_pass_phrase_456",
    }
    details = build_zabbix_snmp_interface_details(config, ip_address="10.0.0.5")

    assert details["details"]["version"] == 3
    assert details["details"]["securityname"] == "corp_admin"
    assert details["details"]["securitylevel"] == 2
    assert details["details"]["authprotocol"] == 5
    assert details["details"]["authpassphrase"] == "auth_pass_phrase_123"
    assert details["details"]["privprotocol"] == 3
    assert details["details"]["privpassphrase"] == "priv_pass_phrase_456"


# ---------------------------------------------------------------------------
# Testes de Validação do SnmpConfigSchema
# ---------------------------------------------------------------------------


def test_snmp_schema_validation_success_v1():
    schema = SnmpConfigSchema(version="v1", community="mypass")
    assert schema.version == "v1"
    assert schema.community == "mypass"


def test_snmp_schema_validation_success_v3():
    schema = SnmpConfigSchema(
        version="v3",
        security_name="admin_v3",
        security_level="authPriv",
        auth_protocol="SHA256",
        auth_password="password_auth",
        priv_protocol="AES128",
        priv_password="password_priv",
    )
    assert schema.version == "v3"
    assert schema.security_name == "admin_v3"
    assert schema.username == "admin_v3"
    assert schema.security_level == "authPriv"
    assert schema.auth_passphrase == "password_auth"
    assert schema.priv_passphrase == "password_priv"


def test_snmp_schema_validation_invalid_version():
    with pytest.raises(ValueError, match="Versão SNMP inválida"):
        SnmpConfigSchema(version="v4")


def test_snmp_schema_validation_v3_missing_username():
    with pytest.raises(ValueError, match="security_name"):
        SnmpConfigSchema(version="v3")


def test_snmp_schema_validation_v3_missing_auth():
    with pytest.raises(ValueError, match="auth_protocol"):
        SnmpConfigSchema(
            version="v3",
            security_name="admin",
            security_level="authNoPriv",
        )


def test_snmp_schema_validation_v3_missing_priv():
    with pytest.raises(ValueError, match="priv_protocol"):
        SnmpConfigSchema(
            version="v3",
            security_name="admin",
            security_level="authPriv",
            auth_protocol="SHA256",
            auth_password="auth_password",
        )


# ---------------------------------------------------------------------------
# Testes de Integração push_host_to_zabbix com SNMP v3
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_host_to_zabbix_with_snmp_v3():
    """Valida que push_host_to_zabbix envia parâmetros SNMPv3 na chamada host.create."""
    worker = ZabbixSyncWorker()
    dev_id = uuid4()
    org_id = uuid4()

    mock_client = AsyncMock(spec=ZabbixClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.call.return_value = {"hostids": ["99001"]}

    worker._get_zabbix_client = MagicMock(return_value=mock_client)

    snmp_v3_config = {
        "version": "v3",
        "username": "zabbix_agent_v3",
        "security_level": "authPriv",
        "auth_protocol": "SHA256",
        "auth_passphrase": "auth_secret_key",
        "priv_protocol": "AES256",
        "priv_passphrase": "priv_secret_key",
    }

    hostid = await worker.push_host_to_zabbix(
        device_id=dev_id,
        org_id=org_id,
        name="Router BGP Core",
        ip_address="10.254.0.1",
        protocol="snmp",
        zabbix_host_id=None,
        thresholds={"snmp": snmp_v3_config},
    )

    assert hostid == "99001"
    mock_client.call.assert_called_once()
    call_args = mock_client.call.call_args
    assert call_args[0][0] == "host.create"
    params = call_args[1]["params"]
    interface = params["interfaces"][0]
    assert interface["details"]["version"] == 3
    assert interface["details"]["securityname"] == "zabbix_agent_v3"
    assert interface["details"]["securitylevel"] == 2
    assert interface["details"]["authprotocol"] == 3
    assert interface["details"]["authpassphrase"] == "auth_secret_key"
    assert interface["details"]["privprotocol"] == 3
    assert interface["details"]["privpassphrase"] == "priv_secret_key"
