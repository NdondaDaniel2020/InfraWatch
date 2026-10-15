---
name: layered-architecture-pattern
description: Diretrizes e padrão arquitetural estrito para separação de responsabilidades em camadas (Controllers, Presenters, Services, Domain, Repositories e Schemas) no InfraWatch seguindo DDD e Arquitetura Hexagonal.
---

# Separação Estrita de Responsabilidades em Camadas (Layered Architecture Pattern)

Esta skill estabelece o guia canônico de divisão de responsabilidades entre as camadas do backend do **InfraWatch**. O objetivo é impedir o surgimento de endpoints inteligentes (fat controllers), vazamento de apresentação para serviços de domínio e acoplamento direto com infraestrutura/banco de dados.

---

## 🏛️ O Princípio da Dependência Hexagonal

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. DRIVING ADAPTERS (API / Controllers & Presenters)        │
│    FastAPI Routers, Dependency Injection, DTOs, Presenters  │
│    ┌───────────────────────────────────────────────────────┐│
│    │ 2. APPLICATION SERVICES (Casos de Uso)                ││
│    │    Orquestração, Unit of Work, Transações             ││
│    │    ┌─────────────────────────────────────────────────┐││
│    │    │ 3. DOMAIN CORE (Núcleo Puro)                    │││
│    │    │    Agregados, Invariantes, Domain Events        │││
│    │    └─────────────────────────────────────────────────┘││
│    │ 4. DRIVEN ADAPTERS (Infraestrutura & Persistência)    ││
│    │    Repositories, SQLAlchemy, Clientes HTTP, Outbox    ││
│    └───────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

> **Regra de Ouro:** O fluxo de controle vai de fora para dentro. O Domínio **nunca** conhece Services nem Banco. O Service **nunca** conhece HTTP nem apresentação. O Controller **nunca** acessa o Banco diretamente.

---

## 🎯 Responsabilidades e Limites Rígidos por Camada

### 1. Controllers / Routers (`src/contexts/<context>/api/routes/`)

* **O que DEVE fazer:**
  - Declarar rotas HTTP, verbos (`GET`, `POST`, `PUT`, `DELETE`), status codes e tags OpenAPI.
  - Validar payloads de entrada via DTOs Pydantic (`schemas.requests`).
  - Aplicar segurança declarativa e RBAC via dependências (`CurrentUserDep`, `require_roles`).
  - Delegar a execução para o Application Service injetado (`*ServiceDep`).
  - Capturar exceções semânticas de negócio/aplicação e traduzi-las em `HTTPException` com status codes adequados (`400`, `401`, `403`, `404`, `409`, `503`).
  - Retornar DTOs de resposta ou invocar um Presenter para formatos binários/stream (CSV, PDF).

* **O que NUNCA deve fazer (VETADO):**
  - ❌ **Zero queries SQL:** Nunca importar `select`, `insert`, `update`, `delete` do SQLAlchemy.
  - ❌ **Zero injeção de sessão:** Nunca injetar `DbSessionDep` ou `AsyncSession` no router.
  - ❌ **Zero transações:** Nunca chamar `session.commit()` ou `session.rollback()`.
  - ❌ **Zero regras de negócio:** Nunca decidir estados, calcular SLA, ou validar transições de ciclo de vida.
  - ❌ **Zero instanciação de clientes externos:** Nunca instanciar `GlpiClient`, `ZabbixClient`, `httpx.AsyncClient` inline.

---

### 2. Presenters & Formatters (`src/contexts/<context>/api/presenters/`)

* **O que DEVE fazer:**
  - Transformar dados analíticos e DTOs retornados pelos Services em formatos de transporte especializados (ex: CSV RFC 4180 com `csv.writer`, streams de exportação, planilhas).
  - Tratar formatação de apresentação (cabeçalhos visuais, máscaras, "SIM"/"NÃO", datas formatadas).

* **O que NUNCA deve fazer (VETADO):**
  - ❌ Nunca fazer consultas a banco ou chamar outros serviços.
  - ❌ Nunca alterar o estado de entidades de domínio.

---

### 3. Application Services (`src/contexts/<context>/services/`)

* **O que DEVE fazer:**
  - Orquestrar a execução de um caso de uso específico (comando ou consulta CQRS).
  - Gerenciar transações ACID através do `AbstractUnitOfWork` ou `AsyncSession`.
  - Obter agregados de domínio via Repositórios, invocar métodos de negócio dos agregados e salvar as alterações.
  - Despachar eventos de domínio via Outbox transacional (`OutboxRepository`) ou SSE (`SSEBroadcaster`).
  - Consumir clientes externos (GLPI, Zabbix) injetados via construtor ou fábricas de dependência.

* **O que NUNCA deve fazer (VETADO):**
  - ❌ **Zero dependências HTTP:** Nunca importar `Request`, `Response`, `HTTPException`, `status` do FastAPI/Starlette.
  - ❌ **Zero geração de transporte cru:** Nunca manipular `csv.writer`, `io.StringIO` para gerar strings CSV na camada de serviço.
  - ❌ **Zero imports tardios inline de infraestrutura:** Não fazer `from src.core.config import get_settings` dentro de métodos para criar clientes HTTP; use injeção no construtor.

---

### 4. Domain & Aggregates (`src/contexts/<context>/domain/`)

* **O que DEVE fazer:**
  - Encapsular as regras de negócio mais críticas e invariantes do sistema.
  - Validar transições de estado (ex: `incident.set_glpi_ticket_id(id)` rejeita se já houver chamado).
  - Registrar eventos de domínio através de `add_domain_event(...)`.
  - Ser código Python puro, determinístico e livre de frameworks.

* **O que NUNCA deve fazer (VETADO):**
  - ❌ **Zero frameworks:** Nunca importar FastAPI, SQLAlchemy, Pydantic, Redis ou httpx no domínio.
  - ❌ **Zero I/O:** O domínio não faz consultas a banco, requisições de rede ou leitura de arquivos.

---

### 5. Repositories (`src/contexts/<context>/database/` ou `repositories/`)

* **O que DEVE fazer:**
  - Abstrair o acesso a tabelas do banco de dados utilizando SQLAlchemy 2.0 moderno.
  - Oferecer métodos com nomes semânticos: `get_by_id`, `find_by_id`, `save`, `delete`, `list_active`.
  - Mapear modelos ORM (`Model`) para agregados de domínio quando aplicável.

* **O que NUNCA deve fazer (VETADO):**
  - ❌ Nunca implementar regras de negócio ou validações de domínio.
  - ❌ Nunca gerenciar commit transacional isolado se estiver sob escopo de um `UnitOfWork`.

---

## 🚫 Catálogo de Antipatterns (Antes vs Depois)

### Caso 1: Smart Endpoint / Fat Controller no Router

❌ **ERRADO (Controller acessando banco diretamente):**
```python
# routes/monitoring.py
@router.post("/heartbeat/{device_id}")
async def receive_heartbeat(device_id: UUID, session: DbSessionDep):
    device = (await session.execute(select(DeviceModel).where(DeviceModel.id == device_id))).scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Not found")
    metric = MetricModel(device_id=device_id, metric_type="heartbeat", value=1.0)
    session.add(metric)
    device.status = "UP"
    await session.commit()
    return {"status": "UP"}
```

✅ **CORRETO (Controller delegando para Service):**
```python
# routes/monitoring.py
@router.post("/heartbeat/{device_id}", response_model=HeartbeatResponse)
async def receive_heartbeat(
    device_id: UUID,
    service: HeartbeatServiceDep,
    payload: HeartbeatSignalRequest | None = None,
) -> HeartbeatResponse:
    try:
        return await service.register_heartbeat(device_id=device_id, signal=payload)
    except DeviceNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
```

---

### Caso 2: Vazamento de Apresentação no Service (CSV Hardcoded)

❌ **ERRADO (Service gerando string CSV com StringIO):**
```python
# services/sla_service.py
class SlaService:
    async def export_device_sla_csv(self, device_id: UUID) -> str:
        report = await self.calculate_device_sla(device_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Device ID", "Uptime (%)"])
        writer.writerow([str(device_id), f"{report.uptime_percentage:.2f}"])
        return output.getvalue()
```

✅ **CORRETO (Service calcula dados; Presenter formata CSV):**
```python
# services/sla_service.py
class SlaService:
    async def get_device_with_sla(self, device_id: UUID) -> tuple[DeviceModel, SlaReportResponse]:
        device = await self._device_repo.get_by_id(device_id)
        if not device:
            raise ValueError("Dispositivo não encontrado")
        report = await self.calculate_device_sla(device_id)
        return device, report

# presenters/csv_presenter.py
class SlaCsvPresenter:
    @classmethod
    def format_single_device(cls, device: Any, report: SlaReportResponse) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Device ID", "Uptime (%)"])
        writer.writerow([str(device.id), f"{report.uptime_percentage:.2f}"])
        return output.getvalue()
```

---

### Caso 3: Acoplamento Inline de Infraestrutura

❌ **ERRADO (Instanciar cliente via lazy import dentro do método):**
```python
# services/incident_service.py
class IncidentService:
    async def create_glpi_ticket(self, incident_id: UUID):
        from src.core.config import get_settings
        from src.integrations.glpi.client import GlpiClient
        settings = get_settings()
        client = GlpiClient(base_url=settings.GLPI_BASE_URL, ...)
        await client.open_ticket(...)
```

✅ **CORRETO (Injeção de dependência formal):**
```python
# api/dependencies.py
def get_glpi_client() -> GlpiClient | None:
    settings = get_settings()
    if not settings.GLPI_ENABLED or not settings.GLPI_BASE_URL:
        return None
    return GlpiClient(...)

def get_incident_service(
    uow: UnitOfWorkDep,
    glpi: Annotated[GlpiClient | None, Depends(get_glpi_client)] = None,
) -> IncidentService:
    return IncidentService(uow_or_session=uow, glpi_client=glpi)
```

---

## 📋 Checklist de Auditoria e Code Review

Antes de finalizar qualquer tarefa ou abrir Pull Request no InfraWatch, execute a seguinte verificação:

1. [ ] **Routers/Controllers:**
   - Nenhum router importa `select`, `insert`, `update` ou `delete`.
   - Nenhum router recebe `DbSessionDep` ou `AsyncSession` diretamente.
   - Nenhum router executa `session.commit()` ou lógica de banco.
   - Todas as regras de negócio foram delegadas para um `*Service`.
2. [ ] **Application Services:**
   - Nenhum service importa `HTTPException`, `Request` ou `Response`.
   - Nenhum service gera arquivos ou strings de apresentação direta (`csv.writer`, `StringIO`).
   - Clientes externos (GLPI, Zabbix) são injetados no construtor via DI.
3. [ ] **Domain:**
   - O domínio não importa bibliotecas externas ou frameworks.
   - Toda validação de estado ou invariante reside nos métodos do agregado.
4. [ ] **Qualidade:**
   - Executar `make lint` (Ruff sem warnings).
   - Executar `mypy src` (0 erros de tipagem estrita).
   - Executar `make test` (100% dos testes passando).
