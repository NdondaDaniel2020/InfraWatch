import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { BackupRecoveryPage } from "../src/pages/backup/BackupRecoveryPage";
import { backupApi } from "../src/services/backupApi";
const { testItems, testMetrics } = vi.hoisted(() => ({
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
  ],
  testMetrics: {
    lastBackupAt: "2026-10-25T02:00:00Z",
    totalBackupsCount: 1,
    totalStorageUsed: "248.6 MB",
    rpoTargetMinutes: 15,
    rpoCurrentMinutes: 8,
    rtoTargetMinutes: 30,
    isCompliant: true,
  },
}));

vi.mock("../src/services/backupApi", () => ({
  backupApi: {
    getBackupHistory: vi.fn().mockResolvedValue({
      items: testItems,
      total: testItems.length,
    }),
    getBackupMetrics: vi.fn().mockResolvedValue(testMetrics),
    triggerBackup: vi.fn().mockResolvedValue({
      backup_id: "bck_test_123",
      status: "accepted",
      message: "Rotina de backup manual despachada para o contêiner isolado.",
      sse_url: "/api/v1/system/backup/events",
      triggered_at: "2026-10-25T04:00:00Z",
    }),
    subscribeBackupProgress: vi.fn(
      (onProgress, onComplete, _onError, _useSimulation) => {
        // Dispara sequência síncrona/imediata para o teste
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

describe("Painel de Backup e Recuperação de Desastres — Issue #224", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve renderizar o cabeçalho, métricas de RPO/RTO e tabela de histórico", async () => {
    renderWithProviders(<BackupRecoveryPage />);

    expect(screen.getByTestId("backup-recovery-page")).toBeInTheDocument();
    expect(
      screen.getByText("Backup & Recuperação de Desastres (Disaster Recovery)")
    ).toBeInTheDocument();
    expect(screen.getByText("DUAL-CLOUD ATIVO")).toBeInTheDocument();

    // Métricas Cards
    expect(screen.getByTestId("backup-metrics-cards")).toBeInTheDocument();
    expect(screen.getByText("RPO (OBJETIVO DE PONTO)")).toBeInTheDocument();
    expect(screen.getByText("RTO (TEMPO DE RESTAURAÇÃO)")).toBeInTheDocument();

    // Tabela de Histórico
    await waitFor(() => {
      expect(screen.getByTestId("backup-history-table")).toBeInTheDocument();
      expect(
        screen.getByText("infrawatch_backup_2026-10-25_020000.tar.gz")
      ).toBeInTheDocument();
      expect(screen.getAllByText("248.6 MB").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("deve alternar para os estados Skeleton, Empty e Error Boundary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupRecoveryPage />);

    const stateSelect = screen.getByLabelText("Simular Estado do Painel de Backup");

    // 1. Skeleton
    await user.selectOptions(stateSelect, "skeleton");
    expect(screen.getByTestId("backup-skeleton")).toBeInTheDocument();

    // 2. Empty
    await user.selectOptions(stateSelect, "empty");
    expect(screen.getByTestId("backup-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum Backup Encontrado")).toBeInTheDocument();

    // 3. Error
    await user.selectOptions(stateSelect, "error");
    expect(screen.getByTestId("backup-error")).toBeInTheDocument();
    expect(
      screen.getByText("Falha de Comunicação com Daemon de Backup")
    ).toBeInTheDocument();
  });

  it("deve abrir modal de confirmação prévia e despachar backup manual", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupRecoveryPage />);

    const triggerBtn = screen.getByTestId("backup-trigger-button");
    await user.click(triggerBtn);

    // Modal de confirmação aberto
    expect(screen.getByTestId("backup-confirm-modal")).toBeInTheDocument();
    expect(
      screen.getByText("Confirmação de Backup Sob Demanda")
    ).toBeInTheDocument();

    // Digita observações
    const notesInput = screen.getByLabelText(/Motivo \/ Observações/i);
    await user.type(notesInput, "Backup emergencial antes do patch");

    // Confirma
    const confirmBtn = screen.getByTestId("confirm-trigger-submit-btn");
    await user.click(confirmBtn);

    expect(backupApi.triggerBackup).toHaveBeenCalledWith(
      "Backup emergencial antes do patch"
    );
  });

  it("deve exibir progresso SSE no modal e atualizar a tabela com o novo snapshot", async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupRecoveryPage />);

    const triggerBtn = screen.getByTestId("backup-trigger-button");
    await user.click(triggerBtn);

    const confirmBtn = screen.getByTestId("confirm-trigger-submit-btn");
    await user.click(confirmBtn);

    // Modal de progresso deve estar aberto com checklist
    await waitFor(() => {
      expect(screen.getByTestId("backup-progress-modal")).toBeInTheDocument();
      expect(screen.getByTestId("backup-progress-bar")).toBeInTheDocument();
      expect(screen.getByTestId("stage-item-started")).toBeInTheDocument();
      expect(screen.getByTestId("stage-item-timescaledb")).toBeInTheDocument();
      expect(screen.getByTestId("stage-item-packaging")).toBeInTheDocument();
      expect(screen.getByTestId("stage-item-completed")).toBeInTheDocument();
    });

    // Conclusão com sucesso
    await waitFor(() => {
      expect(
        screen.getByText("Snapshot Consolidado e Replicado em Nuvem")
      ).toBeInTheDocument();
      expect(
        screen.getAllByText("infrawatch_backup_2026-10-25_040000.tar.gz").length
      ).toBeGreaterThanOrEqual(1);
    });

    // Fecha o modal
    const closeBtn = screen.getByTestId("progress-modal-close-btn");
    await user.click(closeBtn);

    // O novo snapshot deve aparecer na tabela
    expect(
      screen.getAllByText("infrawatch_backup_2026-10-25_040000.tar.gz").length
    ).toBeGreaterThanOrEqual(1);
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
});
