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
- [x] **Tarefa 0.1:** Criar `docker-compose.yml` orquestrando:
  - `postgres`: PostgreSQL 16+ com extensões `uuid-ossp`, `pgcrypto` e `TIMESTAMPTZ` (ADR-030).
  - `redis`: Redis 7+ com persistência AOF/RDB e autenticação por Docker Secrets.
  - `infrawatch-api`: Serviço FastAPI (porta 8000) com Thin Controllers e Handlers desacoplados.
  - `infrawatch-docker-proxy`: Proxy Zero-Trust (`tecnativa/docker-socket-proxy`) blindando o socket do host (ADR-026).
  - `infrawatch-probe-worker`: Worker dedicado para pings, HTTP, TCP e DockerProber sem privilégios root.
  - `infrawatch-integration-worker`: Worker para GLPI, Zabbix e disparo de mensageria.
  - `infrawatch-outbox-worker`: Daemon reativo de Transactional Outbox despertado por `LISTEN/NOTIFY`.
  - `infrawatch-token-worker`: Daemon de expurgo de sessões revogadas com Distributed Lock.
  - `infrawatch-zabbix-sync-worker`: Ingestor periódico de telemetria de hardware Zabbix.
  - `infrawatch-whatsapp-gateway`: Gateway de mensageria (Evolution API) isolado sob profile opcional.
  - Gerenciamento seguro de credenciais via **Docker Secrets** (`/run/secrets/` com `chmod 600`, ADR-027).
- [x] **Tarefa 0.2:** Configuração do Backend Python 3.12 (`pyproject.toml` com FastAPI, SQLAlchemy async, asyncpg, Alembic, Pydantic v2, Httpx, aioping).
- [x] **Tarefa 0.3:** Configuração do Frontend React + Vite + TypeScript (`frontend/`).

---

### Fase 1: Shared Core, Transactional Outbox e Barramento Resiliente
- [x] **Tarefa 1.1:** Implementar classes base de domínio DDD (`Entity`, `ValueObject`, `AggregateRoot`, `DomainEvent`).
- [x] **Tarefa 1.2:** Configurar engine assíncrona SQLAlchemy e Unit of Work para persistência atômica.
- [x] **Tarefa 1.3:** Implementar a tabela `outbox_events` e o `OutboxRelayWorker` com `FOR UPDATE SKIP LOCKED` e trigger reativo `LISTEN/NOTIFY` (`outbox_events_wake`).
- [x] **Tarefa 1.4:** Implementar o `ResilientEventBus` com suporte a Redis Streams, Redis PubSub e fallback transparente para `InMemoryEventBus`.
- [x] **Tarefa 1.5:** Implementar o canal de streaming SSE (`GET /api/v1/events/stream`) com heartbeat a cada 15s.

---

### Fase 2: Identity & Multi-Tenancy (Adaptação Cirúrgica do Projeto Auth)
- [x] **Tarefa 2.1:** Migração das tabelas `organizations`, `users`, `refresh_tokens` e `audit_logs` padronizadas com `TIMESTAMPTZ` (ADR-030).
- [x] **Tarefa 2.2 (Adaptação Cirúrgica - Security Core):** Portar e plugar hashing Argon2id e geração de tokens JWT seguros.
- [x] **Tarefa 2.3 (Dual-Key Rate Limiting - Issue #116):** Implementar rate-limiting centralizado no Redis por IP (`rate_limit:login:ip`) e por Conta (`rate_limit:login:email`) com Account Lockout temporário contra força bruta distribuída.
- [x] **Tarefa 2.4 (Mitigação de Timing Attack - Issue #115):** Respostas em tempo constante neutro (~10ms) em rotas sensíveis de autenticação e recuperação de senha.
- [x] **Tarefa 2.5 (Trusted Proxies & Anti-Spoofing - Issue #114):** Configuração segura do Uvicorn com `--proxy-headers` e sanitização de `X-Forwarded-For`.
- [x] **Tarefa 2.6 (Distributed Lock Não-Bloqueante - Issue #148):** Implementar lock no Redis (`redis_client.lock("lock:cleanup", timeout=300, blocking=False)`) para garantir execução singleton em daemons de expurgo.
- [x] **Tarefa 2.7:** Implementar middleware de RBAC com perfis `SUPER_ADMIN` (RCS Global), `NOC_OPERATOR` (RCS NOC), `ORG_ADMIN` (Administrador do Cliente) e `CLIENT_VIEWER` (Cliente isolado com visão sanitizada).
- [x] **Tarefa 2.8:** Endpoints REST `/api/v1/auth/*` e `/api/v1/organizations/*` sem `BackgroundTasks` (100% orientados a Consumers).
- [x] **Tarefa 2.9:** Middleware de trilha de auditoria imutável (`audit_logs`) para conformidade e rastreabilidade.

---

### Fase 3: Inventory Context e Busca Full-Text
- [x] **Tarefa 3.1:** Aggregate `Device` e Value Objects (`IPAddress`, `NetworkPort`, `DeviceCategory`).
- [x] **Tarefa 3.2:** Migração Alembic da tabela `devices` com coluna gerada `search_vector` e índice GIN.
- [x] **Tarefa 3.3:** Comandos de escrita (Create, Update, Pause, SetMaintenance) emitindo eventos no Transactional Outbox.
- [x] **Tarefa 3.4:** Queries de leitura com busca Full-Text (`websearch_to_tsquery`) e paginação.
- [x] **Tarefa 3.5:** Endpoints REST `/api/v1/devices/*`.

---

### Fase 4: Probe Worker Daemon (Agendador em Memória + Streams)
- [x] **Tarefa 4.1:** Implementar o daemon `src.workers.daemons.probe_worker` com carregamento inicial de ativos em memória.
- [x] **Tarefa 4.2:** Consumo de mutações cadastrais do Redis Stream (`stream:inventory:changes`) com `XREADGROUP` e confirmação `XACK`.
- [x] **Tarefa 4.3:** Rotina de auto-reconciliação *self-healing* a cada 5 minutos no PostgreSQL.
- [x] **Tarefa 4.4:** Executores assíncronos de sondas: `IcmpProber`, `HttpProber`, `TcpProber` e **`DockerProber`** nativo com blindagem via `infrawatch-docker-proxy` (ADR-026).
- [x] **Tarefa 4.5:** Gravação de métricas na tabela particionada `metrics` e publicação de telemetria via SSE.
- [x] **Tarefa 4.6:** Implementar rotina de expurgo de métricas com mais de 30 dias e endpoint OpenMetrics/Prometheus (`GET /api/v1/monitoring/metrics`) protegido por Basic Auth.

---

### Fase 5: Integration Worker (GLPI, Zabbix e Notificações)
- [x] **Tarefa 5.1:** Implementar cliente REST API do GLPI (`GlpiClient`):
  - Autenticação com `initSession`.
  - Abertura de chamado (`POST /Ticket`).
  - Atualização com anotação (`POST /Ticket/{id}/ITILFollowup`).
  - Fechamento com registro de downtime (`PUT /Ticket/{id}`).
- [x] **Tarefa 5.2:** Ingestão Zabbix Híbrida (ADR-028):
  - Receptor de alarme Push Webhook (`/api/v1/integrations/zabbix/webhook`).
  - Autoconfiguração idempotente no startup via `ZabbixWebhookBootstrapper`.
  - Sincronização periódica de hardware via JSON-RPC (`zabbix_sync_worker`).
- [x] **Tarefa 5.3:** Notificadores de mensageria:
  - Telegram Bot.
  - Webhooks (Slack/Discord/Teams).
  - E-mail SMTP.
  - WhatsApp (Evolution API isolada sob profile).

---

### Fase 6: Alert Context, Incidentes e Motor de SLA
- [x] **Tarefa 6.1:** Lógica de avaliação de falhas consecutivas (`consecutive_failures >= retry_threshold`) e detecção de degradação.
- [x] **Tarefa 6.2:** Criação atômica de incidente e disparo do evento para o Integration Worker (abertura no GLPI e alertas).
- [x] **Tarefa 6.3:** Comandos de atendimento: `AcknowledgeIncident` e `ResolveIncident`.
- [x] **Tarefa 6.4:** Motor de cálculo de SLA mensal (com isenção contratual para janelas de manutenção) e geração de relatórios.
- [x] **Tarefa 6.5:** Gestão de Janelas de Manutenção Programada (`maintenance_windows`).

---

### Fase 7: Frontend React + Vite + TypeScript (NOC Cockpit & Client Portal)
- [x] **Tarefa 7.1:** Design tokens operacionais dark mode (`index.css`), componentes base atômicos no padrão shadcn/ui (`Button`, `Card`, `Modal`, `Badge`, `Skeleton`) e utilitário `cn` (`clsx` + `tailwind-merge`).
- [x] **Tarefa 7.2:** Motor de Tempo Real: Hook `useSSE` com auto-reconnect e buffer de eventos em tempo real.
- [ ] **Tarefa 7.3:** Shell da Aplicação, Roteamento & RBAC Guards:
  - Configuração do React Router com layouts protegidos por `<Outlet />`.
  - Guards de autorização baseados em `UserRole` (`SUPER_ADMIN`, `NOC_OPERATOR`, `ORG_ADMIN`, `CLIENT_VIEWER`).
  - Header Global com Status Ticker executivo em tempo real, relógio UTC e indicador de streaming ativo (`LiveIndicator`).
- [ ] **Tarefa 7.4:** Autenticação, MFA & Gestão de Acessos:
  - Formulário de login com suporte a desafio MFA de duas etapas (código TOTP de 6 dígitos via `/auth/login/mfa-challenge`).
  - Botão e fluxo de login social Google OAuth2 (`/auth/google/url` e `/auth/google/callback`).
  - Telas de recuperação de senha (`/auth/password-reset/*`) e confirmação de e-mail (`/auth/verify-email`).
  - Painel de Segurança do Usuário: ativação de MFA com QR Code (`otpauth://`), cópia de 10 códigos de backup e gestão/revogação de sessões e dispositivos ativos (`/users/me/sessions`).
- [ ] **Tarefa 7.5:** Cockpit NOC & Grade Operacional de Dispositivos (Estratégia *Hydrate & Stream*):
  - Hidratação instantânea via TanStack Query em `/api/v1/events/telemetry`.
  - Atualização contínua de micrográficos (sparklines de latência dos últimos 60 pings e histórico diário de 90 dias) acoplada ao `useSSE`.
  - Barra de busca global rápida (`Ctrl + K` / `Cmd + K`) consumindo o endpoint Full-Text Search do PostgreSQL (`/api/v1/devices/search`).
  - Modo NOC TV Fullscreen (`F`) com tipografia ampliada de alto contraste para telões de parede.
- [ ] **Tarefa 7.6:** Gestão de Inventário & Ações Operacionais:
  - Modal e formulário de cadastro/edição de ativos com suporte a sondas ICMP, HTTP, TCP, Docker Container (`DockerProber`) e Heartbeat Passivo.
  - Ações rápidas no card: Pausar monitoramento com justificativa (`/pause`), Retomar (`/resume`) e Manutenção rápida.
- [ ] **Tarefa 7.7:** Painel de Incidentes & Integração GLPI (ITSM):
  - Drawer lateral deslizante (slide-over) com linha do tempo de falhas e diagnósticos técnicos.
  - Ação de Reconhecimento imediato do incidente (`POST /api/v1/incidents/{id}/acknowledge`).
  - Modal de Resolução de Incidente com campo obrigatório de Causa Raiz técnica (`POST /api/v1/incidents/{id}/resolve`).
  - Botão de abertura manual de chamado GLPI em 1 clique (`POST /api/v1/incidents/{id}/glpi-ticket`) com badge e link direto para o chamado.
- [ ] **Tarefa 7.8:** Gestão de Janelas de Manutenção & Motor de SLA:
  - Painel de agendamento de Janelas de Manutenção Programada (`/api/v1/maintenance-windows`).
  - Workflow de Aprovação Formal (`POST /maintenance-windows/{id}/approve`) para isenção contratual da janela no cálculo de SLA.
  - Medidor de SLA acumulado do mês vs. meta contratual (99.5%) com métricas de MTTR e MTBF.
  - Botões para exportação analítica de relatórios em CSV e JSON (`/api/v1/sla/devices/{id}/export` e `/organizations/{id}/export`).
- [ ] **Tarefa 7.9:** Portal do Cliente (`CLIENT_VIEWER`):
  - Visão executiva limpa e sanitizada sem IPs de rede privada (`10.x.x.x`) ou portas de banco confidenciais.
  - Medidor visual circular de disponibilidade mensal acumulada e cartões amigáveis de serviços corporativos.
  - Centro de Notificações In-App: Bell icon com badge de não-lidas (`/notifications/unread-count`), popover de alertas recentes e sincronização *Catch-Up* automática pós-reconexão (`/notifications/sync`).
- [ ] **Tarefa 7.10:** Trilha de Auditoria Forense & Gestão Administrativa:
  - Listagem paginada de logs de auditoria imutáveis (`/api/v1/audit/logs`) com filtros.
  - Botão de verificação criptográfica da integridade da cadeia de hashes SHA-256 (`POST /api/v1/audit/verify`).
  - Painel administrativo para gestão de usuários, papéis RBAC e organizações clientes (`/users` e `/organizations`).
- [ ] **Tarefa 7.11:** Infraestrutura, Containerização & Automação do Frontend:
  - Criar `frontend/Dockerfile` com build multi-stage (Node 20 Alpine para compilação Vite + Nginx Alpine para runtime estático de ~25MB).
  - Criar `nginx/nginx.conf` na raiz como Gateway/Proxy Reverso:
    - Roteamento SPA com `try_files $uri $uri/ /index.html;` para suportar rotas profundas do React Router.
    - Proxy transparente de `/api/` para `infrawatch-api:8000` (eliminando problemas de CORS e portas expostas).
    - Desativação estrita de buffering para SSE (`proxy_buffering off; proxy_cache off; chunked_transfer_encoding off;`).
  - Adicionar serviços `infrawatch-frontend` e `infrawatch-gateway` (Nginx) no `docker-compose.yml`.
  - Adicionar regras de frontend no `Makefile` (`make front-dev`, `make front-test`, `make front-build`, `make front-lint`).

---

### Fase 8: Testes de Carga, Resiliência e Homologação
- [x] **Tarefa 8.1:** Teste de resiliência: chaveamento de fallback e reconexão automática do barramento.
- [x] **Tarefa 8.2:** Teste de consistência do Outbox: confirmação transacional e tolerância a falhas temporárias.
- [x] **Tarefa 8.3:** Testes unitários e de integração automatizados cobrindo autenticação, inventário, Zabbix bootstrapper e probers.
- [ ] **Tarefa 8.4:** Bateria de testes de carga simulando 5.000 alvos simultâneos sob alta concorrência.
- [ ] **Tarefa 8.5:** Pipeline de Backup Automatizado Multi-Destino Dual-Cloud & Disaster Recovery (Issue #220, ADR-032):
  - Contêiner dedicado `infrawatch-backup` com agendamento Cron diário e isolamento total da API (*Blast Radius* zero).
  - Dump comprimido do TimescaleDB (`-Fc`), snapshot do Redis e encriptação AES-256 de `secrets/`.
  - Distribuição multi-destino com `rclone`: Local (`/var/backups`), Google Drive e Cloudflare R2 (com AWS S3 preparado).
  - Rota administrativa `POST /api/v1/system/backup` (HTTP 202) e botão "Gerar Backup Manual" no Dashboard NOC.
  - Script de restauração em comando único (`scripts/restore.sh` / `make restore`).
