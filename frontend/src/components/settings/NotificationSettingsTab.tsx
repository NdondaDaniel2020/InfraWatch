import React, { useState } from "react";
import { Bell, Send, Loader2, CheckCircle2, AlertCircle, MessageSquare, Mail, Globe, ShieldCheck } from "lucide-react";
import { settingsApi } from "../../services/settingsApi";
import type { IntegrationStatusItem, NotificationTestResponse } from "../../types/settings";

interface Props {
  integrations: IntegrationStatusItem[];
}

export const NotificationSettingsTab: React.FC<Props> = ({ integrations }) => {
  const [activeChannel, setActiveChannel] = useState<"telegram" | "whatsapp" | "smtp" | "webhook">("telegram");
  const [recipient, setRecipient] = useState("");
  const [severity, setSeverity] = useState<"CRITICAL" | "DEGRADED" | "RESOLVED" | "INFO">("CRITICAL");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<NotificationTestResponse | null>(null);

  const getStatus = (name: string) => integrations.find((i) => i.name === name);

  const handleSendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testNotification({
        channel: activeChannel,
        recipient: recipient || undefined,
        severity,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        channel: activeChannel,
        latency_ms: 0,
        message: err instanceof Error ? err.message : "Falha na requisição",
        error: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const channelCards = [
    {
      id: "telegram" as const,
      name: "Telegram Bot",
      icon: MessageSquare,
      color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
      status: getStatus("telegram"),
      recipientPlaceholder: "Chat ID (opcional se houver padrão)",
    },
    {
      id: "whatsapp" as const,
      name: "WhatsApp Gateway",
      icon: MessageSquare,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      status: getStatus("whatsapp"),
      recipientPlaceholder: "+244923456789 ou JID de grupo",
    },
    {
      id: "smtp" as const,
      name: "SMTP Server",
      icon: Mail,
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
      status: getStatus("smtp"),
      recipientPlaceholder: "destinatario@rcsangola.co.ao",
    },
    {
      id: "webhook" as const,
      name: "Webhook REST",
      icon: Globe,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      status: getStatus("webhook"),
      recipientPlaceholder: "https://hook.endpoint/alerta (opcional)",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Channels Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {channelCards.map((ch) => {
          const Icon = ch.icon;
          const isSelected = activeChannel === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChannel(ch.id);
                setTestResult(null);
              }}
              className={`p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? "bg-slate-800/80 border-cyan-500/50 shadow-lg shadow-cyan-500/10"
                  : "bg-[#0f172a]/60 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg border ${ch.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    ch.status?.enabled
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {ch.status?.enabled ? "ATIVO" : "INATIVO"}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white">{ch.name}</h4>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {ch.status?.endpoint || "Nenhum endpoint especificado"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Test Execution Console */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-cyan-400" />
              Disparador de Alerta Sintético de Teste
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Canal selecionado: <span className="text-cyan-300 font-semibold uppercase">{activeChannel}</span>
            </p>
          </div>
          <button
            onClick={handleSendTest}
            disabled={testing}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-cyan-600/20"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? "Despachando..." : `Disparar Teste via ${activeChannel.toUpperCase()}`}
          </button>
        </div>

        {/* Test Result */}
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
              {testResult.error && (
                <p className="text-xs mt-1 text-rose-300 font-mono bg-rose-950/40 p-2 rounded border border-rose-900/50">
                  {testResult.error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Form Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Destinatário Específico (Opcional)
            </label>
            <input
              type="text"
              placeholder={channelCards.find((c) => c.id === activeChannel)?.recipientPlaceholder}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Se deixado em branco, o sistema utilizará o destinatário padrão definido no .env.
            </span>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Severidade do Alerta de Teste</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="CRITICAL">CRITICAL (Incidente Crítico NOC)</option>
              <option value="DEGRADED">DEGRADED (Degradação de Desempenho)</option>
              <option value="RESOLVED">RESOLVED (Restabelecimento de Serviço)</option>
              <option value="INFO">INFO (Informativo de Auditoria)</option>
            </select>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Formatação e cores do payload variam de acordo com o nível de severidade.
            </span>
          </div>
        </div>

        {/* Security Alert Note */}
        <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg flex items-center gap-2.5 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Os despachos utilizam as classes de notificação nativas assíncronas do backend em memória (sem dual-write e sem subprocessos externos).
          </span>
        </div>
      </div>
    </div>
  );
};
