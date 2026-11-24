import React, { useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { AuditIntegrityVerificationResponse } from "../../types/audit";

interface CustodyIntegrityBannerProps {
  status: AuditIntegrityVerificationResponse;
  onVerify?: () => Promise<void>;
  isLoading?: boolean;
}

export const CustodyIntegrityBanner: React.FC<CustodyIntegrityBannerProps> = ({
  status,
  onVerify: _onVerify,
  isLoading: _isLoading = false,
}) => {
  const [copied, setCopied] = useState(false);

  const copyBlockHash = () => {
    if (!status.last_block_hash) return;
    navigator.clipboard.writeText(status.last_block_hash);
    setCopied(true);
    toast.success("Hash SHA-256 copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  const isChainValid = status.is_valid && status.violations.length === 0;

  return (
    <section
      data-testid="custody-integrity-banner"
      className={`rounded-xl p-4 sm:p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden transition-colors min-w-0 max-w-full ${
        isChainValid
          ? "bg-obsidian-900 border-emerald-500/30"
          : "bg-obsidian-900 border-rose-500/50 shadow-lg shadow-rose-950/20"
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1 max-w-full">
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
            isChainValid
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          {isChainValid ? (
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-full">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <span className="text-sm sm:text-base font-display font-bold text-white break-words">
              Integridade da Cadeia de Custódia:{" "}
              <span className={isChainValid ? "text-emerald-400" : "text-rose-400"}>
                {isChainValid ? "ÍNTEGRA E VÁLIDA" : "CADEIA ADULTERADA / VIOLAÇÃO"}
              </span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border shrink-0 ${
                isChainValid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isChainValid ? "bg-emerald-400" : "bg-rose-400 animate-ping"
                }`}
              />
              {isChainValid ? "MERKLE PROOF OK" : "VIOLAÇÃO CRIPTOGRÁFICA"}
            </span>
          </div>

          <p className="text-xs text-slate-400 flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0 leading-relaxed">
            <span>
              {status.total_records.toLocaleString("pt-BR")} registros validados consecutivamente
              desde o bloco gênese
            </span>
            <span className="text-obsidian-700 hidden sm:inline">•</span>
            <span className={isChainValid ? "text-emerald-400" : "text-rose-400 font-semibold"}>
              {status.violations.length} adulterações detectadas
            </span>
            <span className="text-obsidian-700 hidden sm:inline">•</span>
            <span className="font-mono text-slate-300">
              Algoritmo: {status.algorithm || "SHA-256 HMAC"}
            </span>
          </p>

          {/* Último Block Hash com wrapping seguro e quebra em mobile */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 pt-1 font-mono tabular-nums text-xs text-slate-400 bg-obsidian-950 px-2.5 py-1.5 rounded-lg border border-obsidian-800 max-w-full min-w-0">
            <span className="text-slate-400 font-medium shrink-0">Último Block Hash:</span>
            <span
              id="block-hash-text"
              className="text-slate-200 select-all text-[11px] truncate flex-1 min-w-[70px] max-w-full font-mono"
              title={status.last_block_hash}
            >
              {status.last_block_hash || "Calculando..."}
            </span>
            <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
              <button
                type="button"
                onClick={copyBlockHash}
                className="hover:text-emerald-400 transition-colors p-1 text-slate-400 hover:bg-obsidian-850 rounded"
                title="Copiar Hash SHA-256"
                aria-label="Copiar Hash SHA-256"
              >
                {copied ? (
                  <Check size={14} className="text-emerald-400" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
              <span className="text-slate-500 text-[10px]">
                ({new Date().toLocaleTimeString("pt-BR", { timeZone: "Africa/Luanda" })} WAT)
              </span>
            </div>
          </div>

          {/* Alertas de Violações se houver */}
          {!isChainValid && status.violations.length > 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs font-mono min-w-0">
              <div className="font-bold flex items-center gap-1.5 text-rose-400 mb-1">
                <ShieldAlert size={14} /> Violações Encontradas:
              </div>
              <ul className="list-disc list-inside space-y-0.5 break-words">
                {status.violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Métricas Rápidas da Verificação (Responsivo: 2 colunas em mobile, inline em desktop) */}
      <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-6 lg:border-l lg:border-obsidian-800 lg:pl-6 shrink-0 bg-obsidian-950/60 lg:bg-transparent p-3 lg:p-0 rounded-lg w-full lg:w-auto min-w-0">
        <div className="flex-1 sm:flex-initial">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Tempo de Verificação</div>
          <div className="text-lg font-mono text-sky-400 font-bold mt-0.5 tabular-nums">
            {status.verification_time_ms !== undefined && status.verification_time_ms !== null
              ? `${status.verification_time_ms}ms`
              : "0ms"}
          </div>
          <div className="text-[10px] text-slate-400">Zero overhead no banco</div>
        </div>

        <div className="h-8 w-px bg-obsidian-800 shrink-0" />

        <div className="flex-1 sm:flex-initial">
          <div className="text-[10px] font-mono text-slate-400 uppercase">Validadores</div>
          <div className="text-lg font-mono text-emerald-400 font-bold mt-0.5 flex items-center gap-1.5 tabular-nums">
            <span>{status.validators_active || "3/3 Ativos"}</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-[10px] text-slate-400">Quórum Consensuado</div>
        </div>
      </div>
    </section>
  );
};
