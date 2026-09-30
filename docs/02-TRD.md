# InfraWatch — Documento de Requisitos Técnicos (TRD)

> **Documento:** 02-TRD.md  
> **Status:** Aprovado e Consolidado  
> **Stack:** Python 3.12+ (FastAPI) • React 18+ (Vite + TypeScript) • PostgreSQL 16+ • Redis 7+

---

## 1. Arquitetura de Processos e Serviços Desacoplados

Para garantir que a API Web mantenha latência ultra-baixa e que as operações de rede não afetem a navegação dos usuários, o sistema opera dividido em **3 processos físicos independentes**:

```
[Container 1: infrawatch-api]
  └── FastAPI Web Server + SSE Engine + JWT Auth + CRUD Endpoints

[Container 2: infrawatch-probe-worker]
  └── Daemon Assíncrono: Timers em memória + Sondas (ICMP, HTTP, TCP) + Telemetria

[Container 3: infrawatch-integration-worker]
  └── Worker de Integração: GLPI REST API + Zabbix Sync + WhatsApp/Telegram/Email
```

---

## 2. Orquestração e Sincronização de Sondas sem Perda de Dados

### 2.1 Agendador em Memória de Alta Concorrência
- O `infrawatch-probe-worker` carrega os ativos ativos no boot e cria tarefas concorrentes gerenciadas pelo event loop do `asyncio`.
- Execução de milhares de pings ou requisições HTTP por minuto sem realizar consultas (`SELECT`) no banco de dados para cada disparo de sonda.

### 2.2 Sincronização via Transactional Outbox + Redis Streams
Para eliminar o problema de perda de mensagens voláteis do Pub/Sub puro:
1. Ao criar, editar ou pausar um dispositivo na API, o registro e o evento `outbox_events` são persistidos atomicamente no PostgreSQL.
2. O Outbox Worker despacha o evento para um **Redis Stream** (`stream:inventory:changes`).
3. O Probe Worker consome o stream como parte de um **Consumer Group** (`XREADGROUP`).
4. Somente após atualizar seu agendador em memória, o worker confirma o processamento (`XACK`).
5. Se o worker estiver offline ou reiniciar durante um cadastro, ele processa todos os eventos pendentes do stream assim que subir.

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

## 4. Conector Zabbix (Telemetria de Hardware)

Para ativos configurados com `zabbix_host_id`:
- O `infrawatch-integration-worker` realiza consultas periódicas (a cada 2 ou 5 minutos) à API JSON-RPC do Zabbix (`/api_jsonrpc.php`).
- Métodos utilizados:
  - `item.get`: Busca itens de telemetria (`system.cpu.util`, `vm.memory.util`, `vfs.fs.size[/,pused]`).
  - `history.get`: Consolida médias de consumo.
- Os dados são cacheados no Redis e salvos nas projeções de telemetria para exibição unificada no dashboard.

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

---

## 8. Arquitetura Orientada a Eventos (EDA) e Padrão Consumer
Eliminação completa de `BackgroundTasks` em todas as rotas e serviços da API:
- Toda operação assíncrona (envio de e-mails, disparo de WhatsApp/Telegram, abertura de chamados no GLPI) é modelada como emissão de eventos tipados (`Event`, `DomainEvent`, `Command`).
- A rota HTTP salva a entidade no banco, despacha o evento no `EventBus` e responde imediatamente com tempo de resposta constante.
- **Consumers Especializados** (`EmailConsumer`, `NotificationConsumer`, `GlpiConsumer`, etc.) processam os eventos de forma desacoplada, com retentativas automáticas e Dead-Letter Queue (DLQ) no Redis, eliminando problemas de encerramento de sessão de banco (`AsyncSession`) em background tasks.
