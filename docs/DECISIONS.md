# InfraWatch — Livro de Decisões Técnicas e Arquiteturais (DECISIONS.MD)

> **Documento:** `docs/DECISIONS.md` (Architecture Decision Records — ADR)  
> **Status:** Vigente e Auditado  
> **Finalidade:** Registro histórico, centralizado e imutável de todas as decisões tomadas, motivações, alternativas descartadas e deduções a partir da pasta `subject/` e da sessão técnica de alinhamento (`/grill-me`).

---

## 📑 Índice das Decisões Registradas

1. [ADR-001: Stack Principal (FastAPI + React/Vite TS + PostgreSQL + Redis)](#adr-001-stack-principal)
2. [ADR-002: Resolução de Dual-Write via Transactional Outbox Pattern](#adr-002-resolução-de-dual-write-via-transactional-outbox-pattern)
3. [ADR-003: Desacoplamento Físico de Processos (API Web vs. Workers)](#adr-003-desacoplamento-físico-de-processos)
4. [ADR-004: Motor de Monitoramento Híbrido (Worker Próprio + Conector Zabbix)](#adr-004-motor-de-monitoramento-híbrido)
5. [ADR-005: Orquestração do Worker sem Perda de Dados (Memória + Redis Streams + Self-Healing)](#adr-005-orquestração-do-worker-sem-perda-de-dados)
6. [ADR-006: Resiliência de Barramento com Fallback em Memória](#adr-006-resiliência-de-barramento-com-fallback-em-memória)
7. [ADR-007: Streaming em Tempo Real com SSE (Server-Sent Events) sem WebSockets](#adr-007-streaming-em-tempo-real-com-sse)
8. [ADR-008: Autenticação baseada no Projeto `Auth` com Remoção de WebSockets](#adr-008-autenticação-baseada-no-projeto-auth)
9. [ADR-009: Privacidade Estrita e Multi-Tenancy sem Páginas Públicas Abertas](#adr-009-privacidade-estrita-e-multi-tenancy)
10. [ADR-010: Integração Bidirecional Inteligente com o GLPI (ITSM)](#adr-010-integração-bidirecional-inteligente-com-o-glpi)
11. [ADR-011: Notificações Multi-Canal com WhatsApp via Gateway de Mensageria](#adr-011-notificações-multi-canal-com-whatsapp)
12. [ADR-012: Busca Full-Text Nativa no PostgreSQL (Sem Elasticsearch Prematuro)](#adr-012-busca-full-text-nativa-no-postgresql)
13. [ADR-013: Modelagem DDD com CQRS em Monólito Modular](#adr-013-modelagem-ddd-com-cqrs-em-monólito-modular)
14. [ADR-014: Roteamento de Rede Direto via MPLS/VPN para IPs Privados](#adr-014-roteamento-de-rede-direto-via-mplsvpn-para-ips-privados)
15. [ADR-015: Retenção de 30 Dias no PostgreSQL + Exportador Prometheus para Grafana](#adr-015-retenção-de-30-dias-no-postgresql--exportador-prometheus-para-grafana)
16. [ADR-016: Detecção de Degradação de Performance com Inscrição Granular](#adr-016-detecção-de-degradação-de-performance-com-inscrição-granular)
17. [ADR-017: Isenção de Janelas de Manutenção Programada no Cálculo de SLA](#adr-017-isenção-de-janelas-de-manutenção-programada-no-cálculo-de-sla)
18. [ADR-018: Políticas de Horário de Notificação e Escalas de Plantão por Canal](#adr-018-políticas-de-horário-de-notificação-e-escalas-de-plantão-por-canal)
19. [ADR-019: Trilha de Auditoria Imutável (Audit Trail) para Compliance](#adr-019-trilha-de-auditoria-imutável-audit-trail-para-compliance)
20. [ADR-020: Padrão Event Consumer em Substituição ao FastAPI BackgroundTasks](#adr-020-padrão-event-consumer-em-substituição-ao-fastapi-backgroundtasks)
21. [ADR-021: Dual-Key Rate Limiting contra Força Bruta Distribuída](#adr-021-dual-key-rate-limiting-contra-força-bruta-distribuída)
22. [ADR-022: Mitigação de Timing Attack e User Enumeration](#adr-022-mitigação-de-timing-attack-e-user-enumeration)
23. [ADR-023: Tratamento de Trusted Proxies e Prevenção de IP Spoofing](#adr-023-tratamento-de-trusted-proxies-e-prevenção-de-ip-spoofing)
24. [ADR-024: Distributed Lock Não-Bloqueante com Redis para Multi-Réplicas](#adr-024-distributed-lock-não-bloqueante-com-redis-para-multi-réplicas)
25. [ADR-025: Proteção e Autenticação do Endpoint de Telemetria /metrics](#adr-025-proteção-e-autenticação-do-endpoint-de-telemetria-metrics)
26. [ADR-026: Monitoramento Nativo de Contêineres Docker via Unix Domain Socket / TCP (DockerProber)](#adr-026-monitoramento-nativo-de-contêineres-docker-via-unix-domain-socket--tcp-dockerprober)
27. [ADR-027: Gerenciamento Seguro de Credenciais com Docker Secrets e Entrypoint Wrapper](#adr-027-gerenciamento-seguro-de-credenciais-com-docker-secrets-e-entrypoint-wrapper)
28. [ADR-028: Ingestão de Alertas Zabbix em Tempo Real (Push Webhook) e Autoconfiguração Idempotente](#adr-028-ingestão-de-alertas-zabbix-em-tempo-real-push-webhook-e-autoconfiguração-idempotente)
29. [ADR-029: Arquitetura de Thin Controllers, Unit of Work e Coesão Modular](#adr-029-arquitetura-de-thin-controllers-unit-of-work-e-coesão-modular)
30. [ADR-030: Padronização Temporal com Timezone Estrito (TIMESTAMPTZ)](#adr-030-padronização-temporal-com-timezone-estrito-timestamptz)
31. [ADR-031: Adoção do TimescaleDB com Hypertables e Compressão Colunar para Séries Temporais](#adr-031-adoção-do-timescaledb-com-hypertables-e-compressão-colunar-para-séries-temporais)

---

### ADR-001: Stack Principal
- **Status:** Aprovado
- **Origem:** Seleção do desenvolvedor a partir de `subject/InfraWatch.md` e `subject/Domain-Driven_Design_DDD_Guia_Completo.md`.
- **Decisão:** Backend em **Python 3.12+ (FastAPI)** assíncrono com SQLAlchemy 2.0 (asyncpg) e Frontend em **React 18+ com Vite e TypeScript**.
- **Por que esta opção:**
  - Python com `asyncio` nativo é a melhor linguagem para lidar com sockets de rede não-bloqueantes (ICMP, TCP, HTTP), além de oferecer código limpo para modelagem DDD.
  - FastAPI entrega documentação OpenAPI automática, validação ultrarrápida via Pydantic v2 e excelente performance de I/O.
  - React/Vite (TS) garante carregamento instantâneo, HMR veloz e contratos de dados fortemente tipados no cliente.
- **Alternativas descartadas:**
  - *Node.js / Express:* Embora similar ao Uptime Kuma, o ecossistema Python possui bibliotecas nativas de rede e SNMP mais maduras e alinhamento com os exemplos do guia DDD.
  - *PHP / Laravel:* Maior consumo de memória por requisição e fraco suporte nativo a daemons de rede assíncronos contínuos.

---

### ADR-002: Resolução de Dual-Write via Transactional Outbox Pattern
- **Status:** Aprovado e Otimizado
- **Origem:** Diretriz explícita em `subject/.md` (*"DUAL WRITE -> Transactional Outbox Pattern"*).
- **Problema:** Ao atualizar um status ou incidente no banco e disparar uma notificação/Redis em operações separadas, se uma falhar, o sistema entra em inconsistência (ex: banco comita mas o Redis não recebe, ou a mensagem é enviada mas a transação do banco dá rollback).
- **Decisão:** Toda mutação de negócio salva o registro da entidade e o evento na tabela `outbox_events` na **mesma transação ACID do PostgreSQL** através do `UnitOfWork` e do `OutboxRepository` centralizado em `src/core/database/outbox_repository.py`.
  - **Otimização de Latência Reativa (LISTEN/NOTIFY via asyncpg):** Em vez de polling contínuo no banco, o `OutboxRelayWorker` mantém conexão dedicada escutando notificações assíncronas instantâneas emitidas pela trigger `outbox_events_wake` no PostgreSQL no exato momento do commit. O tempo de despacho caiu para **menos de 5ms**.
  - **Auto-Reconciliação com Polling de Fallback:** Mantém polling periódico secundário (`poll_interval=15s`) e reconexão automática caso o listener caia ou se o ambiente utilizar banco alternativo (ex.: SQLite em testes locais).
  - **Retentativas com Backoff Exponencial e Jitter:** Falhas de publicação no barramento sofrem retentativas com jitter antes de suspender o lote, preservando a semântica de entrega *at-least-once*.
- **Benefício:** Garantia estrita de entrega *at-least-once*, eliminação de transações distribuídas frágeis, latência em tempo real e desacoplamento total da API Web.

---

### ADR-003: Desacoplamento Físico de Processos e Daemons Assíncronos Resilientes
- **Status:** Aprovado e Expandido
- **Origem:** Requisito levantado na sessão `/grill-me` (*"o monitoramento não pode compartilhar a mesma instância que a API do backend, o backend fica pesado"*).
- **Decisão:** A aplicação opera fisicamente dividida em **processos/containers Docker independentes** no `docker-compose.yml`:
  1. `infrawatch-api`: Atende requisições HTTP REST, autenticação, SSE e emissão de comandos (`ENABLE_BACKGROUND_WORKERS=false` em produção).
  2. `infrawatch-probe-worker`: Daemon dedicado a disparar pings, testes HTTP, TCP e sondas de containers Docker (`DockerProber`).
  3. `infrawatch-integration-worker`: Processamento externo com latência imprevisível (GLPI, WhatsApp, Telegram, E-mail).
  4. `infrawatch-outbox-worker`: Daemon dedicado de relay do Transactional Outbox (`outbox_relay_worker.py`).
  5. `infrawatch-cleanup-worker`: Daemon periódico de limpeza de tokens e sessões com distributed lock (`token_cleanup_worker.py`).
  6. `infrawatch-zabbix-sync-worker`: Daemon dedicado à coleta de telemetria de hardware Zabbix (`zabbix_sync_worker.py`).
  7. `infrawatch-whatsapp-gateway`: Container isolado da Evolution API v2.3.7 para mensageria corporativa (profile opcional).
- **Padrão de Resiliência de Daemons (`async-daemon-resilience`):**
  - **Controle de Concorrência com Semáforos (`asyncio.Semaphore`):** Limita o número de conexões e sockets simultâneos, evitando o erro de SO `Too many open files` (FD exhaustion).
  - **Parada Graciosa Determinística (Graceful Shutdown):** Intervalos de sono utilizam `asyncio.wait_for(stop_event.wait(), timeout=...)` em vez de `sleep()`, permitindo encerramento instantâneo no `SIGTERM` sem esperar o ciclo expirar.
  - **Ciclo Defensivo (`try...finally`):** Teardown isolado para cada recurso (Redis, DB engine, workers) garantindo que uma falha de descarte não impeça os demais.
- **Trade-off Consciente de Recursos de Hardware (Footprint Base ~1.1 GB):**
  - **Contexto & Justificativa:** A concepção inicial previa um monólito unificado consumindo ~350 MB de memória RAM em repouso. Ao desacoplar fisicamente em processos e contêineres especializados com seus próprios interpretadores Python e daemons assíncronos, o footprint base total da stack em repouso passou para ~1.1 GB.
  - **Avaliação de Trade-off (Custo vs. Benefício):** Esse acréscimo de memória foi formalmente validado e aceito como um investimento arquitetural indispensável. Ele viabiliza:
    1. **Escalabilidade Horizontal Independente:** Cada worker (como o `probe-worker`) pode ser escalado em N instâncias ou orquestrado em nós distintos conforme o volume de ativos cresce, sem duplicar a API Web.
    2. **Isolamento de Falhas (Blast Radius Zero):** Falhas, vazamentos de sockets ou picos de CPU durante sondagens de rede afetam unicamente o worker responsável, mantendo a API REST, a emissão de alertas SSE e a autenticação 100% responsivas.
    3. **Preparação para Microsserviços:** O desacoplamento atual serve como base para uma transição suave e gradual para microsserviços distribuídos no futuro caso a escala corporativa exija.
- **Benefício:** Isolamento absoluto de falhas (*blast radius* zero entre API e workers), ausência de contenção de CPU e escalabilidade horizontal independente.

---

### ADR-004: Motor de Monitoramento Híbrido (Worker Próprio + Conector Zabbix + Docker Engine)
- **Status:** Aprovado e Expandido
- **Origem:** Análise factual de viabilidade vs. `subject/InfraWatch.md` (RF01) e referências de `subject/github.md` (Uptime Kuma).
- **Decisão:**
  - **Sondas de Uptime e Latência (Nativo):** Criadas do zero no `infrawatch-probe-worker` (ICMP Ping, HTTP, TCP, SSL, Heartbeat). Autônomas e com cálculo instantâneo de SLA.
  - **Monitoramento Nativo de Containers Docker (`DockerProber` - ADR-026):** Conexão via socket Unix `/var/run/docker.sock` ou TCP para coletar estado de saúde, uso de CPU cgroups, consumo real de memória, throttling e reinicializações em tempo de execução.
  - **Telemetria de Hardware e Ingestão Zabbix (Híbrido - ADR-028):**
    - Sincronização periódica (pull) via JSON-RPC (`zabbix_sync_worker.py`) para CPU, RAM, Disco e interfaces.
    - Recepção de incidentes em tempo real (push) via Webhook Zabbix (`/api/v1/integrations/zabbix/webhook`).
    - Auto-provisionamento idempotente no startup via `ZabbixWebhookBootstrapper`.
- **Alternativas descartadas:**
  - *Criar monitoramento SNMP complexo do zero:* Descartado. Implementar parsers de MIBs proprietárias de dezenas de fabricantes (Cisco, Huawei, Mikrotik) exigiria esforço inviável.
  - *Usar apenas a API do Zabbix:* Descartado por gerar lentidão e dependência externa de monitoramento.

---

### ADR-005: Orquestração do Worker sem Perda de Dados
- **Status:** Aprovado
- **Origem:** Lição aprendida no projeto `Auth` relatada pelo usuário (perda de mensagens com Redis Pub/Sub volátil).
- **Decisão:**
  1. O Probe Worker mantém a lista de tarefas de sondas agendadas em **memória local** (zero queries de agendamento no banco).
  2. Inclusões, edições ou pausas de dispositivos são sincronizadas via **Redis Streams** (`stream:inventory:changes`) com `Consumer Groups` e confirmação explícita `XACK`. Se o worker reiniciar, ele consome o log pendente.
  3. **Auto-Reconciliação (Self-Healing):** A cada 5 minutos, o worker faz uma consulta de validação leve no PostgreSQL para alinhar o estado de sua memória com o banco.
- **Alternativas descartadas:**
  - *Redis Pub/Sub puro:* Descartado por ser *fire-and-forget* (mensagens evaporam se o receptor estiver desconectado).
  - *Fila de tarefas para cada ping (ex: Celery puro):* Descartado por gerar dezenas de milhares de mensagens por minuto no Redis apenas para agendamento periódico trivial.

---

### ADR-006: Resiliência de Barramento com Buffer de Reconciliação e Fallback em Memória
- **Status:** Aprovado e Aprimorado
- **Origem:** Diretriz em `subject/.md` (*"preparar para rodar com muitas replicas e so com uma. em caso de redis cair armazenar em memoria"*).
- **Decisão:** O barramento `ResilientEventBus` detecta dinamicamente a disponibilidade do Redis Streams:
  - **Modo Distribuído (Primário):** Publica e consome via Redis Streams (`stream:*`) com persistência e grupos de consumidores.
  - **Fallback In-Memory com Buffer Circular de Reconciliação:** Se o Redis falhar (`RedisConnectionError` ou `ConnectionRefusedError`):
    1. Comuta instantaneamente e de forma transparente para `InMemoryEventBus` local, garantindo resposta `200 OK` na API sem quebrar a navegação do usuário.
    2. Armazena as mensagens em um buffer circular (`deque(maxlen=2000)`).
    3. Aciona uma tarefa em background (`_probe_and_reconcile_loop`) que sonda a conectividade do Redis a cada 3 segundos.
    4. Ao reconectar, **drena automaticamente o buffer de reconciliação** (`_drain_reconciliation_buffer`) reenviando todos os eventos acumulados para o Redis Streams sem perda de dados.
- **Benefício:** A aplicação é imune a quedas transitórias do Redis e auto-recupera seu estado distribuído sem intervenção humana.

---

### ADR-007: Streaming em Tempo Real com SSE (Server-Sent Events)
- **Status:** Aprovado
- **Origem:** Diretriz em `subject/.md` (*"SSE"*) e alinhamento no `/grill-me`.
- **Decisão:** A comunicação em tempo real entre backend e frontend é feita via **SSE (`text/event-stream`)** no endpoint `GET /api/v1/events/stream`.
- **Por que SSE em vez de WebSockets:**
  - A comunicação em tempo real necessária é unidirecional (do servidor para o dashboard: latência, mudanças UP/DOWN, novos alertas).
  - Ações do usuário (ack, criar dispositivo) são requisições HTTP REST normais com validação semântica de status code.
  - O SSE possui reconexão nativa e transparente no navegador (`EventSource`), menor overhead de handshake e passa sem bloqueios por proxies e balanceadores corporativos.
  - Inclui heartbeat `: ping\n\n` a cada 15s para evitar encerramento por inatividade.

---

### ADR-008: Autenticação baseada no Projeto `Auth` com Remoção de WebSockets
- **Status:** Aprovado
- **Origem:** Repositório de referência em `subject/github.md` (`NdondaDaniel2020/Auth.git`) e decisão de simplificação no `/grill-me`.
- **Decisão:** A autenticação é incorporada como Bounded Context `identity` nativo no monólito modular:
  - Tokens JWT de curta duração (15 min) + Refresh Tokens rotativos persistidos no PostgreSQL com data de expiração.
  - Hashing com Argon2 / Bcrypt.
  - Blacklist de tokens revogados no Redis (com fallback em memória).
  - **Remoção de WebSockets:** As conexões WebSocket presentes no projeto Auth de origem foram expressamente descartadas por redundância com o SSE.

---

### ADR-009: Privacidade Estrita e Multi-Tenancy sem Páginas Públicas Abertas
- **Status:** Aprovado
- **Origem:** Requisito de negócio da RCS Angola debatido no `/grill-me` (prevenção de vazamento de dados de infraestrutura entre clientes concorrentes).
- **Decisão:**
  - O sistema é **100% privado e autenticado**. Não há URLs públicas abertas.
  - Cada cliente corporativo é cadastrado em uma `Organization` e seus usuários recebem o papel `CLIENT_VIEWER`.
  - Um `CLIENT_VIEWER` enxerga unicamente os ativos associados à sua própria organização.
  - Detalhes técnicos confidenciais (IPs de rede interna `10.x.x.x`, portas de banco) são mascarados na interface do cliente.
  - O NOC da RCS Angola utiliza os papéis `ADMIN` e `OPERATOR` com visão global unificada (NOC TV).

---

### ADR-010: Integração Bidirecional Inteligente com o GLPI (ITSM) via Event Consumer
- **Status:** Aprovado e Otimizado
- **Origem:** Requisito RF09 em `subject/InfraWatch.md` e refinamento no `/grill-me`.
- **Decisão:**
  - **Desacoplamento Orientado a Eventos:** O envio e atualização de chamados no GLPI não ocorrem mais de forma síncrona na thread de alerta. O `GlpiTicketConsumer` escuta o Redis Stream `stream:incidents` e processa chamados em background com retentativas automáticas e Dead-Letter Queue (DLQ).
  - **Abertura Automática:** Ao confirmar queda crítica (`DOWN` após 3 falhas), o consumer despacha `POST /Ticket` na REST API do GLPI 10+, registrando `glpi_ticket_id` no incidente.
  - **Templates HTML Padronizados:** Utilização de geradores HTML dedicados em `src/integrations/glpi/templates.py` para formatar descrição rica, tabela com IPs/portas afetadas e linha do tempo de indisponibilidade.
  - **Acompanhamento no Acknowledge:** Quando o operador faz *Acknowledge*, adiciona anotação (`ITILFollowup`) informando a equipe responsável.
  - **Fechamento Inteligente com SLA:** Ao normalizar (`RESOLVED`), calcula o downtime total e atualiza o ticket no GLPI com a solução técnica detalhada.
  - **Abertura Manual em 1 Clique:** Rota dedicada no backend para o operador forçar a abertura de ticket a partir do painel.
- **Benefício:** Quedas ou lentidões na API do GLPI não afetam a velocidade de resposta do InfraWatch nem travam o envio de outros alertas.

---

### ADR-011: Notificações Multi-Canal com WhatsApp Isolado (Descarte de SMS)
- **Status:** Aprovado e Otimizado
- **Origem:** Requisito RF05 em `subject/InfraWatch.md` e seleção de canais no `/grill-me`.
- **Decisão:** Suporte nativo e desacoplado através do `AlertNotificationConsumer`:
  1. **WhatsApp via Evolution API v2.3.7 (Profile Opcional):** Executado em microserviço/container isolado (`infrawatch-whatsapp-gateway`) sob profile opcional do Compose (`--profile whatsapp`), com persistência isolada em Postgres/Redis e secrets nativos. Permite alertas instantâneos em grupos técnicos do NOC e plantonistas.
  2. **Telegram Bot:** Mensagens markdown com formatação visual de severidade (🔴 CRITICAL, 🟡 WARNING, 🟢 RESOLVED).
  3. **Webhooks:** Payloads padronizados para Slack, Discord e Microsoft Teams.
  4. **E-mail (SMTP):** Alertas com layout responsivo HTML desacoplado em template dedicado (`alert_email.html`).
- **Evolução da Decisão sobre WhatsApp Gateway (Emulação Web vs. Meta Cloud API Oficial):**
  - O container `infrawatch-whatsapp-gateway` foi desacoplado sob profile opcional e **desativado por padrão** na execução da stack:
    1. **Prevenção de Banimento de Conta:** Gateways de terceiros baseados em engenharia reversa do WhatsApp Web (Baileys/Puppeteer) violam as políticas de uso da Meta e impõem alto risco de banimento irreversível dos números corporativos utilizados pelo NOC.
    2. **Sobrecarga de Hardware e Memória:** A execução contínua de instâncias de headless browser no container adicionava alto overhead de memória (~250-400 MB) sem garantias de disponibilidade em ambientes de missão crítica.
    3. **Direcionamento Estratégico:** Para ambientes corporativos de produção, o canal WhatsApp deve conectar-se prioritariamente à **Meta WhatsApp Business Cloud API (API oficial)**, ou priorizar canais de mensageria mais estáveis e imunes a bloqueios arbitrários (Telegram e Webhooks para Slack/Discord).
- **Remoção Expressa do Canal SMS:**
  - O canal SMS foi **descartado** devido a tarifas abusivas por disparo, baixa taxa de entrega comprovada em operadoras locais de Angola, impossibilidade de formatação rica e total redundância com o WhatsApp.
- **Filtros e Supressão:** Supressão automática durante janelas de manutenção aprovadas e filtro de *Anti-Flapping*.

---

### ADR-012: Busca Full-Text Nativa no PostgreSQL (Sem Elasticsearch Prematuro)
- **Status:** Aprovado
- **Origem:** Diretriz em `subject/.md` (*"full text search"*) e análise de PACELC em `subject/Table.md`.
- **Decisão:** Implementação de busca textual sobre ativos, tags e incidentes diretamente no PostgreSQL utilizando a coluna gerada `search_vector TSVECTOR` e índices **GIN**.
- **Por que não Elasticsearch:** O PostgreSQL atende consultas de milhares de ativos em menos de 10ms via índice GIN com o dicionário em português (`websearch_to_tsquery`). Introduzir um cluster Elasticsearch nesta fase adicionaria custos de infraestrutura e problemas adicionais de consistência de dados sem necessidade.

---

### ADR-013: Modelagem DDD com CQRS em Monólito Modular
- **Status:** Aprovado
- **Origem:** Guia `subject/Domain-Driven_Design_DDD_Guia_Completo.md` e anotações de `subject/.md`.
- **Decisão:**
  - O sistema é organizado por **Bounded Contexts** bem delineados: `identity`, `organization`, `inventory`, `monitoring`, `alert` e `notification`.
  - **CQRS (Segregação de Comandos e Consultas):**
    - Comandos (Escrita): Passam por validações rigorosas de invariantes nos Agregados, emitem Domain Events e usam o Transactional Outbox.
    - Consultas (Leitura): Queries otimizadas e projeções de telemetria diretamente nas tabelas particionadas e índices GIN, com zero sobrecarga de ciclo de vida de agregados.

---

### ADR-014: Roteamento de Rede Direto via MPLS/VPN para IPs Privados
- **Status:** Aprovado
- **Origem:** Sessão `/grill-me` (definição de alcance da sonda aos quiosques e servidores locais).
- **Decisão:** O servidor central do InfraWatch possui rotas de rede diretas (via MPLS, VPN IPSec ou rede dedicada da RCS Angola) para alcançar os endereços IP privados (`10.x.x.x`, `192.168.x.x`). O `infrawatch-probe-worker` executa pings e testes HTTP diretamente da central sem necessidade de instalar sondas remotas (satélites) nas filiais na fase inicial.

---

### ADR-015: Retenção de 30 Dias no PostgreSQL + Exportador Prometheus para Grafana
- **Status:** Aprovado
- **Origem:** Análise de volume de telemetria e expansão no `/grill-me`.
- **Decisão:**
  - **No PostgreSQL (Operacional):** A tabela `metrics` retém dados brutos por **30 dias**. Uma rotina periódica descarta automaticamente dados mais antigos (`DELETE / DROP PARTITION`), mantendo o PostgreSQL leve e com alta performance.
  - **No Prometheus / Grafana (Auditoria Histórica de Longo Prazo):** O InfraWatch expõe nativamente o endpoint `GET /api/v1/monitoring/metrics` no padrão OpenMetrics/Prometheus. Um container Prometheus pode fazer scrape contínuo dessas métricas e armazená-las de forma ultra-comprimida (algoritmo Gorilla) por 6 meses a 1 ano para dashboards no Grafana sem onerar o banco relacional.

---

### ADR-016: Detecção de Degradação de Performance com Inscrição Granular
- **Status:** Aprovado
- **Origem:** Sessão `/grill-me` (critérios de alerta além de UP/DOWN).
- **Decisão:**
  - O sistema detecta dois níveis de anomalia:
    1. `DOWN` (Crítico): O host para de responder aos pings/HTTP após 3 tentativas consecutivas.
    2. `DEGRADED` (Atenção/Warning): O host continua respondendo, mas a latência ou tempo de resposta HTTP ultrapassa o limiar configurado (ex: latência > 250ms ou HTTP > 3s por 3 checagens seguidas).
  - **Inscrição Granular:** Cada canal de notificação e cada usuário pode configurar quais severidades deseja receber (ex: WhatsApp recebe apenas `CRITICAL`, enquanto canais do Slack recebem `CRITICAL` e `WARNING`).

---

### ADR-017: Isenção de Janelas de Manutenção Programada no Cálculo de SLA
- **Status:** Aprovado
- **Origem:** Práticas contratuais de telecomunicações/TI e alinhamento no `/grill-me`.
- **Decisão:** O tempo em que um dispositivo estiver em janela de manutenção programada aprovada é **isento e excluído** do cálculo de downtime de SLA contratual. Não penaliza a meta de disponibilidade (ex: 99.5%) e suspende alertas externos para clientes durante a janela.

---

### ADR-018: Políticas de Horário de Notificação e Escalas de Plantão por Canal
- **Status:** Aprovado
- **Origem:** Sessão `/grill-me` (prevenção de fadiga de alertas e respeito a horários).
- **Decisão:** Cada canal de notificação (especialmente WhatsApp) possui parâmetros de funcionamento:
  - `active_hours_start` e `active_hours_end` (ex: 08:00 às 18:00).
  - `days_of_week` (dias ativos).
  - `allow_critical_outside_hours` (booleano que permite que quedas críticas `DOWN` ignorem o horário e acordem o plantonista mesmo de madrugada).

---

### ADR-019: Trilha de Auditoria Imutável (Audit Trail) para Compliance
- **Status:** Aprovado
- **Origem:** Sessão `/grill-me` (rastreabilidade de ações em infraestrutura corporativa).
- **Decisão:** Criação da tabela `audit_logs` no PostgreSQL com inserção estritamente append-only (sem UPDATE/DELETE). Registra todas as ações humanas críticas: quem cadastrou/removeu ativos, quem colocou servidor em manutenção, quem fez *Acknowledge* de incidentes e quem alterou regras ou canais de notificação, acompanhado de `ip_address` e `timestamp`.

---

### ADR-020: Padrão Event Consumer em Substituição ao FastAPI BackgroundTasks
- **Status:** Aprovado
- **Origem:** Análise das issues #144 e #146 e código de `app/messaging/` do repositório `NdondaDaniel2020/Auth`.
- **Problema:** O uso de `background_tasks.add_task` do FastAPI acopla tarefas assíncronas ao ciclo de vida da requisição HTTP, sofre com problemas de fechamento prematuro de sessões de banco (`Closed session / InterfaceError`) e não possui persistência, retentativas automáticas nem Dead-Letter Queue (DLQ) em caso de falha de workers.
- **Decisão:** O InfraWatch **elimina completamente** o uso de `BackgroundTasks` em todas as rotas e serviços. Adota-se o padrão 100% orientado a eventos (EDA) do projeto `Auth`:
  1. A rota HTTP executa a mutação no banco e chama `await bus.publish(Event(...))` (ou via Transactional Outbox).
  2. Responde HTTP 200/201 imediatamente ao cliente sem bloquear a thread.
  3. **Consumers Desacoplados** (`NotificationConsumer`, `EmailConsumer`, `GLPIConsumer`) escutam os eventos tipados do barramento (`EventBus`), processam os efeitos colaterais de forma resiliente, realizam retentativas e enviam falhas irrecuperáveis para a Dead-Letter Queue (DLQ) no Redis.

---

### ADR-021: Dual-Key Rate Limiting contra Força Bruta Distribuída
- **Status:** Aprovado
- **Origem:** Análise da Issue #116 do repositório `NdondaDaniel2020/Auth`.
- **Problema:** O rate-limiting convencional que combina apenas `IP|email` é vulnerável a ataques de força bruta distribuída (onde o atacante usa múltiplos proxies/IPs para tentar senhas na mesma conta) e não funciona em ambientes multi-réplicas se armazenado em memória local.
- **Decisão:** Implementação de contagem dupla centralizada no Redis com TTL:
  1. `rate_limit:login:ip:{client_ip}`: Protege contra varreduras massivas vindas da mesma rede.
  2. `rate_limit:login:email:{email}`: Bloqueia a conta temporariamente (*Account Lockout*) após 5 tentativas consecutivas falhas, independentemente de quais IPs originaram as tentativas.

---

### ADR-022: Mitigação de Timing Attack e User Enumeration
- **Status:** Aprovado
- **Origem:** Análise da Issue #115 do repositório `NdondaDaniel2020/Auth`.
- **Problema:** Discrepâncias no tempo de resposta HTTP entre e-mails existentes (~300ms com geração de token e envio) e inexistentes (~10ms) permitem que invasores descubram contas corporativas ativas medindo a latência da requisição.
- **Decisão:** O endpoint de solicitação de redefinição de senha e verificação de e-mail responde imediatamente em **tempo constante neutro** (~10ms) com mensagem genérica: *"Se o e-mail estiver cadastrado, as instruções foram enviadas"*. Toda a validação e despacho de eventos é delegada assincronamente ao `EventBus` e seus Consumers.

---

### ADR-023: Tratamento de Trusted Proxies e Prevenção de IP Spoofing
- **Status:** Aprovado
- **Origem:** Análise da Issue #114 do repositório `NdondaDaniel2020/Auth`.
- **Problema:** Atrás de proxies reversos (Nginx, Traefik, AWS ALB), `request.client.host` lê o IP do balanceador interno, enquanto confiar cegamente em `X-Forwarded-For` permite forjamento de IP (*IP Spoofing*).
- **Decisão:** Configuração do Uvicorn com `--proxy-headers` e `--forwarded-allow-ips`, definindo a lista de CIDRs confiáveis. Apenas proxies autorizados podem repassar cabeçalhos de encaminhamento, garantindo a integridade dos registros na tabela `audit_logs` e no rate-limiter.

---

### ADR-024: Distributed Lock Não-Bloqueante com Redis para Multi-Réplicas
- **Status:** Aprovado
- **Origem:** Análise da Issue #148 do repositório `NdondaDaniel2020/Auth`.
- **Problema:** Ao rodar com múltiplas réplicas da aplicação, rotinas agendadas (limpeza periódica de tokens expirados e expurgo de métricas de 30 dias) são disparadas simultaneamente por todos os nós, gerando contenção de lock e sobrecarga desnecessária no PostgreSQL.
- **Decisão:** As rotinas periódicas de manutenção utilizam Distributed Lock não-bloqueante no Redis:
  `redis_client.lock("lock:periodic_cleanup", timeout=300, blocking=False)`. Apenas o nó que adquirir o lock executa a tarefa; os demais nós secundários pulam a iteração de forma silenciosa.

---

### ADR-025: Proteção e Autenticação do Endpoint de Telemetria /metrics
- **Status:** Aprovado
- **Origem:** Análise da Issue #156 do repositório `NdondaDaniel2020/Auth`.
- **Problema:** O endpoint OpenMetrics/Prometheus expõe métricas de latência, nomes de nós internos, status operacionais e topologia de rede que não devem ser visíveis para o público externo na internet.
- **Decisão:** A rota `/api/v1/monitoring/metrics` é estritamente restrita através de autenticação via Bearer Token de serviço ou Basic Auth configurado no `prometheus.yml`, bloqueando acessos anônimos da internet.

---

### ADR-026: Monitoramento Nativo de Contêineres Docker via Unix Domain Socket / TCP (DockerProber)
- **Status:** Aprovado e Implementado
- **Origem:** Necessidade de observabilidade em infraestruturas conteinerizadas modernas sem depender de agentes pesados externos (Issues #170, #184, #185).
- **Problema:** O monitoramento de contêineres via Zabbix exige configuração de itens de template complexos e agentes dedicados, resultando em latência e atrito de manutenção para monitorar microserviços locais.
- **Decisão:** Implementação do `DockerProber` (`src/workers/probers/docker.py`) utilizando a Docker Engine API nativa via Socket Proxy Seguro (`tecnativa/docker-socket-proxy`), Unix Domain Socket (`/var/run/docker.sock`) ou TCP assíncrono com `httpx.AsyncHTTPTransport`:
  1. **CPU Real:** Cálculo preciso por deltas de cgroups (`cpu_delta / system_delta * online_cpus * 100.0`).
  2. **Memória Efetiva:** Exclusão do cache inativo de páginas do kernel (`used_bytes = usage - inactive_file/cache`).
  3. **Métricas Críticas de Saúde:** Detecção de throttling de CPU, contagem de restarts sucessivos e terminação por estouro de memória (`oom_killed`).
  4. **Healthcheck Nativo:** Leitura direta do status retornado pelas instruções `HEALTHCHECK` dos contêineres inspecionados.
  5. **Blindagem de Segurança (Zero-Trust Socket Proxy):** O contêiner do worker não monta `/var/run/docker.sock` nem executa como `root`. A comunicação é intermediada pelo serviço `infrawatch-docker-proxy` que bloqueia estritamente todas as chamadas de mutação (`POST=0`, `DELETE=0`, `PUT=0`, `EXEC=0`), permitindo unicamente consultas de leitura (`CONTAINERS=1`, `INFO=1`), mitigando integralmente riscos de container escape.
- **Benefício:** Observabilidade de contêineres nativa, assíncrona, de alto desempenho, autônoma e com isolamento de segurança Zero-Trust.

---

### ADR-027: Gerenciamento Seguro de Credenciais com Docker Secrets e Entrypoint Wrapper
- **Status:** Aprovado e Implementado
- **Origem:** Padrão formalizado na skill `docker-compose-secrets-pattern` e resolução das Issues #150 e #158.
- **Problema:** Declarar senhas e chaves em arquivos `.env` ou no bloco `environment:` do Compose expõe credenciais em texto puro no `docker inspect`, no diretório `/proc/<pid>/environ` do Linux, em APMs e no histórico do Git.
- **Decisão:** Migração completa da orquestração para **Docker Secrets**:
  1. Todas as senhas, tokens e chaves são armazenadas em arquivos restritos (`chmod 600`) no diretório `./secrets/*.txt`, gerados automaticamente por `scripts/init-secrets.sh`.
  2. O Docker monta os segredos em memória RAM virtual (**tmpfs**) em `/run/secrets/<nome_do_segredo>`, inacessíveis fora do container.
  3. Serviços com suporte nativo leem segredos via sufixo `_FILE` (ex.: `POSTGRES_PASSWORD_FILE`).
  4. Para a aplicação Python, o script `backend/entrypoint.sh` atua como wrapper desacoplado, lendo `/run/secrets/` e exportando para o ambiente do processo antes da execução, mantendo o código Python 100% agnóstico e aderente ao Twelve-Factor App.
- **Benefício:** Eliminação do risco de vazamento de credenciais na infraestrutura e atendimento ao padrão CIS Docker Benchmark.

---

### ADR-028: Ingestão de Alertas Zabbix em Tempo Real (Push Webhook) e Autoconfiguração Idempotente
- **Status:** Aprovado e Implementado
- **Origem:** Requisitos de baixa latência em detecção de falhas de hardware e resolução das Issues #161, #162 e #186.
- **Problema:** O modelo inicial baseado apenas em pull periódico (polling a cada 2-5 min) impunha atraso inaceitável na resposta a falhas corporativas graves. Além disso, a configuração manual de MediaTypes e Actions no Zabbix gerava alto índice de erro humano.
- **Decisão:**
  1. **Webhook Push em Tempo Real:** Endpoint `/api/v1/integrations/zabbix/webhook` em `alerting` com validação de segredo compartilhado (`zabbix_webhook_secret`), disparando o incidente no InfraWatch no mesmo segundo em que a trigger do Zabbix dispara.
  2. **Autoconfiguração Idempotente no Startup (`ZabbixWebhookBootstrapper`):** Durante o lifespan da API, a aplicação consulta a API JSON-RPC do Zabbix e provisiona automaticamente o `MediaType` de Webhook, a `User Media` e a `Action` global se ainda não existirem.
  3. **Sincronização Periódica Mantida:** O `ZabbixSyncWorker` continua coletando métricas contínuas de CPU, RAM e disco para séries temporais.
- **Benefício:** Latência zero na recepção de alarmes do Zabbix e provisionamento *zero-touch* da integração.

---

### ADR-029: Arquitetura de Thin Controllers, Unit of Work e Coesão Modular
- **Status:** Aprovado e Implementado
- **Origem:** Plano de coesão de módulos (`docs/plano_coesao_modulos.md`) e Issues #87 a #91 e #125 a #141.
- **Problema:** Controladores HTTP acumulavam lógica transacional e persistência direta no banco; utilitários transversais estavam dispersos soltos em `src/core/`; e havia duplicidade entre dataclasses de comando e schemas de request.
- **Decisão:**
  1. **Pacote `src/core/web/`:** Consolidação em pacote coeso de middlewares, manipuladores de erro (`error_handlers.py`), identificação de cliente/dispositivo (`client_info.py`) e paginação padronizada (`pagination.py`).
  2. **Thin Controllers:** As rotas FastAPI limitam-se a validar requisições e devolver códigos HTTP sem abrir transações manuais.
  3. **Encapsulamento nos Services com Unit of Work:** Todas as mutações de agregados e gravação atômica em `outbox_events` são geridas estritamente dentro dos Services via `UnitOfWork` (`src/core/database/unit_of_work.py`).
  4. **Repository Pattern Uniforme:** Padronização do método `save(entity)` em todos os Bounded Contexts (`iam`, `inventory`, `alerting`).
- **Benefício:** Separação estrita de responsabilidades (SoC), facilidade de manutenção e conformidade com Domain-Driven Design (DDD).

---

### ADR-030: Padronização Temporal com Timezone Estrito (TIMESTAMPTZ)
- **Status:** Aprovado e Implementado
- **Origem:** Resolução da Issue #176 e migração Alembic 012 (`012_alter_devices_timestamps_to_timestamptz.py`).
- **Problema:** A utilização de colunas de timestamp ingênuas (*naive timestamps*) gerava discrepâncias no cálculo de SLA e no agendamento de sondas entre servidores em fusos horários distintos (ex.: UTC nos containers vs WAT UTC+1 da operação local em Angola).
- **Decisão:**
  1. Todas as colunas temporais no PostgreSQL foram convertidas para `TIMESTAMPTZ` (`TIMESTAMP WITH TIME ZONE`).
  2. Toda manipulação de data/hora no backend Python utiliza estritamente `datetime.now(UTC)` consciente de fuso horário.
- **Benefício:** Consistência matemática absoluta no cálculo de downtime de SLA, expurgo de séries temporais e sincronização de eventos distribuídos.

---

### ADR-031: Adoção do TimescaleDB com Hypertables e Compressão Colunar para Séries Temporais
- **Status:** Aprovado e Implementado
- **Origem:** Issue #169, Fase 4 (Milestone: *Fase 4: Integrações Corporativas*).
- **Problema:** A tabela `metrics` de telemetria recebe centenas de amostras por segundo provenientes de sondas de rede (ICMP, TCP, HTTP), contêineres Docker e agentes corporativos Zabbix. O particionamento declarativo mensal nativo do PostgreSQL exigia manutenção contínua pelo `PartitionManager`, não realizava compressão de dados históricos, gerava overhead de índices B-tree em volumes massivos e demandava elevado espaço em disco para séries temporais contínuas.
- **Decisão:**
  1. **Adoção do TimescaleDB sobre PostgreSQL 16:** Atualização da imagem de banco de dados no `docker-compose.yml` para a versão específica estável `timescale/timescaledb:2.16.1-pg16` (evitando tags flutuantes como `:latest`), mantendo total conformidade com o driver assíncrono `asyncpg`, SQLAlchemy 2.0 e o ecossistema de 22 Docker Secrets sem alterar conexões existentes.
  2. **Conversão da Tabela `metrics` em Hypertable:** Através da migração Alembic `013_enable_timescaledb_hypertable.py`, a tabela `metrics` foi convertida em Hypertable particionada dinamicamente no eixo temporal (`timestamp`), automatizando a gestão de chunks.
  3. **Compressão Colunar Nativa (Gorilla + Delta-of-Delta):** Configuração de compressão colunar com segmentação por `(device_id, organization_id, metric_type)` e ordenação decrescente por `timestamp`, comprimindo números de ponto flutuante via algoritmo Gorilla e marcas de tempo via Delta-of-Delta.
  4. **Política Automatizada de Compressão de Chunks (7 dias):** Registro de política nativa via `add_compression_policy('metrics', INTERVAL '7 days')`, compactando dados mais antigos que uma semana em segundo plano sem impactar a ingestão de novas métricas.
  5. **Resiliência e Zero-Collision no `PartitionManager`:** Atualização do `PartitionManager` para inspecionar `pg_class.relkind` antes de executar comandos DDL declarativos. Ao detectar uma Hypertable (`relkind != 'p'`), o worker delega a gestão de partições ao motor do TimescaleDB, garantindo tolerância a falhas e zero colisões de DDL.
- **Alternativas Descartadas:**
  - *InfluxDB / VictoriaMetrics:* Exigiria a implantação de um novo cluster de banco de dados isolado, linguagem de consulta proprietária (Flux/InfluxQL), inviabilização de JOINs ACID com tabelas de domínio (`devices`, `organizations`) e aumento do consumo de recursos operacionais.
  - *Particionamento Declarativo Mensal Puro:* Não dispõe de compressão colunar nativa, provocando crescimento linear descontrolado do volume em disco e saturação do cache de páginas do PostgreSQL.
- **Benefício:** Redução de até 90-95% no consumo de armazenamento de métricas antigas, consultas de séries temporais de alto desempenho e preservação completa da integridade relacional e transacional da aplicação.

---

### ADR-032: Estratégia de Backup Automatizado Multi-Destino Dual-Cloud e Acionamento Desacoplado
- **Status:** Aprovado e Planejado
- **Origem:** Issue #220, Fase 6 (Milestone: *Fase 6: Homologação, Carga, Auditoria & Go-Live*).
- **Problema:** A perda do banco de dados (TimescaleDB) ou do cache persistente (Redis 7.4) representaria um desastre operacional grave, com perda de históricos de SLA e séries temporais de rede. Além disso, os segredos (`secrets/`) contêm chaves de criptografia indispensáveis para a leitura de tokens corporativos. Depender de um único destino de backup (local ou nuvem única) cria um Ponto Único de Falha (SPOF). Por fim, executar tarefas pesadas de dump e upload dentro do ciclo de vida assíncrono da API (`lifespan.py` / `asynccontextmanager`) causaria travamentos no loop de eventos (*event loop lag*), risco de OOM Killer e concorrência descontrolada caso a API seja escalada horizontalmente em múltiplas réplicas.
- **Decisão:**
  1. **Contêiner Dedicado de Backup (`infrawatch-backup`):** O pipeline de dump, compactação e upload é 100% isolado em um contêiner leve (base Alpine com `postgresql16-client`, `redis`, `rclone` e `openssl`), eliminando impacto de CPU, memória e I/O na API principal (*Blast Radius* zero).
  2. **Multi-Destino Dual-Cloud com `rclone`:** O bundle diário (`.tar.gz` com checksum SHA-256) é distribuído simultaneamente para:
     - *Local:* Host em `/var/backups/infrawatch/` (RTO instantâneo para restauração local).
     - *Remoto A (Google Drive):* Utilizando a cota gratuita nativa (15 GB) ou expansível para planos corporativos (2 TB+).
     - *Remoto B (Cloudflare R2):* Utilizando o tier gratuito permanente de 10 GB compatível com a API S3 e sem custos de saída de dados (*Zero Egress Fees*).
     - *Destino Adicional Preparado (AWS S3):* Script configurado com instrução comentada (`# rclone copy ... aws_s3:...`) pronto para ser ativado com créditos de estudante / AWS Educate.
  3. **Acionamento Desacoplado pelo Dashboard NOC:** A API FastAPI disponibilizará o endpoint administrativo `POST /api/v1/system/backup` (RBAC `Role.ADMIN`). Em vez de executar o dump, a API apenas emite um sinal assíncrono não bloqueante para acordar o contêiner de backup e retorna imediatamente HTTP 202 (*Accepted*).
  4. **Criptografia Simétrica dos Segredos:** O diretório de Docker Secrets é compactado e cifrado via OpenSSL AES-256-CBC PBKDF2 com chave mestra (`BACKUP_ENCRYPTION_KEY`).
  5. **Política de Rotação (Pruning) e Restauração Automatizada:** Limpeza automática de arquivos locais (> 7 dias) e remotos (> 30 dias), acompanhada de script de recuperação em um comando (`scripts/restore.sh` / `make restore`).
- **Alternativas Descartadas:**
  - *Execução dentro do `lifespan` do FastAPI:* Descartada devido à concorrência destrutiva entre réplicas da API, inchaço da imagem com binários desnecessários e risco de travar requisições de telemetria em tempo real (SSE).
  - *Backup em Destino Único:* Descartada por violar as diretrizes de Disaster Recovery e manter vulnerabilidade a bloqueios de conta ou quedas de serviço de um provedor específico.
- **Benefício:** RPO/RTO minimizados, zero custo adicional de infraestrutura, independência de nuvem (*cloud agnostic*), imunidade a falhas de provedores individuais e preservação da performance e estabilidade da API web.


