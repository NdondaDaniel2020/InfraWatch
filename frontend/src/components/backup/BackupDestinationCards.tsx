import React, { useState } from "react";
import { HardDrive, Cloud, Globe, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { BackupStorageResponse } from "../../types/backup";

interface BackupDestinationCardsProps {
  storage: BackupStorageResponse | null;
  onConnectGDrive?: () => void;
}

export const BackupDestinationCards: React.FC<BackupDestinationCardsProps> = ({
  storage,
  onConnectGDrive,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    if (!text || text === "—") return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Caminho copiado para a área de transferência!");
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const local = storage?.local;
  const gdrive = storage?.gdrive;
  const r2 = storage?.r2;

  return (
    <section
      data-testid="backup-destination-cards"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-label="Topologia de Destinos de Backup 3-2-1"
    >
      {/* Card 1: NVMe Host */}
      <article className="bg-[#091122] border border-[#14233f] hover:border-[#1d325a] rounded-xl p-4 flex flex-col justify-between transition-colors shadow-sm">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <h3>Destino 1: NVMe Host</h3>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 tracking-wider">
              {local?.status || "ONLINE & SINCRONIZADO"}
            </span>
          </div>

          {/* Usage Bar */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Espaço em Uso</span>
              <span className="text-white font-semibold">
                {local?.used_human || "0 B"}{" "}
                <span className="text-slate-500 font-normal">
                  / {local?.total_human || "0 B"} ({local?.used_percent ?? 0}%)
                </span>
              </span>
            </div>
            <div className="w-full bg-[#111c33] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, local?.used_percent || 0))}%` }}
              />
            </div>
          </div>

          {/* Atomic Path Box */}
          <div className="space-y-1 mb-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Caminho Local Atômico
            </span>
            <div className="flex items-center justify-between bg-[#050913] border border-[#14213a] rounded-md px-2.5 py-1.5 font-mono text-xs text-slate-300">
              <span className="truncate">{local?.path || "/var/backups/infrawatch"}</span>
              <button
                type="button"
                onClick={() => handleCopy("local", local?.path || "/var/backups/infrawatch")}
                className="text-slate-500 hover:text-white transition ml-2 shrink-0 cursor-pointer"
                title="Copiar caminho"
                aria-label="Copiar caminho NVMe"
              >
                {copiedKey === "local" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Meta Details */}
        <div className="border-t border-[#131f38] pt-2.5 space-y-1 text-xs font-mono">
          <div className="flex justify-between items-center text-slate-400">
            <span>Política de Retenção:</span>
            <span className="text-slate-200">{local?.retention_policy || "7 dias (FIFO)"}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>I/O Latência NVMe:</span>
            <span className="text-emerald-400 font-medium">
              {local?.io_latency || "0.4ms (Direct-DMA)"}
            </span>
          </div>
        </div>
      </article>

      {/* Card 2: Google Drive */}
      {(() => {
        const isConnected = Boolean(gdrive?.configured && gdrive?.authorized);
        return (
          <article className="bg-[#091122] border border-[#14233f] hover:border-[#1d325a] rounded-xl p-4 flex flex-col justify-between transition-colors shadow-sm">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Cloud
                    className={`w-4 h-4 ${isConnected ? "text-amber-400" : "text-slate-500"}`}
                  />
                  <h3>Destino 2: Google Drive</h3>
                </div>
                {!isConnected ? (
                  <button
                    type="button"
                    onClick={onConnectGDrive}
                    title="Google Drive: Clique para tentar conectar com os serviços Google."
                    data-testid="badge-service-not-configured"
                    className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#0c1830] border border-[#172747] text-slate-500 hover:text-slate-300 hover:border-slate-600 transition cursor-pointer tracking-wider"
                  >
                    Não Configurado
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onConnectGDrive}
                    title="Google Drive conectado. Clique para reconectar aos serviços Google."
                    data-testid="badge-service-connected"
                    className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 tracking-wider hover:bg-emerald-900/60 transition cursor-pointer"
                  >
                    CONECTADO (OAUTH2)
                  </button>
                )}
              </div>

              {/* Usage Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Espaço em Uso</span>
                  {isConnected && gdrive ? (
                    <span className="text-amber-400 font-semibold">
                      {gdrive.used_human}{" "}
                      <span className="text-slate-500 font-normal">
                        / {gdrive.total_human} ({gdrive.used_percent}%)
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono">—</span>
                  )}
                </div>
                <div className="w-full bg-[#111c33] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`${
                      isConnected ? "bg-amber-400" : "bg-slate-700/40"
                    } h-full rounded-full transition-all duration-500`}
                    style={{
                      width: `${
                        isConnected && gdrive
                          ? Math.min(100, Math.max(0, gdrive.used_percent || 0))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Remote Directory Box */}
              <div className="space-y-1 mb-3.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  Diretório Remoto Offsite
                </span>
                <div className="flex items-center justify-between bg-[#050913] border border-[#14213a] rounded-md px-2.5 py-1.5 font-mono text-xs text-slate-400">
                  <span className="truncate">
                    {isConnected && gdrive ? gdrive.remote_directory : "—"}
                  </span>
                  {isConnected && gdrive?.remote_directory && gdrive.remote_directory !== "—" && (
                    <button
                      type="button"
                      onClick={() => handleCopy("gdrive", gdrive.remote_directory)}
                      className="text-slate-500 hover:text-white transition ml-2 shrink-0 cursor-pointer"
                      title="Copiar caminho"
                      aria-label="Copiar pasta Google Drive"
                    >
                      {copiedKey === "gdrive" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Meta Details */}
            <div className="border-t border-[#131f38] pt-2.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-400">
                <span>Retenção Offsite:</span>
                <span className={isConnected ? "text-slate-200" : "text-slate-500"}>
                  {isConnected && gdrive ? gdrive.retention_policy : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Quota Disponível:</span>
                <span
                  className={
                    isConnected ? "text-amber-400 font-medium" : "text-slate-500"
                  }
                >
                  {isConnected && gdrive ? `${gdrive.free_human} Restante` : "—"}
                </span>
              </div>
            </div>
          </article>
        );
      })()}

      {/* Card 3: Cloudflare R2 */}
      {(() => {
        const isConnected = Boolean(r2?.configured && r2?.authorized);
        return (
          <article className="bg-[#091122] border border-[#14233f] hover:border-[#1d325a] rounded-xl p-4 flex flex-col justify-between transition-colors shadow-sm">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Globe
                    className={`w-4 h-4 ${isConnected ? "text-cyan-400" : "text-slate-500"}`}
                  />
                  <h3>Destino 3: Cloudflare R2</h3>
                </div>
                {!isConnected ? (
                  <span
                    data-testid="badge-service-not-configured"
                    className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#0c1830] border border-[#172747] text-slate-500 tracking-wider"
                  >
                    Não Configurado
                  </span>
                ) : (
                  <span
                    data-testid="badge-service-connected"
                    className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 tracking-wider"
                  >
                    ATIVO (ZERO EGRESS)
                  </span>
                )}
              </div>

              {/* Usage Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Espaço em Uso</span>
                  {isConnected && r2 ? (
                    <span className="text-white font-semibold">
                      {r2.used_human}{" "}
                      <span className="text-slate-500 font-normal">
                        / {r2.total_human} ({r2.used_percent}%)
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono">—</span>
                  )}
                </div>
                <div className="w-full bg-[#111c33] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`${
                      isConnected ? "bg-cyan-400" : "bg-slate-700/40"
                    } h-full rounded-full transition-all duration-500`}
                    style={{
                      width: `${
                        isConnected && r2
                          ? Math.min(100, Math.max(0, r2.used_percent || 0))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Bucket Box */}
              <div className="space-y-1 mb-3.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  S3 Bucket Endpoint
                </span>
                <div className="flex items-center justify-between bg-[#050913] border border-[#14213a] rounded-md px-2.5 py-1.5 font-mono text-xs text-slate-400">
                  <span className="truncate">
                    {isConnected && r2 ? r2.bucket : "—"}
                  </span>
                  {isConnected && r2?.bucket && r2.bucket !== "—" && (
                    <button
                      type="button"
                      onClick={() => handleCopy("r2", r2.bucket)}
                      className="text-slate-500 hover:text-white transition ml-2 shrink-0 cursor-pointer"
                      title="Copiar endpoint"
                      aria-label="Copiar bucket R2"
                    >
                      {copiedKey === "r2" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Meta Details */}
            <div className="border-t border-[#131f38] pt-2.5 space-y-1 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-400">
                <span>Replicação Geo-Distribuída:</span>
                <span className={isConnected ? "text-slate-200" : "text-slate-500"}>
                  {isConnected && r2 ? r2.replication || "Multi-Região (Edge)" : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Taxa de Egress Fee:</span>
                <span
                  className={
                    isConnected ? "text-emerald-400 font-medium" : "text-slate-500"
                  }
                >
                  {isConnected && r2 ? r2.egress_fee || "$0.00 / Zero Egress" : "—"}
                </span>
              </div>
            </div>
          </article>
        );
      })()}
    </section>
  );
};
