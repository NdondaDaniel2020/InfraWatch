import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupTriggerButton } from "../src/components/common/BackupTriggerButton";

describe("BackupTriggerButton Component", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("deve renderizar o botão 'Gerar Backup Manual' com ícone", () => {
    render(<BackupTriggerButton />);
    const button = screen.getByRole("button", { name: /gerar backup manual/i });
    expect(button).toBeInTheDocument();
  });

  it("deve abrir o modal com opções ao clicar no botão", async () => {
    const user = userEvent.setup();
    render(<BackupTriggerButton />);

    const button = screen.getByRole("button", { name: /gerar backup manual/i });
    await user.click(button);

    expect(screen.getByText("Gerar Backup Manual do Sistema")).toBeInTheDocument();
    expect(screen.getByText(/destinos em fan-out/i)).toBeInTheDocument();
    expect(screen.getByText(/ignorar envio para nuvem/i)).toBeInTheDocument();
    expect(screen.getByText(/modo simulação/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar backup agora/i })).toBeInTheDocument();
  });

  it("deve disparar POST /api/v1/system/backup e exibir sucesso com Task ID", async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();

    const mockResponse = {
      task_id: "backup_20261016_235500_test123",
      status: "accepted",
      message: "Backup disparado em segundo plano.",
      started_at: "2026-10-16T23:55:00Z",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => mockResponse,
    } as unknown as Response);

    render(<BackupTriggerButton onSuccess={handleSuccess} />);

    // Abrir modal
    await user.click(screen.getByRole("button", { name: /gerar backup manual/i }));

    // Confirmar disparo
    const confirmBtn = screen.getByRole("button", { name: /iniciar backup agora/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/pipeline de backup disparado em segundo plano!/i)).toBeInTheDocument();
      expect(screen.getByText(/Task ID: backup_20261016_235500_test123/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/system/backup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skip_remote: false, dry_run: false }),
      })
    );

    expect(handleSuccess).toHaveBeenCalledWith("backup_20261016_235500_test123");
  });

  it("deve exibir mensagem de erro se a API retornar 403 Forbidden", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Permissão insuficiente." }),
    } as unknown as Response);

    render(<BackupTriggerButton />);

    await user.click(screen.getByRole("button", { name: /gerar backup manual/i }));
    await user.click(screen.getByRole("button", { name: /iniciar backup agora/i }));

    await waitFor(() => {
      expect(screen.getByText(/acesso negado: requer privilégio super_admin/i)).toBeInTheDocument();
    });
  });
});
