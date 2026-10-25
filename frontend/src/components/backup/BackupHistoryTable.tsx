import React, { useState } from "react";
import {
  Copy,
  Check,
  HardDrive,
  Cloud,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileArchive,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { BackupHistoryItem, BackupTargetStatus } from "../../types/backup";

interface BackupHistoryTableProps {
  items: BackupHistoryItem[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export const BackupHistoryTable: React.FC<BackupHistoryTableProps> = ({
  items,
  isLoading,
  onRefresh,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success("Hash SHA-256 copiado para a área de transferência!");
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const renderTargetBadge = (
    label: string,
    status?: BackupTargetStatus,
    icon?: React.ReactNode
  ) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span
            title={`${label}: Replicado com Sucesso`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
          >
            {icon}
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{label}</span>
          </span>
        );
      case "FAILED":
        return (
          <span
            title={`${label}: Falha na Replicação`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse"
          >
            {icon}
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>{label}</span>
          </span>
        );
      case "SKIPPED":
      default:
        return (
          <span
            title={`${label}: Não configurado ou ignorado`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-obsidian-850 border border-obsidian-800"
          >
            {icon}
            <AlertCircle className="w-3 h-3 text-slate-500" />
            <span>{label}</span>
          </span>
        );
    }
  };

  return (
    <div
      data-testid="backup-history-table"
      className="bg-obsidian-900 border border-obsidian-800 rounded-2xl overflow-hidden shadow-sm flex flex-col"
    >
      {/* Header da Tabela */}
      <div className="p-4 border-b border-obsidian-800 flex items-center justify-between bg-obsidian-950/40">
        <div className="flex items-center gap-2">
          <FileArchive className="w-4 h-4 text-emerald-400" />
          <h2 className="font-mono text-xs uppercase font-bold text-white tracking-wider">
            Histórico de Snapshots &amp; Verificação Criptográfica
          </h2>
          <span className="text-[10px] font-mono text-slate-400 bg-obsidian-850 px-2 py-0.5 rounded-full border border-obsidian-800">
            {items.length} Backups Disponíveis
          </span>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-obsidian-850 border border-obsidian-800 text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
            title="Atualizar Histórico"
            aria-label="Atualizar histórico"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        )}
      </div>

      {/* Tabela de Dados */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-obsidian-950/80 text-[10px] uppercase text-slate-400 border-b border-obsidian-800">
            <tr>
              <th scope="col" className="py-3 px-4 font-semibold">Snapshot / Arquivo</th>
              <th scope="col" className="py-3 px-4 font-semibold">Criação (UTC)</th>
              <th scope="col" className="py-3 px-4 font-semibold">Tamanho</th>
              <th scope="col" className="py-3 px-4 font-semibold">Checksum SHA-256</th>
              <th scope="col" className="py-3 px-4 font-semibold">Destinos (Local &amp; Cloud)</th>
              <th scope="col" className="py-3 px-4 font-semibold text-right">Gatilho</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-800/60">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 font-mono text-xs">
                  Nenhum snapshot de backup registrado até o momento.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isCopied = copiedHash === item.sha256;

                return (
                  <tr
                    key={item.filename}
                    className="hover:bg-obsidian-850/50 transition-colors group"
                  >
                    {/* 1. Nome do Arquivo */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {item.filename}
                        </span>
                        {item.notes && (
                          <span className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5">
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Timestamp UTC */}
                    <td className="py-3 px-4 text-slate-300 tabular-nums">
                      {new Date(item.created_at).toLocaleString("pt-BR", {
                        timeZone: "UTC",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}{" "}
                      <span className="text-[10px] text-slate-500">UTC</span>
                    </td>

                    {/* 3. Tamanho */}
                    <td className="py-3 px-4 tabular-nums font-bold text-slate-200">
                      {item.size_human}
                    </td>

                    {/* 4. Hash SHA-256 */}
                    <td className="py-3 px-4">
                      {item.sha256 ? (
                        <div className="flex items-center gap-1.5">
                          <code className="text-[10px] text-slate-400 bg-obsidian-950 px-2 py-0.5 rounded border border-obsidian-800/80 truncate max-w-[140px]">
                            {item.sha256}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyHash(item.sha256!)}
                            title="Copiar Hash SHA-256 para verificação de integridade"
                            aria-label={`Copiar hash do backup ${item.filename}`}
                            className="p-1 rounded bg-obsidian-950 hover:bg-obsidian-800 border border-obsidian-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Não calculado</span>
                      )}
                    </td>

                    {/* 5. Destinos */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {renderTargetBadge(
                          "Local",
                          item.targets?.local || "SUCCESS",
                          <HardDrive className="w-3 h-3" />
                        )}
                        {renderTargetBadge(
                          "GDrive",
                          item.targets?.gdrive || "SUCCESS",
                          <Cloud className="w-3 h-3" />
                        )}
                        {renderTargetBadge(
                          "R2",
                          item.targets?.r2 || "SUCCESS",
                          <Cloud className="w-3 h-3" />
                        )}
                      </div>
                    </td>

                    {/* 6. Tipo de Gatilho */}
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.trigger === "manual"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            : "bg-obsidian-800 text-slate-300 border border-obsidian-700"
                        }`}
                      >
                        {item.trigger === "manual" ? "MANUAL" : "AUTO (CRON)"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
