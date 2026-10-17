# InfraWatch — Fluxos da Aplicação e Ciclos de Vida (APP FLOW)

> **Documento:** 03-APP_FLOW.md  
> **Status:** Aprovado e Consolidado  
> **Objetivo:** Mapear o ciclo de vida ponta a ponta dos eventos, jornadas dos usuários e processos assíncronos.

---

## 1. Visão Geral dos Fluxos Integrados

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / NOC
    participant API as FastAPI Web
    participant DB as PostgreSQL (Outbox)
    participant Streams as Redis Streams
    participant ProbeWorker as Probe Worker Daemon
    participant IngestWorker as Integration Worker
    participant GLPI as GLPI API
    participant SSE as SSE Stream (Frontend)

    Note over Operador, API: 1. Cadastro de Ativo
    Operador->>API: POST /devices (IP, Porta, Intervalo)
    API->>DB: Salva Device + OutboxEvent (Atomicamente)
    API-->>Operador: 201 Created
    
    Note over DB, ProbeWorker: 2. Sincronização Confiável Reativa
    DB-->>DB: Trigger notify_outbox_events() (pg_notify)
    DB->>Streams: Outbox Relay acorda em <5ms e despacha evento
    Streams->>ProbeWorker: XREADGROUP (DeviceCreated)
    ProbeWorker->>ProbeWorker: Cria job em memória
    ProbeWorker->>Streams: XACK

    Note over ProbeWorker, DB: 3. Execução de Sondas (ICMP, HTTP, TCP, Docker Proxy)
    loop A cada X segundos (em memória)
        ProbeWorker->>ProbeWorker: Dispara Sonda (ICMP, HTTP, TCP ou DockerProber)
        ProbeWorker->>DB: Persiste Métrica (latency_ms, timestamptz)
        ProbeWorker->>SSE: Emite probe_result
    end

    Note over ProbeWorker, GLPI: 4. Detecção de Queda e Chamado GLPI
    ProbeWorker->>ProbeWorker: 3 Falhas Consecutivas Detectadas
    ProbeWorker->>DB: Atualiza Status='DOWN' + Cria Incidente
    ProbeWorker->>Streams: Emite incident.triggered
    Streams->>IngestWorker: Consome incident.triggered
    IngestWorker->>GLPI: POST /Ticket (Abertura de Chamado)
    GLPI-->>IngestWorker: Retorna glpi_ticket_id (#8492)
    IngestWorker->>DB: Vincula glpi_ticket_id no Incidente
    IngestWorker->>SSE: Emite incident_created com link do GLPI

    Note over Operador, GLPI: 5. Atendimento (Acknowledge)
    Operador->>API: POST /incidents/id/acknowledge
    API->>DB: Status='ACKNOWLEDGED'
    API->>IngestWorker: Notifica Acknowledge
    IngestWorker->>GLPI: Adiciona Acompanhamento no Chamado
    API->>SSE: Emite incident_acked

    Note over ProbeWorker, GLPI: 6. Recuperação e Fechamento
    ProbeWorker->>ProbeWorker: 2 Sucessos Consecutivos (UP)
    ProbeWorker->>DB: Incidente='RESOLVED', Status='UP'
    ProbeWorker->>IngestWorker: Notifica Recuperação
    IngestWorker->>GLPI: Adiciona Solução com Downtime e Fecha Ticket
    IngestWorker->>SSE: Emite incident_resolved
```

---

## 2. Detalhamento das Fases

### Fase 1: Cadastro e Onboarding do Ativo
- Operador envia requisição para a API.
- Entidade `Device` é validada e gravada no PostgreSQL juntamente com o evento `DeviceCreated` na tabela `outbox_events` (mesma transação ACID).
- O Outbox Worker grava a mensagem no Redis Stream `stream:inventory:changes`.
- O `infrawatch-probe-worker` lê a mensagem via `XREADGROUP`, instancia a tarefa assíncrona em memória e confirma com `XACK`.

### Fase 2: Execução de Sondas e Streaming
- O Probe Worker executa pings e requests HTTP em loop local de timers.
- A cada coleta, grava na tabela particionada `metrics` e despacha o evento via SSE para atualizar os micrográficos dos dashboards conectados.

### Fase 3: Detecção de Incidente e Abertura no GLPI
- Ao atingir o limiar de 3 falhas consecutivas, o ativo transiciona para `DOWN`.
- O incidente é criado no banco de dados e notificado ao `infrawatch-integration-worker`.
- O Integration Worker autentica na API REST do GLPI e abre o chamado com título, descrição do ativo e criticidade alta.
- O `glpi_ticket_id` é registrado no incidente e transmitido via SSE para a tela do NOC.
- Simultaneamente, são disparados alertas via WhatsApp/SMS (número virtual), Telegram Bot e Webhook (Slack/Discord).

### Fase 4: Operação de NOC (Acknowledge)
- O operador clica em **Reconhecer** no dashboard.
- A interface sincroniza via SSE para todos os operadores saberem que o caso está em atendimento.
- Uma nota é inserida no ticket do GLPI informando que a equipe assumiu a investigação.

### Fase 5: Normalização e Fechamento
- Quando o serviço volta a responder por 2 sondas consecutivas, o status volta para `UP`.
- O incidente é marcado como `RESOLVED`, registrando o tempo exato de downtime.
- O chamado no GLPI é atualizado com a solução técnica e o tempo de indisponibilidade registrado no SLA mensal do cliente.

---

## 3. Fluxos Operacionais Específicos

### 3.1 Fluxo de Detecção de Degradação (Latência Alta)
1. O Probe Worker mede o RTT e detecta que a latência superou `latency_threshold_warning_ms` (ex: > 250ms por 3 checagens).
2. O dispositivo transiciona para o status `DEGRADED`.
3. Um alerta de severidade `WARNING` é gerado e despachado via SSE.
4. **Não abre chamado crítico no GLPI**, mas notifica os canais configurados para receber alertas de nível `WARNING`.
5. Se a latência normalizar por 2 checagens, o status retorna para `UP`.

### 3.2 Fluxo de Janela de Manutenção Programada e SLA
1. Operador agenda uma janela em `/devices/{id}/maintenance` definindo `start_time`, `end_time` e motivo.
2. Durante a janela:
   - O dispositivo exibe status `MAINTENANCE` (Azul elétrico).
   - O envio de alertas para clientes é suspenso.
   - O motor de cálculo de SLA **isenta e desconta** esse período do cálculo de disponibilidade (não penaliza a meta de 99.5%).

### 3.3 Fluxo de Acesso do Cliente Final (CLIENT_VIEWER)
1. O usuário do cliente (ex: Banco Sol) faz login em `/login`.
2. A API identifica o papel `CLIENT_VIEWER` e filtra automaticamente todas as consultas pelo seu `organization_id`.
3. Na visualização:
   - O cliente visualiza apenas os seus próprios servidores e quiosques.
   - Detalhes confidenciais de rede (IPs locais `10.x.x.x`, portas de banco) são sanitizados/ocultos.
   - O cliente acompanha o percentual de SLA acumulado do mês e a saúde geral de seus serviços corporativos.

### 3.4 Fluxo de Ingestão Zabbix Push Webhook & Bootstrapper Idempotente
1. **Startup da API:** Durante a inicialização do lifespan (`src.core.web.lifespan`), a classe `ZabbixWebhookBootstrapper` conecta-se ao servidor Zabbix via JSON-RPC.
2. **Auto-Provisionamento:** Verifica e provisiona idempotentemente o MediaType de Webhook, a User Media e a Action de envio de alertas apontando para `/api/v1/integrations/zabbix/webhook`.
3. **Disparo do Alarme no Zabbix:** Quando um trigger do Zabbix identifica uma anomalia em hardware (ex: CPU > 95%), o Zabbix emite imediatamente um POST HTTP para o endpoint da API com payload estruturado e token secreto.
4. **Ingestão com Latência Zero:** A API autentica a requisição, processa o alarme, correlaciona com o `zabbix_host_id` do dispositivo e publica o evento no barramento Redis Streams para notificação imediata do NOC via SSE.

### 3.5 Fluxo Operacional de Backup Manual e Feedback em Tempo Real (SSE)
1. **Acionamento pelo Operador:** O usuário administrador clica em `[ Gerar Backup Manual ]` no painel de configurações.
2. **Disparo Não-Bloqueante:** O frontend despacha `POST /api/v1/system/backup`. A API valida permissões RBAC, publica o comando assíncrono no Redis e retorna `202 Accepted` em <10ms.
3. **Execução Isolada no Worker (`infrawatch-backup`):** O contêiner de backup inicia o pipeline sem sobrecarregar a API Web e emite eventos de telemetria a cada marco completado.
4. **Streaming Visual de Progresso:** O canal SSE transmite as etapas em tempo real para o modal do frontend:
   - *Iniciando rotina*
   - *Exportando TimescaleDB e Hypertables*
   - *Snapshot do Redis*
   - *Criptografando credenciais*
   - *Enviando para o Google Drive*
   - *Enviando para o Cloudflare R2*
   - *Concluído com Sucesso*
5. **Persistência e Histórico:** O modal é concluído com sucesso e o novo registro é inserido na tabela de histórico com data, tamanho, hash SHA-256 e status de cada destino.
