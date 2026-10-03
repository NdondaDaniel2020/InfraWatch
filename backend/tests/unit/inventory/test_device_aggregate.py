"""Testes unitários do agregado Device e Value Objects de inventário.

Valida rejeição de IPs inválidos, portas fora de intervalo,
transições de estado controladas e disparo de eventos.
"""

import pytest
from datetime import datetime, UTC, timedelta
from uuid import uuid4

from src.contexts.inventory.domain.aggregate import Device
from src.contexts.inventory.domain.value_objects import (
    DeviceCategory,
    DeviceStatus,
    IPAddress,
    NetworkPort,
    ThresholdConfig,
)


# ──────────────────── Value Object: IPAddress ────────────────────


class TestIPAddress:
    def test_ipv4_valido(self):
        ip = IPAddress("192.168.1.1")
        assert ip.value == "192.168.1.1"
        assert ip.version == 4

    def test_ipv6_valido(self):
        ip = IPAddress("::1")
        assert ip.value == "::1"
        assert ip.version == 6

    def test_ipv6_completo(self):
        ip = IPAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")
        assert ip.version == 6
        assert str(ip) == "2001:db8:85a3::8a2e:370:7334"

    def test_ip_invalido_rejeita(self):
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            IPAddress("999.999.999.999")

    def test_ip_string_vazia_rejeita(self):
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            IPAddress("")

    def test_ip_texto_rejeita(self):
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            IPAddress("nao-e-um-ip")

    def test_ip_com_zeros_a_esquerda_rejeita(self):
        """Python 3.12+ rejeita zeros à esquerda em octetos IPv4 (RFC 3986)."""
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            IPAddress("192.168.001.001")

    def test_igualdade(self):
        assert IPAddress("10.0.0.1") == IPAddress("10.0.0.1")
        assert IPAddress("10.0.0.1") != IPAddress("10.0.0.2")


# ──────────────────── Value Object: NetworkPort ────────────────────


class TestNetworkPort:
    def test_porta_valida(self):
        port = NetworkPort(443)
        assert port.value == 443
        assert int(port) == 443

    def test_porta_minima(self):
        port = NetworkPort(1)
        assert port.value == 1

    def test_porta_maxima(self):
        port = NetworkPort(65535)
        assert port.value == 65535

    def test_porta_zero_rejeita(self):
        with pytest.raises(ValueError, match="Porta de rede inválida"):
            NetworkPort(0)

    def test_porta_negativa_rejeita(self):
        with pytest.raises(ValueError, match="Porta de rede inválida"):
            NetworkPort(-1)

    def test_porta_acima_limite_rejeita(self):
        with pytest.raises(ValueError, match="Porta de rede inválida"):
            NetworkPort(65536)


# ──────────────────── Value Object: ThresholdConfig ────────────────────


class TestThresholdConfig:
    def test_valores_padrao(self):
        t = ThresholdConfig()
        assert t.max_latency_ms == 200.0
        assert t.max_jitter_ms == 50.0
        assert t.max_loss_percent == 5.0

    def test_valores_customizados(self):
        t = ThresholdConfig(max_latency_ms=100, max_jitter_ms=20, max_loss_percent=1.5)
        assert t.max_latency_ms == 100
        assert t.max_loss_percent == 1.5

    def test_latencia_negativa_rejeita(self):
        with pytest.raises(ValueError, match="max_latency_ms"):
            ThresholdConfig(max_latency_ms=-1)

    def test_jitter_negativo_rejeita(self):
        with pytest.raises(ValueError, match="max_jitter_ms"):
            ThresholdConfig(max_jitter_ms=-5)

    def test_loss_acima_100_rejeita(self):
        with pytest.raises(ValueError, match="max_loss_percent"):
            ThresholdConfig(max_loss_percent=101)

    def test_loss_negativa_rejeita(self):
        with pytest.raises(ValueError, match="max_loss_percent"):
            ThresholdConfig(max_loss_percent=-0.1)

    def test_serializacao_roundtrip(self):
        original = ThresholdConfig(max_latency_ms=150, max_jitter_ms=30, max_loss_percent=2.5)
        reconstruido = ThresholdConfig.from_dict(original.to_dict())
        assert reconstruido == original


# ──────────────────── Value Object: DeviceCategory ────────────────────


class TestDeviceCategory:
    def test_categorias_validas(self):
        assert DeviceCategory("ROUTER") == DeviceCategory.ROUTER
        assert DeviceCategory("SWITCH") == DeviceCategory.SWITCH
        assert DeviceCategory("MICROWAVE_LINK") == DeviceCategory.MICROWAVE_LINK

    def test_categoria_invalida_rejeita(self):
        with pytest.raises(ValueError):
            DeviceCategory("IMPRESSORA")


# ──────────────────── Agregado: Device ────────────────────


class TestDeviceAggregate:
    def _make_device(self, **overrides) -> Device:
        defaults = {
            "id": uuid4(),
            "organization_id": uuid4(),
            "name": "Router Core",
            "ip_address": "10.0.0.1",
            "port": 22,
            "protocol": "ssh",
            "category": "ROUTER",
            "interval_seconds": 60,
            "thresholds": {},
        }
        defaults.update(overrides)
        return Device(**defaults)

    def test_criacao_valida(self):
        device = self._make_device()
        assert device.name == "Router Core"
        assert device.ip_address == "10.0.0.1"
        assert device.port == 22
        assert device.category == "ROUTER"
        assert device.status == "UP"
        assert device.is_paused is False

    def test_criacao_com_ip_invalido_rejeita(self):
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            self._make_device(ip_address="999.999.999.999")

    def test_criacao_com_porta_invalida_rejeita(self):
        with pytest.raises(ValueError, match="Porta de rede inválida"):
            self._make_device(port=0)

    def test_criacao_com_categoria_invalida_rejeita(self):
        with pytest.raises(ValueError):
            self._make_device(category="IMPRESSORA")

    def test_update_parcial_com_validacao(self):
        device = self._make_device()
        device.update(ip_address="192.168.1.100", port=443)
        assert device.ip_address == "192.168.1.100"
        assert device.port == 443

    def test_update_ip_invalido_rejeita(self):
        device = self._make_device()
        with pytest.raises(ValueError, match="Endereço IP inválido"):
            device.update(ip_address="invalido")

    def test_pause_e_resume(self):
        device = self._make_device()
        device.pause()
        assert device.status == "PAUSED"
        assert device.is_paused is True

        device.resume()
        assert device.status == "UP"
        assert device.is_paused is False

    def test_set_maintenance(self):
        device = self._make_device()
        future = datetime.now(UTC) + timedelta(hours=2)
        device.set_maintenance(future)
        assert device.status == "MAINTENANCE"
        assert device.maintenance_until == future

    def test_update_status_para_degraded(self):
        device = self._make_device()
        device.update_status("DEGRADED", latency=250.0, loss=3.0)
        assert device.status == "DEGRADED"

    def test_update_status_para_down(self):
        device = self._make_device()
        device.update_status("DOWN", latency=0.0, loss=100.0)
        assert device.status == "DOWN"

    def test_update_status_dispositivo_pausado_rejeita(self):
        device = self._make_device()
        device.pause()
        with pytest.raises(ValueError, match="pausado"):
            device.update_status("DOWN")

    def test_update_status_dispositivo_em_manutencao_rejeita(self):
        device = self._make_device()
        device.set_maintenance(datetime.now(UTC) + timedelta(hours=1))
        with pytest.raises(ValueError, match="manutencao"):
            device.update_status("UP")

    def test_update_status_invalido_rejeita(self):
        device = self._make_device()
        with pytest.raises(ValueError):
            device.update_status("EXPLODIU")

    def test_thresholds_roundtrip_via_aggregate(self):
        thresholds = {"max_latency_ms": 100, "max_jitter_ms": 20, "max_loss_percent": 1.0}
        device = self._make_device(thresholds=thresholds)
        assert device.thresholds["max_latency_ms"] == 100
        assert device.thresholds["max_jitter_ms"] == 20
