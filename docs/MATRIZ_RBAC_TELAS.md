# Matriz de Acessos e Permissões por Tela (RBAC) — InfraWatch

Este documento define formalmente a padronização de acessos, visualizações, comportamentos de interface (UI) e controles por tela para cada papel do sistema: **`CLIENT_VIEWER`**, **`ORG_ADMIN`**, **`NOC_OPERATOR`** e **`SUPER_ADMIN`**.

---

## 1. Legenda e Convenções da Matriz

| Símbolo | Significado | Comportamento de UI / UX |
| :---: | :--- | :--- |
| ✅ | **Acesso Total (Leitura & Escrita)** | Botões de ação, criação, edição e exclusão habilitados. |
| 👁️ | **Apenas Leitura (Read-Only)** | Tela visível; botões de modificação ficam ocultos ou com estado `disabled`. |
| 🔒 | **Isolamento de Tenant** | Usuário restrito aos registros da sua organização (`organization_id`). |
| 🎭 | **Sanitizado / Mascarado** | IPs de gerência interna, portas sensíveis e nós restritos aparecem como `***.***.***.***`. |
| 🌐 | **Cross-Tenant Global** | Permite visualizar/operar sobre todos os clientes corporativos da RCS Angola. |
| 🚫 | **Acesso Bloqueado** | Rota interceptada pelo `ProtectedRoute` (HTTP 403 / redirect); item oculto no menu lateral (`Sidebar`). |

---

## 2. Matriz Detalhada por Módulo, Tela e Ações de Interface

| Nª | Módulo / Rota | Funcionalidade / Componente de Tela | `CLIENT_VIEWER` | `ORG_ADMIN` | `NOC_OPERATOR` | `SUPER_ADMIN` |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| 1 | **Portal do Cliente**<br>`/portal` | Acompanhar saúde de enlaces e links contratados | 👁️ 🔒 🎭 | 👁️ 🔒 *(sem máscara)* | 👁️ *(suporte a clientes)* | ✅ *(visão global)* |
| | Visualizar métricas (latência, perda, jitter) | 👁️ 🔒 | 👁️ 🔒 | 👁️ 🌐 | ✅ 🌐 |
| 2 | **NOC Dashboard**<br>`/noc` | Stream de telemetria em tempo real (SSE) | 🚫 | 🚫 | ✅ 🌐 | ✅ 🌐 |
| | Matriz de alarmes e contadores de severidade | 🚫 | 🚫 | ✅ 🌐 | ✅ 🌐 |
| 3 | **Topologia**<br>`/topology` | Mapa interativo de rede física e lógica | 🚫 | 🚫 | ✅ 🌐 | ✅ 🌐 |
| | Inspecionar nós e IPs de gerência interna | 🚫 | 🚫 | ✅ 🌐 | ✅ 🌐 |
| 4 | **Dispositivos**<br>`/devices` e `/devices/:id` | Visualizar lista e detalhes de equipamentos | 🚫 | 👁️ 🔒 *(seus ativos)* | 👁️ 🌐 *(rede global)* | 👁️ 🌐 *(rede global)* |
| | Botão `+ Novo Dispositivo` / Editar equipamento | 🚫 | ✅ 🔒 *(seus ativos)* | ✅ 🌐 *(qualquer ativo)* | ✅ 🌐 *(qualquer ativo)* |
| 5 | **Incidentes**<br>`/incidents` | Visualizar lista de incidentes e alarmes | 👁️ 🔒 *(no portal)* | 👁️ 🔒 *(seus ativos)* | 👁️ 🌐 *(todos)* | 👁️ 🌐 *(todos)* |
| | Botões `Reconhecer (Ack)`, Mitigar e Resolver | 🚫 | 🚫 | ✅ 🌐 *(operador)* | ✅ 🌐 *(total)* |
| 6 | **Manutenções**<br>`/maintenance` | Visualizar calendário e janelas de manutenção | 👁️ 🔒 *(no portal)* | 👁️ 🔒 *(seus ativos)* | 👁️ 🌐 *(todas)* | 👁️ 🌐 *(todas)* |
| | Botão `Agendar Manutenção` (Solicitar janela) | 🚫 | ✅ 🔒 *(para seus ativos)* | ✅ 🌐 *(rede global)* | ✅ 🌐 *(rede global)* |
| | Botões `Aprovar`, `Iniciar` e `Concluir` manutenção | 🚫 | 🚫 | ✅ 🌐 *(aprova/executa)* | ✅ 🌐 *(aprova/executa)* |
| 7 | **Relatórios SLA**<br>`/sla` | Visualizar metas e cumprimento de disponibilidade | 👁️ 🔒 *(sua empresa)* | 👁️ 🔒 *(sua empresa)* | 👁️ 🌐 *(qualquer cliente)* | 👁️ 🌐 *(qualquer cliente)* |
| | Botões `Exportar Relatório (PDF / CSV)` | ✅ 🔒 *(sanitizado)* | ✅ 🔒 *(técnico)* | ✅ 🌐 *(global)* | ✅ 🌐 *(global)* |
| 8 | **Gestão de Acessos**<br>`/admin/management` | Tab `Usuários`: Listar usuários | 🚫 | 👁️ 🔒 *(da sua empresa)* | 👁️ 🌐 *(todos)* | 👁️ 🌐 *(todos)* |
| | Botão `+ Convidar / Criar Usuário` | 🚫 | ✅ 🔒 *(apenas para sua Org)* | 🚫 | ✅ 🌐 *(qualquer Org)* |
| | Dropdown `Alterar Papel (Role)` do usuário | 🚫 | 🚫 *(desabilitado)* | 🚫 *(desabilitado)* | ✅ *(exclusivo)* |
| | Botão `Ativar / Desativar Usuário` | 🚫 | ✅ 🔒 *(da sua empresa)* | 🚫 | ✅ 🌐 *(global)* |
| | Tab `Organizações`: Criar nova empresa cliente | 🚫 | 🚫 | 🚫 *(apenas leitura)* | ✅ *(botão ativo)* |
| 9 | **Auditoria**<br>`/audit` | Visualizar logs de auditoria e segurança | 🚫 | 👁️ 🔒 *(eventos da sua Org)* | 🚫 | 👁️ 🌐 *(global de todo o sistema)* |
| 10 | **Backup & DR**<br>`/dr` | Painel de snapshots e status de replicação | 🚫 | 🚫 | 🚫 | 👁️ *(exclusivo)* |
| | Botão `Disparar Backup Manual Imediato` | 🚫 | 🚫 | 🚫 | ✅ *(exclusivo)* |
| 11 | **Segurança & MFA**<br>`/security` | Forçar MFA global e gerenciar políticas de token | 🚫 | 🚫 | 🚫 | ✅ *(exclusivo)* |

---

## 3. Comportamento da Barra Lateral (`Sidebar.tsx`) e Redirecionamentos

| Papel | Itens Visíveis na Sidebar | Destino Padrão Pós-Login |
| :--- | :--- | :---: |
| **`CLIENT_VIEWER`** | • Portal do Cliente (`/portal`)<br>• Relatórios SLA (`/sla`) | `/portal` |
| **`ORG_ADMIN`** | • Portal do Cliente (`/portal`)<br>• Dispositivos (`/devices`)<br>• Incidentes (`/incidents`)<br>• Manutenção (`/maintenance`)<br>• Relatórios SLA (`/sla`)<br>• Trilha de Auditoria (`/audit`)<br>• Gestão de Acessos (`/admin/management`) | `/portal` ou `/devices` |
| **`NOC_OPERATOR`** | • NOC Dashboard (`/noc`)<br>• Dispositivos (`/devices`)<br>• Incidentes (`/incidents`)<br>• Topologia (`/topology`)<br>• Manutenção (`/maintenance`)<br>• Relatórios SLA (`/sla`) | `/noc` |
| **`SUPER_ADMIN`** | • **Todos os módulos habilitados:** NOC, Dispositivos, Incidentes, Topologia, Manutenção, SLA, Auditoria, Administração, Backup & DR, Segurança e Portal do Cliente. | `/noc` |

---

## 4. Diretrizes Técnicas para Componentes de Frontend

1. **Campos Editáveis de RBAC:**
   * O `<select>` de alteração de papel (`role`) em `/admin/management` só deve ser renderizado para usuários com `user.role === 'SUPER_ADMIN'`. Para outros perfis, deve ser apresentado como badge ou texto fixo.
2. **Ações Operacionais de Incidentes:**
   * Botões de transição de estado (`Reconhecer`, `Mitigar`, `Resolver`) em `/incidents` só devem ser interativos para `NOC_OPERATOR` e `SUPER_ADMIN`.
3. **Máscara de Endereços IP e Portas:**
   * Em qualquer componente que exiba dados de interface e enlaces (inclusive gráficos e tabelas de SLA), quando `user.role === 'CLIENT_VIEWER'`, aplicar o mascaramento sanitizado (`***.***.***.***`).
4. **Proteção em Camadas:**
   * A restrição visual deve sempre espelhar o `ProtectedRoute` do cliente e as dependências `require_roles` do backend FastAPI (`HTTP 403 Forbidden` caso haja tentativa de bypass).
