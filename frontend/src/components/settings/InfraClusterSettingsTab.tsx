import React, { useState } from "react";
import { Database, Server, RefreshCw, Loader2, CheckCircle2, AlertCircle, HardDrive } from "lucide-react";
import { settingsApi } from "../../services/settingsApi";
import type { InfraTestResponse, IntegrationStatusItem } from "../../types/settings";

interface Props {
  postgresStatus?: IntegrationStatusItem;
  redisStatus?: IntegrationStatusItem;
  environment: string;
}

export const InfraClusterSettingsTab: React.FC<Props> = ({
  postgresStatus,
  redisStatus,
  environment,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<InfraTestResponse | null>(null);

  const handleTestInfra = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testInfra();
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        postgres_ok: false,
        postgres_latency_ms: 0,
        redis_ok: false,
        redis_latency_ms: 0,
        message: err instanceof Error ? err.message : "Falha ao consultar cluster",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Trigger */}
      <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Cluster Core (TimescaleDB & Redis Streams)</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                ENV: {environment.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Diagnóstico de latência de barramento e integridade do pool de conexões assíncrono.
            </p>
          </div>
        </div>

        <button
          onClick={handleTestInfra}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-indigo-600/20"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {testing ? "Medindo Latência..." : "Verificar Saúde do Cluster"}
        </button>
      </div>

      {/* Cluster Diagnostics Card */}
      {testResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            testResult.postgres_ok && testResult.redis_ok
              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
              : "bg-rose-950/20 border-rose-500/30 text-rose-200"
          }`}
        >
          {testResult.postgres_ok && testResult.redis_ok ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm">
            <span className="font-semibold">{testResult.message}</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="p-3 bg-black/40 rounded-lg border border-white/10 flex justify-between items-center">
                <span className="text-xs text-slate-300">TimescaleDB Ping (SELECT 1)</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    testResult.postgres_ok ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {testResult.postgres_ok ? `${testResult.postgres_latency_ms.toFixed(2)} ms` : "FALHA"}
                </span>
              </div>
              <div className="p-3 bg-black/40 rounded-lg border border-white/10 flex justify-between items-center">
                <span className="text-xs text-slate-300">Redis Ping (PING/PONG)</span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    testResult.redis_ok ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {testResult.redis_ok ? `${testResult.redis_latency_ms.toFixed(2)} ms` : "FALHA"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cluster Resource Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TimescaleDB Card */}
        <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              TimescaleDB / PostgreSQL 16
            </h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              ONLINE
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Endpoint / Host</span>
              <span className="text-slate-200 font-mono">{postgresStatus?.endpoint || "postgres:5432"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Banco de Dados Ativo</span>
              <span className="text-slate-200 font-mono">
                {typeof postgresStatus?.details?.database === "string" ? postgresStatus.details.database : "infrawatch"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Pool de Conexões</span>
              <span className="text-slate-200 font-mono">
                {typeof postgresStatus?.details?.pool_size === "number" ? postgresStatus.details.pool_size : 20} Conexões
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Extensão Hypertables</span>
              <span className="text-emerald-400 font-mono font-medium">Habilitada (timescaledb)</span>
            </div>
          </div>
        </div>

        {/* Redis Streams Card */}
        <div className="bg-[#0f172a]/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-rose-400" />
              Redis 7 (Streams & Cache)
            </h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              ONLINE
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Endpoint / Host</span>
              <span className="text-slate-200 font-mono">{redisStatus?.endpoint || "redis:6379"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Índice do Banco</span>
              <span className="text-slate-200 font-mono">
                DB {typeof redisStatus?.details?.db === "number" ? redisStatus.details.db : 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="text-slate-400">Topologia de Barramento</span>
              <span className="text-slate-200 font-mono">infrawatch:events:stream</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Persistência AOF / RDB</span>
              <span className="text-emerald-400 font-mono font-medium">Ativa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
