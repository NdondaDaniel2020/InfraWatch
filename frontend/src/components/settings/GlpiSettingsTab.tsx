import React, { useState } from "react";
import { Ticket, Play, Loader2, CheckCircle2, AlertCircle, ShieldAlert, KeyRound, Globe } from "lucide-react";
import { settingsApi } from "../../services/settingsApi";
import type { GlpiTestResponse, IntegrationStatusItem } from "../../types/settings";

interface Props {
  statusItem?: IntegrationStatusItem;
}

export const GlpiSettingsTab: React.FC<Props> = ({ statusItem }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GlpiTestResponse | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customAppToken, setCustomAppToken] = useState("");
  const [customUserToken, setCustomUserToken] = useState("");

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testGlpi({
        base_url: customBaseUrl || undefined,
        app_token: customAppToken || undefined,
        user_token: customUserToken || undefined,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        latency_ms: 0,
        message: err instanceof Error ? err.message : "Falha ao conectar à API",
        session_token_obtained: false,
        error: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">GLPI ITSM (Service Desk & Incident Tickets)</h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  statusItem?.enabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {statusItem?.enabled ? "ATIVO" : "DESABILITADO"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Endpoint configurado:{" "}
              <code className="text-slate-300 font-mono">{statusItem?.endpoint || "Nenhum endpoint definido"}</code>
            </p>
          </div>
        </div>

        <button
          onClick={handleRunTest}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-amber-600/20"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {testing ? "Executando Teste..." : "Testar Conexão In-Process"}
        </button>
      </div>

      {/* Test Execution Result */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            testResult.success
              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
              : "bg-rose-950/20 border-rose-500/30 text-rose-200"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{testResult.message}</span>
              {testResult.latency_ms > 0 && (
                <span className="text-xs px-2 py-0.5 bg-black/40 rounded border border-white/10 font-mono">
                  {testResult.latency_ms.toFixed(1)} ms
                </span>
              )}
            </div>
            {testResult.ticket_id && (
              <p className="text-xs mt-1 text-slate-300">
                Ticket efêmero criado e finalizado com ID:{" "}
                <span className="font-mono text-amber-300 font-semibold">#{testResult.ticket_id}</span>
              </p>
            )}
            {testResult.error && (
              <p className="text-xs mt-1 text-rose-300 font-mono bg-rose-950/40 p-2 rounded border border-rose-900/50">
                {testResult.error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Parameter Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Environment In-Memory Status */}
        <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Parâmetros Carregados (.env / Secrets)
          </h4>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">GLPI_BASE_URL</span>
              <span className="text-slate-200 font-mono">{statusItem?.endpoint || "Não configurado"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">GLPI_APP_TOKEN</span>
              <span className="text-slate-200 font-mono">••••••••</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">GLPI_USER_TOKEN</span>
              <span className="text-slate-200 font-mono">••••••••</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Status Mínimo</span>
              <span
                className={`font-mono font-medium ${statusItem?.configured ? "text-emerald-400" : "text-amber-400"}`}
              >
                {statusItem?.configured ? "Credenciais detectadas" : "Incompleto"}
              </span>
            </div>
          </div>
        </div>

        {/* Ephemeral Test Overrides */}
        <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            Sobrescrever Parâmetros para Teste Pontual
          </h4>
          <p className="text-xs text-slate-400">
            Opcional. Insira credenciais temporárias para validar outro servidor GLPI sem persistir alterações.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Base URL de Teste</label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="https://glpi.rcsangola.co.ao/apirest.php"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">App-Token</label>
                <input
                  type="password"
                  placeholder="App Token temporário"
                  value={customAppToken}
                  onChange={(e) => setCustomAppToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">User-Token</label>
                <input
                  type="password"
                  placeholder="User Token temporário"
                  value={customUserToken}
                  onChange={(e) => setCustomUserToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
