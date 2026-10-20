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
  Clock,
} from "lucide-react";
import { useAutoRotate } from "../../hooks/useAutoRotate";
import {
  CriticalAlarmBanner,
  CriticalAlarmData,
} from "../../components/tv/CriticalAlarmBanner";
import { LiveIndicator } from "../../components/common/LiveIndicator";
import { TV_DEVICES } from "../../mocks/tvMocks";
import { TvOverviewPanel } from "../../components/tv/TvOverviewPanel";
import { TvIncidentsPanel } from "../../components/tv/TvIncidentsPanel";
import { TvBackbonesPanel } from "../../components/tv/TvBackbonesPanel";

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
      {/* 1. TOP HEADER NOC TV WALLBOARD (Canônico, Alto Contraste 16:9) */}
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

      {/* 2. BANNER DE ALARME CRÍTICO SEV-1 (INTERROMPE ROTAÇÃO SE ATIVO) */}
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

      {/* 3. BARRA DE CARROSSEL / AUTO-ROTAÇÃO (30s) COM PROGRESS BAR */}
      <div
        data-testid="carousel-control-bar"
        className="h-11 bg-[#0b101d] border-b border-[#1b2640] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 relative overflow-hidden"
      >
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

      {/* 4. CONTEÚDO PRINCIPAL: 3 PAINÉIS DE AUTO-ROTAÇÃO */}
      <main
        id="main-wallboard-content"
        className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col justify-between"
      >
        {currentPanel === 0 && <TvOverviewPanel />}
        {currentPanel === 1 && <TvIncidentsPanel />}
        {currentPanel === 2 && <TvBackbonesPanel />}
      </main>

      {/* 5. RODAPÉ FIXO DO TELÃO */}
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
