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
│  │ (Auth, RBAC, Google   │  │  (Devices, Orgs, FTS) │  │ (Incidents, Rules)    │  │ (In-App & Multi│   │
│  │  OAuth, MFA, Sessions)│  │                       │  │                       │  │   Canal)       │   │
│  └───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘  └───────┬────────┘   │
│              │                          │                          │                      │            │
│              └──────────────────────────┼──────────────────────────┴──────────────────────┘            │
│                                         ▼                                                              │
│                    ┌─────────────────────────────────────────┐                                         │
│                    │   Domain Events & Transactional Outbox  │                                         │
│                    │     (Persistência Atômica no Postgres)  │                                         │
│                    └────────────────────┬────────────────────┘                                         │
│                                         │                                                              │
│            Outbox Relay & Token Cleanup │ (Lifespan Workers / SKIP LOCKED / Anti-Log Storm)            │
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
                 │  • Audit Trail com DDL Triggers │          │ • Distributed Lock│
                 │  • MFA, OAuth & Token Hashes    │          │ • Dual-Key Limits │
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
- Heartbeats periódicos (`: ping`) a cada 15 segundos evitam terminação por proxies intermediários (Nginx com `X-Accel-Buffering: no`). O cliente reconecta automaticamente com reconexão exponencial (*exponential backoff*).
- **Isolamento de Tenant no Stream:** Eventos despachados via SSE respeitam estritamente a organização do usuário conectado, evitando vazamento entre clientes corporativos.

### 2.8 Autenticação, RBAC e Hardening de Segurança (Baseado no Auth) (ADR-008, ADR-009, ADR-020 a ADR-025)
- **Eliminação de BackgroundTasks em Favor de Consumers (ADR-020):** `background_tasks.add_task` do FastAPI foi 100% banido para evitar vazamento de sessões SQLAlchemy (`AsyncSession`). Todas as rotinas assíncronas trafegam via Consumers no Redis Streams com fila de mensagens mortas (DLQ).
- **Dual-Key Rate Limiting & Account Lockout (ADR-021):** Rastreamento simultâneo por IP (`rate_limit:login:ip`) e por Conta (`rate_limit:login:account`) no Redis, com bloqueio temporário (*lockout*) de 15 minutos após 5 falhas consecutivas.
- **Mitigação de Timing Attack & Enumeração (ADR-022):** Para contas inexistentes, executa hash dummy com Argon2id. Retornos de autenticação em tempo constante neutro (~10ms) com mensagem padronizada: `Credenciais inválidas`.
- **Trusted Proxies & Proteção Anti-Spoofing (ADR-023):** Configuração de `--forwarded-allow-ips` no Uvicorn e middleware de validação do cabeçalho `X-Forwarded-For`.
- **Distributed Lock no Redis para Multi-Réplicas (ADR-024):** Context manager assíncrono `redis_distributed_lock` não-bloqueante (`blocking=False`) com TTL para garantir que tarefas periódicas de expurgo e reconciliação rodem em apenas uma réplica por vez.
- **Proteção do Endpoint OpenMetrics (ADR-025):** Rotas `/metrics` e `/api/v1/monitoring/metrics` protegidas via HTTP Basic Auth e Bearer Token utilizando comparação em tempo constante (`secrets.compare_digest`).
- **Autenticação Social Google OAuth 2.0 / OpenID Connect:** Suporte nativo a Single Sign-On (SSO) com login federado via Google (`oauth_provider="google"`, `google_id`), com auto-linking seguro por e-mail verificado e emissão padronizada de tokens JWT locais.
- **Multi-Factor Authentication (MFA / 2FA com TOTP):** Tabela relacional dedicada `mfa_methods`, geração de segredos criptografados, QR Codes para aplicativos autenticadores (Google Authenticator, Microsoft Authenticator) e suporte a login em duas etapas com validação de código de 6 dígitos.
- **Identificação Amigável de Dispositivos e Sessões Ativas:** Módulo `src/core/security/device.py` com parser determinístico de `User-Agent`, identificando tipo de dispositivo, navegador e sistema operacional armazenados em `device_name` na tabela `refresh_tokens`, com endpoints para consulta e revogação de sessões ativas concorrentes.
- **Ciclo de Vida de Tokens Temporários com TTL de 15 Minutos (OWASP):**
  - Recuperação de senha (`password_reset_tokens`) com expiração estrita de 15 minutos (`PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 15`).
  - Verificação de e-mail (`email_verification_tokens`) com expiração de 24 horas.
  - Armazenamento de tokens no banco exclusivamente como hashes criptográficos SHA-256 (`token_hash`), impedindo o vazamento de credenciais caso a base seja exposta.
- **Dependência de Autenticação Polimórfica (`CurrentUserDep`):**
  - Função unificada `get_current_user` em `src/api/dependencies/auth.py` com resolução hierárquica:
    1. Cabeçalho `Authorization` via `OAuth2PasswordBearer`
    2. Cabeçalho manual `Authorization: Bearer <token>`
    3. Query parameter `?token=` (essencial para navegadores em conexões nativas SSE `EventSource`)
  - Eliminação de duplicidades e reexportação limpa de dependências em `src/api/dependencies/`.
- **Validação Estrita de Configurações em Produção:**
  - `@model_validator` na classe `Settings` (`src/core/config.py`):
    - Bloqueia inicialização em `ENVIRONMENT=production` com segredos padrão ou fracos (< 32 caracteres).
    - Obriga chaves distintas para `SECRET_KEY` e `REFRESH_SECRET_KEY`.
    - Bloqueia execução de `DEBUG=True` em produção.
- **Papéis RBAC e Multitenancy Estrito (ADR-009):**
  - `SUPER_ADMIN`: Acesso global e configuração de infraestrutura da RCS Angola.
  - `NOC_OPERATOR`: Operação técnica global (atendimento a incidentes, ack, pausas, silenciamento).
  - `ORG_ADMIN`: Administração da própria organização/empresa cliente (gestão de usuários da empresa).
  - `CLIENT_VIEWER`: Usuário externo somente leitura com **visão sanitizada** (sem exposição de IPs de roteamento interno, portas gerenciais confidenciais ou credenciais).

### 2.9 Sistema de Notificações In-App com Persistência e SSE
- Bounded context de notificações com persistência relacional na tabela `notifications`.
- Notificações de incidentes, manutenções e alertas corporativos vinculadas ao `user_id` e/ou `organization_id`.
- Streaming imediato do contador de não lidas e novos eventos via canal SSE, com endpoints para marcação individual e em lote como lido (`read_at`).

### 2.10 Paginação Padronizada e Desacoplamento Arquitetural
- Módulo `src/core/pagination.py` com a estrutura `PaginatedResponse[T]` genérica Pydantic, desacoplando a camada de domínio (`contexts`) da camada de apresentação (`api`) e eliminando dependências circulares.
- Dependência `PaginationParamsDep` injetável em rotas FastAPI com validação de limites (máximo 100 itens por página).

### 2.11 Integração Inteligente com o GLPI (ITSM) (ADR-010)
- Ao confirmar incidente `CRITICAL` (3 falhas consecutivas), o worker dispara `POST /Ticket` na REST API do GLPI 10+.
- O chamado aberto armazena o `glpi_ticket_id` no incidente do InfraWatch.
- Quando o operador executa *Acknowledge*, uma anotação é inserida no GLPI.
- Ao restabelecer a conectividade (`RESOLVED`), o chamado no GLPI é concluído automaticamente com tempo de downtime total e métricas de restauração.

### 2.12 Notificações Multicanal e Políticas de Plantão (ADR-011, ADR-018)
- Dispatcher com suporte nativo a Telegram, WhatsApp/SMS (via Gateway SMS / Número Virtual homologado em Angola), E-mail transacional HTML (SMTP com templates em `src/contexts/identity/templates/`) e Webhooks customizados.
- Regras de roteamento de alerta por severidade (`WARNING`, `CRITICAL`), com definição de escalas de plantão e janelas de silêncio para horários fora do expediente.

### 2.13 Busca Full-Text Nativa no PostgreSQL (ADR-012)
- Coluna gerada `search_vector` na tabela `devices` com índice GIN, alimentada por nome, IP, descrição e tags.
- Busca veloz via `websearch_to_tsquery` em português, eliminando a dependência prematura de um cluster Elasticsearch.

### 2.14 Modelagem DDD com CQRS em Monólito Modular (ADR-013)
- Bounded Contexts modulares e independentes: `identity`, `inventory`, `telemetry`, `alerting`, `sla` e `integrations`.
- Separação nítida entre Commands (alteração de estado com emissão de eventos) e Queries (leituras otimizadas).

### 2.15 Roteamento de Rede Direto via MPLS/VPN para IPs Privados (ADR-014)
- Sondas executadas diretamente a partir do contêiner do worker através de rotas de rede corporativas (túneis IPSec / MPLS da RCS Angola), viabilizando o monitoramento de faixas privadas (10.x, 172.16.x, 192.168.x) sem instalação de agentes nas pontas.

### 2.16 Retenção de 30 Dias no PostgreSQL e Exportador Prometheus (ADR-015)
- Particionamento diário na tabela `metrics` (`metrics_YYYY_MM_DD`).
- Worker de manutenção preventiva cria partições futuras e descarta partições com mais de 30 dias de idade instantaneamente via `DROP TABLE` (sem lock de delete em massa).
- Histórico de longo prazo exportado via scraper do Prometheus para dashboards executivos no Grafana.

### 2.17 Detecção de Degradação de Performance vs. Queda Total (ADR-016)
- **Status `DEGRADED`:** Identificado por limiares estatísticos de latência (P95 acima da média móvel, jitter elevado ou perda parcial de pacotes).
- **Status `DOWN`:** Exige confirmação de 3 falhas consecutivas antes de declarar incidente crítico, prevenindo alarmes falsos causados por oscilações temporárias de link.

### 2.18 Janelas de Manutenção & Isenção de SLA (ADR-017)
- Agendamento preventivo de janelas de manutenção (`maintenance_windows`).
- Alarmes e disparos de notificações são silenciados durante a janela aprovada.
- O motor de cálculo de SLA abate o tempo de downtime correspondente da penalidade contratual do cliente.

### 2.19 Trilha de Auditoria Imutável (Audit Trail) Anti-Tamper (ADR-019)
- Tabela `audit_logs` que registra toda mutação administrativa (quem, quando, endereço IP, ação e payload diff).
- **Proteção Criptográfica & DDL Triggers:**
  - Triggers no PostgreSQL bloqueiam estritamente operações de `UPDATE` e `DELETE` em `audit_logs` (tabela imutável *append-only*).
  - Encadeamento criptográfico (Hash Chaining) com SHA-256 (`current_hash = SHA256(prev_hash + payload)`), assegurando detecção matemática imediata de adulterações manuais.

### 2.20 Ciclo de Vida de Workers no Lifespan da API com Proteção Anti-Log Storm
- Gerenciamento centralizado de tarefas em segundo plano no ciclo de vida assíncrono do FastAPI (`src/core/lifespan.py`):
  - Inicialização e desligamento gracioso de `OutboxRelayWorker` e `TokenCleanupWorker`.
  - Modo híbrido: execução no lifespan da API para desenvolvimento/testes ou desacoplamento como daemons CLI standalone (`python -m src.workers.outbox_relay_worker`, `python -m src.workers.token_cleanup_worker`) para produção.
  - Proteção `log_storm_guard` para amortecer tempestades de logs em cenários de falhas repetitivas de conexão.

---

## 3. Catálogo Global de Rotas da API

### 3.1 Autenticação, Usuários, MFA, Sessões e Auditoria (`/api/v1/auth`, `/api/v1/mfa`, `/api/v1/users`, `/api/v1/audit`, `/api/health`)
- `GET /api/health` — Endpoint de integridade da API e healthcheck do Dockerfile.
- `POST /api/v1/auth/login` — Autenticação com e-mail/senha, retorna Access Token e Refresh Token rotativo com identificação do dispositivo.
- `POST /api/v1/auth/login-form` — Endpoint compatível com especificação OAuth2 Password Request Form.
- `POST /api/v1/auth/refresh` — Rotação de Refresh Token com Grace Period de 10s.
- `POST /api/v1/auth/logout` — Revogação de sessão e inclusão do token na blacklist do Redis.
- `GET /api/v1/auth/me` — Dados do usuário logado, organização vinculada, papéis e flags MFA.
- `POST /api/v1/auth/forgot-password` — Solicitação de recuperação de senha com token seguro de 15 minutos (OWASP).
- `POST /api/v1/auth/reset-password` — Redefinição de senha utilizando token seguro e hash SHA-256.
- `POST /api/v1/auth/verify-email` — Confirmação de e-mail de novos usuários com token temporário.
- `POST /api/v1/auth/resend-verification` — Reenvio de e-mail de ativação de conta.
- `GET /api/v1/auth/sessions` — Listagem de sessões ativas do usuário com navegador, SO e IP.
- `DELETE /api/v1/auth/sessions/{id}` — Revogação pontual de sessão em dispositivo específico.
- `GET /api/v1/auth/google/login` — Início de fluxo de autenticação social Google OAuth 2.0 / OIDC.
- `GET /api/v1/auth/google/callback` — Callback de autorização do Google com emissão de tokens JWT InfraWatch.
- `POST /api/v1/mfa/setup` — Início de configuração de 2FA TOTP com geração de chave e URI de QR Code.
- `POST /api/v1/mfa/activate` — Ativação de MFA com validação do primeiro código TOTP de 6 dígitos.
- `POST /api/v1/mfa/challenge` — Resolução de desafio MFA durante o fluxo de login.
- `DELETE /api/v1/mfa/disable` — Desativação segura de autenticação multi-fator.
- `GET /api/v1/users` — Listagem paginada de usuários (filtrado por tenant ou global para SuperAdmin).
- `POST /api/v1/users` — Cadastro de operadores ou usuários de clientes.
- `GET /api/v1/users/{id}` — Detalhes de um usuário específico.
- `PATCH /api/v1/users/{id}` — Atualização cadastral de usuário.
- `PATCH /api/v1/users/{id}/role` — Alteração de privilégios RBAC.
- `PATCH /api/v1/users/{id}/status` — Ativação ou desativação de usuário.
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

### 3.4 Telemetria e Métricas (`/api/v1/monitoring`, `/metrics`)
- `GET /metrics` — Endpoint OpenMetrics/Prometheus protegido por Basic Auth / Bearer (ADR-025).
- `GET /api/v1/monitoring/metrics` — Alias compatível da rota de telemetria para scrapers Prometheus.
- `GET /api/v1/monitoring/overview` — Contadores consolidados em tempo real (Total, UP, Degraded, DOWN, Uptime Médio).
- `GET /api/v1/monitoring/devices/{id}/metrics` — Histórico de latência e tempos de resposta (1h, 24h, 7d, 30d).
- `GET /api/v1/monitoring/devices/{id}/uptime-timeline` — Histórico visual de 90 dias de disponibilidade.
- `POST /api/v1/monitoring/heartbeat/{token}` — Endpoint passivo de recepção de sinal de cronjobs.

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

### 3.7 Notificações Multi-Canal e In-App (`/api/v1/notifications`)
- `GET /api/v1/notifications/in-app` — Listagem paginada de notificações corporativas in-app do usuário.
- `PATCH /api/v1/notifications/{id}/read` — Marcar notificação específica como lida.
- `POST /api/v1/notifications/read-all` — Marcar todas as notificações do usuário como lidas.
- `GET /api/v1/notifications/unread-count` — Contador em tempo real de notificações pendentes.
- `GET /api/v1/notifications/channels` — Canais externos configurados (Email, Telegram, WhatsApp/SMS, Webhook).
- `POST /api/v1/notifications/channels` — Cadastro de canal externo com credenciais.
- `POST /api/v1/notifications/channels/{id}/test` — Disparo de teste de validação de envio.
- `GET /api/v1/notifications/logs` — Auditoria de alertas disparados e status de entrega.
- `GET /api/v1/notifications/schedules` — Consulta de escalas de plantão e janelas de notificação.
- `PUT /api/v1/notifications/schedules` — Atualização de horários de atendimento dos canais.

### 3.8 Streaming em Tempo Real (`/api/v1/events`)
- `GET /api/v1/events/stream` — Conexão SSE persistente com suporte a token via header ou query parameter `?token=`, isolamento por tenant e eventos tipados (`probe_result`, `status_change`, `incident_created`, `incident_acked`, `incident_resolved`, `notification_received`, `heartbeat`).

---

## 4. Estrutura de Pastas Monorepo do Back ao Front

```
InfraWatch/
├── ARCHITECTURE.MD                      # Arquitetura e Decisões de Sistema
├── README.md                            # Guia do Projeto e Instruções de Execução
├── LICENSE                              # Licença MIT
├── Makefile                             # Atalhos para Docker, migrações, testes e lint
├── .gitignore                           # Regras de exclusão Git (Python, Node, segredos)
├── .env.example                         # Template centralizado para Docker Compose e infraestrutura
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
│   ├── .env.example                     # Modelo de variáveis de execução local do backend
│   ├── pyproject.toml                   # Dependências e metadados Python (uv / pip)
│   ├── Dockerfile.api                   # Imagem do serviço HTTP FastAPI com healthcheck nativo
│   ├── Dockerfile.worker                # Imagem dos Workers assíncronos (capabilities ICMP)
│   ├── alembic.ini                      # Configuração do Alembic
│   ├── alembic/                         # Migrações versionadas do banco de dados (001 a 006)
│   │   ├── env.py
│   │   └── versions/
│   │       ├── 001_initial_schema.py
│   │       ├── 002_create_users_and_refresh_tokens.py
│   │       ├── 003_create_audit_logs.py
│   │       ├── 004_create_notifications.py
│   │       ├── 005_add_google_oauth_fields_to_users.py
│   │       └── 006_create_mfa_and_token_tables.py
│   │
│   ├── src/                             # Código-Fonte Backend
│   │   ├── core/                        # Primitivas Transversais e Infraestrutura Compartilhada
│   │   │   ├── config.py                # Configurações centralizadas com validação estrita em produção
│   │   │   ├── pagination.py            # Estrutura genérica PaginatedResponse[T] desacoplada
│   │   │   ├── lifespan.py              # Ciclo de vida FastAPI (agendamento gracioso de workers)
│   │   │   ├── domain/                  # Base Entity, ValueObject, AggregateRoot, DomainEvent
│   │   │   ├── database/                # Engine SQLAlchemy async, Session Factory e Unit of Work
│   │   │   ├── redis/                   # Client Redis, Distributed Lock e Blacklist
│   │   │   ├── messaging/               # ResilientEventBus, SSEBroadcaster e InMemory Fallback
│   │   │   └── security/                # Argon2id, JWT, Device Parser, Dual-Key Rate Limiter e Anti-Timing
│   │   │
│   │   ├── contexts/                    # Bounded Contexts Modulares (Regras de Domínio DDD)
│   │   │   ├── identity/                # Usuários, Autenticação, Google OAuth, MFA, Sessões e Auditoria
│   │   │   │   ├── domain/              # Modelos SQLAlchemy, Enums e Invariantes
│   │   │   │   ├── schemas/             # Schemas Pydantic de entrada e saída
│   │   │   │   ├── services/            # AuthService, UserService, EmailService, AuditService
│   │   │   │   └── templates/           # Templates HTML responsivos para e-mails transacionais
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
│   │   │   ├── main.py                  # Ponto de entrada FastAPI, Middlewares e Error Handlers
│   │   │   ├── routes/                  # Roteadores REST (auth, mfa, users, orgs, notifications, sse, etc.)
│   │   │   └── dependencies/            # Injeções de dependência (Auth unificado, RBAC, Pagination, IP)
│   │   │
│   │   └── workers/                     # Daemons Assíncronos e Entrypoints CLI
│   │       ├── probe_worker.py          # Engine de Coleta Concorrente em Memória (ICMP, HTTP, TCP)
│   │       ├── integration_worker.py    # Processador de GLPI, Zabbix e Notificações com DLQ
│   │       ├── outbox_relay_worker.py   # Relay do Transactional Outbox (SKIP LOCKED)
│   │       ├── token_cleanup_worker.py  # Expurgador periódico de tokens expirados e sessões revogadas
│   │       └── partition_manager.py     # Criação preventiva e expurgo de partições de métricas
│   │
│   └── tests/                           # Suíte de Testes Automatizados do Backend
│       ├── unit/                        # Testes Unitários de Domínio, Autenticação, Criptografia e Configs
│       ├── integration/                 # Testes de Integração com Postgres, Redis, Migrações Alembic e SSE
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
            ├── auth/                    # Login, perfil, troca e recuperação de senha, Google OAuth e MFA
            ├── dashboard/               # Grid operacional em tempo real e NOC TV Wallboard
            ├── inventory/               # Gestão de ativos com busca Full-Text FTS
            ├── incidents/               # Painel de atendimento de incidentes e integração GLPI
            ├── sla/                     # Relatórios de SLA por cliente e exportação PDF
            └── settings/                # Configurações de canais de notificação e GLPI
```

---

## 5. Matriz de Rastreabilidade (Domínio x ADRs x Milestones)

| Bounded Context | Responsabilidade Primária | ADRs Aplicáveis | Milestones / Issues |
| :--- | :--- | :--- | :--- |
| **Shared Core & Messaging** | Entidades DDD, Unit of Work, Transactional Outbox, EventBus Resiliente, Paginação Desacoplada e SSE | ADR-002, ADR-006, ADR-007, ADR-020 | **Fase 1** (Issues #2 a #6, #65, #77, #85) |
| **Identity & Access** | Autenticação Unificada, Google OAuth 2.0, MFA TOTP, Rotação JWT, Sessões Ativas, RBAC, Trilha de Auditoria com DDL Triggers | ADR-008, ADR-009, ADR-019, ADR-021 a ADR-024 | **Fase 2** (Issues #7 a #14, #53, #56, #61, #63, #67, #71, #73, #79, #83) |
| **Notifications & In-App** | Alertas Multicanais (Telegram, WhatsApp, SMTP), Notificações In-App persistidas e streaming SSE | ADR-007, ADR-011, ADR-018 | **Fase 2 & 5** (Issues #23, #56, #63, #69) |
| **Inventory & Assets** | Agregado Device, Validação de IPs/Portas, Busca Full-Text e Emissão de Eventos | ADR-012, ADR-014 | **Fase 3** (Issues #15 a #16) |
| **Telemetry & Probing** | Daemon de Sondas, Agendamento em Memória, Particionamento de Métricas e Scraper Prometheus com Basic Auth | ADR-003, ADR-005, ADR-015, ADR-025 | **Fase 4** (Issues #17 a #20, #75, #81) |
| **Alerting, Incidents & SLA** | Motor de Falhas Consecutivas, Degradação P95, Janelas de Manutenção e Cálculo de SLA | ADR-016, ADR-017 | **Fase 4 & 5** (Issues #24 a #26) |
| **Corporate Integrations** | REST API GLPI 10+, Conector Zabbix JSON-RPC e Dispatcher Notificações (WhatsApp/SMS) | ADR-004, ADR-010, ADR-011, ADR-018 | **Fase 5** (Issues #21 a #23) |
| **Frontend Obsidian UI** | Dashboard Operacional NOC, TV Wallboard, Portal do Cliente e Exportação de SLA | ADR-007, ADR-009 | **Fase 6** (Issues #27 a #37) |
