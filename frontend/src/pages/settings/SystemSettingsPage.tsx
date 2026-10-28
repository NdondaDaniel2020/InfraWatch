import React, { useEffect, useState } from "react";
import { Sliders, Ticket, Activity, Bell, Server, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { settingsApi } from "../../services/settingsApi";
import type { IntegrationStatusResponse } from "../../types/settings";
import { GlpiSettingsTab } from "../../components/settings/GlpiSettingsTab";
import { ZabbixSettingsTab } from "../../components/settings/ZabbixSettingsTab";
import { NotificationSettingsTab } from "../../components/settings/NotificationSettingsTab";
import { InfraClusterSettingsTab } from "../../components/settings/InfraClusterSettingsTab";

type TabId = "glpi" | "zabbix" | "notifications" | "cluster";

export const SystemSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("glpi");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<IntegrationStatusResponse | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await settingsApi.getStatus();
      setStatusData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configurações do sistema");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getIntegration = (name: string) => {
    return statusData?.integrations.find((item) => item.name === name);
  };

  const tabs = [
    {
      id: "glpi" as TabId,
      name: "GLPI ITSM",
      icon: Ticket,
      count: getIntegration("glpi")?.enabled ? "Ativo" : "Inativo",
      enabled: getIntegration("glpi")?.enabled,
    },
    {
      id: "zabbix" as TabId,
      name: "Zabbix Server",
      icon: Activity,
      count: getIntegration("zabbix")?.enabled ? "Ativo" : "Inativo",
      enabled: getIntegration("zabbix")?.enabled,
    },
    {
      id: "notifications" as TabId,
      name: "Notificações",
      icon: Bell,
      count: "Multicanal",
      enabled: true,
    },
    {
      id: "cluster" as TabId,
      name: "Infra & Cluster",
      icon: Server,
      count: "Timescale/Redis",
      enabled: true,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Central de Configurações do Sistema</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Diagnóstico in-process e validação em tempo real de integrações externas e recursos do cluster.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium transition border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Recarregar Status
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-3 border-b-2 text-xs font-medium transition-all ${
                isActive
                  ? "border-cyan-500 text-cyan-400 bg-cyan-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isActive
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {loading && !statusData ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-xs">Consultando estado das integrações em memória...</p>
        </div>
      ) : (
        <div>
          {activeTab === "glpi" && <GlpiSettingsTab statusItem={getIntegration("glpi")} />}
          {activeTab === "zabbix" && <ZabbixSettingsTab statusItem={getIntegration("zabbix")} />}
          {activeTab === "notifications" && (
            <NotificationSettingsTab integrations={statusData?.integrations || []} />
          )}
          {activeTab === "cluster" && (
            <InfraClusterSettingsTab
              postgresStatus={getIntegration("postgres")}
              redisStatus={getIntegration("redis")}
              environment={statusData?.environment || "production"}
            />
          )}
        </div>
      )}
    </div>
  );
};
