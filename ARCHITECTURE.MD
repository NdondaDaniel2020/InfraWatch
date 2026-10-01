# InfraWatch — Arquitetura de Sistema (ARCHITECTURE.MD)

> **Plataforma Enterprise de Observabilidade de Rede, NOC Telemetry & Gestão Automatizada de Incidentes com GLPI**  
> **Stack Principal:** Python 3.12+ (FastAPI) • React 18+ (Vite + TypeScript) • PostgreSQL 16+ • Redis 7+ (Streams & Locks)  
> **Conectores Corporativos:** Zabbix JSON-RPC API (Hardware & SNMP) • GLPI REST API 10+ (Gestão de Chamados ITSM)  
> **Ambiente Operacional:** RCS Angola / Exija Serviços (Multi-Tenant Isolado)

---

## 1. Visão Geral e Princípios Arquiteturais

O **InfraWatch** é estruturado como um **Monólito Modular** orientado a **Domain-Driven Design (DDD)** com segregação **CQRS** (Command Query Responsibility Segregation), desacoplamento físico entre a API Web e os Workers de Monitoramento, barramento de eventos resiliente e integração corporativa bidirecional com o **GLPI** e o **Zabbix**.

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
│                    │   Redis Streams / PubSub ◄──► In-Memory │                                         │
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
                 │  • Audit Trail Imutável         │          │ • Distributed Lock│
                 └────────────────┬────────────────┘          └────────┬──────────┘
                                  ▲                                    ▲
                                  │                                    │
    ┌─────────────────────────────┴────────────────────────────────────┴───────────────────────────────┐
    │                                                                                                  │
    │  Processo 2: Dedicated Probe Worker (Python)     Processo 3: Zabbix & GLPI Integration Worker    │
    │  ┌────────────────────────────────────────────┐    ┌──────────────────────────────────────────┐  │
    │  │ • In-Memory Scheduling Loop (Zero DB I/O)  │    │ • Sync periódico c/ Zabbix (CPU/RAM/SNMP)│  │
    │  │ • Async Sockets: ICMP Ping, HTTP, TCP, SSL │    │ • Abertura e Fechamento de Chamados GLPI │  │
    │  │ • Stream Consumer (Atualizações Cadastrais)│    │ • Notificações WhatsApp / Telegram / SMS │  │
    │  │ • Self-healing Reconciliação (5 minutos)   │    │ • Escalas de Plantão & Horários          │  │
    │  └────────────────────────────────────────────┘    └──────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decisões Arquiteturais Consolidadas (Consenso Técnico e ADRs)

### 2.1 Stack Tecnológico Principal (ADR-001)
- **Backend:** Python 3.12+ assíncrono com FastAPI, SQLAlchemy 2.0 (asyncpg), Alembic e Pydantic v2.
- **Frontend:** Single-Page Application em React 18+ com Vite, TypeScript, TailwindCSS/Vanilla CSS e Lucide Icons.
- **Persistência Relacional:** PostgreSQL 16+ com particionamento nativo de métricas por data e extensões criptográficas (`uuid-ossp`, `pgcrypto`).
- **Cache, Barramento e Sincronização:** Redis 7+ com Redis Streams, PubSub e Locks distribuídos.

### 2.2 Resolução de Dual-Write via Transactional Outbox Pattern (ADR-002)
- Toda operação de escrita (criação de ativo, alteração de status, abertura de incidente) comita atomicamente a entidade de domínio e o registro em `outbox_events` sob a **mesma transação ACID do PostgreSQL**.
- Um **Outbox Relay Worker** assíncrono executa `SELECT ... FOR UPDATE SKIP LOCKED` para consumir eventos pendentes e publicá-los no barramento sem risco de inconsistência (*at-least-once delivery*).

### 2.3 Desacoplamento Físico de Processos (API Web vs. Workers) (ADR-003)
- **`infrawatch-api`:** Atende exclusivamente requisições HTTP REST, autenticação, SSE, CRUD administrativo e relatórios. Não executa rotinas de rede demoradas.
- **`infrawatch-probe-worker`:** Processo daemon dedicado a disparar sondas de conectividade de rede (ICMP, HTTP, TCP, Heartbeat) com alta concorrência assíncrona.
- **`infrawatch-integration-worker`:** Processo daemon que isola chamadas com latência externa imprevisível (REST API do GLPI 10+, API JSON-RPC do Zabbix, despacho de WhatsApp/SMS/Telegram).

### 2.4 Motor Híbrido de Coleta: Sondas Nativas + Conector Zabbix (ADR-004)
- **Disponibilidade e SLA em Tempo Real (Sondas Nativas):** O InfraWatch monitora de forma 100% autônoma ping ICMP, tempos de resposta HTTP(S), portas TCP de serviços e heartbeats passivos, garantindo cálculo matemático instantâneo de SLA.
- **Telemetria Avançada de Hardware (Conector Zabbix):** Dispositivos corporativos com `zabbix_host_id` sincronizam telemetria de hardware (CPU, RAM, Disco, tráfego de interface) via JSON-RPC sem duplicar configurações de MIBs SNMP proprietárias.

### 2.5 Orquestração de Sondas sem Perda de Dados (ADR-005)
- **Agendamento 100% em Memória Local:** O daemon de monitoramento mantém o inventário ativo e cronograma em memória local, eliminando I/O contínuo no PostgreSQL para agendamento.
- **Sincronização por Redis Streams:** Mutações cadastrais (criação, edição, pausa) são emitidas no stream `stream:inventory:changes` e consumidas por `Consumer Groups` com confirmação `XACK`.
- **Auto-Reconciliação (Self-Healing):** A cada 5 minutos, o worker executa checagem leve no banco (`SELECT id, updated_at FROM devices`) para assegurar paridade absoluta entre memória e banco relacional.

### 2.6 Resiliência de Barramento com Fallback em Memória (ADR-006)
- O barramento `ResilientEventBus` publica e consome primariamente via Redis Streams e Pub/Sub.
- Em caso de falha de conexão ou indisponibilidade temporária do Redis, o barramento ativa degradação graciosa com fallback transparente para `InMemoryEventBus`, mantendo a aplicação funcional em réplica única de desenvolvimento ou contingência.

### 2.7 Streaming em Tempo Real com Server-Sent Events (SSE) (ADR-007)
- Substituição de WebSockets por **Server-Sent Events (SSE)** unidirecionais sobre HTTP padronizado.
- Heartbeats a cada 15 segundos evitam terminação de proxies intermediários. O cliente React reconecta automaticamente com reconexão exponencial (*exponential backoff*).

### 2.8 Autenticação, RBAC e Hardening de Segurança (Baseado no Auth) (ADR-008, ADR-009, ADR-020 a ADR-025)
- **Eliminação de BackgroundTasks em Favor de Consumers (ADR-020):** `background_tasks.add_task` do FastAPI foi 100% banido para evitar vazamento de sessões SQLAlchemy (`AsyncSession`). Todas as rotinas assíncronas trafegam via Consumers no Redis Streams com fila de mensagens mortas (DLQ).
- **Dual-Key Rate Limiting & Account Lockout (ADR-021):** Rastreamento simultâneo por IP (`rate_limit:login:ip`) e por Conta (`rate_limit:login:account`) no Redis, com bloqueio temporário (*lockout*) de 15 minutos após 5 falhas consecutivas.
- **Mitigação de Timing Attack & Enumeração (ADR-022):** Para contas inexistentes, executa hash dummy com Argon2id. Retornos de autenticação em tempo constante neutro (~10ms) com mensagem padronizada: `Credenciais inválidas`.
- **Trusted Proxies & Proteção Anti-Spoofing (ADR-023):** Configuração de `--forwarded-allow-ips` no Uvicorn e middleware de validação do cabeçalho `X-Forwarded-For`.
- **Distributed Lock no Redis para Multi-Réplicas (ADR-024):** Context manager assíncrono `redis_distributed_lock` não-bloqueante (`blocking=False`) com TTL para garantir que tarefas periódicas de expurgo e reconciliação rodem em apenas uma réplica por vez.
- **Proteção do Endpoint OpenMetrics (ADR-025):** A rota `/api/v1/monitoring/metrics` requer autenticação HTTP Basic Auth dedicada ao scraper do Prometheus.
- **Papéis RBAC e Multitenancy Estrito (ADR-009):**
  - `SUPER_ADMIN`: Acesso global e configuração de infraestrutura da RCS Angola.
  - `NOC_OPERATOR`: Operação técnica global (atendimento a incidentes, ack, pausas, silenciamento).
  - `ORG_ADMIN`: Administração da própria organização/empresa cliente (gestão de usuários da empresa).
  - `CLIENT_VIEWER`: Usuário externo somente leitura com **visão sanitizada** (sem exposição de IPs de roteamento interno, portas gerenciais confidenciais ou credenciais).

### 2.9 Integração Inteligente com o GLPI (ITSM) (ADR-010)
- Ao confirmar incidente `CRITICAL` (3 falhas consecutivas), o worker dispara `POST /Ticket` na REST API do GLPI 10+.
- O chamado aberto armazena o `glpi_ticket_id` no incidente do InfraWatch.
- Quando o operador executa *Acknowledge*, uma anotação é inserida no GLPI.
- Ao restabelecer a conectividade (`RESOLVED`), o chamado no GLPI é concluído automaticamente com tempo de downtime total e métricas de restauração.

### 2.10 Notificações Multicanal e Políticas de Plantão (ADR-011, ADR-018)
- Dispatcher com suporte nativo a Telegram, WhatsApp/SMS (via Gateway SMS / Número Virtual homologado em Angola), E-mail (SMTP) e Webhooks customizados.
- Regras de roteamento de alerta por severidade (`WARNING`, `CRITICAL`), com definição de escalas de plantão e janelas de silêncio para horários fora do expediente.

### 2.11 Busca Full-Text Nativa no PostgreSQL (ADR-012)
- Coluna gerada `search_vector` na tabela `devices` com índice GIN, alimentada por nome, IP, descrição e tags.
- Busca veloz via `websearch_to_tsquery` em português, eliminando a dependência prematura de um cluster Elasticsearch.

### 2.12 Modelagem DDD com CQRS em Monólito Modular (ADR-013)
- Bounded Contexts modulares e independentes: `identity`, `inventory`, `telemetry`, `alerting`, `sla` e `integrations`.
- Separação nítida entre Commands (alteração de estado com emissão de eventos) e Queries (leituras otimizadas).

### 2.13 Roteamento de Rede Direto via MPLS/VPN para IPs Privados (ADR-014)
- Sondas executadas diretamente a partir do contêiner do worker através de rotas de rede corporativas (túneis IPSec / MPLS da RCS Angola), viabilizando o monitoramento de faixas privadas (10.x, 172.16.x, 192.168.x) sem instalação de agentes nas pontas.

### 2.14 Retenção de 30 Dias no PostgreSQL e Exportador Prometheus (ADR-015)
- Particionamento diário na tabela `metrics` (`metrics_YYYY_MM_DD`).
- Worker de manutenção preventiva cria partições futuras e descarta partições com mais de 30 dias de idade instantaneamente via `DROP TABLE` (sem lock de delete em massa).
- Histórico de longo prazo exportado via scraper do Prometheus para dashboards executivos no Grafana.

### 2.15 Detecção de Degradação de Performance vs. Queda Total (ADR-016)
- **Status `DEGRADED`:** Identificado por limiares estatísticos de latência (P95 acima da média móvel, jitter elevado ou perda parcial de pacotes).
- **Status `DOWN`:** Exige confirmação de 3 falhas consecutivas antes de declarar incidente crítico, prevenindo alarmes falsos causados por oscilações temporárias de link.

### 2.16 Janelas de Manutenção & Isenção de SLA (ADR-017)
- Agendamento preventivo de janelas de manutenção (`maintenance_windows`).
- Alarmes e disparos de notificações são silenciados durante a janela aprovada.
- O motor de cálculo de SLA abate o tempo de downtime correspondente da penalidade contratual do cliente.

### 2.17 Trilha de Auditoria Imutável (Audit Trail) (ADR-019)
- Tabela `audit_logs` que registra imutavelmente toda mutação administrativa (quem, quando, endereço IP, ação e payload diff).

---

## 3. Catálogo Global de Rotas da API

### 3.1 Autenticação, Usuários e Auditoria (`/api/v1/auth`, `/api/v1/users`, `/api/v1/audit`)
- `POST /api/v1/auth/login` — Autenticação com e-mail/senha, retorna Access Token e Refresh Token rotativo.
- `POST /api/v1/auth/refresh` — Rotação de Refresh Token com Grace Period de 10s.
- `POST /api/v1/auth/logout` — Revogação de sessão e inclusão do token na blacklist do Redis.
- `POST /api/v1/auth/forgot-password` — Solicitação de recuperação de senha com token temporário e timing constante.
- `POST /api/v1/auth/reset-password` — Redefinição de senha utilizando token seguro.
- `GET /api/v1/auth/me` — Dados do usuário logado, organização vinculada e papel RBAC.
- `GET /api/v1/users` — Listagem de usuários (filtrado por tenant ou global para SuperAdmin).
- `POST /api/v1/users` — Cadastro de operadores ou usuários de clientes.
- `PATCH /api/v1/users/{id}/role` — Alteração de privilégios RBAC.
- `GET /api/v1/audit/logs` — Consulta à trilha de auditoria imutável (restrito a `SUPER_ADMIN`).

### 3.2 Organizações / Clientes Multi-Tenant (`/api/v1/organizations`)
- `GET /api/v1/organizations` — Listagem de clientes corporativos da RCS Angola.
- `POST /api/v1/organizations` — Criação de novo cliente/empresa.
- `GET /api/v1/organizations/{id}` — Detalhes da organização e meta contratual de SLA.
- `PUT /api/v1/organizations/{id}` — Configuração de dados de contato e meta de SLA.

### 3.3 Inventário de Ativos (`/api/v1/devices`)
- `GET /api/v1/devices` — Lista de ativos com Full-Text Search (`?q=term`), filtros por status, organização e tags.
- `POST /api/v1/devices` — Cadastro de dispositivo com validação de invariantes e outbox event.
- `GET /api/v1/devices/{id}` — Detalhes completos do ativo (visão sanitizada se `CLIENT_VIEWER`).
- `PUT /api/v1/devices/{id}` — Atualização cadastral com evento no stream.
- `DELETE /api/v1/devices/{id}` — Remoção lógica ou definitiva.
- `POST /api/v1/devices/{id}/pause` — Pausar monitoramento temporariamente.
- `POST /api/v1/devices/{id}/resume` — Retomar monitoramento.
- `POST /api/v1/devices/{id}/test-now` — Disparar sonda imediata sob demanda.

### 3.4 Telemetria e Métricas (`/api/v1/monitoring`)
- `GET /api/v1/monitoring/overview` — Contadores consolidados em tempo real (Total, UP, Degraded, DOWN, Uptime Médio).
- `GET /api/v1/monitoring/devices/{id}/metrics` — Histórico de latência e tempos de resposta (1h, 24h, 7d, 30d).
- `GET /api/v1/monitoring/devices/{id}/uptime-timeline` — Histórico visual de 90 dias de disponibilidade.
- `POST /api/v1/monitoring/heartbeat/{token}` — Endpoint passivo de recepção de sinal de cronjobs.
- `GET /api/v1/monitoring/metrics` — Endpoint OpenMetrics/Prometheus protegido por Basic Auth (ADR-025).

### 3.5 Alertas, Incidentes e Janelas de Manutenção (`/api/v1/incidents`, `/api/v1/sla`, `/api/v1/maintenance-windows`)
- `GET /api/v1/incidents` — Lista de incidentes ativos e resolvidos com filtros por severidade.
- `GET /api/v1/incidents/{id}` — Linha do tempo detalhada do incidente e notas técnicas.
- `POST /api/v1/incidents/{id}/acknowledge` — Operador reconhece incidente e silencia alarmes locais.
- `POST /api/v1/incidents/{id}/resolve` — Resolução manual com justificativa e fechamento no GLPI.
- `GET /api/v1/sla/devices/{id}` — Cálculo de SLA mensal com isenção de janelas de manutenção.
- `GET /api/v1/sla/export` — Exportação de relatório em PDF/CSV para diretoria e clientes.
- `GET /api/v1/maintenance-windows` — Listagem de manutenções programadas.
- `POST /api/v1/maintenance-windows` — Agendamento e aprovação de janela de manutenção.
- `PATCH /api/v1/maintenance-windows/{id}/cancel` — Cancelamento preventivo de manutenção.

### 3.6 Integrações Externas: GLPI e Zabbix (`/api/v1/integrations`)
- `GET /api/v1/integrations/glpi/config` — Consulta parâmetros de conexão GLPI.
- `PUT /api/v1/integrations/glpi/config` — Configuração de URL, App-Token e User-Token do GLPI.
- `POST /api/v1/incidents/{id}/create-ticket` — Abertura manual forçada de chamado no GLPI em 1 clique.
- `GET /api/v1/integrations/zabbix/config` — Consulta credenciais e endpoint JSON-RPC do Zabbix.
- `PUT /api/v1/integrations/zabbix/config` — Atualização de parâmetros de conexão do Zabbix.
- `POST /api/v1/integrations/zabbix/sync` — Forçar sincronização de hosts e itens de telemetria Zabbix.

### 3.7 Notificações Multi-Canal e Escalas (`/api/v1/notifications`)
- `GET /api/v1/notifications/channels` — Canais configurados (Email, Telegram, WhatsApp/SMS, Webhook).
- `POST /api/v1/notifications/channels` — Cadastro de canal com credenciais.
- `POST /api/v1/notifications/channels/{id}/test` — Disparo de teste de validação de envio.
- `GET /api/v1/notifications/logs` — Auditoria de alertas disparados e status de entrega.
- `GET /api/v1/notifications/schedules` — Consulta de escalas de plantão e janelas de notificação.
- `PUT /api/v1/notifications/schedules` — Atualização de horários de atendimento dos canais.

### 3.8 Streaming em Tempo Real (`/api/v1/events`)
- `GET /api/v1/events/stream` — Conexão SSE persistente com autenticação JWT e eventos tipados (`probe_result`, `status_change`, `incident_created`, `incident_acked`, `incident_resolved`, `heartbeat`).

---

## 4. Estrutura de Pastas Monorepo do Back ao Front

```
InfraWatch/
├── ARCHITECTURE.MD                      # Arquitetura e Decisões de Sistema
├── README.md                            # Guia do Projeto e Instruções de Execução
├── LICENSE                              # Licença MIT
├── Makefile                             # Atalhos para Docker, migrações, testes e lint
├── .gitignore                           # Regras de exclusão Git (Python, Node, segredos)
├── docker-compose.yml                   # Orquestração: API, Workers, Postgres 16, Redis 7
│
├── docs/                                # Documentação Técnica e de Negócio (ADR-001 a ADR-025)
│   ├── DECISIONS.md                     # Livro de Decisões Técnicas
│   ├── 01-PRD.md                        # Product Requirements Document
│   ├── 02-TRD.md                        # Technical Requirements Document
│   ├── 03-APP_FLOW.md                   # Fluxos de uso e ciclos de eventos
│   ├── 04-UI_UX_BRIEF.md                # Especificação de interface e experiência
│   ├── 05-BACKEND_SCHEMA.md             # Modelagem de banco, índices e outbox
│   └── 06-IMPLEMENTATION_PLAN.md        # Roteiro passo a passo de implementação (Fases 1 a 6)
│
├── scripts/                             # Scripts Utilitários, DevOps e Setup
│   ├── init-db.sql                      # Inicialização das extensões PostgreSQL (uuid-ossp, pgcrypto)
│   └── wait-for-services.sh             # Validação de prontidão de portas (Postgres, Redis)
│
├── backend/                             # Serviço Python 3.12+ (FastAPI + Workers Daemons)
│   ├── .env.example                     # Modelo de variáveis do servidor (DB, Redis, JWT, GLPI, Zabbix)
│   ├── pyproject.toml                   # Dependências e metadados Python (uv / pip)
│   ├── Dockerfile.api                   # Imagem do serviço HTTP FastAPI (usuário não-root)
│   ├── Dockerfile.worker                # Imagem dos Workers assíncronos (com capabilities ICMP)
│   ├── alembic.ini                      # Configuração do Alembic
│   ├── alembic/                         # Migrações versionadas do banco de dados
│   │   ├── env.py
│   │   └── versions/
│   │
│   ├── src/                             # Código-Fonte Backend
│   │   ├── core/                        # Primitivas Transversais e Infraestrutura Compartilhada
│   │   │   ├── config.py                # Configurações centralizadas via Pydantic Settings
│   │   │   ├── domain/                  # Base Entity, ValueObject, AggregateRoot, DomainEvent
│   │   │   ├── database/                # Engine SQLAlchemy async, Session Factory e Unit of Work
│   │   │   ├── redis/                   # Client Redis, Distributed Lock e Blacklist
│   │   │   ├── messaging/               # ResilientEventBus (Streams, PubSub e InMemory Fallback)
│   │   │   └── security/                # Argon2id, JWT, Dual-Key Rate Limiter e Anti-Timing Attack
│   │   │
│   │   ├── contexts/                    # Bounded Contexts Modulares (Regras de Domínio DDD)
│   │   │   ├── identity/                # Usuários, Autenticação, RBAC de 4 Níveis e Auditoria
│   │   │   ├── organization/            # Tenants, Clientes da RCS Angola e Metas de SLA
│   │   │   ├── inventory/               # Ativos, Dispositivos, Busca Full-Text e VOs de Rede
│   │   │   ├── telemetry/               # Sondas de Rede (ICMP, HTTP, TCP), Buffer de Métricas e Partições
│   │   │   ├── alerting/                # Motor de Degradação P95, Falhas Consecutivas e Incidentes
│   │   │   └── sla/                     # Cálculo Matemático de SLA e Janelas de Manutenção
│   │   │
│   │   ├── integrations/                # Clientes e Conectores de Serviços Externos
│   │   │   ├── glpi/                    # Cliente REST API do GLPI 10+ (Chamados e Acompanhamentos)
│   │   │   ├── zabbix/                  # Conector JSON-RPC para Hardware e SNMP
│   │   │   └── notifications/           # Dispatcher Multicanal (Telegram, WhatsApp/SMS, SMTP, Webhook)
│   │   │
│   │   ├── api/                         # Camada de Apresentação HTTP & SSE (FastAPI)
│   │   │   ├── main.py                  # Ponto de entrada Uvicorn/FastAPI
│   │   │   ├── routes/                  # Roteadores REST (auth, devices, incidents, sla, etc.)
│   │   │   ├── dependencies/            # Injeção de dependências (Auth, RBAC, Tenant, Trusted Proxy)
│   │   │   └── sse/                     # Connection Manager e Distribuidor de Eventos SSE
│   │   │
│   │   └── workers/                     # Daemons Assíncronos Isolados
│   │       ├── probe_worker.py          # Engine de Coleta Concorrente em Memória (ICMP, HTTP, TCP)
│   │       ├── integration_worker.py    # Processador de GLPI, Zabbix e Notificações com DLQ
│   │       ├── outbox_relay_worker.py   # Relay do Transactional Outbox (SKIP LOCKED)
│   │       └── partition_manager.py     # Criação preventiva e expurgo de partições de métricas
│   │
│   └── tests/                           # Suíte de Testes Automatizados do Backend
│       ├── unit/                        # Testes Unitários de Domínio, Criptografia e Probes
│       ├── integration/                 # Testes de Integração com Postgres, Redis e APIs
│       ├── resilience/                  # Testes de Caos, Failover do Redis e Idempotência do Outbox
│       └── e2e/                         # Testes de Ciclo Completo (Queda -> GLPI -> Resolução)
│
└── frontend/                            # Single-Page Application (React 18+ / Vite / TypeScript)
    ├── .env.example                     # Modelo de variáveis públicas do cliente React (VITE_API_URL)
    ├── package.json                     # Dependências Node.js
    ├── vite.config.ts                   # Configuração de build Vite e aliases
    ├── tsconfig.json                    # Tipagem TypeScript estrita
    └── src/
        ├── shared/                      # Design tokens (Obsidian Theme), hooks (useSSE), componentes base UI
        ├── layouts/                     # Sidebar, Topbar com status global, NOC Fullscreen Wallboard
        └── modules/                     # Módulos de Telas e Negócio
            ├── auth/                    # Login, perfil, troca e recuperação de senha
            ├── dashboard/               # Grid operacional em tempo real e NOC TV Wallboard
            ├── inventory/               # Gestão de ativos com busca Full-Text FTS
            ├── incidents/               # Painel de atendimento de incidentes e integração GLPI
            ├── sla/                     # Relatórios de SLA por cliente e exportação PDF
            └── settings/                # Configurações de canais de notificação e GLPI
```

---

## 5. Matriz de Rastreabilidade (Domínio x ADRs x Milestones)

| Bounded Context | Responsabilidade Primária | ADRs Aplicáveis | Milestones / Fases |
| :--- | :--- | :--- | :--- |
| **Shared Core & Messaging** | Entidades DDD, Unit of Work, Transactional Outbox, EventBus Resiliente e SSE | ADR-002, ADR-006, ADR-007 | **Fase 1** (Issues #2 a #6) |
| **Identity & Access** | Autenticação, Rotação JWT, RBAC Multi-Tenant, Rate Limiting e Trilha de Auditoria | ADR-008, ADR-009, ADR-020 a ADR-024 | **Fase 2** (Issues #7 a #12) |
| **Inventory & Assets** | Agregado Device, Validação de IPs/Portas, Busca Full-Text e Emissão de Eventos | ADR-012, ADR-014 | **Fase 3** (Issues #13 a #16) |
| **Telemetry & Probing** | Daemon de Sondas, Agendamento em Memória, Particionamento de Métricas e Prometheus | ADR-003, ADR-005, ADR-015, ADR-025 | **Fase 4** (Issues #17 a #21) |
| **Alerting, Incidents & SLA** | Motor de Falhas Consecutivas, Degradação P95, Janelas de Manutenção e Cálculo de SLA | ADR-016, ADR-017 | **Fase 4 & 5** (Issues #22 a #26) |
| **Corporate Integrations** | REST API GLPI 10+, Conector Zabbix JSON-RPC e Dispatcher Notificações (WhatsApp/SMS) | ADR-004, ADR-010, ADR-011, ADR-018 | **Fase 5** (Issues #27 a #31) |
| **Frontend Obsidian UI** | Dashboard Operacional NOC, TV Wallboard, Portal do Cliente e Exportação de SLA | ADR-007, ADR-009 | **Fase 6** (Issues #32 a #37) |
