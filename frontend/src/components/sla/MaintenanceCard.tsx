import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  BellOff,
  Eye,
  RotateCcw,
  ShieldCheck,
  FileText,
} from "lucide-react";
import type { MaintenanceWindow } from "../../types/sla";
import { toast } from "sonner";

interface MaintenanceCardProps {
  maintenance: MaintenanceWindow;
  onApprove?: (id: string) => void;
  canApprove?: boolean;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  maintenance,
  onApprove,
  canApprove = false,
}) => {
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const startDate = new Date(maintenance.startTimeUtc);
  const endDate = new Date(maintenance.endTimeUtc);

  const dayStr = startDate.toLocaleDateString("pt-BR", { day: "2-digit" });
  const monthStr = startDate
    .toLocaleDateString("pt-BR", { month: "short" })
    .toUpperCase()
    .replace(".", "");
  const yearStr = startDate.getFullYear();

  const statusConfigs = {
    APPROVED: {
      textColor: "text-sky-400",
      borderColor: "border-sky-500/30",
      badgeBg: "bg-sky-500/10 text-sky-300 border-sky-500/30",
      edgeClass: "bg-sky-500",
      label: "PROGRAMADA",
      icon: <Calendar className="w-5 h-5 text-sky-400" />,
    },
    PENDING_APPROVAL: {
      textColor: "text-amber-400",
      borderColor: "border-amber-500/40",
      badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
      edgeClass: "bg-amber-400",
      label: "PENDENTE CAB",
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    },
    IN_PROGRESS: {
      textColor: "text-amber-400",
      borderColor: "border-amber-500/40",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      edgeClass: "bg-amber-400",
      label: "EM EXECUÇÃO",
      icon: <Clock className="w-5 h-5 text-amber-400" />,
    },
    COMPLETED: {
      textColor: "text-emerald-400",
      borderColor: "border-emerald-500/30",
      badgeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      edgeClass: "bg-emerald-500",
      label: "CONCLUÍDA",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    },
    CANCELLED: {
      textColor: "text-rose-400",
      borderColor: "border-rose-500/30",
      badgeBg: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      edgeClass: "bg-rose-500",
      label: "CANCELADA",
      icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
    },
  }[maintenance.status] || {
    textColor: "text-slate-400",
    borderColor: "border-obsidian-800",
    badgeBg: "bg-obsidian-850 text-slate-300 border-obsidian-700",
    edgeClass: "bg-slate-500",
    label: maintenance.status,
    icon: <Calendar className="w-5 h-5 text-slate-400" />,
  };

  const handleRollbackClick = () => {
    if (maintenance.rollbackPlan) {
      toast.info(`Plano de Rollback (${maintenance.rfcNumber}): ${maintenance.rollbackPlan}`);
    } else {
      toast.info("Plano de contingência e rollback já pré-aprovado pelo CAB.");
    }
  };

  const durationHours = Math.floor(maintenance.durationMinutes / 60);
  const durationMins = maintenance.durationMinutes % 60;
  const durationText = `${durationHours}h ${durationMins.toString().padStart(2, "0")}m`;

  const formatUtcDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  };

  const formatWatTime = (d: Date) => {
    const wat = new Date(d.getTime() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(wat.getUTCHours())}:${pad(wat.getUTCMinutes())} WAT`;
  };

  return (
    <article
      data-testid={`rfc-card-${maintenance.id}`}
      data-status={maintenance.status.toLowerCase()}
      className={`rfc-card p-5 rounded-xl bg-obsidian-900 border ${
        maintenance.status === "PENDING_APPROVAL"
          ? "border-amber-500/40 hover:border-amber-500/70"
          : "border-obsidian-800 hover:border-obsidian-700"
      } transition-colors flex flex-col gap-4 relative overflow-hidden group shadow-md w-full`}
    >
      {/* Barra de cor indicadora na lateral */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusConfigs.edgeClass}`} />

      {/* LINHA PRINCIPAL DO CARTÃO (Data + Detalhes + Ações) */}
      <div className="flex flex-col xl:flex-row gap-5 items-start xl:items-stretch w-full">
        {/* Bloco de Data (Esquerda) */}
        <div className="flex xl:flex-col items-center justify-center p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 min-w-[120px] shrink-0 text-center gap-1 self-stretch xl:self-auto">
          {statusConfigs.icon}
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg text-white leading-tight">
              {dayStr} {monthStr}
            </span>
            <span className={`font-mono tabular-nums text-xs font-semibold ${statusConfigs.textColor}`}>
              {yearStr}
            </span>
          </div>
          <span
            className={`font-mono text-[10px] font-semibold px-2 py-0.5 mt-1 rounded border ${statusConfigs.badgeBg}`}
          >
            {statusConfigs.label}
          </span>
        </div>

        {/* Detalhes Centrais da RFC */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 w-full">
          {/* Linha de cabeçalho da RFC: código, horários e cliente */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-800 pb-2">
            <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
              <span
                className={`font-bold px-2 py-0.5 rounded bg-obsidian-950 border ${statusConfigs.borderColor} ${statusConfigs.textColor}`}
              >
                {maintenance.rfcNumber}
              </span>
              <span className="text-obsidian-700">•</span>
              <span className="text-white flex items-center gap-1 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                {startDate.toISOString().substring(11, 16)} – {endDate.toISOString().substring(11, 16)} UTC
              </span>
              <span className="text-obsidian-700">•</span>
              <span className="text-slate-400">
                Duração: <strong className="text-white">{durationText}</strong>
              </span>
            </div>

            {/* Contratante */}
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{maintenance.clientName}</span>
              {maintenance.clientCategory && (
                <span className="px-1.5 py-0.2 rounded bg-obsidian-950 border border-obsidian-800 text-[10px] font-mono text-slate-400">
                  {maintenance.clientCategory}
                </span>
              )}
            </div>
          </div>

          {/* Ativos Alvo */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold">
              Ativo(s) Alvo:
            </span>
            {maintenance.targetDeviceNames && maintenance.targetDeviceNames.length > 0 ? (
              maintenance.targetDeviceNames.map((deviceName, idx) => {
                const deviceId = maintenance.targetDeviceIds[idx];
                return deviceId ? (
                  <Link
                    key={deviceName}
                    to={`/devices/${deviceId}`}
                    className="px-2 py-0.5 rounded bg-obsidian-950 hover:bg-obsidian-850 border border-obsidian-800 text-sky-400 hover:text-sky-300 font-mono text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span>{deviceName}</span>
                  </Link>
                ) : (
                  <span
                    key={deviceName}
                    className="px-2 py-0.5 rounded bg-obsidian-950 border border-obsidian-800 text-sky-400 font-mono text-xs font-semibold"
                  >
                    {deviceName}
                  </span>
                );
              })
            ) : (
              <span className="px-2 py-0.5 rounded bg-obsidian-950 border border-obsidian-800 text-slate-400 font-mono text-xs">
                Infraestrutura Global
              </span>
            )}
          </div>

          {/* Título & Descrição do Procedimento */}
          <div className="space-y-1">
            <h4 className="font-display font-bold text-sm text-white group-hover:text-sky-300 transition-colors">
              {maintenance.title}
            </h4>
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
              {maintenance.description || maintenance.title}
            </p>
          </div>

          {/* Faixa de Homologação de Isenção de SLA (ADR-009) */}
          <div
            className={`p-2.5 rounded-lg bg-obsidian-950 border ${
              maintenance.status === "PENDING_APPROVAL"
                ? "border-amber-500/30"
                : "border-emerald-500/30"
            } flex flex-wrap items-center justify-between gap-2`}
          >
            <div className="flex items-center gap-2">
              {maintenance.status === "PENDING_APPROVAL" ? (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold">
                    AGUARDANDO DEFERIMENTO FORMAL
                  </span>
                  <span className="text-xs text-amber-300 font-mono">
                    Impacto potencial de R$ 0 / penalidade retida
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-300 font-mono font-semibold">
                    Isenção de SLA Homologada
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    (Sem impacto contratual • ADR-009)
                  </span>
                </>
              )}
              <span className="text-obsidian-700 hidden sm:inline">•</span>
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                {maintenance.approvedBy
                  ? `Aprovador: ${maintenance.approvedBy}`
                  : maintenance.status === "APPROVED" || maintenance.slaExemption
                  ? "Homologado pelo NOC Lead"
                  : "Parecer técnico pendente do NOC Lead"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {maintenance.alarmSuppression && (
                <span className="font-mono text-xs text-emerald-400 flex items-center gap-1">
                  <BellOff className="w-3.5 h-3.5" />
                  Supressão de alarmes ativa
                </span>
              )}

              {canApprove && maintenance.status === "PENDING_APPROVAL" && (
                <button
                  type="button"
                  onClick={() => onApprove?.(maintenance.id)}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-colors shadow cursor-pointer"
                >
                  Homologar Isenção Agora
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Ações da RFC (Direita) */}
        <div className="flex xl:flex-col items-center justify-between xl:justify-center gap-2 border-t xl:border-t-0 xl:border-l border-obsidian-800 pt-3 xl:pt-0 xl:pl-4 min-w-[140px] shrink-0 self-stretch xl:self-auto">
          <button
            type="button"
            onClick={() => setIsDossierOpen(!isDossierOpen)}
            aria-expanded={isDossierOpen}
            className={`w-full h-9 px-3.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus:ring-2 focus:ring-sky-400 ${
              isDossierOpen
                ? "bg-sky-500 text-obsidian-950 border-sky-400 font-bold"
                : "bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 border-obsidian-700"
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>{isDossierOpen ? "Fechar Dossiê" : "Ver Dossiê"}</span>
          </button>

          <button
            type="button"
            onClick={handleRollbackClick}
            title={maintenance.rollbackPlan || "Plano de contingência e rollback pré-aprovado"}
            className="w-full h-9 px-3.5 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 text-slate-400 hover:text-slate-200 border border-obsidian-800 text-xs font-mono flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rollback Plan</span>
          </button>
        </div>
      </div>

      {/* DOSSIÊ TÉCNICO DETALHADO DA RFC (Renderizado abaixo do cartão, largura 100%!) */}
      {isDossierOpen && (
        <section
          data-testid={`rfc-dossier-${maintenance.id}`}
          className="w-full mt-2 pt-4 border-t border-obsidian-800 flex flex-col gap-4 font-mono text-xs"
        >
          {/* Header do Dossiê */}
          <div className="flex items-center justify-between bg-obsidian-950 px-4 py-2.5 rounded-lg border border-sky-500/30">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <span className="text-sky-400 font-bold text-xs uppercase tracking-wider">
                DOSSIÊ TÉCNICO OPERACIONAL — {maintenance.rfcNumber}
              </span>
            </div>
            <span className="text-slate-500 text-[11px] font-mono">
              UUID: {maintenance.id}
            </span>
          </div>

          {/* Grid de Metadados Auditados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                Janela Operacional
              </span>
              <span className="text-slate-200 font-medium text-xs">
                {formatUtcDate(startDate)}
              </span>
              <span className="text-slate-400 text-[11px]">
                {formatWatTime(startDate)} – {formatWatTime(endDate)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                Duração Homologada
              </span>
              <span className="text-sky-400 font-bold text-xs">
                {maintenance.durationMinutes} minutos ({durationText})
              </span>
              <span className="text-slate-500 text-[10px]">
                Teto Contratual: 8h máx/mês
              </span>
            </div>

            <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                Contratante Vinculada
              </span>
              <span className="text-white font-medium text-xs">
                {maintenance.clientName}
              </span>
              <span className="text-slate-500 text-[10px]">
                Categoria: {maintenance.clientCategory || "CORPORATIVO"}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 flex flex-col gap-1">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                Ativo(s) Afetado(s)
              </span>
              <span
                className="text-emerald-400 font-semibold text-xs truncate"
                title={maintenance.targetDeviceNames.join(", ") || "Global"}
              >
                {maintenance.targetDeviceNames.join(", ") || "Infraestrutura Global"}
              </span>
              <span className="text-slate-500 text-[10px]">
                Cluster: LUANDA-01
              </span>
            </div>
          </div>

          {/* Escopo e Procedimento Técnico */}
          <div className="p-3.5 rounded-lg bg-obsidian-950 border border-obsidian-800 flex flex-col gap-1.5">
            <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              Escopo &amp; Procedimento Técnico Homologado:
            </span>
            <p className="text-slate-300 leading-relaxed text-xs font-sans">
              {maintenance.description || maintenance.title}
            </p>
          </div>

          {/* Plano de Contingência / Rollback */}
          {maintenance.rollbackPlan && (
            <div className="p-3.5 rounded-lg bg-obsidian-950 border border-amber-500/20 flex flex-col gap-1.5">
              <span className="text-amber-400 font-semibold text-[11px] uppercase tracking-wider">
                Plano de Contingência / Rollback:
              </span>
              <p className="text-slate-300 leading-relaxed text-xs font-sans">
                {maintenance.rollbackPlan}
              </p>
            </div>
          )}

          {/* Rodapé de Governança BNA */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-obsidian-800 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Supressão automática de alarmes e telemetria ativada durante a janela</span>
            </span>
            <span className="text-slate-500">
              Isenção formal de SLA auditada conforme ADR-009 e normas do BNA
            </span>
          </div>
        </section>
      )}
    </article>
  );
};
