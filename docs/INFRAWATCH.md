# InfraWatch
**Software Design Document**

*RCS Angola*  
*Exija Serviços — Clientes são parceiros de valor acrescentado*

---

## 1. Introdução

### Objetivo do Documento
Este documento descreve o design da solução **InfraWatch**, uma plataforma de monitoramento de infraestruturas corporativas orientada ao utilizador final. O sistema visa centralizar a observação de múltiplos serviços e sistemas (redes, servidores, aplicações, endpoints, etc.), fornecendo visibilidade em tempo real sobre o estado dos mesmos, tempos de inatividade (*downtime*), disponibilidade, alertas e outras métricas operacionais críticas.

### Escopo
O **InfraWatch** oferecerá:
* Conexão com múltiplas fontes e sistemas (via API, SNMP, ping, webhook, etc.);
* Identificação automática de status (up/down);
* Armazenamento histórico e visualização de métricas;
* Dashboards intuitivos, focados no utilizador final;
* Alertas configuráveis por e-mail, notificação ou mensagem;
* Mecanismo de SLA tracking (percentual de uptime por serviço ou sistema).

---

## 2. Visão Geral do Sistema

O sistema será composto por:
* **Um frontend responsivo**, com dashboards amigáveis, orientados à operação;
* **Um motor de monitoramento**, que coleta dados em tempo real;
* **Um sistema de notificações**, que alerta proativamente sobre falhas ou anomalias;
* **Um banco de dados temporal**, que armazena logs e registros históricos para análise posterior.

---

## 3. Requisitos Funcionais

| Código | Requisito |
| :--- | :--- |
| **RF01** | Conectar-se a diferentes sistemas via API, SNMP, ping ou webhook |
| **RF02** | Detectar automaticamente mudanças de estado (up/down) |
| **RF03** | Registrar logs e métricas associadas a cada sistema monitorado |
| **RF04** | Apresentar as informações em dashboards personalizáveis |
| **RF05** | Enviar notificações automáticas por e-mail, SMS ou push |
| **RF06** | Permitir configuração de níveis de criticidade e regras de SLA |
| **RF07** | Armazenar métricas para análise histórica |
| **RF08** | Permitir múltiplos perfis de utilizador com permissões específicas |
| **RF09** | Integrar com ferramentas de gestão existentes (GLPI, DocuWare, etc.) |

---

## 4. Requisitos Não-Funcionais

| Código | Requisito |
| :--- | :--- |
| **RNF01** | Interface intuitiva, moderna e multilíngue |
| **RNF02** | Tempo de verificação personalizável por sistema (ex: a cada 60s) |
| **RNF03** | Alta disponibilidade e tolerância a falhas |
| **RNF04** | Escalável horizontalmente |
| **RNF05** | Compatível com dispositivos móveis |
| **RNF06** | Mecanismos de autenticação e logs de auditoria |

---

## 5. Componentes do Sistema

### 5.1 Frontend (React ou Angular)
* Dashboard principal com visão global do estado das infraestruturas
* Indicadores em tempo real (status, uptime, alertas)
* Página de relatórios e SLA
* Gestão de perfis e permissões

### 5.2 Backend (Node.js, Laravel ou Python)
* Módulo de coleta e monitoramento (pooling, webhook, ping, etc.)
* Motor de regras e alertas
* Registro e tratamento de logs
* API de integração

### 5.3 Banco de Dados
* **Banco relacional:** (configuração, usuários, permissões)
* **Banco de séries temporais:** (ex: InfluxDB, TimescaleDB) para métricas

### 5.4 Sistema de Notificações
* Integração com e-mail, WhatsApp, Telegram, Slack, etc.
* Regras de escalonamento por tipo de incidente

---

## 6. Exemplos de Uso

### Exemplo 1:
Servidor `"ERP-PROD"` está em status *down* há 3 minutos. O sistema exibe alerta visual em vermelho no dashboard e envia e-mail ao responsável da infraestrutura.

### Exemplo 2:
Usuário visualiza SLA acumulado do serviço `"Kiosks Self-Service"` e observa 99.3% de uptime no mês corrente, com 3 falhas registradas.

---

## 7. Considerações Finais

A solução **InfraWatch** proporcionará visibilidade em tempo real do estado da infraestrutura tecnológica da organização, antecipando falhas e otimizando o tempo de reação da equipe técnica. A centralização da informação e o foco no utilizador final garantem acessibilidade, eficiência e agilidade nos processos operacionais.
