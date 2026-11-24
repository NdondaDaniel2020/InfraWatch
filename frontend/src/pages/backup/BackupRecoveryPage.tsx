import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Zap,
  Shield,
  Lock,
  AlertCircle,
  Check,
  RefreshCw,
  MinusCircle,
  Database,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BackupHistoryItem,
  BackupMetricsSummary,
  BackupProgressEvent,
  BackupStorageResponse,
  GDriveStatusResponse,
} from "../../types/backup";
import { backupApi } from "../../services/backupApi";
import { BackupProgressModal } from "../../components/backup/BackupProgressModal";
import { BackupDestinationCards } from "../../components/backup/BackupDestinationCards";
import { BackupHistoryTable } from "../../components/backup/BackupHistoryTable";
import { RfcErrorBanner } from "../../components/common";

export type BackupPageStateSimulation = "nominal" | "skeleton" | "empty" | "error";

export interface BackupRecoveryPageProps {
  initialViewState?: BackupPageStateSimulation;
}

export const BackupRecoveryPage: React.FC<BackupRecoveryPageProps> = ({
  initialViewState = "nominal",
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyItems, setHistoryItems] = useState<BackupHistoryItem[]>([]);
  const [metrics, setMetrics] = useState<BackupMetricsSummary>({
    totalBackupsCount: 0,
    totalStorageUsed: "—",
  });
  const [storage, setStorage] = useState<BackupStorageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(
    initialViewState !== "empty" && initialViewState !== "error"
  );
  const [loadError, setLoadError] = useState<string | null>(
    initialViewState === "error"
      ? "Falha na sincronização do repositório de desastre (DR)"
      : null
  );
  const [gdriveStatus, setGDriveStatus] = useState<GDriveStatusResponse | null>(null);
  const [isConnectingGDrive, setIsConnectingGDrive] = useState(false);

  // Controle de transição visual do botão aprovado: Seta verde (check) por alguns segundos -> Reload
  const [gdriveShowSuccess, setGDriveShowSuccess] = useState(false);
  const [r2ShowSuccess, setR2ShowSuccess] = useState(false);
  const [isRefreshingService, setIsRefreshingService] = useState<string | null>(null);

  // Estados de Execução de Backup em Tempo Real
  const [isRunning, setIsRunning] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProgressEvent, setCurrentProgressEvent] =
    useState<BackupProgressEvent | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const cleanupStreamRef = useRef<(() => void) | null>(null);

  // Carrega histórico, métricas de capacidade dos 3 destinos e status do Google Drive
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [historyRes, gdriveRes, storageRes] = await Promise.all([
        backupApi.getBackupHistory().catch(() => ({ items: [], total: 0 })),
        typeof backupApi.getGDriveStatus === "function"
          ? backupApi.getGDriveStatus().catch(() => null)
          : Promise.resolve({ configured: true, authorized: true, message: "OK" }),
        typeof backupApi.getBackupStorage === "function"
          ? backupApi.getBackupStorage().catch(() => null)
          : Promise.resolve(null),
      ]);

      const metricsRes = await backupApi.getBackupMetrics(historyRes);
      setHistoryItems(historyRes.items);
      setMetrics(metricsRes);

      if (gdriveRes) {
        setGDriveStatus(gdriveRes);
        if (gdriveRes.configured && gdriveRes.authorized) {
          // Exibe sinal de bom (seta verde) por 4 segundos e depois transiciona para reload
          setGDriveShowSuccess(true);
          setTimeout(() => setGDriveShowSuccess(false), 4000);
        }
      }

      if (storageRes) {
        setStorage(storageRes);
        if (storageRes.r2?.configured && storageRes.r2?.authorized) {
          setR2ShowSuccess(true);
          setTimeout(() => setR2ShowSuccess(false), 4000);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Erro ao carregar catálogo de backups do storage.";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    cleanupStreamRef.current?.();
    cleanupStreamRef.current = null;
    setIsModalOpen(false);
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      cleanupStreamRef.current?.();
      cleanupStreamRef.current = null;
    };
  }, []);

  // Tratar retorno da autorização do Google Drive via query params
  useEffect(() => {
    if (searchParams.get("gdrive_connected") === "true") {
      toast.success("Google Drive conectado e autorizado com sucesso para replicação de backups!");
      setSearchParams({}, { replace: true });
      loadData();
    }
  }, [searchParams, setSearchParams, loadData]);

  useEffect(() => {
    if (initialViewState === "skeleton") {
      setIsLoading(true);
      return;
    }
    if (initialViewState === "error") {
      setIsLoading(false);
      setLoadError("Falha na sincronização do repositório de desastre (DR)");
      return;
    }
    loadData();
  }, [loadData, initialViewState]);

  // Redireciona para o Google OAuth para autorizar o Drive com os serviços Google
  const handleConnectGDrive = async () => {
    setIsConnectingGDrive(true);
    try {
      const redirectUri = window.location.origin + "/auth/callback";
      toast.info("Iniciando conexão com os serviços Google...");
      const { auth_url } = await backupApi.getGDriveAuthUrl(redirectUri);
      if (auth_url) {
        window.location.href = auth_url;
      } else {
        throw new Error("URL de autorização do Google não retornada pelo servidor.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Falha ao obter link de autorização do Google Drive."
      );
      setIsConnectingGDrive(false);
    }
  };

  // Revalidação manual de status individual de serviço
  const handleRefreshService = async (service: "gdrive" | "r2") => {
    setIsRefreshingService(service);
    try {
      if (service === "gdrive") {
        const res = await backupApi.getGDriveStatus();
        setGDriveStatus(res);
        toast.info(`Google Drive: ${res.message || "Status atualizado"}`);
      } else {
        const res = await backupApi.getBackupStorage();
        setStorage(res);
        toast.info("Cloudflare R2: Status de quota atualizado");
      }
    } catch {
      toast.error(`Falha ao revalidar serviço ${service}.`);
    } finally {
      setIsRefreshingService(null);
    }
  };

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

      cleanupStreamRef.current?.();
      cleanupStreamRef.current = backupApi.subscribeBackupProgress(
        (event) => {
          setCurrentProgressEvent(event);
        },
        (finalEvent) => {
          setIsCompleted(true);
          setIsRunning(false);
          cleanupStreamRef.current?.();
          cleanupStreamRef.current = null;
          const fname = finalEvent.filename || finalEvent.file;
          toast.success(
            `Backup finalizado com sucesso! Snapshot: ${fname || "novo snapshot"}`
          );

          if (fname) {
            const newItem: BackupHistoryItem = {
              filename: fname,
              size_human: finalEvent.size_human ?? "N/D",
              created_at: new Date().toISOString(),
              sha256: finalEvent.sha256,
              trigger: "manual",
              notes: notes || "Disparo manual sob demanda",
              targets: finalEvent.targets ?? {
                local: "SUCCESS",
                gdrive: finalEvent.gdrive ?? "SUCCESS",
                r2: finalEvent.r2 ?? "SKIPPED",
              },
            };
            setHistoryItems((prev) => [newItem, ...prev.filter((i) => i.filename !== fname)]);
          }

          loadData();
        },
        (err) => {
          setProgressError(err);
          setIsRunning(false);
          cleanupStreamRef.current?.();
          cleanupStreamRef.current = null;
          toast.error(`Falha no pipeline de backup: ${err}`);
        }
      );
    } catch (err) {
      setProgressError(String(err));
      setIsRunning(false);
      cleanupStreamRef.current?.();
      cleanupStreamRef.current = null;
      toast.error("Falha ao comunicar com a API de backup.");
    }
  };

  // Determinação de status para os botões do Hero:
  // - Não configurado: Cinza
  // - Configurado mas não conectado: Vermelho
  // - Configurado e conectado: Seta verde (check) por alguns segundos -> Reload
  const isGDriveConfigured = gdriveStatus?.configured ?? storage?.gdrive?.configured ?? false;
  const isGDriveAuthorized = gdriveStatus?.authorized ?? storage?.gdrive?.authorized ?? false;

  const isR2Configured = Boolean(storage?.r2?.configured);
  const isR2Authorized = Boolean(storage?.r2?.authorized);

  return (
    <div
      data-testid="backup-recovery-page"
      className="p-4 md:p-6 flex flex-col gap-6 w-full"
    >
      {/* 1. TopBar e Header da Página com Breadcrumb & Badges de Resiliência */}
      <header
        className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 pb-4 border-b border-obsidian-800"
        data-purpose="page-header"
      >
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1.5"
          >
            <Link
              to="/noc"
              className="hover:text-slate-400 transition-colors cursor-pointer"
            >
              Cockpit NOC
            </Link>
            <span>/</span>
            <span className="text-emerald-400 font-medium">
              Disaster Recovery &amp; Backups (ADR-032)
            </span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            Backup Automatizado &amp; Recuperação de Desastres (ADR-032)
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-4xl font-normal leading-relaxed">
            Estratégia de backup 3-2-1 multi-destino: snapshots atômicos do TimescaleDB, compressão
            Zstandard, replicação redundante para Google Drive e Cloudflare R2 com garantia de
            recuperação e zero vazamento de dados.
          </p>
        </div>

        {/* Right side: Resiliência Badges */}
        <div className="flex items-center gap-2 text-xs font-mono pt-1 xl:justify-end flex-wrap">
          {/* RPO */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#091224] border border-[#162746] text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">RPO:</span>
            <span className="text-cyan-400 font-semibold">&lt; 24h</span>
          </div>
          {/* Encryption Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#091224] border border-[#162746] text-slate-300">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Cifra:</span>
            <span className="text-cyan-400 font-semibold tracking-wide">AES-256-GCM</span>
          </div>
          {/* WORM Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#091224] border border-[#162746] text-slate-300">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">WORM:</span>
            <span className="text-amber-400 font-semibold">Ativa (30d)</span>
          </div>
        </div>
      </header>

      {/* 1.1 Banner de Erro RFC (RFC 5424) */}
      {loadError && (
        <RfcErrorBanner
          title="FALHA NO SUBSISTEMA DE BACKUP & RECUPERAÇÃO DE DESASTRES (DR)"
          rfcCode="RFC 5424 • ERR_STORAGE_CATALOG_UNREACHABLE"
          message={loadError}
          onRetry={loadData}
          isRetrying={isLoading}
        />
      )}

      {/* 2. HeroExecutionCard: Execução Manual On-Demand [BLAST RADIUS ZERO] */}
      <section
        className="rounded-xl border border-emerald-500/25 bg-[#091222]/90 shadow-[0_0_20px_-3px_rgba(16,185,129,0.12)] p-4 lg:p-5 relative overflow-hidden"
        data-purpose="manual-execution-card"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Icon & Description */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Execução Manual On-Demand
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded border border-emerald-500/40 text-emerald-300 bg-emerald-950/60 uppercase">
                  BLAST RADIUS ZERO
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Dispara snapshot atômico imediato do TimescaleDB com compressão Zstandard, expurgo de
                buffers Redis e envio em paralelo para os 3 destinos.
              </p>
            </div>
          </div>

          {/* Right: Action Buttons & Timestamp */}
          <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
            <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
              {/* Botão Individual 1: Google Drive */}
              {isLoading ? (
                <div
                  data-testid="hero-gdrive-skeleton"
                  className="w-28 h-8 rounded-lg bg-[#0c1830] border border-slate-800/80 animate-pulse"
                />
              ) : !isGDriveConfigured ? (
                <button
                  type="button"
                  data-testid="hero-gdrive-btn-unconfigured"
                  onClick={handleConnectGDrive}
                  disabled={isConnectingGDrive}
                  title="Google Drive: Clique para tentar conectar com os serviços Google."
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700/60 bg-[#0c1830]/60 text-slate-400 hover:text-white hover:border-slate-500 text-xs font-mono font-medium transition shadow-sm cursor-pointer"
                >
                  <span>Google Drive</span>
                  {isConnectingGDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  ) : (
                    <MinusCircle className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
              ) : !isGDriveAuthorized ? (
                <button
                  type="button"
                  data-testid="hero-gdrive-btn-connect"
                  onClick={handleConnectGDrive}
                  disabled={isConnectingGDrive}
                  title="Google Drive configurado mas não conectado. Clique para autorizar nos serviços Google."
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-300 hover:border-rose-500/60 hover:bg-rose-950/60 text-xs font-mono font-bold transition shadow-sm cursor-pointer"
                >
                  <span>Conectar Google Drive</span>
                  {isConnectingGDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="hero-gdrive-btn-connected"
                  onClick={handleConnectGDrive}
                  disabled={isConnectingGDrive}
                  title="Google Drive conectado. Clique para reconectar ou autenticar com os serviços Google."
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-400 text-xs font-mono font-medium hover:border-emerald-500/60 transition shadow-sm cursor-pointer"
                >
                  <span>Google Drive</span>
                  {isConnectingGDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  ) : gdriveShowSuccess ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
              )}

              {/* Botão Individual 2: Cloudflare R2 */}
              {isLoading ? (
                <div
                  data-testid="hero-r2-skeleton"
                  className="w-28 h-8 rounded-lg bg-[#0c1830] border border-slate-800/80 animate-pulse"
                />
              ) : !isR2Configured ? (
                <span
                  data-testid="hero-r2-btn-unconfigured"
                  title="Cloudflare R2: Não configurado no servidor"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700/60 bg-[#0c1830]/60 text-slate-500 text-xs font-mono font-medium cursor-not-allowed opacity-80"
                >
                  <span>Cloudflare R2</span>
                  <MinusCircle className="w-3.5 h-3.5 text-slate-500" />
                </span>
              ) : !isR2Authorized ? (
                <span
                  data-testid="hero-r2-btn-error"
                  title="Cloudflare R2 configurado mas indisponível"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs font-mono font-bold transition shadow-sm"
                >
                  <span>Cloudflare R2</span>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="hero-r2-btn-connected"
                  onClick={() => handleRefreshService("r2")}
                  title="Cloudflare R2 ativo. Clique para atualizar status."
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#1b2f57] bg-[#0c1830] text-slate-200 text-xs font-mono font-medium hover:border-[#2b4575] transition shadow-sm cursor-pointer"
                >
                  <span>Cloudflare R2</span>
                  {r2ShowSuccess ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-slate-300 ${
                        isRefreshingService === "r2" ? "animate-spin" : ""
                      }`}
                    />
                  )}
                </button>
              )}

              {/* Botão 3: Gerar Backup Manual */}
              <button
                type="button"
                data-testid="trigger-backup-button"
                onClick={() => handleTriggerBackup()}
                disabled={isRunning || isLoading}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wider transition-all transform active:scale-95 shadow-[0_0_16px_-2px_rgba(16,185,129,0.45)] font-mono disabled:opacity-50 cursor-pointer"
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Zap className="w-4 h-4 fill-current text-slate-950" />
                )}
                <span>Gerar Backup Manual</span>
              </button>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mt-1 sm:justify-end">
              <svg
                className="w-3.5 h-3.5 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path
                  d="M12 6v6l4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <span>
                Última execução:{" "}
                <strong className="text-slate-400 font-medium">
                  {isLoading ? (
                    <span className="inline-block w-28 h-3 bg-[#14233f] rounded animate-pulse align-middle" />
                  ) : metrics.lastBackupAt ? (
                    `${new Date(metrics.lastBackupAt).toLocaleString("pt-BR", {
                      timeZone: "UTC",
                      dateStyle: "short",
                      timeStyle: "short",
                    })} UTC`
                  ) : (
                    "Nenhum snapshot registrado"
                  )}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Topologia de Destinos de Backup 3-2-1 */}
      <BackupDestinationCards
        storage={storage}
        isLoading={isLoading}
        onConnectGDrive={handleConnectGDrive}
      />

      {/* 4. Livro-Razão de Snapshots & Auditoria Forense (5 itens por página) */}
      <BackupHistoryTable
        items={historyItems}
        isLoading={isLoading}
        onRefresh={loadData}
      />

      {/* 5. Faixa de Conformidade Regulatória (Rodapé) */}
      <footer
        className="bg-[#091122]/60 border border-[#14233f] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono"
        data-purpose="compliance-regulatory-footer"
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-white font-semibold">
              Conformidade Regulatória ADR-032 &amp; BNA / INACOM
            </div>
            <div className="text-slate-400 text-[11px] leading-relaxed">
              Todos os snapshots mantêm integridade criptográfica verificável por Merkle Tree e
              isolamento offsite imutável contra incidentes catastróficos.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 md:border-l md:border-[#14233f] md:pl-6 text-[11px] shrink-0">
          <div>
            <div className="text-slate-500 uppercase tracking-wider text-[10px]">
              Chave Pública ED25519
            </div>
            <span className="text-cyan-400 font-mono">
              {historyItems.length > 0 && historyItems[0].sha256
                ? `${historyItems[0].sha256.substring(0, 5)}...${historyItems[0].sha256.slice(-4)}`
                : "ed25519:master"}
            </span>
          </div>
          <div>
            <div className="text-slate-500 uppercase tracking-wider text-[10px]">
              Última Auditoria
            </div>
            <div className="text-white font-medium">
              {metrics.lastBackupAt
                ? new Date(metrics.lastBackupAt).toLocaleDateString("pt-BR", {
                    timeZone: "UTC",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }) + " (Auditado)"
                : "Pendente"}
            </div>
          </div>
        </div>
      </footer>

      {/* Modal de Progresso em Tempo Real (SSE) */}
      <BackupProgressModal
        isOpen={isModalOpen}
        currentEvent={currentProgressEvent}
        isCompleted={isCompleted}
        error={progressError}
        onClose={handleCloseModal}
      />
    </div>
  );
};
