import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { deviceDetailApi } from "../../src/services/deviceDetailApi";
import { slaApi } from "../../src/services/slaApi";
import { incidentsApi } from "../../src/services/incidentsApi";
import { apiClient } from "../../src/services/apiClient";
import { ErrorState } from "../../src/components/common/ErrorState";
import { ErrorBoundary } from "../../src/components/common/ErrorBoundary";

vi.mock("../../src/services/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("Resiliência de Serviços e Propagação de Erros (Issue #280)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_ENABLE_MOCKS", "false");
  });

  describe("1. deviceDetailApi", () => {
    it("deve propagar erro de rede 500 em getDeviceInterfaces sem mascarar com mocks", async () => {
      const error500 = new Error("Request failed with status code 500");
      vi.mocked(apiClient.get).mockRejectedValueOnce(error500);

      await expect(deviceDetailApi.getDeviceInterfaces("dev-1")).rejects.toThrow(
        "Request failed with status code 500"
      );
      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/devices/dev-1/interfaces");
    });

    it("deve retornar interfaces da API em caso de sucesso 200", async () => {
      const mockApiData = [
        {
          id: "port-1",
          name: "TenGigE0/0/1",
          status: "UP",
          rx_power_dbm: -3.5,
          tx_power_dbm: -2.1,
          wavelength_nm: 1310,
          temperature_c: 42.0,
        },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockApiData);

      const result = await deviceDetailApi.getDeviceInterfaces("dev-1");
      expect(result).toEqual(mockApiData);
    });
  });

  describe("2. slaApi", () => {
    it("deve propagar erro 404 em listMaintenanceWindows sem mascarar com mocks", async () => {
      const error404 = new Error("Request failed with status code 404");
      vi.mocked(apiClient.get).mockRejectedValueOnce(error404);

      await expect(slaApi.listMaintenanceWindows()).rejects.toThrow(
        "Request failed with status code 404"
      );
      expect(apiClient.get).toHaveBeenCalledWith("/api/v1/maintenance-windows");
    });

    it("deve propagar erro de gateway em getMaintenanceKpiSummary", async () => {
      const error502 = new Error("Bad Gateway 502");
      vi.mocked(apiClient.get).mockRejectedValueOnce(error502);

      await expect(slaApi.getMaintenanceKpiSummary()).rejects.toThrow("Bad Gateway 502");
    });
  });

  describe("3. incidentsApi", () => {
    it("deve propagar erro de conexao em listIncidents quando mocks desabilitados", async () => {
      const netError = new Error("Network Error");
      vi.mocked(apiClient.get).mockRejectedValueOnce(netError);

      await expect(incidentsApi.listIncidents()).rejects.toThrow("Network Error");
    });

    it("deve propagar erro ao tentar reconhecer (acknowledge) com backend offline", async () => {
      const errorTimeout = new Error("Timeout ao comunicar com gateway");
      vi.mocked(apiClient.post).mockRejectedValueOnce(errorTimeout);

      await expect(incidentsApi.acknowledgeIncident("inc-1")).rejects.toThrow(
        "Timeout ao comunicar com gateway"
      );
    });

    it("deve propagar erro ao resolver incidente com backend offline", async () => {
      const error500 = new Error("Internal Server Error");
      vi.mocked(apiClient.post).mockRejectedValueOnce(error500);

      await expect(
        incidentsApi.resolveIncident("inc-1", {
          root_cause: "Causa raiz técnica válida com mais de vinte caracteres.",
        })
      ).rejects.toThrow("Internal Server Error");
    });
  });

  describe("4. Componentes Visuais de Erro (ErrorState & ErrorBoundary)", () => {
    it("deve renderizar componente ErrorState com titulo, mensagem e botao de retry", () => {
      const onRetryMock = vi.fn();
      render(
        <ErrorState
          title="Falha no Dashboard"
          message="Erro ao sincronizar com telemetria"
          onRetry={onRetryMock}
        />
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Falha no Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Erro ao sincronizar com telemetria")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /tentar novamente/i });
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it("deve renderizar ErrorState na variante inline corretamente", () => {
      render(
        <ErrorState
          message="Falha de conexão rápida"
          variant="inline"
        />
      );

      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("bg-red-950/20");
      expect(screen.getByText("Falha de conexão rápida")).toBeInTheDocument();
    });

    it("deve capturar erro em ErrorBoundary e renderizar ErrorState com recuperacao", () => {
      const ProblemComponent: React.FC = () => {
        throw new Error("Falha catastrófica de componente");
      };

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const onResetMock = vi.fn();
      render(
        <ErrorBoundary onReset={onResetMock}>
          <ProblemComponent />
        </ErrorBoundary>
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Falha na Comunicação")).toBeInTheDocument();
      expect(screen.getByText("Falha catastrófica de componente")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /tentar novamente/i });
      fireEvent.click(retryBtn);
      expect(onResetMock).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });
});
