import React, { useEffect, useState } from "react";
import {
  Activity,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Settings2,
  Globe,
  Save,
  RotateCcw,
  Database,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { settingsApi } from "../../services/settingsApi";
import type { IntegrationStatusItem, ZabbixTestResponse } from "../../types/settings";

interface Props {
  statusItem?: IntegrationStatusItem;
  onRefresh?: () => void | Promise<void>;
}

export const ZabbixSettingsTab: React.FC<Props> = ({ statusItem, onRefresh }) => {
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testResult, setTestResult] = useState<ZabbixTestResponse | null>(null);

  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [validateConnectivity, setValidateConnectivity] = useState(true);

  useEffect(() => {
    if (statusItem) {
      if (statusItem.endpoint) {
        setApiUrl(statusItem.endpoint);
      }
      setEnabled(statusItem.enabled ?? true);
      if (typeof statusItem.details?.user === "string") {
        setUsername(statusItem.details.user);
      }
    }
  }, [statusItem]);

  const handleRunTest = async () => {
    if (!apiUrl.trim()) {
      toast.error("Informe a URL JSON-RPC do Zabbix para executar o teste.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testZabbix({
        api_url: apiUrl.trim() || undefined,
        api_token: apiToken.trim() || undefined,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(`Falha no teste: ${res.message}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Falha ao conectar à API do Zabbix";
      setTestResult({
        success: false,
        latency_ms: 0,
        message: errMsg,
        hosts_count: 0,
        error: String(err),
      });
      toast.error(errMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiUrl.trim()) {
      toast.error("A URL da API JSON-RPC do Zabbix é obrigatória.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        endpoint: apiUrl.trim(),
        enabled,
        username: username.trim() || undefined,
        validate_connectivity: validateConnectivity,
      };
      if (apiToken.trim()) {
        payload.api_token = apiToken.trim();
      }
      if (password.trim()) {
        payload.password = password.trim();
      }

      const res = await settingsApi.updateIntegration("zabbix", payload);
      toast.success(res.message || "Configuração do Zabbix salva e ativada com sucesso!");
      setApiToken("");
      setPassword("");
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "detail" in err
          ? String((err as { detail: unknown }).detail)
          : "Erro ao salvar configuração do Zabbix";
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Deseja realmente remover os parâmetros do banco de dados e restaurar o padrão do .env?")) {
      return;
    }
    setResetting(true);
    try {
      const res = await settingsApi.resetIntegration("zabbix");
      toast.success(res.message || "Configurações restauradas para o padrão do ambiente!");
      setApiToken("");
      setPassword("");
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Erro ao restaurar configurações padrão";
      toast.error(errMsg);
    } finally {
      setResetting(false);
    }
  };

  const isDatabaseSource = statusItem?.source === "database";

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Zabbix Server (SNMP / Agent Telemetry & JSON-RPC)</h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  statusItem?.enabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {statusItem?.enabled ? "ATIVO" : "DESABILITADO"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  isDatabaseSource
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {isDatabaseSource ? <Database className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
                {isDatabaseSource ? "Origem: Banco de Dados" : "Origem: Padrão .env"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Endpoint JSON-RPC:{" "}
              <code className="text-slate-300 font-mono">{statusItem?.endpoint || "Nenhum endpoint configurado"}</code>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunTest}
          disabled={testing || saving}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-red-600/20"
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
            {testResult.api_version && (
              <p className="text-xs mt-1 text-slate-300">
                Versão do Servidor: <span className="font-mono text-cyan-300 font-semibold">{testResult.api_version}</span> |
                Hosts ativos no inventário: <span className="font-mono text-emerald-300 font-semibold">{testResult.hosts_count}</span>
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
        {/* Left Card: Active Operative Parameters */}
        <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                Parâmetros em Operação (Estado Ativo)
              </h4>
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  isDatabaseSource ? "bg-cyan-500/10 text-cyan-400" : "bg-slate-800 text-slate-400"
                }`}
              >
                {isDatabaseSource ? "DB Override" : "Factory Default"}
              </span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">ZABBIX_API_URL</span>
                <span className="text-slate-200 font-mono truncate max-w-[240px]" title={statusItem?.endpoint || ""}>
                  {statusItem?.endpoint || "Não configurado"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">ZABBIX_API_TOKEN</span>
                <span className="text-slate-200 font-mono">
                  {statusItem?.details?.api_token_configured ? "•••••••• (Configurado)" : "Não configurado"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">ZABBIX_USER</span>
                <span className="text-slate-200 font-mono">
                  {typeof statusItem?.details?.user === "string" ? statusItem.details.user : "Admin"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800">
                <span className="text-slate-400">Status Operacional</span>
                <span
                  className={`font-mono font-medium ${statusItem?.configured ? "text-emerald-400" : "text-amber-400"}`}
                >
                  {statusItem?.configured ? "Credenciais detectadas" : "Incompleto / Aguardando URL"}
                </span>
              </div>
              {statusItem?.updated_at && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">Última Alteração</span>
                  <span className="text-slate-300 font-mono">
                    {new Date(statusItem.updated_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {isDatabaseSource && (
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting || saving}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {resetting ? "Restaurando..." : "Restaurar Padrão de Fábrica (.env)"}
              </button>
            </div>
          )}
        </div>

        {/* Right Card: Configure & Persist Parameters */}
        <form onSubmit={handleSave} className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-cyan-400" />
              Configurar Parâmetros de Integração
            </h4>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
              Persistência Web
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Defina o endpoint e credenciais de serviço do servidor Zabbix. A sincronização de inventário e métricas
            adotará estes valores imediatamente.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">API URL JSON-RPC *</label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="url"
                  required
                  placeholder="http://zabbix:8080/api_jsonrpc.php"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">API Token (Recomendado Zabbix 7)</label>
              <input
                type="password"
                placeholder={statusItem?.details?.api_token_configured ? "Manter token salvo" : "Token permanente Zabbix"}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Usuário Fallback</label>
                <input
                  type="text"
                  placeholder="Admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Senha Fallback</label>
                <input
                  type="password"
                  placeholder="Manter senha salva ou alterar"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2 border-t border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={validateConnectivity}
                  onChange={(e) => setValidateConnectivity(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Validar conectividade (pre-flight check) antes de salvar</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Habilitar sincronização com Zabbix</span>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRunTest}
                disabled={testing || saving}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {testing ? "Testando..." : "Testar Conexão"}
              </button>

              <button
                type="submit"
                disabled={saving || testing}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-cyan-600/20"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Salvando..." : "Salvar e Aplicar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
