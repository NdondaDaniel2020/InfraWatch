# InfraWatch — Documento de Requisitos Técnicos (TRD)

> **Documento:** 02-TRD.md  
> **Status:** Aprovado e Consolidado  
> **Stack:** Python 3.12+ (FastAPI) • React 18+ (Vite + TypeScript) • PostgreSQL 16+ • Redis 7+

---

## 1. Arquitetura de Processos e Serviços Desacoplados

Para garantir que a API Web mantenha latência ultra-baixa e que as operações de rede e integrações externas não afetem a navegação dos usuários, o sistema opera dividido em **processos/containers físicos independentes** no `docker-compose.yml`, protegidos pela camada de **Docker Secrets** montada em memória (`/run/secrets/`):

```
[Container 1: infrawatch-api]
  └── FastAPI Web Server + SSE Engine + JWT Auth + OpenAPI (ENABLE_BACKGROUND_WORKERS=false)

[Container 2: infrawatch-probe-worker]
  └── Daemon de Sondas: Timers em memória + ICMP, HTTP, TCP, SSL + Docker Engine API (DockerProber)

[Container 3: infrawatch-integration-worker]
  └── Consumers de Integração: GLPI REST API + WhatsApp (Evolution v2.3.7) + Telegram + SMTP

[Container 4: infrawatch-outbox-worker]
  └── Relay do Transactional Outbox: Conexão reativa LISTEN/NOTIFY via asyncpg + Polling fallback

[Container 5: infrawatch-cleanup-worker]
  └── Expurgo Periódico: Limpeza de tokens JWT e sessões revogadas com Distributed Lock no Redis

[Container 6: infrawatch-zabbix-sync-worker]
  └── Sincronizador Zabbix: Ingestão contínua de telemetria de hardware (CPU/RAM/Disco) via JSON-RPC

[Container 7: infrawatch-whatsapp-gateway (Opcional)]
  └── Microserviço dedicado Evolution API v2.3.7 para mensageria corporativa no WhatsApp
```

---

## 2. Orquestração e Sincronização de Sondas sem Perda de Dados

### 2.1 Agendador em Memória de Alta Concorrência e Padrão de Resiliência
- O `infrawatch-probe-worker` carrega os ativos no boot e gerencia alvos via `InMemorySchedule` no event loop do `asyncio`.
- Execução de milhares de sondas por minuto sem realizar consultas (`SELECT`) no banco de dados para cada disparo.
- **Padrão `async-daemon-resilience`:** Sondas protegidas por `asyncio.Semaphore(max_concurrent)` para evitar esgotamento de descritores de rede (`Too many open files`), encerramento gracioso instantâneo com `asyncio.wait_for(stop_event.wait(), timeout)` e teardown seguro em `try...finally`.
- **Suporte ao `DockerProber` (ADR-026):** Coleta nativa assíncrona blindada via `infrawatch-docker-proxy` (`tecnativa/docker-socket-proxy`), Unix Socket ou TCP, avaliando CPU real cgroups, memória sem cache inativo, throttling, restarts sucessivos e healthcheck da imagem com Zero-Trust.

### 2.2 Sincronização Reativa via Outbox (LISTEN/NOTIFY) + Redis Streams
Para eliminar o problema de perda de mensagens voláteis do Pub/Sub puro:
1. Ao criar, editar ou pausar um dispositivo na API, o registro e o evento `outbox_events` são persistidos atomicamente no PostgreSQL sob a mesma transação ACID (`UnitOfWork`).
2. O PostgreSQL dispara a trigger `notify_outbox_events()`, acordando o `infrawatch-outbox-worker` via `LISTEN outbox_events_wake` em menos de 5ms.
3. O Outbox Worker despacha o evento para o **Redis Stream** (`stream:inventory:changes`).
4. O Probe Worker consome o stream como parte de um **Consumer Group** (`XREADGROUP`) com confirmação explícita `XACK`.
5. Se o worker reiniciar, ele consome o log pendente a partir do último checkpoint confirmado.

### 2.3 Reconciliação Periódica (Self-Healing)
A cada 5 minutos, o worker executa uma consulta de checagem no PostgreSQL:
```sql
SELECT id, updated_at, is_paused, interval_seconds 
FROM devices 
WHERE is_paused = FALSE;
```
Se houver qualquer divergência entre o estado em memória e o banco de dados, o agendador local corrige as tarefas ativas automaticamente.

---

## 3. Integração com GLPI (REST API)

### 3.1 Autenticação e Sessão
O cliente GLPI conecta-se via `POST /apirest.php/initSession` com os cabeçalhos:
- `App-Token: <app_token>`
- `Authorization: user_token <user_token>`
Recebe um `session_token` temporário para as requisições subsequentes.

### 3.2 Abertura Automática de Chamado
Ao confirmar um incidente `CRITICAL`:
```http
POST /apirest.php/Ticket
Headers: Session-Token, App-Token
Payload:
{
  "input": {
    "name": "[CRITICAL] Indisponibilidade: ERP-PROD-01 (192.168.10.50)",
    "content": "Falha confirmada pelo InfraWatch. 3 timeouts consecutivos via HTTP port 8080.\nInício: 2026-09-30 16:42:00",
    "urgency": 5,
    "impact": 5,
    "priority": 5,
    "itilcategories_id": 12
  }
}
```
O `id` retornado é salvo no campo `incidents.glpi_ticket_id` e exibido no painel do operador.

### 3.3 Atualização e Fechamento
- **No Acknowledge:** `POST /apirest.php/Ticket/{id}/ITILFollowup` (registra que o operador assumiu o incidente).
- **Na Resolução:** `PUT /apirest.php/Ticket/{id}` (adiciona solução técnica com a duração exata do downtime e altera status para solucionado).

---

## 4. Integração Híbrida Zabbix (Hardware & Webhook Push)

O InfraWatch integra-se ao Zabbix de forma bidirecional e híbrida (ADR-004 e ADR-028):
1. **Ingestão em Tempo Real via Webhook (Push):** Endpoint `/api/v1/integrations/zabbix/webhook` com validação de assinatura (`zabbix_webhook_secret`), despachando incidentes no exato milissegundo em que uma trigger crítica é disparada no Zabbix.
2. **Autoconfiguração Idempotente no Startup (`ZabbixWebhookBootstrapper`):** No boot da API, a aplicação conecta via JSON-RPC e provisiona automaticamente o `MediaType` de Webhook, a `User Media` e a `Action` no Zabbix sem requerer setup manual no painel.
3. **Sincronização Contínua de Hardware (Pull):** Para ativos configurados com `zabbix_host_id`, o `infrawatch-zabbix-sync-worker` coleta telemetria periódica (`item.get`, `history.get`) de CPU, memória RAM, disco e tráfego de rede com controle de concorrência por semáforo assíncrono.

---

## 5. Streaming em Tempo Real com SSE (Server-Sent Events)

- **URL:** `GET /api/v1/events/stream`
- **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- **Eventos:**
  - `probe_result`: latência e status momentâneo.
  - `status_change`: alteração entre `UP` e `DOWN`.
  - `incident_created`: alerta de incidente com dados do chamado GLPI.
  - `incident_acked`: operador assumiu o chamado.
- **Heartbeat:** Linha de comentário `: ping\n\n` a cada 15s para manter a conexão viva através de proxies corporativos.

---

## 6. Retenção de Métricas e Exportador Prometheus

### 6.1 Política de Expurgo no PostgreSQL (30 Dias)
- A tabela `metrics` particionada retém dados brutos por 30 dias.
- Um cronjob diário no PostgreSQL / worker executa a desconexão ou expurgo de partições com mais de 30 dias:
  `DROP TABLE IF EXISTS metrics_YYYY_MM;` ou `DELETE FROM metrics WHERE recorded_at < NOW() - INTERVAL '30 days'`.

### 6.2 Endpoint OpenMetrics / Prometheus
- **URL:** `GET /api/v1/monitoring/metrics`
- **Formato:** Texto puro OpenMetrics compatível com scraping padrão do Prometheus (`prometheus_client`).
- Permite que a equipe de infraestrutura da RCS aponte um Prometheus/Grafana externo para histórico de longo prazo (meses/anos) sem penalizar o banco do InfraWatch.

---

## 7. Trilha de Auditoria (Audit Trail)
- Middleware/Interceptor intercepta comandos de mutação (POST, PUT, PATCH, DELETE) executados por usuários autenticados.
- Grava de forma assíncrona na tabela `audit_logs` os dados do autor (`user_id`, `organization_id`), endereço IP de origem, recurso afetado e payload diferencial (*diff* em JSONB).
- Protegido por DDL triggers no PostgreSQL que bloqueiam operações de `UPDATE` e `DELETE` (imutabilidade *append-only*), além de encadeamento criptográfico com SHA-256.

---

## 8. Arquitetura Orientada a Eventos (EDA) e Padrão Consumer
Eliminação completa de `BackgroundTasks` em todas as rotas e serviços da API:
- Toda operação assíncrona (envio de e-mails, disparo de WhatsApp/Telegram, abertura de chamados no GLPI) é modelada como emissão de eventos tipados (`Event`, `DomainEvent`, `Command`).
- A rota HTTP salva a entidade no banco, despacha o evento no `EventBus` e responde imediatamente com tempo de resposta constante.
- **Consumers Especializados** (`IamEmailConsumer`, `AlertNotificationConsumer`, `GlpiTicketConsumer`, etc.) processam os eventos de forma desacoplada, com retentativas automáticas e Dead-Letter Queue (DLQ) no Redis, eliminando problemas de encerramento de sessão de banco (`AsyncSession`) em background tasks.

---

## 9. Gerenciamento Seguro de Credenciais via Docker Secrets (ADR-027)
- Todas as senhas, chaves de API, credenciais de banco e tokens JWT operam sob o padrão **Docker Secrets** montados em memória RAM virtual (**tmpfs**) em `/run/secrets/`.
- Permissões estritas no host (`chmod 600` via `scripts/init-secrets.sh`).
- Imunidade contra vazamentos via `docker inspect`, `/proc/<pid>/environ`, crash dumps e logs de APM.
- O wrapper `backend/entrypoint.sh` injeta os segredos no ambiente de execução do processo Python de forma transparente e aderente ao Twelve-Factor App.

---

## 10. Thin Controllers, Unit of Work e Padronização Temporal TIMESTAMPTZ (ADR-029, ADR-030)
- **Thin Controllers:** As rotas FastAPI limitam-se a validar contratos de entrada Pydantic e formatar códigos de status HTTP, sem acesso direto a transações de banco.
- **Services com Unit of Work:** Mutações de agregação e persistência atômica na tabela `outbox_events` ocorrem estritamente na camada de serviços através de `UnitOfWork` (`src/core/database/unit_of_work.py`).
- **Precisão Temporal TIMESTAMPTZ:** Todas as colunas de data/hora no PostgreSQL operam com `TIMESTAMP WITH TIME ZONE` e código backend padronizado com `datetime.now(UTC)`, garantindo conformidade matemática absoluta no cálculo de SLA contratual.

