import React, { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Calendar, X, AlertCircle } from "lucide-react";
import type { CreateMaintenanceInput, MaintenanceWindow } from "../../types/sla";
import {
  createMaintenanceSchema,
  type CreateMaintenanceFormData,
} from "../../schemas/slaSchema";

interface DeviceOption {
  id: string;
  name: string;
  ipAddress?: string;
  category?: string;
}

interface OrganizationOption {
  id: string;
  name: string;
}

interface CreateMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMaintenanceInput) => void;
  isSubmitting?: boolean;
  organizations?: OrganizationOption[];
  devices?: DeviceOption[];
  existingMaintenances?: MaintenanceWindow[];
}

const getDefaultTimes = () => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalIso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    startTime: toLocalIso(start),
    endTime: toLocalIso(end),
  };
};

export const CreateMaintenanceModal: React.FC<CreateMaintenanceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  organizations = [],
  devices = [],
  existingMaintenances = [],
}) => {
  const initialTimes = useMemo(() => getDefaultTimes(), []);
  const defaultDevice = devices[0]?.name || "SW-CORE-LUANDA-01";
  const defaultClient = organizations[0]?.name || "Unitel Angola (Backbone Core)";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateMaintenanceFormData>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: {
      title: "",
      description: "",
      targetDeviceInput: defaultDevice,
      clientName: defaultClient,
      startTime: initialTimes.startTime,
      endTime: initialTimes.endTime,
      alarmSuppression: true,
      slaExemption: true,
      rollbackPlan: "",
    },
    mode: "onChange",
  });

  const targetDeviceInput = watch("targetDeviceInput", defaultDevice);

  const conflictingMaintenance = useMemo(() => {
    if (!targetDeviceInput || existingMaintenances.length === 0) return null;
    const inputUpper = targetDeviceInput.toUpperCase().trim();
    return existingMaintenances.find((m) => {
      if (m.status === "CANCELLED" || m.status === "COMPLETED") return false;
      return (
        m.targetDeviceNames.some(
          (d) => d.toUpperCase().includes(inputUpper) || inputUpper.includes(d.toUpperCase())
        ) ||
        m.targetDeviceIds.some((id) => id.toLowerCase() === targetDeviceInput.toLowerCase().trim())
      );
    });
  }, [targetDeviceInput, existingMaintenances]);

  const isCoreAsset = useMemo(() => {
    const upper = (targetDeviceInput || "").toUpperCase();
    return (
      upper.includes("SW-CORE") ||
      upper.includes("10.0.1.1") ||
      upper.includes("CORE") ||
      upper.includes("BACKBONE")
    );
  }, [targetDeviceInput]);

  const hasConflict = Boolean(conflictingMaintenance || isCoreAsset);

  if (!isOpen) return null;

  const onFormSubmit = (data: CreateMaintenanceFormData) => {
    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);

    const deviceValues = data.targetDeviceInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    // Mapeia nomes informados para UUIDs reais caso existam no inventário
    const resolvedDeviceIds = deviceValues.map((val) => {
      const match = devices.find(
        (d) => d.name.toLowerCase() === val.toLowerCase() || d.id === val
      );
      return match ? match.id : val;
    });

    const matchedOrg = organizations.find(
      (org) => org.name.toLowerCase() === data.clientName.trim().toLowerCase()
    );

    onSubmit({
      title: data.title,
      description: data.description,
      targetDeviceIds: resolvedDeviceIds,
      clientName: data.clientName,
      organizationId: matchedOrg ? matchedOrg.id : undefined,
      startTimeUtc: startDate.toISOString(),
      endTimeUtc: endDate.toISOString(),
      alarmSuppression: data.alarmSuppression,
      slaExemption: data.slaExemption,
      rollbackPlan: data.rollbackPlan,
    });
  };

  const topErrorMessage =
    errors.title?.message ||
    errors.description?.message ||
    errors.targetDeviceInput?.message ||
    errors.startTime?.message ||
    errors.endTime?.message;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-obsidian-900 border border-sky-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id="schedule-modal-title" className="font-display font-bold text-base text-white">
                Agendar Nova Parada Técnica
              </h2>
              <p className="text-xs text-slate-400">
                Criar RFC com supressão de alarmes e homologação de isenção de SLA (ADR-009)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-obsidian-850 transition-colors"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner de erro de validação geral */}
        {topErrorMessage && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{topErrorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-3.5 pt-2">
          {/* Título da RFC */}
          <div className="space-y-1">
            <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
              Título da Intervenção *
            </label>
            <input
              type="text"
              {...register("title")}
              placeholder="Atualização crítica de firmware em Core Switch..."
              aria-invalid={!!errors.title}
              className={`w-full bg-obsidian-950 border ${
                errors.title ? "border-rose-500" : "border-obsidian-800"
              } rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:border-sky-500 focus:outline-none transition-colors`}
            />
            {errors.title && (
              <span className="text-[11px] text-rose-400 block">{errors.title.message}</span>
            )}
          </div>

          {/* Cliente e Ativo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
                Contratante / Escopo *
              </label>
              <select
                {...register("clientName")}
                aria-invalid={!!errors.clientName}
                className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none transition-colors"
              >
                {organizations.length > 0 ? (
                  organizations.map((org) => (
                    <option key={org.id} value={org.name}>
                      {org.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Unitel Angola (Backbone Core)">Unitel Angola (Backbone Core)</option>
                    <option value="Banco Sol (Internet Banking)">Banco Sol (Internet Banking)</option>
                    <option value="Sonangol E.P. (Terminal Luanda)">Sonangol E.P. (Terminal Luanda)</option>
                  </>
                )}
              </select>
              {errors.clientName && (
                <span className="text-[11px] text-rose-400 block">{errors.clientName.message}</span>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
                Ativo(s) Alvo *
              </label>
              <input
                type="text"
                {...register("targetDeviceInput")}
                placeholder="Ex: SW-CORE-LUANDA-01, ROUTER-02"
                aria-invalid={!!errors.targetDeviceInput}
                className={`w-full bg-obsidian-950 border ${
                  errors.targetDeviceInput ? "border-rose-500" : "border-obsidian-800"
                } rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:border-sky-500 focus:outline-none transition-colors`}
              />
              {errors.targetDeviceInput && (
                <span className="text-[11px] text-rose-400 block">{errors.targetDeviceInput.message}</span>
              )}
            </div>
          </div>

          {/* Aviso de Conflito em Tempo Real */}
          {hasConflict && (
            <div
              data-testid="conflict-warning"
              className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {conflictingMaintenance
                  ? `Aviso de Conflito: O ativo digitado já possui janela agendada (${conflictingMaintenance.rfcNumber})!`
                  : `Aviso de Conflito: O ativo digitado (${targetDeviceInput}) é um elemento crítico de Backbone Core.`}
              </span>
            </div>
          )}

          {/* Datas Início e Fim */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
                Início da Janela (WAT / UTC) *
              </label>
              <input
                type="datetime-local"
                {...register("startTime")}
                aria-invalid={!!errors.startTime}
                className={`w-full bg-obsidian-950 border ${
                  errors.startTime ? "border-rose-500" : "border-obsidian-800"
                } rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none transition-colors`}
              />
              {errors.startTime && (
                <span className="text-[11px] text-rose-400 block">{errors.startTime.message}</span>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
                Término Estimado (WAT / UTC) *
              </label>
              <input
                type="datetime-local"
                {...register("endTime")}
                aria-invalid={!!errors.endTime}
                className={`w-full bg-obsidian-950 border ${
                  errors.endTime ? "border-rose-500" : "border-obsidian-800"
                } rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none transition-colors`}
              />
              {errors.endTime && (
                <span className="text-[11px] text-rose-400 block">{errors.endTime.message}</span>
              )}
            </div>
          </div>

          {/* Descrição e Procedimento */}
          <div className="space-y-1">
            <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
              Escopo e Procedimento Técnico *
            </label>
            <textarea
              rows={3}
              {...register("description")}
              placeholder="Descreva o escopo da parada e impacto previsto na topologia..."
              aria-invalid={!!errors.description}
              className={`w-full bg-obsidian-950 border ${
                errors.description ? "border-rose-500" : "border-obsidian-800"
              } rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:border-sky-500 focus:outline-none transition-colors resize-vertical`}
            />
            {errors.description && (
              <span className="text-[11px] text-rose-400 block">{errors.description.message}</span>
            )}
          </div>

          {/* Plano de Rollback */}
          <div className="space-y-1">
            <label className="block text-[11px] font-mono text-slate-400 uppercase font-semibold">
              Plano de Rollback / Contingência
            </label>
            <input
              type="text"
              {...register("rollbackPlan")}
              placeholder="Ex: Rollback de firmware para versão anterior em até 15 minutos"
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-mono focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Opções de Governança e Supressão */}
          <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                {...register("alarmSuppression")}
                className="rounded border-obsidian-700 bg-obsidian-900 text-sky-500 focus:ring-sky-500"
              />
              <span>Ativar supressão automática de telemetria e alarmes durante a janela</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                {...register("slaExemption")}
                className="rounded border-obsidian-700 bg-obsidian-900 text-sky-500 focus:ring-sky-500"
              />
              <span>Requerer homologação formal de Isenção de SLA (ADR-009 / BNA)</span>
            </label>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-obsidian-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-obsidian-950 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 shadow-md"
            >
              {isSubmitting ? "Submetendo..." : "Submeter Parada Programada"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
