---
name: backend-feature-tdd-workflow
description: Fluxo padronizado de desenvolvimento de features e tarefas de backend no InfraWatch seguindo DDD, Arquitetura Hexagonal, CQRS, TDD, tipagem estrita com Mypy e linting com Ruff.
---

# Fluxo de Desenvolvimento Backend com TDD (Backend Feature TDD Workflow)

Esta skill padroniza o ciclo de vida de desenvolvimento de novas features e regras de negócio no backend do **InfraWatch**. Ela assegura que cada alteração respeite o isolamento de Bounded Contexts (DDD), Arquitetura Hexagonal (Ports & Adapters), CQRS, cobertura de testes automatizados via TDD, e aprovação estrita em linters e checadores de tipo antes de qualquer commit.

---

## 🏗️ Estrutura de Bounded Contexts (`backend/src/contexts/<context>/`)

Cada contexto de negócio deve seguir rigidamente a divisão de camadas:

```text
backend/src/contexts/<context>/
├── domain/                      # 1. NÚCLEO PURO (Zero dependências externas)
│   ├── aggregate.py            #    Agregados e Entidades com lógica invariante
│   ├── events.py               #    Eventos de domínio (@dataclass frozen=True)
│   ├── value_objects.py        #    Objetos de valor imutáveis
│   └── exceptions.py           #    Exceções semânticas de negócio
├── schemas/                     # 2. CONTRATOS EXTERNOS E DTOs
│   ├── requests.py             #    Modelos Pydantic de entrada
│   └── responses.py            #    Modelos Pydantic de saída (.for_viewer())
├── services/                    # 3. CASOS DE USO / APLICAÇÃO (CQRS)
│   ├── command_service.py      #    Escritas via AbstractUnitOfWork
│   └── query_service.py        #    Leituras otimizadas sem locks
├── database/                    # 4. ADAPTERS DE PERSISTÊNCIA (Driven)
│   ├── models.py               #    Tabelas SQLAlchemy 2.0 (Mapped[...])
│   └── repository.py           #    Implementação concreta das portas de repositório
└── consumers/                   # 5. HANDLERS DE EVENTOS (Driving)
    └── event_consumer.py       #    Consumidores de Redis Streams / EventBus
```

---

## 🔄 Passo a Passo de Implementação (Ciclo TDD)

### 1. Modelagem do Domínio e Testes Unitários de Negócio
Antes de tocar em banco de dados ou rotas FastAPI, defina as regras puras no domínio:

1. **Escrever o teste primeiro:** Crie `backend/tests/unit/<context>/test_<aggregate>_domain.py`.
2. **Definir o Agregado/Entidade:**
   - Métodos com regras invariantes (ex: `device.pause(reason)`, `incident.acknowledge(operator_id)`).
   - Proibido mutar estado externamente sem passar pelos métodos do agregado.
3. **Definir Value Objects e Eventos:**
   - Value Objects com validação no construtor.
   - Eventos de domínio herdando de `DomainEvent` com campos tipados (`UUID | None`, `datetime | None`).

```python
# Exemplo de teste de domínio
def test_degraded_state_transition():
    evaluator = FailureEvaluator(retry_threshold=3)
    state = evaluator.evaluate(consecutive_failures=1, packet_loss_pct=15.0)
    assert state == DeviceHealthStatus.DEGRADED
```

---

### 2. Contratos e DTOs de Entrada e Saída (`schemas/`)
Separe rigorosamente contratos de entrada de modelos de saída:

- **Requests (`schemas/requests.py`):** Pydantic `BaseModel` com validações de campo (`Field(...)`).
- **Responses (`schemas/responses.py`):** Evite métodos que mutem instâncias. Use factories imutáveis:
  ```python
  @classmethod
  def for_viewer(cls, entity: Entity, viewer_role: str) -> Self:
      return cls(...)
  ```

---

### 3. Camada de Aplicação e Serviços (`services/`)
Aplique separação CQRS com transações atômicas:

- Utilize sempre `AbstractUnitOfWork` para operações de escrita.
- Dispare eventos de domínio via `Transactional Outbox` (`session.add(OutboxEvent(...))`).
- Teste os serviços com repositórios em memória ou mocks assíncronos em `backend/tests/unit/<context>/`.

---

### 4. Persistência e Migrações (`database/` & `alembic/`)
- Mapeamento declarativo SQLAlchemy 2.0 (`Mapped[UUID]`, `mapped_column(...)`).
- Chaves estrangeiras e índices em colunas de busca frequente (`organization_id`, `status`, `created_at`).
- **Migração Alembic:** Se houver nova tabela ou coluna:
  ```bash
  # Criar migração versionada
  alembic revision --autogenerate -m "feat(<context>): criar tabela <nome>"
  ```
  - Garanta que a migração suporte tanto PostgreSQL quanto compatibilidade de testes com SQLite se aplicável.

---

### 5. Camada Web (`backend/src/api/routes/`)
- Rotas limpas e desacopladas, injetando dependências:
  ```python
  @router.post("/", status_code=status.HTTP_201_CREATED, response_model=DeviceResponse)
  async def create_device(
      request: CreateDeviceRequest,
      uow: AbstractUnitOfWork = Depends(get_uow),
      current_user: User = Depends(get_current_active_user),
  ) -> DeviceResponse:
      ...
  ```
- Testes de integração em `backend/tests/integration/<context>/test_<resource>_endpoints.py`.

---

## 🛡️ Checklist de Qualidade Obrigatório (Antes do Commit)

Nunca realize commit sem que todas as validações passem com 100% de sucesso no ambiente local:

```bash
# 1. Executar os testes unitários da feature
backend/.venv/bin/pytest backend/tests/unit/<context>

# 2. Executar a suíte completa de testes
backend/.venv/bin/pytest backend/tests

# 3. Linter e formatação com Ruff (zero erros)
backend/.venv/bin/ruff check backend

# 4. Checagem estática de tipos com Mypy (zero erros)
backend/.venv/bin/mypy backend/src/contexts/<context> backend/src/api/routes/<context>.py
```

---

## 🎯 Regras de Ouro
1. **Domínio Imaculado:** A pasta `domain/` nunca deve importar SQLAlchemy, FastAPI, Pydantic, Redis ou bibliotecas HTTP.
2. **Atomicidade via UoW:** Toda escrita de negócio deve ocorrer dentro do contexto `async with uow:`.
3. **Outbox Obrigatório:** Toda comunicação entre Bounded Contexts ocorre por eventos registrados no Outbox na mesma transação da entidade.
4. **Tipagem Estrita:** Proibido o uso de `Any` em retornos públicos; use união moderna (`X | None`), `Self`, e tipos genéricos apropriados.
5. **Test First:** Sempre escreva ou planeje o teste antes de implementar o código produtivo.
