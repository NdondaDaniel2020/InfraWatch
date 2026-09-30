# InfraWatch — Documento de Requisitos do Produto (PRD)

> **Documento:** 01-PRD.md  
> **Status:** Aprovado e Consolidado  
> **Organização:** RCS Angola / Exija Serviços  
> **Produto:** InfraWatch (Enterprise Observability & SLA Platform)

---

## 1. Visão do Produto e Objetivos Estratégicos

### 1.1 Declaração de Visão
O **InfraWatch** é uma plataforma centralizada de observabilidade e monitoramento de infraestruturas tecnológicas corporativas, voltada para operações de missão crítica e prestação de serviços gerenciados (MSP). O sistema atende tanto a equipe interna de NOC da RCS Angola quanto os **clientes finais contratantes**, garantindo transparência operacional, controle rigoroso de SLA (*Service Level Agreement*), rastreabilidade de incidentes e abertura automática de chamados de suporte no **GLPI**.

### 1.2 Princípios de Isolamento e Segurança (Multi-Tenancy)
- **100% Autenticado e Privado:** Não existem páginas públicas abertas na internet. Todo acesso requer credenciais válidas.
- **Isolamento Estrito por Cliente:** Cada cliente corporativo (`Organization`) possui usuários com perfil `CLIENT_VIEWER`. Um cliente **nunca** enxerga ativos, métricas ou incidentes de outros clientes da RCS Angola.
- **Sanitização de Dados Técnicos:** Na visão do cliente final, endereços IP internos de roteamento, portas confidenciais de banco de dados e credenciais são mascarados. O cliente visualiza a saúde funcional do serviço (ex: *"Portal ERP: Operacional — SLA: 99.8%"*).
- **Visão Centralizada de NOC (RCS Global):** Administradores e operadores da RCS possuem visão unificada de todos os clientes em uma única tela de comando operacional (NOC TV).

---

## 2. Personas do Sistema

| Persona | Papel | Acesso e Permissões |
| :--- | :--- | :--- |
| **Administrador Master (RCS)** | Gestão da plataforma e contratos | Acesso total a todas as organizações, configurações do sistema, canais de notificação e conectores Zabbix/GLPI. |
| **Operador de NOC (RCS)** | Monitoramento 24/7 e suporte | Monitora todos os clientes no NOC TV, reconhece incidentes (*Ack*), interage com chamados do GLPI e gerencia janelas de manutenção. |
| **Gestor / Cliente Final** | Acompanhamento do contrato | Visualiza **apenas** os ativos e relatórios de SLA da sua própria empresa (`CLIENT_VIEWER`), sem acesso a dados técnicos sensíveis. |

---

## 3. Requisitos Funcionais Detalhados

### 3.1 Gestão de Clientes e Inventário (RF01 / RF08)
- **RF-INV-01 (Organizações Multi-Tenant):** Cadastro de clientes/empresas com definição de meta padrão de SLA contratual (ex: 99.5%).
- **RF-INV-02 (Cadastro de Ativos):** Cadastro de dispositivos com nome, tipo (Servidor, Roteador, Aplicação, Banco, Quiosque), protocolo, host/IP, porta e intervalo.
- **RF-INV-03 (Busca Full-Text):** Busca textual ultrarrápida via PostgreSQL (`tsvector`) por nome, IP, descrição e tags.
- **RF-INV-04 (Janela de Manutenção):** Possibilidade de agendar parada técnica em um ativo, suspendendo alertas durante o período.

### 3.2 Motor Híbrido de Monitoramento e Telemetria (RF01 / RF02 / RF03)
- **RF-MON-01 (Sondas Rápidas de Uptime - Worker Dedicado):**
  - **ICMP Ping:** Latência (ms) e perda de pacotes (%).
  - **HTTP / HTTPS:** Validação de status code (2xx, 3xx), tempo de resposta e expiração de certificado SSL.
  - **TCP Port:** Teste de disponibilidade de portas de banco e serviços (5432, 3306, 8080, 22).
  - **Heartbeat Passivo:** URL de recepção de sinal para monitorar cronjobs e rotinas batch.
- **RF-MON-02 (Conector Zabbix - Telemetria Avançada):**
  - Sincronização periódica com a API do Zabbix (`zabbix_host_id`) para ingestão de métricas aprofundadas de hardware (uso de CPU %, memória RAM %, utilização de disco e tráfego de interface).
- **RF-MON-03 (Tolerância a Flapping e Falsos Positivos):**
  - Confirmação de queda apenas após $N$ falhas consecutivas (padrão: 3).
- **RF-MON-04 (Detecção de Degradação de Performance):**
  - Identificação de latência anormal (`latency_threshold_warning_ms`, ex: > 250ms ou HTTP > 3s por 3 checagens), disparando alerta de severidade `WARNING` (`DEGRADED`).
- **RF-MON-05 (Exportador OpenMetrics / Prometheus para Grafana):**
  - Exposição de métricas no padrão Prometheus (`/api/v1/monitoring/metrics`) para permitir auditoria histórica de longo prazo no Grafana sem sobrecarregar o banco relacional.

### 3.3 Gestão de Incidentes e Integração ITSM com GLPI (RF05 / RF06 / RF09)
- **RF-INC-01 (Ciclo de Vida do Incidente):**
  - `TRIGGERED` (Disparado e pendente).
  - `ACKNOWLEDGED` (Operador assume o chamado e suspende notificações repetitivas).
  - `RESOLVED` (Normalizado via sonda ou resolvido manualmente).
- **RF-INC-02 (Integração Bidirecional Inteligente com GLPI):**
  - **Abertura Automática:** Ao confirmar incidente crítico, o sistema chama a REST API do GLPI e abre o chamado com prioridade e categoria configuradas, salvando o `glpi_ticket_id` no InfraWatch.
  - **Acompanhamento no NOC:** O operador vê o link direto do chamado do GLPI no painel do InfraWatch.
  - **Atualização no Acknowledge:** Registra no chamado que o operador assumiu o incidente.
  - **Fechamento Inteligente:** Quando a sonda detecta retorno do serviço, calcula o tempo total de downtime e atualiza o ticket no GLPI com a solução técnica.
  - **Abertura Manual em 1 Clique:** Botão para o operador forçar abertura de chamado no GLPI caso necessário.

### 3.4 Notificações Multi-Canal (RF05)
- **RF-NOT-01 (Canais Integrados):**
  - **E-mail (SMTP):** Relatórios de incidentes e resumos executivos.
  - **Telegram Bot:** Alertas imediatos para canais ou grupos técnicos.
  - **Webhooks (Slack, Discord, Teams):** Notificações integradas a canais de comunicação da empresa.
  - **WhatsApp / SMS (Número Virtual):** Integração com APIs de mensageria (Evolution API, Z-API ou Twilio) para alerta direto no celular dos gestores de plantão.
- **RF-NOT-02 (Regras de Supressão):** Não notificar ativos em manutenção programada e agrupar mensagens em caso de oscilações repetitivas (*anti-flapping*).
- **RF-NOT-03 (Horários de Plantão e Inscrição Granular):**
  - Configuração de horário ativo por canal (ex: 08:00 às 18:00) com permissão para ignorar horário em quedas críticas (`allow_critical_outside_hours`).
  - Filtro por severidade (`CRITICAL`, `WARNING`).

### 3.5 Controle de SLA e Relatórios Executivos (RF06 / RF07)
- **RF-SLA-01 (Cálculo de Uptime e Isenção de Manutenção):**
  - O tempo em que o dispositivo estiver em **Manutenção Programada** é excluído do cálculo de downtime de SLA (não penaliza a meta contratual de 99.5%).
  - Apenas paradas não planejadas reduzem o percentual de disponibilidade.
- **RF-SLA-02 (Exportação de Relatórios):** Geração de relatórios executivos em PDF e CSV com dados consolidados por cliente para reuniões de diretoria.

### 3.6 Trilha de Auditoria e Governança (RF08)
- **RF-SEC-03 (Audit Trail Imutável):** Registro em banco de todas as ações de usuários (criação/exclusão de ativos, entrada em manutenção, Acknowledge de incidentes e alteração de parâmetros de SLA) para fins de compliance e prestação de contas aos clientes.
