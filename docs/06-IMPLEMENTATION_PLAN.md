# InfraWatch — Plano de Implementação Passo a Passo (IMPLEMENTATION_PLAN)

> **Documento:** 06-IMPLEMENTATION_PLAN.md  
> **Status:** Aprovado e Consolidado  
> **Estratégia:** Implementação modular desacoplada do Backend ao Frontend.

---

## 1. Visão Geral das Fases de Entrega

```
[Fase 0: Docker & Multi-Container Setup]
           │
           ▼
[Fase 1: Shared Core, Outbox & EventBus Resiliente]
           │
           ▼
[Fase 2: Identity & Multi-Tenancy (Baseado no Auth)]
           │
           ▼
[Fase 3: Inventory Context & Full-Text Search]
           │
           ▼
[Fase 4: Probe Worker Daemon (Memória + Streams)]
           │
           ▼
[Fase 5: Integration Worker: GLPI, Zabbix & Notificações]
           │
           ▼
[Fase 6: Alert Context, Incidentes & Motor de SLA]
           │
           ▼
[Fase 7: Frontend React/Vite: NOC TV & Portal do Cliente]
           │
           ▼
[Fase 8: Testes de Resiliência, E2E e Homologação]
```

---

## 2. Tarefas Detalhadas por Fase

### Fase 0: Setup do Ambiente Multi-Serviço
- [ ] **Tarefa 0.1:** Criar `docker-compose.yml` orquestrando:
  - `postgres`: PostgreSQL 16+ com extensões `uuid-ossp` e `pgcrypto`.
  - `redis`: Redis 7+ com persistência AOF/RDB.
  - `infrawatch-api`: Serviço FastAPI (porta 8000).
  - `infrawatch-probe-worker`: Worker dedicado para pings e requisições de rede.
  - `infrawatch-integration-worker`: Worker para GLPI, Zabbix e disparo de mensagens.
- [ ] **Tarefa 0.2:** Configuração do Backend Python 3.12 (`pyproject.toml` com FastAPI, SQLAlchemy async, asyncpg, Alembic, Pydantic v2, Httpx, aioping).
- [ ] **Tarefa 0.3:** Configuração do Frontend React + Vite + TypeScript (`frontend/`).

---

### Fase 1: Shared Core, Transactional Outbox e Barramento Resiliente
- [ ] **Tarefa 1.1:** Implementar classes base de domínio DDD (`Entity`, `ValueObject`, `AggregateRoot`, `DomainEvent`).
- [ ] **Tarefa 1.2:** Configurar engine assíncrona SQLAlchemy e Unit of Work para persistência atômica.
- [ ] **Tarefa 1.3:** Implementar a tabela `outbox_events` e o `OutboxRelayWorker` com `FOR UPDATE SKIP LOCKED`.
- [ ] **Tarefa 1.4:** Implementar o `ResilientEventBus` com suporte a Redis Streams, Redis PubSub e fallback transparente para `InMemoryEventBus`.
- [ ] **Tarefa 1.5:** Implementar o canal de streaming SSE (`GET /api/v1/events/stream`) com heartbeat a cada 15s.

---

### Fase 2: Identity & Multi-Tenancy (Adaptação Cirúrgica do Projeto Auth)
> **Estratégia de Adaptação Cirúrgica:** Em vez de reescrever do zero ou clonar às cegas com arquivos redundantes, extraímos cirurgicamente os módulos de segurança testados do repositório `Auth` (`/spot/NdDaniel/Code/Estudo/Auth`) e os integramos diretamente em `backend/src/contexts/identity/`:
> - Criptografia: `app/core/security.py` (Argon2id, geração de tokens opacos).
> - JWT & Rotação: `app/services/auth_service.py` (criação de par de tokens, rotação estrita de refresh token).
> - Rate Limiting & Account Lockout: `app/core/rate_limiter.py` (Dual-Key: IP e Conta via Redis).
> - Revogação / Blacklist: `app/services/token_service.py` (invalidação de tokens no Redis).
> - Eventos e Consumers: `app/messaging/` (eliminando `BackgroundTasks` em favor de Consumers com DLQ).
> - **Exclusões estritas:** Remoção de WebSockets e código legado de brokers redundantes.

- [ ] **Tarefa 2.1:** Migração das tabelas `organizations`, `users`, `refresh_tokens` e `audit_logs`.
- [ ] **Tarefa 2.2 (Adaptação Cirúrgica - Security Core):** Portar e plugar hashing Argon2id e geração de tokens JWT seguros.
- [ ] **Tarefa 2.3 (Dual-Key Rate Limiting - Issue #116):** Implementar rate-limiting centralizado no Redis por IP (`rate_limit:login:ip`) e por Conta (`rate_limit:login:email`) com Account Lockout temporário contra força bruta distribuída.
- [ ] **Tarefa 2.4 (Mitigação de Timing Attack - Issue #115):** Garantir respostas em tempo constante neutro em rotas sensíveis de autenticação e recuperação de senha.
- [ ] **Tarefa 2.5 (Trusted Proxies & Anti-Spoofing - Issue #114):** Configuração segura do Uvicorn com `--proxy-headers` e sanitização de `X-Forwarded-For`.
- [ ] **Tarefa 2.6 (Distributed Lock Não-Bloqueante - Issue #148):** Implementar lock no Redis (`redis_client.lock("lock:cleanup", timeout=300, blocking=False)`) para garantir que rotinas de limpeza rodem em apenas uma réplica em produção.
- [ ] **Tarefa 2.7:** Implementar middleware de RBAC com perfis `ADMIN` (RCS Global), `OPERATOR` (RCS NOC) e `CLIENT_VIEWER` (Cliente isolado por `organization_id`).
- [ ] **Tarefa 2.8:** Endpoints REST `/api/v1/auth/*` e `/api/v1/organizations/*` sem `BackgroundTasks` (100% orientados a Consumers).
- [ ] **Tarefa 2.9:** Middleware de trilha de auditoria imutável (`audit_logs`) para conformidade e rastreabilidade.

---

### Fase 3: Inventory Context e Busca Full-Text
- [ ] **Tarefa 3.1:** Aggregate `Device` e Value Objects (`IPAddress`, `NetworkPort`, `DeviceCategory`).
- [ ] **Tarefa 3.2:** Migração Alembic da tabela `devices` com coluna gerada `search_vector` e índice GIN.
- [ ] **Tarefa 3.3:** Comandos de escrita (Create, Update, Pause, SetMaintenance) emitindo eventos no Transactional Outbox.
- [ ] **Tarefa 3.4:** Queries de leitura com busca Full-Text (`websearch_to_tsquery`) e paginação.
- [ ] **Tarefa 3.5:** Endpoints REST `/api/v1/devices/*`.

---

### Fase 4: Probe Worker Daemon (Agendador em Memória + Streams)
- [ ] **Tarefa 4.1:** Implementar o daemon `worker_probe.py` com carregamento inicial de ativos em memória.
- [ ] **Tarefa 4.2:** Consumo de mutações cadastrais do Redis Stream (`stream:inventory:changes`) com `XREADGROUP` e confirmação `XACK`.
- [ ] **Tarefa 4.3:** Rotina de auto-reconciliação *self-healing* a cada 5 minutos no PostgreSQL.
- [ ] **Tarefa 4.4:** Executores assíncronos de sondas: `IcmpProber`, `HttpProber` e `TcpProber`.
- [ ] **Tarefa 4.5:** Gravação de métricas na tabela particionada `metrics` e publicação de telemetria via SSE.
- [ ] **Tarefa 4.6:** Implementar rotina de expurgo de métricas com mais de 30 dias e endpoint OpenMetrics/Prometheus (`GET /api/v1/monitoring/metrics`).

---

### Fase 5: Integration Worker (GLPI, Zabbix e Notificações)
- [ ] **Tarefa 5.1:** Implementar cliente REST API do GLPI (`GlpiClient`):
  - Autenticação com `initSession`.
  - Abertura de chamado (`POST /Ticket`).
  - Atualização com anotação (`POST /Ticket/{id}/ITILFollowup`).
  - Fechamento com registro de downtime (`PUT /Ticket/{id}`).
- [ ] **Tarefa 5.2:** Implementar conector Zabbix JSON-RPC para coleta periódica de hardware (CPU, RAM, Disco).
- [ ] **Tarefa 5.3:** Notificadores de mensageria:
  - WhatsApp/SMS (gateway com número virtual).
  - Telegram Bot.
  - Webhooks (Slack/Discord).
  - E-mail SMTP.

---

### Fase 6: Alert Context, Incidentes e Motor de SLA
- [ ] **Tarefa 6.1:** Lógica de avaliação de falhas consecutivas (`consecutive_failures >= retry_threshold`).
- [ ] **Tarefa 6.2:** Criação atômica de incidente e disparo do evento para o Integration Worker (abertura no GLPI e alertas).
- [ ] **Tarefa 6.3:** Comandos de atendimento: `AcknowledgeIncident` e `ResolveIncident`.
- [ ] **Tarefa 6.4:** Motor de cálculo de SLA mensal (com isenção de janelas de manutenção) e geração de relatórios.
- [ ] **Tarefa 6.5:** Gestão de Janelas de Manutenção Programada (`maintenance_windows`).

---

### Fase 7: Frontend React + Vite (TypeScript)
- [ ] **Tarefa 7.1:** Design tokens operacionais dark mode (`index.css`) com foco em alto contraste e legibilidade.
- [ ] **Tarefa 7.2:** Hook `useSSE` com auto-reconnect e buffer de eventos em tempo real.
- [ ] **Tarefa 7.3:** Grid Operacional de Cartões com sparklines de latência e histórico diário de 90 dias.
- [ ] **Tarefa 7.4:** Modo NOC TV Fullscreen para exibição em monitores de parede da central.
- [ ] **Tarefa 7.5:** Portal do Cliente (`CLIENT_VIEWER`) com visão limpa e dados técnicos sensíveis mascarados.
- [ ] **Tarefa 7.6:** Painel de Incidentes com link direto para o chamado do GLPI e botão de Acknowledge.

---

### Fase 8: Testes de Carga, Resiliência e Homologação
- [ ] **Tarefa 8.1:** Teste de resiliência: derrubar o Redis e validar o chaveamento imediato para `InMemoryEventBus`.
- [ ] **Tarefa 8.2:** Teste de consistência do Outbox: validar que nenhum evento cadastral é perdido mesmo desligando o Probe Worker durante operações de escrita.
- [ ] **Tarefa 8.3:** Teste de integração ponta a ponta com simulação de queda de servidor, abertura de ticket no GLPI e notificação no Telegram/WhatsApp.
