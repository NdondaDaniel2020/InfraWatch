"""Testes unitários para o TopologySanitizer (ADR-012) com credenciais SNMP."""

from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.services.sanitizer import TopologySanitizer


def test_sanitizer_masks_snmp_credentials_for_client_viewer():
    """Valida que todas as credenciais SNMP são ofuscadas para usuários CLIENT_VIEWER."""
    payload = {
        "id": "123",
        "name": "Router Core",
        "thresholds": {
            "snmp": {
                "version": "v3",
                "username": "admin_snmp",
                "community": "public_secret",
                "auth_password": "super_auth_password",
                "priv_password": "super_priv_password",
                "auth_passphrase": "super_auth_passphrase",
                "priv_passphrase": "super_priv_passphrase",
            }
        },
    }

    sanitized = TopologySanitizer.sanitize(payload, role=UserRole.CLIENT_VIEWER)

    snmp_data = sanitized["thresholds"]["snmp"]
    assert snmp_data["version"] == "v3"
    assert snmp_data["username"] == "admin_snmp"
    assert snmp_data["community"] == "********"
    assert snmp_data["auth_password"] == "********"
    assert snmp_data["priv_password"] == "********"
    assert snmp_data["auth_passphrase"] == "********"
    assert snmp_data["priv_passphrase"] == "********"


def test_sanitizer_preserves_snmp_credentials_for_admin_and_operator():
    """Valida que papéis técnicos (SUPER_ADMIN, NOC_OPERATOR, ORG_ADMIN) mantêm acesso total."""
    payload = {
        "thresholds": {
            "snmp": {
                "community": "secret_community",
                "auth_password": "real_password",
            }
        }
    }

    for role in (UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR, UserRole.ORG_ADMIN):
        sanitized = TopologySanitizer.sanitize(payload, role=role)
        assert sanitized["thresholds"]["snmp"]["community"] == "secret_community"
        assert sanitized["thresholds"]["snmp"]["auth_password"] == "real_password"
