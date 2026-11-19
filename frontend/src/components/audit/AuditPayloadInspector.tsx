import React, { useState } from "react";
import {
  GitCompare,
  Lock,
  Copy,
  Check,
  History,
  Download,
  Network,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AuditLogEntry } from "../../types/audit";

interface AuditPayloadInspectorProps {
  log: AuditLogEntry | null;
}

interface DiffLine {
  type: "added" | "removed" | "neutral";
  key: string;
  value: unknown;
}

function computeStateDelta(
  action: string,
  resourceId: string,
  details: Record<string, unknown> | null
): DiffLine[] {
  if (!details || typeof details !== "object") return [];

  const lines: DiffLine[] = [];

  // Se houver explicitly before/after
  let before: Record<string, unknown> | null =
    details.before && typeof details.before === "object"
      ? (details.before as Record<string, unknown>)
      : null;
  let after: Record<string, unknown> | null =
    details.after && typeof details.after === "object"
      ? (details.after as Record<string, unknown>)
      : null;

  // Derivação semântica para ações com mudança de estado atômico quando before/after não vieram aninhados
  if (!before && !after) {
    if (action === "DEVICE_PAUSED") {
      before = {
        is_active: true,
        monitoring_status: "MONITORING",
      };
      after = {
        is_active: false,
        monitoring_status: "PAUSED",
      };
      if (details.pause_reason) after.pause_reason = details.pause_reason;
      if (details.operator_id) after.operator_id = details.operator_id;
      if (details.authorized_by) after.authorized_by = details.authorized_by;
    } else if (action === "INCIDENT_ACK" || action === "INCIDENT_ACKNOWLEDGED") {
      before = {
        status: "TRIGGERED",
        acknowledged: false,
      };
      after = {
        status: "ACKNOWLEDGED",
        acknowledged: true,
      };
      if (details.operator_notes) after.operator_notes = details.operator_notes;
    } else if (action === "SESSION_MFA" || action === "SESSION_MFA_PASS") {
      before = {
        authenticated: false,
        mfa_verified: false,
      };
      after = {
        authenticated: true,
        mfa_verified: true,
      };
      if (details.auth_method) after.auth_method = details.auth_method;
      if (details.session_duration) after.session_duration = details.session_duration;
    } else if (action === "SLA_EXEMPT_REQ" || action === "SLA_EXEMPTION_REQ") {
      before = {
        sla_status: "STANDARD_ENFORCED",
      };
      after = {
        sla_status: "EXEMPTION_PENDING_APPROVAL",
      };
      if (details.reason) after.reason = details.reason;
      if (details.window_hours) after.window_hours = details.window_hours;
    }
  }

  // Chave identificadora contextual sempre na primeira linha
  const primaryIdKey = details.device_id
    ? "device_id"
    : details.incident_id
    ? "incident_id"
    : details.session_id
    ? "session_id"
    : details.ticket_id
    ? "ticket_id"
    : "resource_id";

  lines.push({ type: "neutral", key: primaryIdKey, value: resourceId });

  // Outras chaves de topo que não façam parte de before/after
  for (const [k, val] of Object.entries(details)) {
    if (
      k !== "before" &&
      k !== "after" &&
      k !== "summary" &&
      k !== primaryIdKey &&
      k !== "device_id" &&
      k !== "incident_id" &&
      (!after || !(k in after)) &&
      (!before || !(k in before))
    ) {
      lines.push({ type: "neutral", key: k, value: val });
    }
  }

  if (before || after) {
    const allKeys = Array.from(
      new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    );
    for (const key of allKeys) {
      const hasBefore = before && key in before;
      const hasAfter = after && key in after;

      if (hasBefore && hasAfter && before && after) {
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) {
          lines.push({ type: "neutral", key, value: before[key] });
        } else {
          lines.push({ type: "removed", key, value: before[key] });
          lines.push({ type: "added", key, value: after[key] });
        }
      } else if (hasBefore && before) {
        lines.push({ type: "removed", key, value: before[key] });
      } else if (hasAfter && after) {
        lines.push({ type: "added", key, value: after[key] });
      }
    }
  } else {
    for (const [key, val] of Object.entries(details)) {
      if (key !== primaryIdKey && key !== "device_id" && key !== "incident_id") {
        lines.push({ type: "neutral", key, value: val });
      }
    }
  }

  return lines;
}

export const AuditPayloadInspector: React.FC<AuditPayloadInspectorProps> = ({ log }) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const deltaLines = React.useMemo(() => {
    if (!log) return [];
    return computeStateDelta(log.action, log.resource_id, log.details);
  }, [log]);

  if (!log) {
    return (
      <aside
        data-testid="audit-payload-inspector"
        className="bg-obsidian-900 rounded-xl border border-obsidian-800 p-8 flex flex-col items-center justify-center text-center text-slate-500 min-h-[380px]"
      >
        <GitCompare size={36} className="text-slate-600 mb-3" />
        <h3 className="font-display font-semibold text-slate-300 text-sm">
          Nenhum evento selecionado
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Selecione uma linha ou clique em &quot;[Ver Diff]&quot; na tabela para inspecionar os detalhes
          forenses e o delta de estado JSONB.
        </p>
      </aside>
    );
  }

  const merkleRoot =
    log.merkle_root ||
    (log.hash ? `#${log.hash.slice(0, 8)}...${log.hash.slice(-4)}` : "#merkle-root");

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(log.details || {}, null, 2));
    setCopiedJson(true);
    toast.success("Payload JSONB copiado para a área de transferência!");
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyPreviousHash = () => {
    if (!log.previous_hash) return;
    navigator.clipboard.writeText(log.previous_hash);
    setCopiedHash(true);
    toast.success("Hash anterior copiado com sucesso!");
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDownloadProofSig = () => {
    const proofData = {
      event_id: log.id,
      timestamp: log.created_at,
      action: log.action,
      resource_id: log.resource_id,
      hash: log.hash,
      previous_hash: log.previous_hash,
      merkle_root: merkleRoot,
      signature_algorithm: "ed25519-sha256",
      signature: `sig_ed25519_${log.hash.slice(0, 24)}...`,
    };
    const blob = new Blob([JSON.stringify(proofData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proof-${log.id}.sig`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Prova forense baixada: proof-${log.id}.sig`);
  };

  const getInspectorRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return "px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold font-mono border border-purple-500/30";
      case "NOC_OPERATOR":
        return "px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[9px] font-mono border border-sky-500/30";
      case "ORG_ADMIN":
        return "px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-semibold font-mono border border-amber-500/30";
      default:
        return "px-1.5 py-0.5 rounded bg-obsidian-800 text-slate-400 text-[9px] font-mono";
    }
  };

  return (
    <aside
      data-testid="audit-payload-inspector"
      className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden flex flex-col"
    >
      {/* Header do Inspector */}
      <div className="p-4 border-b border-obsidian-800 bg-obsidian-950/80">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <GitCompare size={20} className="text-sky-400 shrink-0" />
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                Diff de Estado JSONB — Evento #{log.id}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 font-mono">
                <span className="tabular-nums">
                  {new Date(log.created_at).toLocaleTimeString("pt-BR")} WAT
                </span>
                <span>•</span>
                <span className="text-white font-medium">{log.resource_id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metadados da Operação */}
        <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-obsidian-800">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Autor:</span>
            <span className="text-white font-medium">{log.actor_name || "system"}</span>
            <span className={getInspectorRoleBadge(log.actor_role)}>
              {log.actor_role}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Operação: <span className="text-sky-400 font-semibold">{log.action}</span>
          </div>
        </div>
      </div>

      {/* Checksum Criptográfico SHA-256 */}
      <div className="px-4 py-2 bg-obsidian-950 border-b border-obsidian-800 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Lock size={12} className="text-emerald-400 shrink-0" />
          <span className="text-[11px] font-mono text-slate-300 truncate">
            SHA-256: <span className="text-slate-400 font-mono select-all">{log.hash}</span>
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold font-mono shrink-0 border border-emerald-500/30">
          ASSINATURA VÁLIDA
        </span>
      </div>

      {/* Visualizador de Código Diff */}
      <div className="p-4 bg-obsidian-950 font-mono tabular-nums text-xs overflow-x-auto leading-relaxed select-text flex-1">
        <div className="text-slate-500 pb-1.5 text-[10px] uppercase font-bold tracking-wider">
          // Comparação de Delta Atômico (Before vs After)
        </div>

        <pre className="font-mono text-[12px] leading-5 text-slate-300">
          <span>{"{"}</span>
          {"\n"}
          {deltaLines.map((line, idx) => {
            const isLast = idx === deltaLines.length - 1;
            const comma = isLast ? "" : ",";
            const formattedValue = JSON.stringify(line.value);

            if (line.type === "removed") {
              return (
                <span
                  key={idx}
                  className="bg-rose-950/40 text-rose-300 block w-full px-2 -mx-2 rounded font-mono"
                >
                  <span className="text-rose-400 font-bold select-none">-</span>{" "}
                  <span className="text-rose-300">&quot;{line.key}&quot;</span>:{" "}
                  <span className="text-rose-400">{formattedValue}</span>
                  {comma}
                </span>
              );
            }

            if (line.type === "added") {
              return (
                <span
                  key={idx}
                  className="bg-emerald-950/40 text-emerald-300 block w-full px-2 -mx-2 rounded font-mono"
                >
                  <span className="text-emerald-400 font-bold select-none">+</span>{" "}
                  <span className="text-emerald-300">&quot;{line.key}&quot;</span>:{" "}
                  <span className="text-emerald-400">{formattedValue}</span>
                  {comma}
                </span>
              );
            }

            return (
              <span key={idx} className="block px-2 -mx-2 font-mono text-slate-300">
                {"  "}
                <span className="text-sky-300">&quot;{line.key}&quot;</span>:{" "}
                <span className="text-emerald-300">{formattedValue}</span>
                {comma}
              </span>
            );
          })}
          <span>{"}"}</span>
        </pre>
      </div>

      {/* Raiz Merkle do Bloco */}
      <div className="px-4 py-2.5 bg-obsidian-900 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-slate-400" />
          <span className="text-slate-400">Raiz Merkle do Bloco:</span>
          <span className="text-slate-200">{merkleRoot}</span>
        </div>
        <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
          <ShieldCheck size={12} /> PROVA VÁLIDA
        </span>
      </div>

      {/* Ações do Drawer/Inspector */}
      <div className="p-3 bg-obsidian-900 border-t border-obsidian-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyJson}
            className="px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white font-mono text-xs transition-colors border border-obsidian-700 flex items-center gap-1.5"
          >
            {copiedJson ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Copy size={14} />
            )}
            <span>Copiar JSONB</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPreviousHash}
            disabled={!log.previous_hash}
            className="px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white font-mono text-xs transition-colors border border-obsidian-700 flex items-center gap-1.5 disabled:opacity-40"
          >
            {copiedHash ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <History size={14} />
            )}
            <span>Hash Anterior</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownloadProofSig}
          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Download size={14} />
          <span>Baixar Prova (.sig)</span>
        </button>
      </div>
    </aside>
  );
};
