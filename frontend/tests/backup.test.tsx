import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { BackupRecoveryPage } from "../src/pages/backup/BackupRecoveryPage";
import { backupApi } from "../src/services/backupApi";

const { testItems, testMetrics, testStorage } = vi.hoisted(() => ({
  testItems: [
    {
      filename: "infrawatch_backup_2026-10-25_020000.tar.gz",
      size_bytes: 260714496,
      size_human: "248.6 MB",
      created_at: "2026-10-25T02:00:00Z",
      sha256: "9a8f4c21b8e734d0812f8e1a90f339b1a774c82b09ff8271923e110cf98e4d2a",
      storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-25_020000.tar.gz",
      targets: { local: "SUCCESS", gdrive: "SUCCESS", r2: "SUCCESS" } as const,
      trigger: "scheduled" as const,
      notes: "Rotina automática diária (Cron 02:00 UTC)",
    },
    {
      filename: "infrawatch_backup_2026-10-24_020000.tar.gz",
      size_bytes: 260714496,
      size_human: "247.1 MB",
      created_at: "2026-10-24T02:00:00Z",
      sha256: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
      storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-24_020000.tar.gz",
      targets: { local: "SUCCESS", gdrive: "FAILED", r2: "SKIPPED" } as const,
      trigger: "manual" as const,
      notes: "Disparo manual sob demanda",
    },
  ],
  testMetrics: {
    lastBackupAt: "2026-10-25T02:00:00Z",
    totalBackupsCount: 2,
    totalStorageUsed: "495.7 MB",
    rpoTargetMinutes: 15,
    rpoCurrentMinutes: 8,
    rtoTargetMinutes: 30,
    isCompliant: true,
  },
  testStorage: {
    local: {
      status: "ONLINE & SINCRONIZADO",
      path: "/var/backups/infrawatch/timescaledb",
      total_bytes: 53687091200,
      used_bytes: 4509715660,
      free_bytes: 49177375540,
      total_human: "50 GB",
      used_human: "4.2 GB",
      free_human: "45.8 GB",
      used_percent: 8.4,
      backups_size_bytes: 521428992,
      backups_size_human: "495.7 MB",
      retention_policy: "7 dias (FIFO)",
      io_latency: "0.4ms (Direct-DMA)",
    },
    gdrive: {
      status: "CONECTADO (OAUTH2)",
      configured: true,
      authorized: true,
      email: "daniel@infrawatch.ao",
      display_name: "Daniel Ndonda",
      remote_directory: "InfraWatch_Backups_Offsite/PROD",
      retention_policy: "30 dias históricos",
      total_bytes: 16106127360,
      used_bytes: 13743895347,
      free_bytes: 2362232013,
      total_human: "15 GB",
      used_human: "12.8 GB",
      free_human: "2.2 GB",
      used_percent: 85.3,
    },
    r2: {
      status: "ATIVO (ZERO EGRESS)",
      configured: true,
      authorized: true,
      bucket: "infrawatch-backup-luanda-dr",
      replication: "Multi-Região (Edge)",
      egress_fee: "$0.00 / Zero Egress",
      total_bytes: 10737418240,
      used_bytes: 6871947673,
      free_bytes: 3865470567,
      total_human: "10 GB",
      used_human: "6.4 GB",
      free_human: "3.6 GB",
      used_percent: 64.0,
    },
  },
}));

vi.mock("../src/services/backupApi", () => ({
  backupApi: {
    getBackupHistory: vi.fn().mockResolvedValue({
      items: testItems,
      total: testItems.length,
    }),
    getBackupMetrics: vi.fn().mockResolvedValue(testMetrics),
    getBackupStorage: vi.fn().mockResolvedValue(testStorage),
    getGDriveStatus: vi.fn().mockResolvedValue({
      configured: true,
      authorized: true,
      message: "OK",
    }),
    getGDriveAuthUrl: vi.fn().mockResolvedValue({
      auth_url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      state: "gdrive_backup",
    }),
    triggerBackup: vi.fn().mockResolvedValue({
      backup_id: "bck_test_123",
      status: "accepted",
      message: "Rotina de backup manual despachada para o contêiner isolado.",
      sse_url: "/api/v1/system/backup/events",
      triggered_at: "2026-10-25T04:00:00Z",
    }),
    subscribeBackupProgress: vi.fn(
      (onProgress, onComplete, _onError) => {
        onProgress({
          stage: "started",
          percent: 5,
          message: "Iniciando rotina de backup...",
        });
        onProgress({
          stage: "timescaledb",
          percent: 20,
          message: "Exportando catálogo TimescaleDB...",
        });
        onProgress({
          stage: "packaging",
          percent: 70,
          message: "Criando pacote consolidado e gerando checksum...",
        });
        const completedEvent = {
          stage: "completed" as const,
          percent: 100,
          message: "Backup concluído com sucesso!",
          filename: "infrawatch_backup_2026-10-25_040000.tar.gz",
          size_human: "250.0 MB",
          sha256: "aabbcc11223344556677889900aabbccddeeff112233445566778899aabbccdd",
        };
        onProgress(completedEvent);
        onComplete(completedEvent);
        return () => {};
      }
    ),
  },
}));

const renderWithProviders = (ui: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {ui}
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("Painel de Backup e Recuperação de Desastres — Issue #224 / ADR-032", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar o cabeçalho canônico, cards 3-2-1 e livro-razão", async () => {
    renderWithProviders(<BackupRecoveryPage />);

    expect(screen.getByTestId("backup-recovery-page")).toBeInTheDocument();
    expect(
      screen.getByText("Backup Automatizado & Recuperação de Desastres (ADR-032)")
    ).toBeInTheDocument();

    // Badges de Resiliência no Topo
    expect(screen.getByText("RPO:")).toBeInTheDocument();
    expect(screen.getByText("Cifra:")).toBeInTheDocument();
    expect(screen.getByText("WORM:")).toBeInTheDocument();

    // Topologia dos 3 Destinos
    await waitFor(() => {
      expect(screen.getByTestId("backup-destination-cards")).toBeInTheDocument();
      expect(screen.getByText("Destino 1: NVMe Host")).toBeInTheDocument();
      expect(screen.getByText("Destino 2: Google Drive")).toBeInTheDocument();
      expect(screen.getByText("Destino 3: Cloudflare R2")).toBeInTheDocument();
    });

    // Tabela do Livro-Razão com Coluna Snapshot / Arquivo
    await waitFor(() => {
      expect(screen.getByTestId("backup-history-table")).toBeInTheDocument();
      expect(
        screen.getByText("infrawatch_backup_2026-10-25_020000.tar.gz")
      ).toBeInTheDocument();
      expect(screen.getAllByText("248.6 MB").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("deve renderizar status verde para sucesso, vermelho para falha e cinza para não configurado na listagem", async () => {
    renderWithProviders(<BackupRecoveryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-history-table")).toBeInTheDocument();
      // Deve encontrar badges de sucesso (verde), falha (vermelho) e não configurado (cinza)
      expect(screen.getAllByTestId("dest-status-success").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId("dest-status-failed").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId("dest-status-skipped").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("deve disparar backup manual sob demanda via botão da Hero bar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupRecoveryPage />);

    const triggerBtn = screen.getByTestId("trigger-backup-button");
    await user.click(triggerBtn);

    expect(backupApi.triggerBackup).toHaveBeenCalled();

    // Modal de progresso deve abrir e exibir checklist
    await waitFor(() => {
      expect(screen.getByTestId("backup-progress-modal")).toBeInTheDocument();
      expect(screen.getByTestId("backup-progress-bar")).toBeInTheDocument();
    });

    // Fecha o modal após conclusão
    const closeBtn = screen.getByTestId("progress-modal-close-btn");
    await user.click(closeBtn);
  });

  it("deve copiar o hash SHA-256 para a área de transferência ao clicar no botão de cópia", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });

    renderWithProviders(<BackupRecoveryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("backup-history-table")).toBeInTheDocument();
    });

    const copyBtn = screen.getByLabelText(
      "Copiar hash do backup infrawatch_backup_2026-10-25_020000.tar.gz"
    );
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      "9a8f4c21b8e734d0812f8e1a90f339b1a774c82b09ff8271923e110cf98e4d2a"
    );
  });

  it("deve exibir botão vermelho de conexão quando Google Drive configurado mas não autorizado", async () => {
    vi.spyOn(backupApi, "getGDriveStatus").mockResolvedValueOnce({
      configured: true,
      authorized: false,
      message: "Aguardando autorização",
    });

    renderWithProviders(<BackupRecoveryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-gdrive-btn-connect")).toBeInTheDocument();
      expect(screen.getByText("Conectar Google Drive")).toBeInTheDocument();
    });
  });

  it("deve exibir botão cinza quando serviço não está configurado", async () => {
    vi.spyOn(backupApi, "getGDriveStatus").mockResolvedValueOnce({
      configured: false,
      authorized: false,
      message: "Não configurado",
    });

    renderWithProviders(<BackupRecoveryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("hero-gdrive-btn-unconfigured")).toBeInTheDocument();
    });
  });

  it("deve exibir destino como Não Configurado com valores e barra cinzas quando serviço externo não estiver conectado", async () => {
    vi.spyOn(backupApi, "getBackupStorage").mockResolvedValueOnce({
      local: testStorage.local,
      gdrive: {
        ...testStorage.gdrive,
        configured: false,
        authorized: false,
        status: "Não Configurado",
        remote_directory: "—",
        retention_policy: "—",
        total_human: "—",
        used_human: "—",
        free_human: "—",
        used_percent: 0,
      },
      r2: {
        ...testStorage.r2,
        configured: false,
        authorized: false,
        status: "Não Configurado",
        bucket: "—",
        replication: "—",
        egress_fee: "—",
        total_human: "—",
        used_human: "—",
        free_human: "—",
        used_percent: 0,
      },
    });

    renderWithProviders(<BackupRecoveryPage />);

    await waitFor(() => {
      const unconfBadges = screen.getAllByTestId("badge-service-not-configured");
      expect(unconfBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Não Configurado").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("deve renderizar o estado Skeleton enquanto carrega os dados", () => {
    renderWithProviders(<BackupRecoveryPage initialViewState="skeleton" />);

    expect(screen.getByTestId("backup-recovery-page")).toBeInTheDocument();
    expect(screen.getByTestId("hero-gdrive-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("hero-r2-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("backup-card-skeleton-1")).toBeInTheDocument();
    expect(screen.getAllByTestId("backup-row-skeleton").length).toBe(5);
    expect(screen.getByText("CARREGANDO SNAPSHOTS...")).toBeInTheDocument();
  });

  it("deve renderizar o estado Vazio quando não houver snapshots", async () => {
    vi.spyOn(backupApi, "getBackupHistory").mockResolvedValueOnce({
      items: [],
      total: 0,
    });

    renderWithProviders(<BackupRecoveryPage initialViewState="empty" />);

    await waitFor(() => {
      expect(
        screen.getByText("Nenhum snapshot encontrado para os filtros selecionados.")
      ).toBeInTheDocument();
    });
  });

  it("deve renderizar o estado RFC Error Banner quando ocorrer erro no carregamento", async () => {
    renderWithProviders(<BackupRecoveryPage initialViewState="error" />);

    expect(screen.getByTestId("rfc-error-banner")).toBeInTheDocument();
    expect(
      screen.getByText(/FALHA NO SUBSISTEMA DE BACKUP & RECUPERAÇÃO DE DESASTRES/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/RFC 5424 • ERR_STORAGE_CATALOG_UNREACHABLE/i)).toBeInTheDocument();
  });
});
