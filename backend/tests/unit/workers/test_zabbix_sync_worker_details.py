"""Testes unitários para utilitários e detalhes de SNMP em ZabbixSyncWorker."""

from __future__ import annotations

from src.workers.daemons.zabbix_sync_worker import build_zabbix_snmp_interface_details


def test_build_zabbix_snmp_interface_details_default_and_v1() -> None:
    """Valida configurações padrão (fallback v2c) e SNMP v1."""
    # 1. Sem config (None)
    details_none = build_zabbix_snmp_interface_details(None, port=161, ip_address="192.168.1.10")
    assert details_none["ip"] == "192.168.1.10"
    assert details_none["port"] == "161"
    assert details_none["details"]["version"] == 2
    assert details_none["details"]["community"] == "public"

    # 2. SNMP v1 explícito
    v1_config = {"version": "v1", "community": "corp_read", "port": 1161}
    details_v1 = build_zabbix_snmp_interface_details(v1_config, ip_address="10.0.0.1")
    assert details_v1["port"] == "1161"
    assert details_v1["details"]["version"] == 1
    assert details_v1["details"]["community"] == "corp_read"


def test_build_zabbix_snmp_interface_details_v2c() -> None:
    """Valida SNMP v2c com comunidade customizada."""
    v2_config = {"version": "v2c", "community": "noc_monitoring"}
    details_v2 = build_zabbix_snmp_interface_details(v2_config, port=161, ip_address="172.16.0.1")
    assert details_v2["details"]["version"] == 2
    assert details_v2["details"]["community"] == "noc_monitoring"


def test_build_zabbix_snmp_interface_details_v3_no_auth_no_priv() -> None:
    """Valida SNMP v3 noAuthNoPriv (nível 0)."""
    v3_noauth = {
        "version": "v3",
        "username": "snmpuser",
        "security_level": "noAuthNoPriv",
    }
    details = build_zabbix_snmp_interface_details(v3_noauth, ip_address="10.1.1.1")
    assert details["details"]["version"] == 3
    assert details["details"]["securityname"] == "snmpuser"
    assert details["details"]["securitylevel"] == 0
    assert "authprotocol" not in details["details"]


def test_build_zabbix_snmp_interface_details_v3_auth_no_priv() -> None:
    """Valida SNMP v3 authNoPriv (nível 1)."""
    v3_auth = {
        "version": "3",
        "security_name": "readonly_user",
        "security_level": "authNoPriv",
        "auth_protocol": "sha256",
        "auth_passphrase": "auth_super_secret",
    }
    details = build_zabbix_snmp_interface_details(v3_auth, ip_address="10.1.1.2")
    assert details["details"]["version"] == 3
    assert details["details"]["securitylevel"] == 1
    assert details["details"]["authprotocol"] == 3  # SHA256 mapeado para 3
    assert details["details"]["authpassphrase"] == "auth_super_secret"
    assert "privprotocol" not in details["details"]


def test_build_zabbix_snmp_interface_details_v3_auth_priv_protocols() -> None:
    """Valida SNMP v3 authPriv (nível 2) com variantes de protocolos de autenticação e privacidade."""
    # Testar MD5 e DES
    v3_md5_des = {
        "version": "v3",
        "security_name": "admin_snmp",
        "security_level": "authPriv",
        "auth_protocol": "md5",
        "auth_passphrase": "md5_secret_pass",
        "priv_protocol": "des",
        "priv_passphrase": "des_secret_pass",
    }
    details = build_zabbix_snmp_interface_details(v3_md5_des, ip_address="10.1.1.3")
    assert details["details"]["securitylevel"] == 2
    assert details["details"]["authprotocol"] == 0  # MD5
    assert details["details"]["privprotocol"] == 0  # DES

    # Testar SHA e AES256
    v3_sha_aes = {
        "version": "v3",
        "security_name": "admin_snmp",
        "security_level": "2",
        "auth_protocol": "sha",
        "auth_passphrase": "sha_secret_pass",
        "priv_protocol": "aes256",
        "priv_passphrase": "aes_secret_pass",
    }
    details_aes = build_zabbix_snmp_interface_details(v3_sha_aes, ip_address="10.1.1.4")
    assert details_aes["details"]["authprotocol"] == 1  # SHA1
    assert details_aes["details"]["privprotocol"] == 3  # AES256
