import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Tv,
  ArrowLeft,
  Maximize,
  Minimize,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Clock,
  Radio,
  Activity,
  Layers,
  AlertOctagon,
  Network,
} from "lucide-react";
import { useAutoRotate } from "../../hooks/useAutoRotate";
import {
  CriticalAlarmBanner,
  CriticalAlarmData,
} from "../../components/tv/CriticalAlarmBanner";
import { LiveIndicator } from "../../components/common/LiveIndicator";

export interface TvDeviceItem {
  id: string;
  hostname: string;
  category: string;
  protocol: string;
  ip: string;
  status: "UP" | "DOWN" | "DEGRADADO" | "MANUTENÇÃO";
  rtt: string;
  rttUnit: string;
  heroSub: string;
  metricLabel: string;
  metricBadge: string;
  bottomLeft: string;
  bottomRight: string;
}

export interface TvIncidentItem {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  device: string;
  ip: string;
  client: string;
  title: string;
  startedAgo: string;
  slaRemaining: string;
  glpiTicket: string;
  assignee: string;
  status: "INVESTIGANDO" | "EM ATENDIMENTO" | "MITIGANDO";
}

export interface TvBackboneLink {
  id: string;
  name: string;
  type: string;
  capacity: string;
  utilization: string;
  utilizationPercent: number;
  rtt: string;
  packetLoss: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

const TV_DEVICES: TvDeviceItem[] = [
  {
    id: "dev-1",
    hostname: "AUTH-KEYCLOAK-IAM",
    category: "Security",
    protocol: "OIDC / SAML",
    ip: "10.0.1.20",
    status: "UP",
    rtt: "14.2",
    rttUnit: "ms",
    heroSub: "14.8k Sessões",
    metricLabel: "TEMPO DE TOKEN OAUTH",
    metricBadge: "MFA Ativo",
    bottomLeft: "Ameaças: 0 | 100% Auth",
    bottomRight: "Realm: Banco-Sol",
  },
  {
    id: "dev-2",
    hostname: "BACKUP-MINIO-S3",
    category: "Disaster Recovery",
    protocol: "S3 API :9000",
    ip: "10.0.2.15",
    status: "UP",
    rtt: "3.2",
    rttUnit: "ms",
    heroSub: "WORM 30d",
    metricLabel: "LATÊNCIA S3 PUT/GET",
    metricBadge: "85 MB/s",
    bottomLeft: "Objetos: 4.8M",
    bottomRight: "Blast Radius Zero",
  },
  {
    id: "dev-3",
    hostname: "STORAGE-SAN-HUSKY",
    category: "Banco Sol",
    protocol: "Fiber Channel",
    ip: "10.0.3.50",
    status: "MANUTENÇÃO",
    rtt: "74",
    rttUnit: "%",
    heroSub: "ISENTO DE SLA",
    metricLabel: "UPGRADE FIRMWARE V5.2",
    metricBadge: "Aditivo #04",
    bottomLeft: "Janela: 01:00 → 04:00",
    bottomRight: "IO Drained Safe",
  },
  {
    id: "dev-4",
    hostname: "FIREWALL-PALOALTO-01",
    category: "Perimeter DMZ",
    protocol: "HA Active",
    ip: "10.200.1.1",
    status: "UP",
    rtt: "1.1",
    rttUnit: "ms",
    heroSub: "1.492 Bloqueios",
    metricLabel: "LATÊNCIA INSPEÇÃO L7",
    metricBadge: "CPU: 18%",
    bottomLeft: "Sessões: 84.1k",
    bottomRight: "Policies in Sync",
  },
  {
    id: "dev-5",
    hostname: "SW-CORE-LUANDA-01",
    category: "Unitel Backbone",
    protocol: "10.200.0.1",
    ip: "10.200.0.1",
    status: "DOWN",
    rtt: "100",
    rttUnit: "%",
    heroSub: "TIMEOUT TOTAL",
    metricLabel: "PERDA DE PACOTES",
    metricBadge: "RTT > 3.000ms",
    bottomLeft: "GLPI #8492 [Em Atendimento]",
    bottomRight: "SRE L3 Luanda",
  },
  {
    id: "dev-6",
    hostname: "API-GATEWAY-PROD",
    category: "Banco Sol",
    protocol: "10.100.4.12",
    ip: "10.100.4.12",
    status: "DEGRADADO",
    rtt: "342.8",
    rttUnit: "ms",
    heroSub: "▲ +180ms delta",
    metricLabel: "TEMPO DE RESPOSTA HTTP",
    metricBadge: "Limiar: 250ms",
    bottomLeft: "Pool: 12 Pods Ativos",
    bottomRight: "Auto-Throttle Ativo",
  },
  {
    id: "dev-7",
    hostname: "ROUTER-EDGE-BENGUELA",
    category: "Sonangol Logistics",
    protocol: "SD-WAN #04",
    ip: "10.150.8.1",
    status: "DEGRADADO",
    rtt: "188.4",
    rttUnit: "ms",
    heroSub: "▲ Meta: < 90ms",
    metricLabel: "LATÊNCIA ENLACE MPLS",
    metricBadge: "Perda: 2.1%",
    bottomLeft: "Circuito Secundário",
    bottomRight: "Rota Contingência",
  },
  {
    id: "dev-8",
    hostname: "DB-TIMESCALEDB-PRIMARY",
    category: "Core Telemetry",
    protocol: "10.0.1.5:5432",
    ip: "10.0.1.5",
    status: "UP",
    rtt: "1.4",
    rttUnit: "ms",
    heroSub: "▼ Zero Packet Drop",
    metricLabel: "LATÊNCIA TCP SYN/ACK",
    metricBadge: "Sync Lag: 0s",
    bottomLeft: "WAL Archiving: On",
    bottomRight: "90d Nominal",
  },
  {
    id: "dev-9",
    hostname: "K8S-INGRESS-01",
    category: "Unitel Borda",
    protocol: "10.50.2.1:443",
    ip: "10.50.2.1",
    status: "UP",
    rtt: "4.2",
    rttUnit: "ms",
    heroSub: "42.1k req/s",
    metricLabel: "LATÊNCIA MÉDIA DE BORDA",
    metricBadge: "Perda: 0.0%",
    bottomLeft: "Traefik v2.11 Proxy",
    bottomRight: "Baseline Normal",
  },
  {
    id: "dev-10",
    hostname: "CONTAINER-REDIS-LEADER",
    category: "Docker Core",
    protocol: "unix socket",
    ip: "127.0.0.1",
    status: "UP",
    rtt: "0.8",
    rttUnit: "ms",
    heroSub: "18.4k ops/s",
    metricLabel: "IPC SOCKET LATENCY",
    metricBadge: "Hit Rate: 99.4%",
    bottomLeft: "Uptime: 142 dias",
    bottomRight: "Socket Connected",
  },
  {
    id: "dev-11",
    hostname: "SW-ACCESS-TALATONA",
    category: "Sede Talatona",
    protocol: "10.220.12.1",
    ip: "10.220.12.1",
    status: "UP",
    rtt: "2.1",
    rttUnit: "ms",
    heroSub: "STP Root OK",
    metricLabel: "PING ICMP AGÊNCIA",
    metricBadge: "Portas: 48/48 UP",
    bottomLeft: "PoE Status: Nominal",
    bottomRight: "48 Enlaces",
  },
  {
    id: "dev-12",
    hostname: "DNS-RESOLVER-PUBLIC",
    category: "External IP",
    protocol: "Anycast #1",
    ip: "1.1.1.1",
    status: "UP",
    rtt: "8.5",
    rttUnit: "ms",
    heroSub: "DNSSEC OK",
    metricLabel: "RESOLUÇÃO UDP QUERY",
    metricBadge: "Sucesso: 99.99%",
    bottomLeft: "BIND9 Carrier Grade",
    bottomRight: "Zero Lag",
  },
];

const TV_INCIDENTS: TvIncidentItem[] = [
  {
    id: "inc-1",
    severity: "CRITICAL",
    device: "SW-CORE-LUANDA-01",
    ip: "10.200.0.1",
    client: "Unitel Corporate Backbone",
    title: "Queda Total de Conectividade ICMP • Enlace Fibra Óptica Rompido",
    startedAgo: "3m 42s",
    slaRemaining: "00:41:18",
    glpiTicket: "#8492",
    assignee: "Daniel Ndonda (SRE L3)",
    status: "EM ATENDIMENTO",
  },
  {
    id: "inc-2",
    severity: "HIGH",
    device: "API-GATEWAY-PROD",
    ip: "10.100.4.12",
    client: "Banco Sol Core Banking",
    title: "Degradação HTTP P95 > 340ms • Limiar de SLA de 250ms Ultrapassado",
    startedAgo: "14m 20s",
    slaRemaining: "01:45:40",
    glpiTicket: "#8495",
    assignee: "Equipe Core App",
    status: "MITIGANDO",
  },
  {
    id: "inc-3",
    severity: "HIGH",
    device: "ROUTER-EDGE-BENGUELA",
    ip: "10.150.8.1",
    client: "Sonangol Logistics",
    title: "Jitter Elevado e Flap em Enlace Primário SD-WAN • Tráfego em Rota de Contingência",
    startedAgo: "28m 05s",
    slaRemaining: "01:01:55",
    glpiTicket: "#8497",
    assignee: "Telecom Angola NOC",
    status: "INVESTIGANDO",
  },
];

const TV_BACKBONES: TvBackboneLink[] = [
  {
    id: "bb-1",
    name: "Luanda DC1 ↔ Talatona DC2",
    type: "Fibra Escura Dupla 100Gbps",
    capacity: "100 Gbps",
    utilization: "53.4 Gbps",
    utilizationPercent: 53.4,
    rtt: "2.1 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-2",
    name: "Angola Cables WACS Subsea",
    type: "Cabo Submarino Sangano ↔ Sesimbra",
    capacity: "40 Gbps",
    utilization: "24.1 Gbps",
    utilizationPercent: 60.2,
    rtt: "114.2 ms",
    packetLoss: "0.02%",
    status: "HEALTHY",
  },
  {
    id: "bb-3",
    name: "BNA Metro Ring Luanda",
    type: "Anel Metro DWDM 10Gbps",
    capacity: "10 Gbps",
    utilization: "2.3 Gbps",
    utilizationPercent: 23.0,
    rtt: "1.4 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-4",
    name: "Sonangol Logistics SD-WAN",
    type: "Enlace Micro-ondas Benguela",
    capacity: "5 Gbps",
    utilization: "4.2 Gbps",
    utilizationPercent: 84.0,
    rtt: "188.4 ms",
    packetLoss: "2.10%",
    status: "DEGRADED",
  },
  {
    id: "bb-5",
    name: "Unitel Peering IXP Luanda",
    type: "PNI Direto BGP Borda",
    capacity: "40 Gbps",
    utilization: "31.8 Gbps",
    utilizationPercent: 79.5,
    rtt: "0.9 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-6",
    name: "Luanda Core ↔ SW-CORE-01",
    type: "Enlace Trunk L3 10Gbps",
    capacity: "10 Gbps",
    utilization: "0.0 Gbps",
    utilizationPercent: 0,
    rtt: "> 3000 ms",
    packetLoss: "100.0%",
    status: "DOWN",
  },
];

export const TvWallboardPage: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTimeWat, setCurrentTimeWat] = useState<string>("");
  const [currentTimeUtc, setCurrentTimeUtc] = useState<string>("");
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(true);
  const [criticalAlarmDismissed, setCriticalAlarmDismissed] = useState<boolean>(false);

  // Alerta crítico ativo
  const criticalAlarm: CriticalAlarmData | null = useMemo(() => {
    if (criticalAlarmDismissed) return null;
    const downDevice = TV_DEVICES.find((d) => d.status === "DOWN");
    if (!downDevice) return null;
    return {
      id: downDevice.id,
      hostname: downDevice.hostname,
      ip: downDevice.ip,
      location: "Cluster LUANDA-01 • Unitel Backbone",
      downDuration: "Há 3m 42s",
      packetLoss: "100% TIMEOUT TOTAL",
      glpiTicketId: "#8492",
      impactedClients: "Unitel Corporate Backbone",
    };
  }, [criticalAlarmDismissed]);

  // Hook de Auto-Rotação (30s)
  const {
    currentPanel,
    progress,
    isAutoRotating,
    nextPanel,
    prevPanel,
    setPanel,
    toggleAutoRotate,
    resume,
  } = useAutoRotate({
    totalPanels: 3,
    intervalMs: 30000,
    autoStart: true,
    isPausedExternally: Boolean(criticalAlarm),
  });

  // Dual Clocks (WAT UTC+1 Luanda & UTC)
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTimeWat(
        now.toLocaleTimeString("pt-AO", {
          timeZone: "Africa/Luanda",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
      setCurrentTimeUtc(
        now.toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };

    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    return () => clearInterval(interval);
  }, []);

  // Monitoramento de Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const panelNames = [
    "Saúde dos Clientes & Ativos",
    "Incidentes Ativos & SLA GLPI",
    "Matriz de Latência & Enlaces",
  ];

  return (
    <div
      data-testid="tv-wallboard-page"
      className="flex flex-col h-screen w-screen bg-[#080c14] text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* ===================================================================== */}
      {/* 1. TOP HEADER NOC TV WALLBOARD (Canônico, Alto Contraste 16:9)        */}
      {/* ===================================================================== */}
      <header className="h-16 border-b border-[#1b2640] bg-[#080c14] px-4 md:px-6 flex items-center justify-between shrink-0 z-30">
        {/* Esquerda: Sair do Telão + Identificação Principal */}
        <div className="flex items-center gap-4">
          <Link
            to="/noc"
            data-testid="link-exit-tv"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e1524] hover:bg-[#131c30] border border-[#1b2640] text-slate-300 hover:text-white text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Voltar ao Cockpit Interativo NOC"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Sair do Telão</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Tv size={20} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm tracking-tight text-white font-mono">
                  INFRAWATCH NOC
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  WALLBOARD 16:9
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Central de Operações RCS Angola • Cluster LUANDA-01
              </span>
            </div>
          </div>
        </div>

        {/* Centro: Ticker Global de Ativos em Tempo Real */}
        <div className="hidden xl:flex items-center gap-3.5 px-4 py-1.5 bg-[#0e1524] rounded-lg border border-[#1b2640] text-xs font-mono tabular-nums shadow-inner">
          <span className="text-slate-400">
            TOTAL: <strong className="text-white">48</strong>
          </span>
          <span className="h-3 w-px bg-[#1b2640]" />
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> UP: 45
          </span>
          <span className="h-3 w-px bg-[#1b2640]" />
          <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> DEG: 2
          </span>
          <span className="h-3 w-px bg-[#1b2640]" />
          <span className="flex items-center gap-1.5 text-rose-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> DOWN: 1
          </span>
          <span className="h-3 w-px bg-[#1b2640]" />
          <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> MAINT: 0
          </span>
        </div>

        {/* Direita: Dual Clocks, Rotação e Controles */}
        <div className="flex items-center gap-3">
          {/* Dual Clock: WAT (Luanda) + UTC */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1 bg-[#0e1524] rounded-lg border border-[#1b2640] font-mono text-xs tabular-nums">
            <div className="flex items-center gap-1.5 text-slate-200">
              <Clock size={14} className="text-emerald-400" />
              <span>WAT</span>
              <strong className="text-white font-bold">{currentTimeWat || "--:--:--"}</strong>
            </div>
            <span className="h-3 w-px bg-[#1b2640]" />
            <div className="text-slate-400 text-[11px]">
              UTC: <span className="text-slate-200">{currentTimeUtc || "--:--:--"}</span>
            </div>
          </div>

          {/* SSE Live Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden md:inline">SSE LIVE</span>
          </div>

          {/* Botão Tela Cheia */}
          <button
            type="button"
            onClick={toggleFullscreen}
            data-testid="btn-toggle-fullscreen"
            aria-label={isFullscreen ? "Sair do modo tela cheia" : "Entrar em tela cheia"}
            className="p-2 rounded-lg bg-[#0e1524] hover:bg-[#131c30] border border-[#1b2640] text-slate-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* 2. BANNER DE ALARME CRÍTICO SEV-1 (INTERROMPE ROTAÇÃO SE ATIVO)       */}
      {/* ===================================================================== */}
      <CriticalAlarmBanner
        alarm={criticalAlarm}
        onAcknowledge={() => setCriticalAlarmDismissed(true)}
        onResumeRotation={() => {
          setCriticalAlarmDismissed(true);
          resume();
        }}
        isAudioMuted={isAudioMuted}
        onToggleMute={() => setIsAudioMuted(!isAudioMuted)}
      />

      {/* ===================================================================== */}
      {/* 3. BARRA DE CARROSSEL / AUTO-ROTAÇÃO (30s) COM PROGRESS BAR           */}
      {/* ===================================================================== */}
      <div
        data-testid="carousel-control-bar"
        className="h-11 bg-[#0b101d] border-b border-[#1b2640] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 relative overflow-hidden"
      >
        {/* Barra de Progresso Visual de Alta Resolução no Fundo */}
        <div
          data-testid="carousel-progress-bar"
          className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-emerald-400 transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />

        {/* Esquerda: Seletor de Painéis */}
        <div className="flex items-center gap-1.5 z-10">
          <span className="text-[11px] font-mono text-slate-400 mr-1 hidden sm:inline">
            PAINEL:
          </span>
          {panelNames.map((name, index) => (
            <button
              key={name}
              type="button"
              onClick={() => setPanel(index)}
              data-testid={`btn-panel-${index}`}
              className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition-colors flex items-center gap-1.5 ${
                currentPanel === index
                  ? "bg-emerald-500 text-obsidian-950 shadow-md font-extrabold"
                  : "bg-[#0e1524] text-slate-400 hover:text-white border border-[#1b2640]"
              }`}
            >
              <span>0{index + 1}</span>
              <span className="hidden md:inline font-sans font-medium text-[11px]">
                {name}
              </span>
            </button>
          ))}
        </div>

        {/* Direita: Controles de Pausa, Avanço e Tempo Restante */}
        <div className="flex items-center gap-2.5 z-10">
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-400">
            <span>Rotação:</span>
            <strong className="text-white">
              {criticalAlarm ? "Pausada (Alerta)" : isAutoRotating ? "30s" : "Pausada"}
            </strong>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevPanel}
              data-testid="btn-prev-panel"
              aria-label="Painel anterior"
              className="p-1 rounded bg-[#0e1524] hover:bg-[#131c30] border border-[#1b2640] text-slate-300 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={toggleAutoRotate}
              data-testid="btn-toggle-rotate"
              aria-label={isAutoRotating ? "Pausar rotação" : "Iniciar rotação"}
              className="p-1 px-2 rounded bg-[#0e1524] hover:bg-[#131c30] border border-[#1b2640] text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1 transition-colors"
            >
              {isAutoRotating ? <Pause size={14} /> : <Play size={14} />}
              <span className="hidden sm:inline">
                {isAutoRotating ? "Pausar" : "Girar"}
              </span>
            </button>

            <button
              type="button"
              onClick={nextPanel}
              data-testid="btn-next-panel"
              aria-label="Próximo painel"
              className="p-1 rounded bg-[#0e1524] hover:bg-[#131c30] border border-[#1b2640] text-slate-300 hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. CONTEÚDO PRINCIPAL: 3 PAINÉIS DE AUTO-ROTAÇÃO                     */}
      {/* ===================================================================== */}
      <main
        id="main-wallboard-content"
        className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col justify-between"
      >
        {/* =================================================================== */}
        {/* PAINEL 1: VISÃO GERAL E SAÚDE DOS CLIENTES CORPORATIVOS             */}
        {/* =================================================================== */}
        {currentPanel === 0 && (
          <section
            data-testid="tv-panel-overview"
            aria-label="Visão Geral e Saúde dos Clientes Corporativos"
            className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
          >
            {/* Topo: 3 Cards Métricos Superiores (Donut, Espectrograma e Throughput) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
              {/* Card 1: Trânsito & Backbones Gbps (Donut Hachurado) */}
              <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Radio size={16} className="text-purple-400" />
                    <span>Trânsito &amp; Backbones (Gbps)</span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
                    100.3 <span className="text-xs text-slate-400 font-normal">Gbps Total</span>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-0.5">
                    ● Luanda-Talatona 53% • WACS 24% • BNA 23%
                  </div>
                </div>

                <div className="w-16 h-16 shrink-0 relative">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke="#2a395e"
                      strokeWidth="3.5"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="3.5"
                      strokeDasharray="53, 100"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke="#ec4899"
                      strokeWidth="3.5"
                      strokeDasharray="24, 100"
                      strokeDashoffset="-53"
                    />
                  </svg>
                </div>
              </article>

              {/* Card 2: Espectro Óptico & RTT Jitter */}
              <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Activity size={16} className="text-pink-400" />
                    <span>Espectro Óptico &amp; RTT Jitter</span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1 tabular-nums">
                    61% <span className="text-xs text-slate-400 font-normal">Nominal (&lt; 18ms)</span>
                  </div>
                  <div className="text-[11px] font-mono text-rose-400 mt-0.5">
                    ▲ 28% Spikes &amp; Loss (&gt; 45ms) • 11% Jitter
                  </div>
                </div>

                <div className="w-24 h-10 flex items-center">
                  <svg viewBox="0 0 100 24" className="w-full h-full text-pink-400">
                    <path
                      d="M0,12 L15,12 L20,4 L25,20 L30,8 L35,16 L40,12 L55,12 L60,2 L65,22 L70,12 L100,12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </article>

              {/* Card 3: Throughput & Carga 24h */}
              <article className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-3.5 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Layers size={16} className="text-emerald-400" />
                    <span>Throughput &amp; Carga (24h)</span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-white mt-1 tabular-nums">
                    99.98% <span className="text-xs text-emerald-400 font-normal">SLA Diário</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    Pico: 1.2M req/s • Zero Buffer Bloat
                  </div>
                </div>

                <div className="flex items-end gap-1.5 h-10">
                  <span className="w-2 bg-[#2a395e] h-4 rounded-t" />
                  <span className="w-2 bg-emerald-500 h-7 rounded-t" />
                  <span className="w-2 bg-[#2a395e] h-5 rounded-t" />
                  <span className="w-2 bg-emerald-400 h-9 rounded-t" />
                  <span className="w-2 bg-emerald-500 h-10 rounded-t" />
                </div>
              </article>
            </div>

            {/* Grid 4x3 de 12 Dispositivos de Alta Legibilidade */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 overflow-hidden">
              {TV_DEVICES.map((dev) => {
                const isDown = dev.status === "DOWN";
                const isDeg = dev.status === "DEGRADADO";
                const isMaint = dev.status === "MANUTENÇÃO";

                const badgeBg = isDown
                  ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  : isDeg
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  : isMaint
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";

                const heroColor = isDown
                  ? "text-rose-400"
                  : isDeg
                  ? "text-amber-400"
                  : isMaint
                  ? "text-sky-400"
                  : "text-emerald-400";

                return (
                  <article
                    key={dev.id}
                    data-testid={`tv-device-card-${dev.hostname}`}
                    className={`bg-[#0e1524] rounded-xl p-3 border flex flex-col justify-between transition-colors shadow-sm ${
                      isDown
                        ? "border-rose-500/60 ring-1 ring-rose-500/30"
                        : "border-[#1b2640]"
                    }`}
                  >
                    {/* Top Row: Tags + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono truncate">
                        <span className="text-slate-300 font-semibold">{dev.category}</span>
                        <span>•</span>
                        <span className="truncate">{dev.protocol}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${badgeBg}`}
                      >
                        {dev.status}
                      </span>
                    </div>

                    {/* Hostname */}
                    <h3 className="text-sm font-bold font-mono text-white tracking-tight mt-1 truncate">
                      {dev.hostname}
                    </h3>

                    {/* Hero Metric */}
                    <div className="my-1.5 bg-[#080c14] rounded-lg p-2 border border-[#1b2640]/60">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span className="truncate">{dev.metricLabel}</span>
                        <span className={heroColor}>{dev.metricBadge}</span>
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className={`text-2xl font-extrabold font-mono tabular-nums ${heroColor}`}>
                          {dev.rtt}{" "}
                          <span className="text-xs font-normal text-slate-400">
                            {dev.rttUnit}
                          </span>
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {dev.heroSub}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-400 pt-1 border-t border-[#1b2640]/50">
                      <span className="truncate">{dev.bottomLeft}</span>
                      <span className={`shrink-0 ${heroColor}`}>{dev.bottomRight}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* PAINEL 2: INCIDENTES ATIVOS E CHAMADOS GLPI EM ANDAMENTO           */}
        {/* =================================================================== */}
        {currentPanel === 1 && (
          <section
            data-testid="tv-panel-incidents"
            aria-label="Incidentes Ativos e Chamados GLPI em Andamento"
            className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
          >
            {/* Cabeçalho do Painel com KPIs de SLA & Incidentes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
              <div className="bg-[#0e1524] border border-rose-500/40 rounded-xl p-4">
                <div className="text-xs font-mono text-rose-400 font-bold flex items-center gap-1.5">
                  <AlertOctagon size={16} /> INCIDENTES CRÍTICOS (SEV-1)
                </div>
                <div className="text-4xl font-extrabold font-mono text-rose-400 mt-2 tabular-nums">
                  1
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  100% de perda em SW-CORE-LUANDA-01
                </div>
              </div>

              <div className="bg-[#0e1524] border border-amber-500/40 rounded-xl p-4">
                <div className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5">
                  <Activity size={16} /> DEGRADAÇÃO &amp; LATÊNCIA (SEV-2)
                </div>
                <div className="text-4xl font-extrabold font-mono text-amber-400 mt-2 tabular-nums">
                  2
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  Banco Sol API &amp; Sonangol SD-WAN
                </div>
              </div>

              <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4">
                <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1.5">
                  <Clock size={16} className="text-emerald-400" /> MTTR MÉDIO DO DIA
                </div>
                <div className="text-4xl font-extrabold font-mono text-emerald-400 mt-2 tabular-nums">
                  18m
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  Meta SLA: &lt; 60 minutos
                </div>
              </div>

              <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4">
                <div className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1.5">
                  <ShieldAlert size={16} className="text-sky-400" /> SLA MENSAL CONTRATUAL
                </div>
                <div className="text-4xl font-extrabold font-mono text-white mt-2 tabular-nums">
                  99.88%
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  Disponibilidade Agregada BNA / RCS
                </div>
              </div>
            </div>

            {/* Lista Expandida de Incidentes e Tickets GLPI */}
            <div className="flex-1 bg-[#0e1524] border border-[#1b2640] rounded-xl p-4 overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-[#1b2640]">
                <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
                  <AlertOctagon size={18} className="text-rose-500" />
                  <span>FILA DE INCIDENTES DISPATCHADOS • GLPI RCS ANGOLA</span>
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  Total de chamados ativos: <strong className="text-white">3</strong>
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-3 py-3 overflow-hidden justify-around">
                {TV_INCIDENTS.map((inc) => (
                  <article
                    key={inc.id}
                    data-testid={`tv-incident-${inc.id}`}
                    className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      inc.severity === "CRITICAL"
                        ? "bg-rose-950/30 border-rose-500/50"
                        : "bg-[#080c14] border-[#1b2640]"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          inc.severity === "CRITICAL"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        }`}
                      >
                        <AlertOctagon size={20} />
                      </div>

                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold ${
                              inc.severity === "CRITICAL"
                                ? "bg-rose-500 text-white"
                                : "bg-amber-500 text-obsidian-950"
                            }`}
                          >
                            {inc.severity}
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            {inc.device}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            ({inc.ip})
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-xs font-medium text-emerald-400 font-mono">
                            {inc.client}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-slate-200 mt-1">
                          {inc.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 font-mono text-xs">
                      <div className="flex flex-col text-right">
                        <span className="text-[11px] text-slate-400">SLA RESTANTE</span>
                        <strong
                          className={`text-base font-bold tabular-nums ${
                            inc.severity === "CRITICAL" ? "text-rose-400" : "text-amber-400"
                          }`}
                        >
                          {inc.slaRemaining}
                        </strong>
                      </div>

                      <div className="flex flex-col text-right">
                        <span className="text-[11px] text-slate-400">CHAMADO GLPI</span>
                        <strong className="text-slate-200">{inc.glpiTicket}</strong>
                      </div>

                      <div className="flex flex-col text-right">
                        <span className="text-[11px] text-slate-400">RESPONSÁVEL</span>
                        <strong className="text-slate-300">{inc.assignee}</strong>
                      </div>

                      <span className="px-3 py-1 rounded bg-[#0e1524] border border-[#1b2640] text-emerald-400 text-xs font-bold">
                        {inc.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-[#1b2640] flex justify-between">
                <span>Roteamento autônomo BGP ativo em todos os ASNs</span>
                <span>Tempo médio de primeira resposta L1: 42 segundos</span>
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* PAINEL 3: MATRIZ DE LATÊNCIA E ENLACES DE FIBRA / RÁDIO             */}
        {/* =================================================================== */}
        {currentPanel === 2 && (
          <section
            data-testid="tv-panel-backbones"
            aria-label="Matriz de Latência e Enlaces de Fibra/Rádio"
            className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
          >
            {/* Topo do Painel de Enlaces */}
            <div className="bg-[#0e1524] border border-[#1b2640] rounded-xl p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Network size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold font-mono text-white">
                    MATRIZ METROPOLITANA &amp; INTERCONEXÕES TRANSCONTINENTAIS
                  </h2>
                  <p className="text-xs font-mono text-slate-400">
                    6 Enlaces Principais • DWDM, Submarino, SD-WAN e PNI Peering
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> 4 Nominais
                </span>
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> 1 Degradado
                </span>
                <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> 1 Fora do Ar
                </span>
              </div>
            </div>

            {/* Grid de Cards dos Enlaces de Rede */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden">
              {TV_BACKBONES.map((link) => {
                const isDown = link.status === "DOWN";
                const isDeg = link.status === "DEGRADED";

                const borderColor = isDown
                  ? "border-rose-500/60 ring-1 ring-rose-500/30"
                  : isDeg
                  ? "border-amber-500/60"
                  : "border-[#1b2640]";

                const statusColor = isDown
                  ? "text-rose-400"
                  : isDeg
                  ? "text-amber-400"
                  : "text-emerald-400";

                return (
                  <article
                    key={link.id}
                    data-testid={`tv-link-${link.id}`}
                    className={`bg-[#0e1524] rounded-xl p-4 border flex flex-col justify-between shadow-sm ${borderColor}`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">{link.type}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            isDown
                              ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                              : isDeg
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {link.status}
                        </span>
                      </div>

                      <h3 className="text-base font-bold font-mono text-white mt-1.5">
                        {link.name}
                      </h3>
                    </div>

                    {/* Métricas do Enlace */}
                    <div className="my-3 bg-[#080c14] rounded-lg p-3 border border-[#1b2640]/60">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-slate-400">LATÊNCIA RTT:</span>
                        <strong className={`text-base ${statusColor}`}>{link.rtt}</strong>
                      </div>

                      <div className="flex justify-between items-center text-xs font-mono mt-1">
                        <span className="text-slate-400">PACKET LOSS:</span>
                        <strong className={`text-sm ${statusColor}`}>
                          {link.packetLoss}
                        </strong>
                      </div>

                      {/* Barra de Utilização de Capacidade */}
                      <div className="mt-2.5">
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                          <span>Carga: {link.utilization}</span>
                          <span className="text-white font-bold">
                            {link.utilizationPercent}% de {link.capacity}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#1b2640] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isDown
                                ? "bg-rose-500"
                                : isDeg
                                ? "bg-amber-400"
                                : "bg-gradient-to-r from-emerald-500 to-sky-400"
                            }`}
                            style={{ width: `${link.utilizationPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-[10.5px] font-mono text-slate-400 flex justify-between">
                      <span>Probes ICMP + BGP Sync</span>
                      <span className={statusColor}>Carrier Grade</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ===================================================================== */}
      {/* 5. RODAPÉ FIXO DO TELÃO (Status de Engenharia e Cluster)              */}
      {/* ===================================================================== */}
      <footer className="h-9 bg-[#080c14] border-t border-[#1b2640] px-4 md:px-6 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <LiveIndicator />
          <span className="text-slate-300 font-semibold">INFRAWATCH NOC ENGINE v2.4</span>
          <span>•</span>
          <span>Cluster Primário Luanda DC1</span>
          <span>•</span>
          <span className="text-emerald-400">TimescaleDB Hypertable Sync OK</span>
        </div>

        <div className="flex items-center gap-3">
          <span>Rotação a cada 30 segundos</span>
          <span>•</span>
          <span className="text-slate-300 font-bold">Painel {currentPanel + 1} de 3</span>
        </div>
      </footer>
    </div>
  );
};
