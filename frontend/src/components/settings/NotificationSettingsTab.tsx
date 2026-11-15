import React, { useEffect, useState } from "react";
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Mail,
  Globe,
  ShieldCheck,
  Save,
  RotateCcw,
  Database,
  Terminal,
  Settings2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { settingsApi } from "../../services/settingsApi";
import type { IntegrationStatusItem, NotificationTestResponse } from "../../types/settings";

interface Props {
  integrations: IntegrationStatusItem[];
  onRefresh?: () => void | Promise<void>;
}

type ChannelType = "telegram" | "whatsapp" | "smtp" | "webhook";

export const NotificationSettingsTab: React.FC<Props> = ({ integrations, onRefresh }) => {
  const [activeChannel, setActiveChannel] = useState<ChannelType>("telegram");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testResult, setTestResult] = useState<NotificationTestResponse | null>(null);

  // Form states per channel
  // Telegram
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(true);

  // WhatsApp
  const [whatsappGatewayUrl, setWhatsappGatewayUrl] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappRecipient, setWhatsappRecipient] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  // SMTP
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpTls, setSmtpTls] = useState(true);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpRecipient, setSmtpRecipient] = useState("");
  const [smtpEnabled, setSmtpEnabled] = useState(true);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(true);

  const getStatus = (name: string): IntegrationStatusItem | undefined =>
    integrations.find((i) => i.name === name);

  const currentStatus = getStatus(activeChannel);
  const isDatabaseSource = currentStatus?.source === "database";

  // Sincroniza formulários quando o status ou canal ativo muda
  useEffect(() => {
    const tg = getStatus("telegram");
    if (tg) {
      setTelegramChatId((tg.details?.default_chat_id as string) || "");
      setTelegramEnabled(tg.enabled ?? true);
    }

    const wa = getStatus("whatsapp");
    if (wa) {
      setWhatsappGatewayUrl(wa.endpoint || (wa.details?.gateway_url as string) || "");
      setWhatsappRecipient((wa.details?.default_recipient as string) || "");
      setWhatsappEnabled(wa.enabled ?? true);
    }

    const smtp = getStatus("smtp");
    if (smtp) {
      setSmtpHost((smtp.details?.host as string) || "");
      setSmtpPort(String(smtp.details?.port || 587));
      setSmtpTls(Boolean(smtp.details?.tls ?? true));
      setSmtpFrom((smtp.details?.from_address as string) || "");
      setSmtpUser((smtp.details?.user as string) || "");
      setSmtpRecipient((smtp.details?.default_recipient as string) || "");
      setSmtpEnabled(smtp.enabled ?? true);
    }

    const wh = getStatus("webhook");
    if (wh) {
      setWebhookUrl(wh.endpoint || (wh.details?.url as string) || "");
      setWebhookEnabled(wh.enabled ?? true);
    }
  }, [integrations]);

  // Dispara o teste in-process utilizando os dados já configurados no banco/ambiente
  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testNotification({
        channel: activeChannel,
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(`Falha no teste: ${res.message}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Falha ao conectar e despachar alerta de teste";
      setTestResult({
        success: false,
        channel: activeChannel,
        latency_ms: 0,
        message: errMsg,
        error: String(err),
      });
      toast.error(errMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let payload: Record<string, unknown> = {};

      if (activeChannel === "telegram") {
        payload = {
          enabled: telegramEnabled,
          default_chat_id: telegramChatId.trim() || undefined,
        };
        if (telegramToken.trim()) {
          payload.bot_token = telegramToken.trim();
        }
      } else if (activeChannel === "whatsapp") {
        if (!whatsappGatewayUrl.trim()) {
          toast.error("A URL do Gateway WhatsApp é obrigatória.");
          setSaving(false);
          return;
        }
        payload = {
          gateway_url: whatsappGatewayUrl.trim(),
          enabled: whatsappEnabled,
          default_recipient: whatsappRecipient.trim() || undefined,
        };
        if (whatsappToken.trim()) {
          payload.api_token = whatsappToken.trim();
        }
      } else if (activeChannel === "smtp") {
        if (!smtpHost.trim()) {
          toast.error("O Host SMTP é obrigatório.");
          setSaving(false);
          return;
        }
        if (!smtpFrom.trim()) {
          toast.error("O E-mail Remetente é obrigatório.");
          setSaving(false);
          return;
        }
        payload = {
          host: smtpHost.trim(),
          port: Number(smtpPort) || 587,
          tls: smtpTls,
          from_address: smtpFrom.trim(),
          user: smtpUser.trim() || undefined,
          default_recipient: smtpRecipient.trim() || undefined,
          enabled: smtpEnabled,
        };
        if (smtpPassword.trim()) {
          payload.password = smtpPassword.trim();
        }
      } else if (activeChannel === "webhook") {
        if (!webhookUrl.trim()) {
          toast.error("A URL do Webhook é obrigatória.");
          setSaving(false);
          return;
        }
        payload = {
          url: webhookUrl.trim(),
          enabled: webhookEnabled,
        };
      }

      const res = await settingsApi.updateIntegration(activeChannel, payload);
      toast.success(res.message || `Configuração de ${activeChannel.toUpperCase()} salva no banco com sucesso!`);

      // Limpa os campos de senha por segurança
      setTelegramToken("");
      setWhatsappToken("");
      setSmtpPassword("");

      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "detail" in err
          ? String((err as { detail: unknown }).detail)
          : `Erro ao salvar configurações de ${activeChannel}`;
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetChannel = async () => {
    if (
      !window.confirm(
        `Deseja realmente remover os parâmetros de ${activeChannel.toUpperCase()} do banco de dados e restaurar o padrão do .env?`
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      const res = await settingsApi.resetIntegration(activeChannel);
      toast.success(res.message || `Configurações de ${activeChannel.toUpperCase()} restauradas para o padrão .env!`);
      setTelegramToken("");
      setWhatsappToken("");
      setSmtpPassword("");
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : `Erro ao restaurar configurações de ${activeChannel}`;
      toast.error(errMsg);
    } finally {
      setResetting(false);
    }
  };

  const channelCards = [
    {
      id: "telegram" as const,
      name: "Telegram Bot",
      icon: MessageSquare,
      color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
      status: getStatus("telegram"),
      title: "Telegram Bot (Alertas e Mensageria)",
      endpointLabel: "Destino / Chat ID",
    },
    {
      id: "whatsapp" as const,
      name: "WhatsApp Gateway",
      icon: MessageSquare,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      status: getStatus("whatsapp"),
      title: "WhatsApp Gateway (Evolution API)",
      endpointLabel: "Gateway Endpoint",
    },
    {
      id: "smtp" as const,
      name: "SMTP Server",
      icon: Mail,
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
      status: getStatus("smtp"),
      title: "Servidor SMTP (Alertas por E-mail)",
      endpointLabel: "Servidor Host",
    },
    {
      id: "webhook" as const,
      name: "Webhook REST",
      icon: Globe,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      status: getStatus("webhook"),
      title: "Webhook REST (Discord / Slack / Genérico)",
      endpointLabel: "URL de Destino",
    },
  ];

  const currentCard = channelCards.find((c) => c.id === activeChannel) || channelCards[0];
  const CurrentIcon = currentCard.icon;

  return (
    <div className="space-y-6">
      {/* Channels Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {channelCards.map((ch) => {
          const Icon = ch.icon;
          const isSelected = activeChannel === ch.id;
          const isDb = ch.status?.source === "database";
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
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                      ch.status?.enabled
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {ch.status?.enabled ? "ATIVO" : "INATIVO"}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono flex items-center gap-0.5 ${
                      isDb
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                        : "bg-slate-800/80 text-slate-400 border border-slate-700/50"
                    }`}
                    title={isDb ? "Configurado no Banco de Dados" : "Configurado via .env"}
                  >
                    {isDb ? <Database className="w-2.5 h-2.5" /> : <Terminal className="w-2.5 h-2.5" />}
                    {isDb ? "DB" : "ENV"}
                  </span>
                </div>
              </div>
              <h4 className="text-sm font-semibold text-white">{ch.name}</h4>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {ch.status?.endpoint || "Nenhum endpoint especificado"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Status Bar com Botão de Testar Conexão In-Process (Idêntico ao Zabbix e GLPI) */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-lg border ${currentCard.color}`}>
            <CurrentIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">{currentCard.title}</h3>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  currentStatus?.enabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {currentStatus?.enabled ? "ATIVO" : "DESABILITADO"}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
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
              {currentCard.endpointLabel}:{" "}
              <code className="text-slate-300 font-mono">
                {currentStatus?.endpoint ||
                  (currentStatus?.details?.default_chat_id as string) ||
                  "Nenhum destino especificado"}
              </code>
            </p>
          </div>
        </div>

        {/* Botão de Teste Direto com os Dados Já Configurados */}
        <button
          type="button"
          onClick={handleRunTest}
          disabled={testing || saving}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-cyan-600/20"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {testing ? "Executando Teste..." : `Testar ${activeChannel.toUpperCase()} In-Process`}
        </button>
      </div>

      {/* Test Execution Result Banner */}
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

      {/* Editor & Persistence Form Panel */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  Parâmetros de Conexão: <span className="text-cyan-400 uppercase">{activeChannel}</span>
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Altere os parâmetros e credenciais. Ao salvar, as configurações são gravadas no banco de dados e
                prevalecem sobre o .env.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDatabaseSource && (
              <button
                type="button"
                onClick={handleResetChannel}
                disabled={resetting || saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition border border-slate-700"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Restaurar Padrão (.env)
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveChannel}
              disabled={saving || resetting}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-lg shadow-cyan-600/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar Configuração"}
            </button>
          </div>
        </div>

        {/* Dynamic Channel Fields */}
        <form onSubmit={handleSaveChannel} className="space-y-4">
          {activeChannel === "telegram" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Telegram Bot Token <span className="text-slate-500 font-mono">(Segredo)</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={
                      currentStatus?.details?.bot_token_configured
                        ? "•••••••• (Token já configurado - deixe em branco para manter)"
                        : "Ex: 123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                    }
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    className="w-full px-3 py-2 pl-9 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Chat ID Padrão de Alertas</label>
                <input
                  type="text"
                  placeholder="Ex: -1001234567890 ou @meu_canal"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="telegram_enabled"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="telegram_enabled" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Habilitar envio de alertas via Telegram Bot
                </label>
              </div>
            </div>
          )}

          {activeChannel === "whatsapp" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Gateway URL (Evolution API / Baileys REST) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: http://localhost:8085/message/sendText/infrawatch"
                  value={whatsappGatewayUrl}
                  onChange={(e) => setWhatsappGatewayUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  API Key / Token de Autenticação <span className="text-slate-500 font-mono">(Segredo)</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={
                      currentStatus?.details?.api_token_configured
                        ? "•••••••• (Token já configurado - deixe em branco para manter)"
                        : "Ex: my_evolution_api_secret_token"
                    }
                    value={whatsappToken}
                    onChange={(e) => setWhatsappToken(e.target.value)}
                    className="w-full px-3 py-2 pl-9 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Destinatário Padrão (Telefone / JID)</label>
                <input
                  type="text"
                  placeholder="Ex: +244923456789 ou 12036304@g.us"
                  value={whatsappRecipient}
                  onChange={(e) => setWhatsappRecipient(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="whatsapp_enabled"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="whatsapp_enabled" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Habilitar envio de alertas via WhatsApp Gateway
                </label>
              </div>
            </div>
          )}

          {activeChannel === "smtp" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Servidor SMTP (Host) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: smtp.gmail.com ou mail.rcsangola.co.ao"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Porta SMTP</label>
                <input
                  type="number"
                  placeholder="587"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  E-mail Remetente (From) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="Ex: noc-alerts@rcsangola.co.ao"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Usuário SMTP</label>
                <input
                  type="text"
                  placeholder="Ex: noc-alerts@rcsangola.co.ao"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Senha SMTP <span className="text-slate-500 font-mono">(Segredo)</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={
                      currentStatus?.details?.password_configured
                        ? "•••••••• (Senha já configurada)"
                        : "Senha do servidor SMTP"
                    }
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full px-3 py-2 pl-9 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Destinatário Padrão de Alertas</label>
                <input
                  type="email"
                  placeholder="Ex: plantao-noc@rcsangola.co.ao"
                  value={smtpRecipient}
                  onChange={(e) => setSmtpRecipient(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpTls}
                    onChange={(e) => setSmtpTls(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                  />
                  Habilitar TLS (STARTTLS)
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpEnabled}
                    onChange={(e) => setSmtpEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                  />
                  Habilitar canal SMTP
                </label>
              </div>
            </div>
          )}

          {activeChannel === "webhook" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  URL de Destino do Webhook REST <span className="text-rose-400">*</span>
                </label>
                <input
                  type="url"
                  placeholder="Ex: https://discord.com/api/webhooks/... ou https://hooks.slack.com/services/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="webhook_enabled"
                  checked={webhookEnabled}
                  onChange={(e) => setWebhookEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="webhook_enabled" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Habilitar envio de alertas via Webhook REST
                </label>
              </div>
            </div>
          )}
        </form>

        {/* Security Note */}
        <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg flex items-center gap-2.5 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Os testes e despachos utilizam as classes de notificação nativas assíncronas do backend em memória (sem
            dual-write e sem subprocessos externos).
          </span>
        </div>
      </div>
    </div>
  );
};
