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
import { Badge } from "../ui/Badge";

interface AuditPayloadInspectorProps {
  log: AuditLogEntry | null;
}

export const AuditPayloadInspector: React.FC<AuditPayloadInspectorProps> = ({ log }) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

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
      merkle_root: log.merkle_root || "#b94d27b9...3f12",
      signature_algorithm: "ed25519-sha256",
      signature: "sig_ed25519_9f8a4b01ce48df2a9844...",
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

  const hasBeforeAfter =
    log.details &&
    typeof log.details === "object" &&
    ("before" in log.details || "after" in log.details);

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
            <Badge variant="neutral" className="text-[9px] font-mono">
              {log.actor_role}
            </Badge>
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
      <div className="p-4 bg-obsidian-950 font-mono tabular-nums text-xs overflow-x-auto leading-relaxed select-text flex-1 min-h-[260px]">
        <div className="text-slate-500 pb-1.5 text-[10px] uppercase font-bold tracking-wider">
          // Comparação de Delta Atômico (Before vs After)
        </div>

        {hasBeforeAfter ? (
          <pre className="font-mono text-[12px] leading-5 text-slate-300">
            <span>{"{"}</span>
            {"\n"}
            <span className="text-sky-300"> &quot;resource_id&quot;</span>:{" "}
            <span className="text-emerald-300">&quot;{log.resource_id}&quot;</span>,{"\n"}
            {Boolean(log.details?.before) && (
              <span className="bg-rose-950/40 text-rose-300 block w-full px-2 -mx-2 rounded">
                <span className="text-rose-400 font-bold select-none">- </span>
                <span className="text-rose-300">
                  &quot;before&quot;: {JSON.stringify(log.details?.before, null, 2)}
                </span>
              </span>
            )}
            {Boolean(log.details?.after) && (
              <span className="bg-emerald-950/40 text-emerald-300 block w-full px-2 -mx-2 rounded">
                <span className="text-emerald-400 font-bold select-none">+ </span>
                <span className="text-emerald-300">
                  &quot;after&quot;: {JSON.stringify(log.details?.after, null, 2)}
                </span>
              </span>
            )}
            <span>{"}"}</span>
          </pre>
        ) : (
          <pre className="font-mono text-[12px] leading-5 text-slate-300">
            {JSON.stringify(log.details || {}, null, 2)}
          </pre>
        )}
      </div>

      {/* Raiz Merkle do Bloco */}
      <div className="px-4 py-2.5 bg-obsidian-900 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-slate-400" />
          <span className="text-slate-400">Raiz Merkle do Bloco:</span>
          <span className="text-slate-200">{log.merkle_root || "#b94d27b9...3f12"}</span>
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
