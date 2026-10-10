"""Testes unitários do agregado Incident do contexto de Alerting.

Valida regras de negócio invariantes:
- Transição de status (TRIGGERED -> ACKNOWLEDGED -> RESOLVED).
- Registro do operador no reconhecimento e emissão de evento de domínio.
- Cálculo exato do tempo de indisponibilidade em minutos na resolução.
- Rejeição de resolução com causa raiz em branco.
- Bloqueio de reconhecimento ou resolução dupla em incidentes já encerrados.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.contexts.alerting.domain.events import (
    IncidentAcknowledgedEvent,
    IncidentResolvedEvent,
)
from src.contexts.alerting.domain.exceptions import (
    IncidentAlreadyResolvedError,
)
from src.contexts.alerting.domain.incident import (
    Incident,
    IncidentSeverity,
    IncidentStatus,
)


class TestIncidentAggregate:
    def test_criacao_inicial_de_incidente(self) -> None:
        device_id = uuid4()
        org_id = uuid4()
        incident = Incident(
            device_id=device_id,
            organization_id=org_id,
            title="Queda de enlace principal",
            severity=IncidentSeverity.CRITICAL,
        )

        assert incident.id is not None
        assert incident.device_id == device_id
        assert incident.organization_id == org_id
        assert incident.title == "Queda de enlace principal"
        assert incident.severity == IncidentSeverity.CRITICAL
        assert incident.status == IncidentStatus.TRIGGERED
        assert incident.operator_id is None
        assert incident.acknowledged_at is None
        assert incident.resolved_at is None
        assert incident.downtime_minutes is None
        assert incident.root_cause is None

    def test_reconhecimento_com_sucesso_vincula_operador_e_emite_evento(self) -> None:
        device_id = uuid4()
        operator_id = uuid4()
        incident = Incident(
            device_id=device_id,
            title="Perda de conectividade",
            severity=IncidentSeverity.DOWN,
        )

        ack_time = datetime.now(UTC)
        incident.acknowledge(operator_id=operator_id, acknowledged_at=ack_time)

        assert incident.status == IncidentStatus.ACKNOWLEDGED
        assert incident.operator_id == operator_id
        assert incident.acknowledged_at == ack_time

        events = incident.pull_domain_events()
        assert len(events) == 1
        ack_event = events[0]
        assert isinstance(ack_event, IncidentAcknowledgedEvent)
        assert ack_event.incident_id == incident.id
        assert ack_event.device_id == device_id
        assert ack_event.operator_id == operator_id
        assert ack_event.acknowledged_at == ack_time

    def test_resolucao_calcula_downtime_exato_em_minutos_e_emite_evento(self) -> None:
        device_id = uuid4()
        operator_id = uuid4()
        start_time = datetime.now(UTC) - timedelta(minutes=75, seconds=30)

        incident = Incident(
            device_id=device_id,
            title="Fibra óptica rompida",
            severity=IncidentSeverity.CRITICAL,
            started_at=start_time,
        )
        incident.acknowledge(operator_id=operator_id)
        incident.clear_domain_events()

        resolve_time = datetime.now(UTC)
        downtime = incident.resolve(
            root_cause="Fibra rompida pela concessionária durante obras na rodovia",
            resolved_at=resolve_time,
        )

        assert incident.status == IncidentStatus.RESOLVED
        assert incident.resolved_at == resolve_time
        assert incident.root_cause == "Fibra rompida pela concessionária durante obras na rodovia"
        # 75 minutos decorridos
        assert downtime == 75
        assert incident.downtime_minutes == 75

        events = incident.pull_domain_events()
        assert len(events) == 1
        res_event = events[0]
        assert isinstance(res_event, IncidentResolvedEvent)
        assert res_event.device_id == device_id
        assert res_event.root_cause == "Fibra rompida pela concessionária durante obras na rodovia"
        assert res_event.downtime_minutes == 75

    def test_resolucao_rejeita_causa_raiz_vazia(self) -> None:
        incident = Incident(device_id=uuid4(), title="Incidente de teste")

        with pytest.raises(ValueError, match="A causa raiz é obrigatória"):
            incident.resolve(root_cause="   ")

    def test_bloqueio_de_reconhecimento_em_incidente_resolvido(self) -> None:
        incident = Incident(device_id=uuid4(), title="Incidente já resolvido")
        incident.resolve(root_cause="Cabo reconectado com sucesso")

        with pytest.raises(IncidentAlreadyResolvedError, match="Não é possível reconhecer um incidente já resolvido"):
            incident.acknowledge(operator_id=uuid4())

    def test_bloqueio_de_resolucao_dupla(self) -> None:
        incident = Incident(device_id=uuid4(), title="Incidente duplicado")
        incident.resolve(root_cause="Falha elétrica corrigida")

        with pytest.raises(IncidentAlreadyResolvedError, match="O incidente já se encontra resolvido"):
            incident.resolve(root_cause="Tentativa de resolver novamente")

    def test_resolucao_direta_sem_reconhecimento_previo(self) -> None:
        """Permite auto-resolução (ex: recuperação automática pelo motor de monitoramento)."""
        operator_id = uuid4()
        start = datetime.now(UTC) - timedelta(hours=2)
        incident = Incident(device_id=uuid4(), title="Auto-recovery", started_at=start)

        downtime = incident.resolve(
            root_cause="Enlace restabelecido automaticamente após reconexão da operadora",
            operator_id=operator_id,
        )

        assert incident.status == IncidentStatus.RESOLVED
        assert incident.operator_id == operator_id
        assert downtime == 120
        assert incident.downtime_minutes == 120
