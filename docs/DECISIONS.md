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
11. [ADR-011: Notificações Multi-Canal com WhatsApp/SMS via Número Virtual](#adr-011-notificações-multi-canal-com-whatsapp-sms)
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
- **Status:** Aprovado
- **Origem:** Diretriz explícita em `subject/.md` (*"DUAL WRITE -> Transactional Outbox Pattern"*).
- **Problema:** Ao atualizar um status ou incidente no banco e disparar uma notificação/Redis em operações separadas, se uma falhar, o sistema entra em inconsistência (ex: banco comita mas o Redis não recebe, ou a mensagem é enviada mas a transação do banco dá rollback).
- **Decisão:** Toda mutação de negócio salva o registro da entidade e o evento na tabela `outbox_events` na **mesma transação ACID do PostgreSQL**. Um worker de segundo plano despacha os eventos pendentes via `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Benefício:** Garantia de entrega *at-least-once*, desacoplamento total e consistência de dados estrita.

---

### ADR-003: Desacoplamento Físico de Processos (API Web vs. Workers)
- **Status:** Aprovado
- **Origem:** Requisito levantado na sessão `/grill-me` (*"o monitoramento não pode compartilhar a mesma instância que a API do backend, o backend fica pesado"*).
- **Decisão:** A aplicação roda separada em **3 processos/containers Docker independentes**:
  1. `infrawatch-api`: Atende requisições HTTP REST, autenticação, SSE e emissão de comandos.
  2. `infrawatch-probe-worker`: Daemon dedicado a disparar pings, testes HTTP e TCP em alta concorrência.
  3. `infrawatch-integration-worker`: Processamento externo com latência imprevisível (GLPI, Zabbix, WhatsApp, Telegram, E-mail).
- **Benefício:** Se o worker de sondas saturar a rede ou se a API do GLPI estiver lenta, o painel web dos operadores permanece rápido e responsivo.

---

### ADR-004: Motor de Monitoramento Híbrido (Worker Próprio + Conector Zabbix)
- **Status:** Aprovado
- **Origem:** Análise factual de viabilidade vs. `subject/InfraWatch.md` (RF01) e referências de `subject/github.md` (Uptime Kuma).
- **Decisão:** 
  - **Sondas de Uptime e Latência (Nativo):** Criadas do zero no `infrawatch-probe-worker` (ICMP Ping, HTTP, TCP, SSL, Heartbeat). Autônomas e com cálculo instantâneo de SLA.
  - **Telemetria de Hardware (Zabbix Connector):** Conexão opcional via API JSON-RPC do Zabbix (`zabbix_host_id`) para buscar dados consolidados de CPU, RAM, Disco e interfaces de rede.
- **Alternativas descartadas:**
  - *Criar monitoramento SNMP complexo do zero:* Descartado. Implementar parsers de MIBs proprietárias de dezenas de fabricantes (Cisco, Huawei, Mikrotik) exigiria meses de esforço desnecessário.
  - *Usar apenas a API do Zabbix:* Descartado. Tornaria o InfraWatch dependente do Zabbix para saber se uma URL caiu, além de gerar overhead de requisições JSON-RPC.

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

### ADR-006: Resiliência de Barramento com Fallback em Memória
- **Status:** Aprovado
- **Origem:** Diretriz em `subject/.md` (*"preparar para rodar com muitas replicas e so com uma. em caso de redis cair armazenar em memoria"*).
- **Decisão:** O barramento `ResilientEventBus` detecta a disponibilidade do Redis:
  - **Modo Distribuído:** Publica e consome via Redis Streams / Pub/Sub entre múltiplos containers.
  - **Fallback In-Memory:** Se o Redis cair ou não estiver configurado (nó único / Edge), chaveia dinamicamente para `asyncio.Queue` local sem interromper o serviço, tentando reconectar ao Redis em background a cada 10s.
- **Benefício:** A aplicação nunca falha de forma catastrófica por indisponibilidade do cache.

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

### ADR-010: Integração Bidirecional Inteligente com o GLPI (ITSM)
- **Status:** Aprovado
- **Origem:** Requisito RF09 em `subject/InfraWatch.md` e refinamento no `/grill-me`.
- **Decisão:**
  - Ao confirmar queda crítica (`DOWN` após 3 falhas), o `infrawatch-integration-worker` chama a REST API do GLPI (`POST /Ticket`), salvando o `glpi_ticket_id` no incidente.
  - Quando o operador faz *Acknowledge* no InfraWatch, adiciona acompanhamento no ticket do GLPI informando que a equipe assumiu o caso.
  - Quando a sonda detecta o restabelecimento do serviço (`RESOLVED`), calcula o downtime total e atualiza o chamado no GLPI com a solução técnica.
  - Fornece botão de abertura manual em 1 clique no painel de NOC.

---

### ADR-011: Notificações Multi-Canal com WhatsApp/SMS via Número Virtual
- **Status:** Aprovado
- **Origem:** Requisito RF05 em `subject/InfraWatch.md` e seleção de canais no `/grill-me`.
- **Decisão:** Suporte nativo aos seguintes canais:
  1. **WhatsApp / SMS:** Conexão com gateway de mensageria com número virtual (Evolution API, Z-API ou Twilio).
  2. **Telegram Bot:** Mensagens formatadas em markdown para grupos técnicos.
  3. **Webhooks:** Payloads padronizados para Slack, Discord e Microsoft Teams.
  4. **E-mail (SMTP):** Resumos e relatórios de incidentes.
  - Todas as notificações passam por filtro de *Anti-Flapping* e supressão em janelas de manutenção.

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
- **Decisão:** Cada canal de notificação (especialmente WhatsApp e SMS) possui parâmetros de funcionamento:
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
