# InfraWatch — Brief de Design UI & UX (UI_UX_BRIEF)

> **Documento:** 04-UI_UX_BRIEF.md  
> **Status:** Aprovado para Frontend  
> **Estilo:** *Mission-Control Dark / Observability Studio*  
> **Fontes:** Plus Jakarta Sans (Interface) & JetBrains Mono (Métricas/IPs)

---

## 1. Filosofia Visual e Direção Estética

O **InfraWatch** adota uma identidade visual de alto padrão inspirada nas melhores centrais de comando de operações modernas (como Datadog, Grafana Labs e interfaces de telecomunicações de ponta). O objetivo é combinar:
- **Sobriedade e Conforto Visual:** Um fundo escuro profundo (*obsidian slate*) projetado para operadores que passam 8 a 12 horas diárias na frente da tela sem fadiga ocular.
- **Destaque Cromático Instantâneo:** Cores funcionais vivas e contrastantes (verde esmeralda, vermelho carmesim elétrico e âmbar) para que qualquer anomalia seja detectada à distância pelo olho humano em menos de 1 segundo.
- **Sensação de Tempo Real:** A interface pulsa e respira vida. Elementos de conexão SSE mantêm um indicador de streaming contínuo (*Live Heartbeat*), e micro-gráficos de latência atualizam-se suavemente sem saltos bruscos.

---

## 2. Paleta de Cores e Tokens de Design

### 2.1 Superfícies e Estrutura (Dark Mode Primário)
```css
:root {
  /* Superfícies e Fundos */
  --bg-canvas: #090d16;          /* Fundo principal ultra-profundo */
  --bg-surface: #0f172a;         /* Fundo dos cartões e painéis */
  --bg-surface-hover: #1e293b;   /* Hover em cartões e linhas de tabela */
  --bg-surface-elevated: #1e293b;/* Modais e popovers */
  
  /* Bordas e Divisores */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-highlight: rgba(255, 255, 255, 0.16);
  --border-active: #3b82f6;

  /* Tipografia */
  --text-primary: #f8fafc;       /* Títulos e valores críticos */
  --text-secondary: #94a3b8;     /* Labels e descrições */
  --text-muted: #64748b;         /* Metadados e timestamps */
  --text-accent: #60a5fa;        /* Links e seleções ativas */
}
```

### 2.2 Cores de Status Operacional (Alto Contraste)
```css
:root {
  /* UP / Operacional */
  --status-up: #10b981;
  --status-up-bg: rgba(16, 185, 129, 0.12);
  --status-up-glow: 0 0 16px rgba(16, 185, 129, 0.4);

  /* DEGRADED / Atenção */
  --status-degraded: #f59e0b;
  --status-degraded-bg: rgba(245, 158, 11, 0.12);
  --status-degraded-glow: 0 0 16px rgba(245, 158, 11, 0.4);

  /* DOWN / Crítico */
  --status-down: #ef4444;
  --status-down-bg: rgba(239, 68, 68, 0.15);
  --status-down-glow: 0 0 20px rgba(239, 68, 68, 0.6);

  /* MAINTENANCE / Manutenção Programada */
  --status-maint: #3b82f6;
  --status-maint-bg: rgba(59, 130, 246, 0.12);

  /* PAUSED / Inativo */
  --status-paused: #6b7280;
  --status-paused-bg: rgba(107, 114, 128, 0.12);
}
```

---

## 3. Tipografia e Escala

- **Família da Interface:** `'Plus Jakarta Sans', -apple-system, sans-serif` — Proporciona legibilidade técnica contemporânea, elegância em números e clareza corporativa.
- **Família Técnica / Telemetria:** `'JetBrains Mono', 'Fira Code', monospace` — Utilizada exclusivamente para:
  - Endereços IP e hostnames (`192.168.1.100`, `api.rcsangola.co.ao`)
  - Tempos de resposta e latência (`14.2 ms`)
  - Portas e códigos de status HTTP (`200 OK`, `Port 5432`)
  - Identificadores de incidentes (`#INC-2026-081`)

---

## 4. Estrutura das Telas Principais

### 4.1 Header Global & Status Ticker
```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [● InfraWatch]  [Pesquisar ativos, IPs, incidentes (Ctrl+K)]     SLA Global: 99.82%  ● LIVE SSE  [👤 Daniel]│
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Live Indicator:** Um badge com um ponto verde brilhante piscante em ritmo suave ("breathe animation"), confirmando a saúde da conexão SSE com o backend.
- **Status Ticker Executivo:** Mostra o resumo numérico em tempo real: `Total: 48 | UP: 46 | Degraded: 1 | DOWN: 1`.
- **Modo NOC (TV View):** Botão para expandir a visualização em tela cheia com tipografia ampliada para monitores de parede.

### 4.2 Grade Operacional de Dispositivos (Cards Inteligentes)
Cada dispositivo é exibido em um cartão inteligente com:
1. **Cabeçalho do Card:**
   - Ícone do tipo (Servidor, Roteador, Webhook, BD).
   - Nome do Ativo (`ERP-PROD-01`) e Grupo (`Sede Luanda`).
   - Pílula de status dinâmica com brilho suave.
2. **Corpo de Telemetria:**
   - Endereço IP / Host em tipografia mono.
   - Última latência registrada: `12 ms` com indicador de tendência (▲ ou ▼).
   - Intervalo de verificação (`a cada 30s`).
3. **Barra de Uptime (Histórico de 90 dias):**
   - Mini-barras verticais verdes, amarelas e vermelhas representando a integridade dia a dia (estilo Uptime Kuma / GitHub commits).
   - Tooltip dinâmico ao passar o mouse com percentual exato do dia e incidentes ocorridos.
4. **Sparkline de Latência:**
   - Gráfico de onda suavizado dos últimos 60 pings, destacando picos e variações.

### 4.3 Painel Lateral de Atendimento de Incidentes (Drawer / Slide-over)
- Ao clicar em um dispositivo em estado crítico (`DOWN`):
  - Abre uma gaveta lateral sem perder a visão geral do dashboard.
  - Exibe a linha do tempo do incidente:
    - `16:42:01` — Sonda HTTP retornou status 503 Service Unavailable.
    - `16:42:31` — Segunda falha confirmada.
    - `16:43:01` — Terceira falha. Incidente promovido para `CRITICAL`.
    - `16:43:02` — Chamado no GLPI aberto automaticamente: badge **`[Ticket #8492 no GLPI ↗]`** com link direto para o chamado.
    - `16:43:03` — Notificação disparada para o grupo de plantão Telegram e WhatsApp.
  - Ação proeminente: Botão `[ Reconhecer Incidente (Acknowledge) ]` com campo de justificativa imediato.

### 4.4 Portal do Cliente (Visão CLIENT_VIEWER)
- Interface limpa e amigável projetada para os clientes corporativos da RCS Angola (ex: gestores do Banco Sol).
- **Dados Sanitizados:** Não exibe IPs de rede privada (`10.x.x.x`) nem portas confidenciais de banco.
- Exibe o nome do serviço amigável (*"Portal Internet Banking"*, *"Serviço de Quiosques Self-Service"*), status operacional e medidor circular de **SLA Mensal Acumulado** (ex: `99.85% vs Meta de 99.50%`).
- Exibe botão para exportar relatório executivo mensal em PDF.

### 4.5 Modal de Agendamento de Manutenção Programada
- Modal rápido acionado com 1 clique pelo operador (`Agendar Parada Técnica`).
- Campos: Ativo, Data/Hora de Início, Data/Hora de Término, Motivo da Parada (*"Atualização de kernel do SO"*).
- Badge informativo: *"Esta parada será isenta do cálculo de SLA contratual e os alertas serão suspensos durante a janela."*

---

## 5. Micro-Interações e Comportamento Operacional

1. **Animação de Alerta Crítico:**
   - Quando um ativo cai, a borda do card e o badge de status recebem animação contínua de pulso luminoso vermelho (`animation: pulse-glow 1.5s infinite`).
2. **Animação de Degradação (Atenção):**
   - Quando a latência ultrapassa o teto, o card ganha contorno âmbar suave e o sparkline destaca picos em amarelo.
3. **Transição de Status sem "Flicker":**
   - Atualizações via SSE alteram as propriedades no DOM de forma cirúrgica, sem remontar o componente ou causar saltos visuais na página.
4. **Atalhos de Teclado Operacionais:**
   - `Ctrl + K` / `Cmd + K`: Abre barra de busca global instantânea.
   - `Esc`: Fecha modais e drawers.
   - `F`: Alterna modo tela cheia (NOC TV Mode).
