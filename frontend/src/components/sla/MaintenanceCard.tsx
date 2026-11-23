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

  return (
    <article
      data-testid={`rfc-card-${maintenance.id}`}
      data-status={maintenance.status.toLowerCase()}
      className={`rfc-card p-5 rounded-xl bg-obsidian-900 border ${
        maintenance.status === "PENDING_APPROVAL"
          ? "border-amber-500/40 hover:border-amber-500/70"
          : "border-obsidian-800 hover:border-obsidian-700"
      } transition-colors flex flex-col xl:flex-row gap-5 relative overflow-hidden group shadow-md`}
    >
      {/* Barra de cor indicadora na lateral */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusConfigs.edgeClass}`} />

      {/* Bloco de Data (Esquerda) */}
      <div className="flex xl:flex-col items-center justify-center p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 min-w-[120px] shrink-0 text-center gap-1">
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
      <div className="flex-1 flex flex-col gap-3 min-w-0">
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

          {/* Badge do Cliente */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-obsidian-950 text-slate-300 font-mono text-xs border border-obsidian-800">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{maintenance.clientName}</span>
          </div>
        </div>

        {/* Ativos Alvo */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Ativos Alvo:</span>
          {maintenance.targetDeviceNames.map((name, index) => {
            const devId = maintenance.targetDeviceIds[index];
            const isValidDeviceUuid = Boolean(devId && /^[0-9a-fA-F-]{36}$/.test(devId));
            return (
              <span
                key={name}
                className="px-2 py-0.5 rounded bg-obsidian-950 border border-obsidian-800 text-white flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {isValidDeviceUuid ? (
                  <Link
                    to={`/devices/${devId}`}
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {name}
                  </Link>
                ) : (
                  <span>{name}</span>
                )}
              </span>
            );
          })}
        </div>

        {/* Título e Escopo */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{maintenance.title}</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{maintenance.description}</p>
        </div>

        {/* Status de Homologação e Isenção de SLA */}
        <div
          className={`p-2.5 rounded-lg bg-obsidian-950 border ${
            maintenance.slaExemption ? "border-emerald-500/30" : "border-amber-500/30"
          } flex flex-wrap items-center justify-between gap-2`}
        >
          <div className="flex items-center flex-wrap gap-2">
            {maintenance.slaExemption ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-xs font-semibold border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Isenção de SLA Homologada
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-bold border border-amber-500/40">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Aguardando Deferimento Formal
              </span>
            )}

            <span className="text-xs text-slate-400 font-mono">
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
      <div className="flex xl:flex-col items-center justify-between xl:justify-center gap-2 border-t xl:border-t-0 xl:border-l border-obsidian-800 pt-3 xl:pt-0 xl:pl-4 min-w-[140px] shrink-0">
        <button
          type="button"
          onClick={() => setIsDossierOpen(!isDossierOpen)}
          aria-expanded={isDossierOpen}
          className="w-full h-9 px-3.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 border border-obsidian-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus:ring-2 focus:ring-sky-400"
        >
          <Eye className="w-4 h-4 text-sky-400" />
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

      {/* Dossiê Técnico Detalhado da RFC */}
      {isDossierOpen && (
        <section
          data-testid={`rfc-dossier-${maintenance.id}`}
          className="w-full mt-3 p-4 rounded-xl bg-obsidian-950 border border-sky-500/30 flex flex-col gap-3 font-mono text-xs shadow-inner"
        >
          <div className="flex items-center justify-between border-b border-obsidian-800 pb-2">
            <span className="text-sky-400 font-bold">
              DOSSIÊ TÉCNICO OPERACIONAL — {maintenance.rfcNumber}
            </span>
            <span className="text-slate-500 text-[11px]">ID: {maintenance.id}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-slate-300">
            <div>
              <span className="text-slate-500 block text-[11px]">Janela UTC:</span>
              <span className="text-white">{maintenance.startTimeUtc} até {maintenance.endTimeUtc}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Duração Homologada:</span>
              <span className="text-white">{maintenance.durationMinutes} minutos</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Contratante:</span>
              <span className="text-white">
                {maintenance.clientName} ({maintenance.clientCategory || "CORPORATIVO"})
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Ativo(s) Afetado(s):</span>
              <span className="text-white">{maintenance.targetDeviceNames.join(", ") || "Global"}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-obsidian-900">
            <span className="text-slate-500 block text-[11px] mb-1">Escopo e Procedimento:</span>
            <p className="text-slate-300 leading-relaxed">{maintenance.description || maintenance.title}</p>
          </div>

          {maintenance.rollbackPlan && (
            <div className="pt-2 border-t border-obsidian-900">
              <span className="text-amber-400 block text-[11px] mb-1">Plano de Contingência / Rollback:</span>
              <p className="text-slate-300 leading-relaxed">{maintenance.rollbackPlan}</p>
            </div>
          )}
        </section>
      )}
    </article>
  );
};
