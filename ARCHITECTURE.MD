# InfraWatch — Arquitetura de Sistema (ARCHITECTURE.MD)

> **Plataforma de Observabilidade e Monitoramento de Infraestruturas Corporativas**  
> **Stack Principal:** Python 3.12+ (FastAPI) • React 18+ (Vite + TypeScript) • PostgreSQL 16+ • Redis 7+  
> **Conectores Corporativos:** Zabbix API (Telemetria Avançada) • GLPI REST API (Gestão de Chamados ITSM)

---

## 1. Visão Geral e Princípios Arquiteturais

O **InfraWatch** é estruturado como um **Monólito Modular** orientado a **Domain-Driven Design (DDD)** com segregação **CQRS**, desacoplamento físico entre a API Web e os Workers de Monitoramento, barramento de eventos resiliente e integração corporativa bidirecional com o **GLPI** e opcionalmente com o **Zabbix**.

```
                           ┌─────────────────────────────────────────────────────────┐
                           │                    React / Vite (TS)                    │
                           │   Operations Dashboard • SLA • NOC TV • Client Portal   │
                           └────────────────────────────┬────────────────────────────┘
                                                        │
                                           HTTP REST /  │ SSE (Streaming Events)
                                            JSON API    │ (text/event-stream)
                                                        ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Processo 1: InfraWatch Web API (FastAPI)                                  │
│                                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────┐   │
│  │    Identity Context   │  │   Inventory Context   │  │    Alert & SLA        │  │  Notification  │   │
│  │ (Auth, RBAC, Tenants) │  │  (Devices, Orgs, FTS) │  │ (Incidents, Rules)    │  │ (Multi-Canal)  │   │
│  └───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘  └───────┬────────┘   │
│              │                          │                          │                      │            │
│              └──────────────────────────┼──────────────────────────┴──────────────────────┘            │
│                                         ▼                                                              │
│                    ┌─────────────────────────────────────────┐                                         │
│                    │   Domain Events & Transactional Outbox  │                                         │
│                    │     (Persistência Atômica no Postgres)  │                                         │
│                    └────────────────────┬────────────────────┘                                         │
│                                         │                                                              │
│                     Outbox Relay Worker │ (Polling SKIP LOCKED / CDC)                                  │
│                                         ▼                                                              │
│                    ┌─────────────────────────────────────────┐                                         │
│                    │     Resilient Event Bus / PubSub        │                                         │
│                    │   Redis PubSub/Streams ◄──► In-Memory   │                                         │
│                    └────────────────────┬────────────────────┘                                         │
│                                         │                                                              │
│                                         ▼                                                              │
│                             SSE Channel Distributor                                                    │
└─────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                          │
                                          ├────────────────────────────┐
                                          ▼                            ▼
                 ┌─────────────────────────────────┐          ┌───────────────────┐
                 │          PostgreSQL 16+         │          │     Redis 7+      │
                 │  • Relational Data & Outbox     │          │ • Streams / PubSub│
                 │  • Full-Text Search (tsvector)  │          │ • Fast Cache      │
                 │  • Time-Series Partitioning     │          │ • Token Revoke    │
                 └────────────────┬────────────────┘          └────────┬──────────┘
                                  ▲                                    ▲
                                  │                                    │
    ┌─────────────────────────────┴────────────────────────────────────┴───────────────────────────────┐
    │                                                                                                  │
    │  Processo 2: Dedicated Probe Worker (Python)     Processo 3: Zabbix & GLPI Integration Worker    │
    │  ┌────────────────────────────────────────────┐    ┌──────────────────────────────────────────┐  │
    │  │ • In-Memory Scheduling Loop (Zero DB I/O)  │    │ • Sync periódico c/ Zabbix (CPU/RAM/SNMP)│  │
    │  │ • Async Sockets: ICMP Ping, HTTP, TCP      │    │ • Abertura e Fechamento de Chamados GLPI │  │
    │  │ • Stream Consumer (Atualizações Cadastrais)|    │ • Notificações WhatsApp / Telegram / SMS │  │
    │  │ • Self-healing Reconciliação (5 minutos)   │    └──────────────────────────────────────────┘  │
    │  └────────────────────────────────────────────┘                                                  │
    └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decisões Arquiteturais Consolidadas (Consenso Técnico)

### 2.1 Desacoplamento Físico de Processos (API vs. Monitoramento)
- A **API Web (`infrawatch-api`)** cuida exclusivamente de requisições HTTP, autenticação, SSE, CRUD e relatórios. Ela **não** executa pings nem faz requisições HTTP de teste diretamente, garantindo latência estável para os operadores.
- O **Probe Worker (`infrawatch-probe-worker`)** roda em processo/container isolado. Ele mantém a tabela de testes em memória local e executa sondas assíncronas concorrentes via `asyncio`.
- O **Integration Worker (`infrawatch-integration-worker`)** gerencia integrações externas de latência variável: chamadas à REST API do GLPI, chamadas à API JSON-RPC do Zabbix e despacho de WhatsApp/Telegram/Email.

### 2.2 Sincronização e Resiliência sem Perda de Dados
- **Agendamento em Memória de Alto Desempenho:** O probe worker não faz queries contínuas ao banco de dados para "saber quem deve pingar". O cronograma vive na memória do worker.
- **Sincronização de Mutações via Transactional Outbox + Redis Streams:** Quando um dispositivo é criado, atualizado ou pausado na API, o evento é gravado atomicamente no PostgreSQL e empurrado para o stream do Redis com confirmação (`XACK`). Se o worker reiniciar, ele consome o log pendente e se atualiza.
- **Auto-Recuperação (Self-Healing):** A cada 5 minutos, o worker faz uma consulta de validação rápida no PostgreSQL (`SELECT id, updated_at FROM devices`) para assegurar paridade absoluta entre a memória e o banco de dados.

### 2.3 Modelo Híbrido de Coleta (Worker Leve + Zabbix API)
- **Disponibilidade e SLA Instantâneos (Nativo):** O InfraWatch monitora ICMP Ping, HTTP(S), portas TCP e Heartbeats de forma 100% autônoma, sem depender de ferramentas de terceiros.
- **Telemetria Profunda de Hardware (Zabbix Connector):** Caso o ativo possua vínculo com o Zabbix (`zabbix_host_id`), o conector sincroniza métricas avançadas (carga de CPU, consumo de RAM, espaço em disco e tráfego de interface) sem reinventar parsers de MIBs SNMP proprietárias.

### 2.4 Autenticação e Multi-Tenancy Seguro (RCS Angola)
- **Baseado no Escopo do Projeto `Auth`:** JWT assinado, rotação estrita de Refresh Token, blacklist no Redis/memória, hashing Argon2/Bcrypt. Remoção de WebSockets do projeto base em favor do streaming nativo via **Server-Sent Events (SSE)**.
- **Privacidade Rigorosa por Cliente (Sem Páginas Públicas Abertas):**
  - O sistema é 100% privado.
  - Papéis RBAC:
    - `ADMIN` (RCS Global): Gestão irrestrita de toda a plataforma, clientes e infraestruturas.
    - `OPERATOR` (RCS NOC): Operação técnica global (atendimento a incidentes, ack, pausas).
    - `CLIENT_VIEWER` (Cliente Final): Acesso exclusivo aos ativos da sua própria `Organization`. Detalhes confidenciais de rede (como IPs de roteamento interno e portas de banco) são mascarados na interface do cliente.

### 2.5 Integração Inteligente com o GLPI (ITSM)
- Ao confirmar uma queda (incidente `CRITICAL`), o InfraWatch executa `POST /apirest.php/Ticket` no GLPI.
- O `glpi_ticket_id` é registrado no incidente e exibido no painel de NOC.
- Quando o operador faz *Acknowledge* no InfraWatch, uma anotação é inserida no chamado do GLPI.
- Quando a sonda detecta o restabelecimento do serviço (`RESOLVED`), o chamado no GLPI é atualizado com o tempo total de downtime e solução automática.

---

## 3. Catálogo Global de Rotas da API

### 3.1 Autenticação e Usuários (`/api/v1/auth` e `/api/v1/users`)
- `POST /api/v1/auth/login` — Autenticação com e-mail/senha, retorna Access Token e Refresh Token.
- `POST /api/v1/auth/refresh` — Rotação de Refresh Token.
- `POST /api/v1/auth/logout` — Revogação de sessão e inclusão na blacklist.
- `GET /api/v1/auth/me` — Dados do usuário logado, organização vinculada e permissões.
- `GET /api/v1/users` — Listagem de usuários (filtrado por tenant ou global para Admin).
- `POST /api/v1/users` — Cadastro de operadores ou usuários de clientes.
- `PATCH /api/v1/users/{id}/role` — Alteração de privilégios.

### 3.2 Organizações / Clientes Multi-Tenant (`/api/v1/organizations`)
- `GET /api/v1/organizations` — Listagem de clientes da RCS Angola.
- `POST /api/v1/organizations` — Criação de novo cliente/empresa.
- `PUT /api/v1/organizations/{id}` — Configuração de dados de contato e SLA contratual padrão.

### 3.3 Inventário de Ativos (`/api/v1/devices`)
- `GET /api/v1/devices` — Lista de ativos com Full-Text Search (`?q=term`), filtros por status, organização e tags.
- `POST /api/v1/devices` — Cadastro de dispositivo com validação de invariantes e outbox event.
- `GET /api/v1/devices/{id}` — Detalhes completos do ativo.
- `PUT /api/v1/devices/{id}` — Atualização cadastral.
- `DELETE /api/v1/devices/{id}` — Remoção lógica ou definitiva.
- `POST /api/v1/devices/{id}/pause` — Pausar monitoramento.
- `POST /api/v1/devices/{id}/resume` — Retomar monitoramento.
- `POST /api/v1/devices/{id}/maintenance` — Definir janela de manutenção programada.
- `POST /api/v1/devices/{id}/test-now` — Disparar sonda imediata sob demanda.

### 3.4 Telemetria e Métricas (`/api/v1/monitoring`)
- `GET /api/v1/monitoring/overview` — Contadores consolidados em tempo real (Total, UP, Degraded, DOWN, Uptime Médio).
- `GET /api/v1/monitoring/devices/{id}/metrics` — Histórico de latência e tempos de resposta (1h, 24h, 7d, 30d).
- `GET /api/v1/monitoring/devices/{id}/uptime-timeline` — Histórico visual de 90 dias de disponibilidade.
- `POST /api/v1/monitoring/heartbeat/{token}` — Endpoint passivo de recepção de sinal de cronjobs.

### 3.5 Alertas, Incidentes e SLA (`/api/v1/incidents` e `/api/v1/sla`)
- `GET /api/v1/incidents` — Lista de incidentes ativos e resolvidos com filtros.
- `GET /api/v1/incidents/{id}` — Linha do tempo detalhada do incidente e notas de atendimento.
- `POST /api/v1/incidents/{id}/acknowledge` — Operador reconhece incidente e suspende alarmes.
- `POST /api/v1/incidents/{id}/resolve` — Resolução manual com justificativa.
- `GET /api/v1/sla/summary` — Relatório de SLA mensal acumulado por cliente ou ativo.
- `GET /api/v1/sla/export` — Exportação de relatório em PDF/CSV para diretoria e clientes.

### 3.6 Integração GLPI (`/api/v1/integrations/glpi`)
- `GET /api/v1/integrations/glpi/config` — Consulta parâmetros de conexão GLPI.
- `PUT /api/v1/integrations/glpi/config` — Configuração de URL, App-Token e User-Token.
- `POST /api/v1/incidents/{id}/create-ticket` — Abertura manual forçada de chamado no GLPI em 1 clique.

### 3.7 Notificações Multi-Canal (`/api/v1/notifications`)
- `GET /api/v1/notifications/channels` — Canais configurados (Email, Telegram, WhatsApp/SMS, Webhook).
- `POST /api/v1/notifications/channels` — Cadastro de canal com credenciais.
- `POST /api/v1/notifications/channels/{id}/test` — Disparo de teste de validação.
- `GET /api/v1/notifications/logs` — Auditoria de alertas enviados.

### 3.8 Streaming em Tempo Real (`/api/v1/events`)
- `GET /api/v1/events/stream` — Conexão SSE persistente com eventos tipados (`probe_result`, `status_change`, `incident_created`, `incident_acked`, `incident_resolved`).

---

## 4. Estrutura de Pastas Monorepo do Back ao Front

```
InfraWatch/
├── ARCHITECTURE.MD
├── docker-compose.yml                   # Orquestração: API, Workers, Postgres, Redis
├── Makefile
├── docs/                                # Documentação atualizada
│   ├── DECISIONS.md                     # Livro de Decisões Técnicas (ADR-001 a ADR-013)
│   ├── 01-PRD.md                        # Product Requirements Document
│   ├── 02-TRD.md                        # Technical Requirements Document
│   ├── 03-APP_FLOW.md                   # Fluxos de uso e ciclos de eventos
│   ├── 04-UI_UX_BRIEF.md                # Especificação de interface e experiência
│   ├── 05-BACKEND_SCHEMA.md             # Modelagem de banco, índices e outbox
│   └── 06-IMPLEMENTATION_PLAN.md        # Roteiro passo a passo de implementação
│
├── backend/
│   ├── pyproject.toml
│   ├── Dockerfile.api                   # Imagem do serviço HTTP FastAPI
│   ├── Dockerfile.worker                # Imagem do Probe Worker / Integration Worker
│   ├── alembic/                         # Migrações versionadas
│   ├── src/
│   │   ├── main.py                      # Ponto de entrada FastAPI Web API
│   │   ├── worker_probe.py              # Ponto de entrada do Probe Worker Daemon
│   │   ├── worker_integration.py        # Ponto de entrada do Worker GLPI/Notif/Zabbix
│   │   ├── config.py
│   │   │
│   │   ├── shared/                      # Componentes transversais
│   │   │   ├── domain/                  # Base Entity, ValueObject, AggregateRoot, DomainEvent
│   │   │   ├── infrastructure/
│   │   │   │   ├── database.py          # SQLAlchemy async session & pool
│   │   │   │   ├── event_bus.py         # ResilientEventBus (Streams / PubSub / Memory)
│   │   │   │   └── outbox.py            # Outbox publisher & worker logic
│   │   │   └── presentation/
│   │   │       ├── sse.py               # SSE connection manager
│   │   │       └── dependencies.py      # Autenticação, RBAC e injeção de dependências
│   │   │
│   │   └── contexts/                    # Bounded Contexts Modulares
│   │       ├── identity/                # JWT, Refresh Tokens, RBAC (Baseado no Auth)
│   │       ├── organization/            # Tenants, Clientes da RCS Angola
│   │       ├── inventory/               # Ativos, Dispositivos, Full-Text Search
│   │       ├── monitoring/              # Sondas (ICMP, HTTP, TCP), Zabbix Sync
│   │       ├── alert/                   # Regras, Incidentes e Cálculo de SLA
│   │       ├── integration_glpi/        # Cliente REST API do GLPI
│   │       └── notification/            # Email, Telegram, WhatsApp (número virtual), Webhook
│   └── tests/
│
└── frontend/                            # React 18+ / Vite / TypeScript
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── shared/                      # Design tokens, hooks (useSSE), componentes UI
        ├── layouts/                     # Sidebar, Topbar com status global, NOC Fullscreen
        └── modules/
            ├── auth/                    # Login, perfil, troca de senha
            ├── dashboard/               # Grid operacional em tempo real e NOC TV
            ├── inventory/               # Gestão de ativos com busca FTS
            ├── incidents/               # Painel de atendimento e integração GLPI
            ├── sla/                     # Relatórios de SLA por cliente
            └── settings/                # Configurações de canais e GLPI
```
