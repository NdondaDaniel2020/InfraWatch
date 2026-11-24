import React, { useEffect, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import {
  Sliders,
  Ticket,
  Activity,
  Bell,
  Server,
  RefreshCw,
} from "lucide-react";
import { settingsApi } from "../../services/settingsApi";
import type { IntegrationStatusResponse } from "../../types/settings";
import { GlpiSettingsTab } from "../../components/settings/GlpiSettingsTab";
import { ZabbixSettingsTab } from "../../components/settings/ZabbixSettingsTab";
import { NotificationSettingsTab } from "../../components/settings/NotificationSettingsTab";
import { InfraClusterSettingsTab } from "../../components/settings/InfraClusterSettingsTab";
import { RfcErrorBanner } from "../../components/common";

type TabId = "glpi" | "zabbix" | "notifications" | "cluster";

const BreadcrumbLink: React.FC<{
  to: string;
  className?: string;
  children: React.ReactNode;
}> = ({ to, className, children }) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

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
      count: "Ativo",
      enabled: true,
    },
    {
      id: "cluster" as TabId,
      name: "Infra & Cluster",
      icon: Server,
      count: "Ativo",
      enabled: true,
    },
  ];

  return (
    <main
      data-testid="system-settings-page"
      role="main"
      className="p-4 md:p-6 flex flex-col gap-6 w-full text-slate-100 bg-obsidian-950 min-h-screen"
    >
      {/* 1. Header com Breadcrumb Institucional (Padrão Ouro Obsidian Dark) */}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono">
            <BreadcrumbLink to="/noc" className="text-slate-400 hover:text-slate-200 transition-colors">
              Cockpit NOC
            </BreadcrumbLink>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">
              Configurações do Sistema
            </span>
          </nav>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Central de Configurações do Sistema
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Diagnóstico in-process e validação em tempo real de integrações externas e recursos do cluster.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-obsidian-900 border border-obsidian-800 text-slate-300 font-mono text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>{statusData?.environment ? `ENV: ${statusData.environment.toUpperCase()}` : "DIAGNOSTIC ENGINE"}</span>
          </div>

          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-obsidian-850 hover:bg-obsidian-800 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-mono font-semibold transition border border-obsidian-800 cursor-pointer shadow-sm"
            title="Recarregar status de diagnóstico em tempo real"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
            Recarregar Status
          </button>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <RfcErrorBanner
          title="FALHA NA COMUNICAÇÃO COM O SUBSISTEMA DE INTEGRAÇÕES"
          rfcCode="RFC 5424 • ERR_INTEGRATION_GATEWAY_UNAVAILABLE"
          message={error}
          onRetry={fetchStatus}
          isRetrying={loading}
        />
      )}

      {/* Tabs Navigation com tamanhos perfeitamente equalizados mantendo a base */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-obsidian-800 gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-2 px-3 py-3 border-b-2 text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? "border-cyan-500 text-cyan-400 bg-cyan-500/5 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-obsidian-900/60"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0 ${
                  isActive
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-obsidian-850 text-slate-400 border border-obsidian-800"
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
        <div className="space-y-4" data-testid="settings-skeleton">
          <p className="sr-only">Consultando estado das integrações em memória...</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-48 bg-obsidian-800 rounded" />
                <div className="h-5 w-20 bg-obsidian-800 rounded-full" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-3 w-32 bg-obsidian-800/80 rounded" />
                <div className="h-9 w-full bg-obsidian-950 border border-obsidian-800 rounded-lg" />
                <div className="h-3 w-28 bg-obsidian-800/80 rounded pt-2" />
                <div className="h-9 w-full bg-obsidian-950 border border-obsidian-800 rounded-lg" />
              </div>
            </div>
            <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-40 bg-obsidian-800 rounded" />
                <div className="h-5 w-16 bg-obsidian-800 rounded-full" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-3 w-36 bg-obsidian-800/80 rounded" />
                <div className="h-9 w-full bg-obsidian-950 border border-obsidian-800 rounded-lg" />
                <div className="h-8 w-28 bg-obsidian-800 rounded mt-4" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {activeTab === "glpi" && (
            <GlpiSettingsTab statusItem={getIntegration("glpi")} onRefresh={fetchStatus} />
          )}
          {activeTab === "zabbix" && (
            <ZabbixSettingsTab statusItem={getIntegration("zabbix")} onRefresh={fetchStatus} />
          )}
          {activeTab === "notifications" && (
            <NotificationSettingsTab
              integrations={statusData?.integrations || []}
              onRefresh={fetchStatus}
            />
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
    </main>
  );
};
