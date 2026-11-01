import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  HardDriveDownload,
  Database,
  CloudOff,
  Server,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  BackupHistoryItem,
  BackupMetricsSummary,
  BackupProgressEvent,
} from "../../types/backup";
import { backupApi } from "../../services/backupApi";
import { BackupTriggerButton } from "../../components/backup/BackupTriggerButton";
import { BackupProgressModal } from "../../components/backup/BackupProgressModal";
import { BackupHistoryTable } from "../../components/backup/BackupHistoryTable";
import { BackupMetricsCards } from "../../components/backup/BackupMetricsCards";

export type BackupPageStateSimulation = "nominal" | "skeleton" | "empty" | "error";

export interface BackupRecoveryPageProps {
  initialViewState?: BackupPageStateSimulation;
}

export const BackupRecoveryPage: React.FC<BackupRecoveryPageProps> = ({
  initialViewState = "nominal",
}) => {
  const [stateSimulation, setStateSimulation] =
    useState<BackupPageStateSimulation>(initialViewState);
  const [historyItems, setHistoryItems] = useState<BackupHistoryItem[]>([]);
  const [metrics, setMetrics] = useState<BackupMetricsSummary>({
    totalBackupsCount: 0,
    totalStorageUsed: "—",
  });
  const [isLoading, setIsLoading] = useState(true);

  // Estados de Execução de Backup em Tempo Real
  const [isRunning, setIsRunning] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProgressEvent, setCurrentProgressEvent] =
    useState<BackupProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Carrega histórico e métricas
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const historyRes = await backupApi.getBackupHistory();
      const metricsRes = await backupApi.getBackupMetrics();
      setHistoryItems(historyRes.items);
      setMetrics(metricsRes);
    } catch (err) {
      setStateSimulation("error");
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao carregar catálogo de backups do storage."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Disparo manual de backup
  const handleTriggerBackup = async (notes?: string) => {
    setIsRunning(true);
    setIsModalOpen(true);
    setIsCompleted(false);
    setProgressError(null);
    setCurrentProgressEvent({
      stage: "started",
      percent: 5,
      message: "Disparando comando de backup manual assíncrono...",
    });

    try {
      const response = await backupApi.triggerBackup(notes);
      toast.info(response.message);

      // Conecta ao stream SSE
      backupApi.subscribeBackupProgress(
        (event) => {
          setCurrentProgressEvent(event);
        },
        (finalEvent) => {
          setIsCompleted(true);
          setIsRunning(false);
          toast.success(
            `Backup finalizado com sucesso! Snapshot: ${finalEvent.filename || "novo snapshot"}`
          );

          // Atualiza lista localmente com o novo backup
          if (finalEvent.filename) {
            const newItem: BackupHistoryItem = {
              filename: finalEvent.filename,
              size_human: finalEvent.size_human ?? "N/D",
              created_at: new Date().toISOString(),
              sha256: finalEvent.sha256,
              trigger: "manual",
              notes: notes || "Disparo manual sob demanda",
            };
            setHistoryItems((prev) => [newItem, ...prev]);
          }
        },
        (err) => {
          setProgressError(err);
          setIsRunning(false);
          toast.error(`Falha no pipeline de backup: ${err}`);
        }
      );
    } catch (err) {
      setProgressError(String(err));
      setIsRunning(false);
      toast.error("Falha ao comunicar com a API de backup.");
    }
  };

  return (
    <div
      data-testid="backup-recovery-page"
      className="p-4 md:p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full"
    >
      {/* 1. Cabeçalho da Página e Seletor de Estados */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Link to="/noc" className="text-slate-400 hover:text-slate-200 transition-colors">
              Cockpit
            </Link>
            <span className="text-obsidian-700">/</span>
            <span className="text-slate-400">Governança &amp; Resiliência</span>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">Backup &amp; DR (ADR-032)</span>
          </div>
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>Backup &amp; Recuperação de Desastres (Disaster Recovery)</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              DUAL-CLOUD ATIVO
            </span>
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Gestão do ciclo de vida de backups de telemetria (TimescaleDB) e estado volátil (Redis).
            Criptografia AES-256 PBKDF2 em repouso e replicação contínua para Google Drive e Cloudflare R2 com retenção automatizada.
          </p>
        </div>

        {/* Ações de Topo */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <BackupTriggerButton
            isLoading={isLoading}
            isRunning={isRunning}
            onConfirmTrigger={handleTriggerBackup}
          />
        </div>
      </section>

      {/* ESTADO 1: SKELETON / CARREGANDO */}
      {stateSimulation === "skeleton" && (
        <div data-testid="backup-skeleton" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-obsidian-900 border border-obsidian-800/60 p-4 space-y-3 animate-pulse"
              >
                <div className="w-24 h-3 rounded bg-obsidian-800" />
                <div className="w-32 h-6 rounded bg-obsidian-850" />
              </div>
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-obsidian-900 border border-obsidian-800/60 p-6 animate-pulse" />
        </div>
      )}

      {/* ESTADO 2: ERRO DE COMUNICAÇÃO COM DAEMON */}
      {stateSimulation === "error" && (
        <div
          data-testid="backup-error"
          className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-center space-y-3"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <CloudOff className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-rose-400">
            Falha de Comunicação com Daemon de Backup
          </h2>
          <p className="text-xs text-slate-400 max-w-md font-mono">
            RFC 5424 Code: <span className="text-rose-300 font-bold">ERR_BACKUP_DAEMON_OFFLINE</span>
            <br />
            O contêiner isolado de backup ou a fila de mensagens Redis não responderam ao heartbeat.
          </p>
          <button
            type="button"
            onClick={() => {
              setStateSimulation("nominal");
              loadData();
            }}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-mono text-xs font-bold rounded-xl transition-colors"
          >
            Tentar Reconectar
          </button>
        </div>
      )}

      {/* ESTADO 3: VAZIO / SEM BACKUPS */}
      {stateSimulation === "empty" && (
        <div
          data-testid="backup-empty"
          className="p-12 rounded-2xl bg-obsidian-900 border border-obsidian-800 flex flex-col items-center justify-center text-center space-y-4 shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-obsidian-950 border border-obsidian-800 flex items-center justify-center text-slate-500">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white mb-1">Nenhum Backup Encontrado</h2>
            <p className="text-xs text-slate-400 max-w-md">
              O catálogo de backups locais e em nuvem ainda não possui snapshots consolidados.
              Dispare um backup manual ou aguarde a primeira janela agendada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleTriggerBackup("Backup inicial do sistema")}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-mono text-xs font-bold rounded-xl transition-colors flex items-center gap-2"
          >
            <HardDriveDownload className="w-4 h-4" />
            <span>Gerar Primeiro Backup</span>
          </button>
        </div>
      )}

      {/* ESTADO 4: NOMINAL (AO VIVO) */}
      {stateSimulation === "nominal" && (
        <>
          {/* 2. Cards de Métricas e Conformidade RPO/RTO */}
          <BackupMetricsCards metrics={metrics} />

          {/* 3. Banner Informativo de Resiliência e Compliance */}
          <section className="bg-obsidian-900/60 border border-obsidian-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0 mt-0.5">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <span className="font-mono text-xs font-bold text-white flex items-center gap-2">
                  <span>Criptografia Categórica AES-256 PBKDF2 &amp; Imutabilidade</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                    CONFORME BNA / INACOM
                  </span>
                </span>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Os snapshots locais e remotos são cifrados antes da transmissão usando chaves mestras
                  protegidas por Docker Secrets. Checksums SHA-256 auditáveis garantem que nenhuma alteração
                  ou corrupção de dados passe despercebida.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-obsidian-950 border border-obsidian-800 text-[11px] font-mono text-slate-300 flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span>Daemon:</span>
                <span className="text-emerald-400 font-bold">ONLINE (ISOLADO)</span>
              </div>
            </div>
          </section>

          {/* 4. Tabela de Histórico e Hashes */}
          <BackupHistoryTable
            items={historyItems}
            isLoading={isLoading}
            onRefresh={loadData}
          />
        </>
      )}

      {/* 5. Modal de Progresso em Tempo Real (SSE) */}
      <BackupProgressModal
        isOpen={isModalOpen}
        currentEvent={currentProgressEvent}
        isCompleted={isCompleted}
        error={progressError}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
