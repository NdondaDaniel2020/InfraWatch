# InfraWatch Backend 🛰️

Módulo backend em **Python 3.12+** construído com **FastAPI**, **SQLAlchemy 2.0 (AsyncIO)**, **PostgreSQL 16 (TIMESTAMPTZ)** e **Redis Streams**. Implementa Arquitetura Hexagonal, Domain-Driven Design (DDD), Transactional Outbox Pattern e daemons assíncronos de alta resiliência para observabilidade corporativa.

---

## 🏛️ Estrutura e Bounded Contexts

O código está estruturado em contextos de domínio desacoplados sob `src/`:

```text
backend/
├── alembic/                       # Migrações de banco de dados versionadas
├── src/
│   ├── contexts/                  # Bounded Contexts de Domínio (DDD)
│   │   ├── iam/                   # Autenticação, RBAC, Organizações, MFA, Google OAuth
│   │   ├── inventory/             # Gestão de Dispositivos, Alvos, Busca Full-Text
│   │   ├── telemetry/             # Métricas, Séries Temporais, SLA, OpenMetrics
│   │   └── integrations/          # Conectores externos (GLPI ITSM, Zabbix, Notificadores)
│   ├── core/                      # Shared Kernel & Utilitários Transversais
│   │   ├── database/              # SQLAlchemy AsyncSession, Base, OutboxRepository
│   │   ├── security/              # Criptografia Argon2id, JWT, SecretStr
│   │   ├── web/                   # Dependências HTTP, Lifespan, Error Handlers, Middlewares
│   │   └── config.py              # Configurações Twelve-Factor e leitura de Docker Secrets
│   ├── workers/                   # Daemons e Background Workers Assíncronos
│   │   ├── daemons/               # Entrypoints executáveis dos workers CLI
│   │   │   ├── probe_worker.py          # Sondas ICMP, HTTP, TCP e Docker Engine
│   │   │   ├── integration_worker.py    # Consumo de eventos GLPI e mensageria
│   │   │   ├── zabbix_sync_worker.py    # Sincronização periódica com Zabbix JSON-RPC
│   │   │   ├── outbox_relay_worker.py   # Despacho LISTEN/NOTIFY do PostgreSQL para Redis
│   │   │   └── token_cleanup_worker.py  # Expurgo de sessões revogadas com Distributed Lock
│   │   ├── probers/               # Micro-probers (ICMP, HTTP, TCP, DockerProber)
│   │   └── scheduler/             # Agendador em memória de alta performance
│   └── main.py                    # Factory da aplicação FastAPI e montagem de rotas
└── tests/                         # Suítes de testes automatizados (unit, integration)
```

---

## 🔐 Gerenciamento de Credenciais (Docker Secrets)

Em conformidade com a **ADR-027**, credenciais e senhas não devem ser declaradas em texto puro em variáveis de ambiente. O backend consome segredos montados pelo Docker em `/run/secrets/` (`chmod 600`) ou lê automaticamente via `entrypoint.sh`.

Para desenvolvimento local:
```bash
# Na raiz do repositório:
./scripts/init-secrets.sh
```

---

## 🚀 Execução dos Serviços

### 1. API REST, SSE e Webhook
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Documentação Interativa Swagger:** `http://localhost:8000/docs`
- **Stream SSE:** `GET /api/v1/events/stream`
- **Métricas Prometheus:** `GET /api/v1/monitoring/metrics` (Protegido por Basic Auth)
- **Webhook Zabbix:** `POST /api/v1/integrations/zabbix/webhook`

### 2. Daemons Assíncronos em Background
Cada daemon é independente e resiliente a falhas temporárias de rede (padrão `async-daemon-resilience`):

```bash
# Sondas de rede e contêineres Docker
python -m src.workers.daemons.probe_worker

# Integração GLPI e despacho de notificações
python -m src.workers.daemons.integration_worker

# Coleta periódica de telemetria de hardware no Zabbix
python -m src.workers.daemons.zabbix_sync_worker

# Relay do Transactional Outbox (PostgreSQL -> Redis Streams)
python -m src.workers.daemons.outbox_relay_worker

# Limpeza periódica de tokens expirados
python -m src.workers.daemons.token_cleanup_worker
```

---

## 🗄️ Banco de Dados e Migrações (Alembic)

Todas as alterações estruturais de schema são versionadas pelo Alembic. Conforme a **ADR-030**, todas as colunas de data/hora utilizam estritamente `TIMESTAMPTZ`:

```bash
# Aplicar todas as migrações pendentes
alembic upgrade head

# Reverter a última migração
alembic downgrade -1

# Criar uma nova migração autogerada
alembic revision --autogenerate -m "descricao_da_alteracao"
```

---

## 🧪 Qualidade de Código e Testes Automatizados

O projeto adota Test-Driven Development (TDD) estrito com cobertura unitária e de integração:

```bash
# Executar todos os testes com pytest
pytest

# Executar testes unitários de workers
pytest tests/unit/workers/ -v

# Executar testes com relatório de cobertura
pytest --cov=src --cov-report=term-missing

# Checagem de tipagem estrita com Mypy
mypy src/ tests/

# Validação e formatação com Ruff
ruff check src/ tests/
ruff format --check src/ tests/
```
