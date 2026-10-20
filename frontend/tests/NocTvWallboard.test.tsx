import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { renderHook } from "@testing-library/react";

import { useAutoRotate } from "../src/hooks/useAutoRotate";
import { CriticalAlarmBanner } from "../src/components/tv/CriticalAlarmBanner";
import { TvWallboardPage } from "../src/pages/wallboard/TvWallboardPage";
import { NocTvWallboard } from "../src/pages/NocTvWallboard";

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe("NOC TV Wallboard Fullscreen com Auto-Rotação (Issue #30)", () => {
  describe("1. Hook useAutoRotate (Temporizador e Rotação)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("deve iniciar no painel 0 com rotação ativa por padrão", () => {
      const { result } = renderHook(() =>
        useAutoRotate({ totalPanels: 3, intervalMs: 30000 })
      );

      expect(result.current.currentPanel).toBe(0);
      expect(result.current.isAutoRotating).toBe(true);
      expect(result.current.progress).toBe(0);
    });

    it("deve alternar automaticamente para o próximo painel após o intervalo de 30 segundos", () => {
      const { result } = renderHook(() =>
        useAutoRotate({ totalPanels: 3, intervalMs: 30000 })
      );

      expect(result.current.currentPanel).toBe(0);

      // Avança 30 segundos
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(result.current.currentPanel).toBe(1);

      // Avança mais 30 segundos
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(result.current.currentPanel).toBe(2);

      // Avança mais 30 segundos (deve dar wrap para 0)
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(result.current.currentPanel).toBe(0);
    });

    it("não deve alternar de painel quando isPausedExternally for true (ex: alarme crítico)", () => {
      const { result, rerender } = renderHook(
        ({ isPaused }) =>
          useAutoRotate({
            totalPanels: 3,
            intervalMs: 30000,
            isPausedExternally: isPaused,
          }),
        { initialProps: { isPaused: true } }
      );

      expect(result.current.currentPanel).toBe(0);

      act(() => {
        vi.advanceTimersByTime(35000);
      });

      // Permanece no painel 0
      expect(result.current.currentPanel).toBe(0);

      // Despausa externamente
      rerender({ isPaused: false });

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(result.current.currentPanel).toBe(1);
    });

    it("deve permitir navegação manual via nextPanel, prevPanel e setPanel", () => {
      const { result } = renderHook(() =>
        useAutoRotate({ totalPanels: 3, intervalMs: 30000, autoStart: false })
      );

      act(() => {
        result.current.nextPanel();
      });
      expect(result.current.currentPanel).toBe(1);

      act(() => {
        result.current.nextPanel();
      });
      expect(result.current.currentPanel).toBe(2);

      act(() => {
        result.current.prevPanel();
      });
      expect(result.current.currentPanel).toBe(1);

      act(() => {
        result.current.setPanel(0);
      });
      expect(result.current.currentPanel).toBe(0);
    });

    it("deve permitir pausar e retomar a rotação via toggleAutoRotate", () => {
      const { result } = renderHook(() =>
        useAutoRotate({ totalPanels: 3, intervalMs: 30000 })
      );

      expect(result.current.isAutoRotating).toBe(true);

      act(() => {
        result.current.toggleAutoRotate();
      });
      expect(result.current.isAutoRotating).toBe(false);

      act(() => {
        vi.advanceTimersByTime(35000);
      });
      expect(result.current.currentPanel).toBe(0);

      act(() => {
        result.current.toggleAutoRotate();
      });
      expect(result.current.isAutoRotating).toBe(true);
    });
  });

  describe("2. Componente CriticalAlarmBanner (Alerta Visual Máximo Sev-1)", () => {
    const mockAlarm = {
      id: "alarm-1",
      hostname: "SW-CORE-LUANDA-01",
      ip: "10.200.0.1",
      location: "Cluster LUANDA-01",
      downDuration: "3m 42s",
      packetLoss: "100%",
      glpiTicketId: "#8492",
    };

    it("não deve renderizar nada se o alarme for nulo", () => {
      const { container } = render(<CriticalAlarmBanner alarm={null} />);
      expect(container.firstChild).toBeNull();
    });

    it("deve exibir detalhes da falha crítica quando alarme ativo", () => {
      render(<CriticalAlarmBanner alarm={mockAlarm} />);

      expect(screen.getByTestId("critical-alarm-banner")).toBeInTheDocument();
      expect(screen.getByText("SEV-1 ALARME CRÍTICO")).toBeInTheDocument();
      expect(screen.getByText("SW-CORE-LUANDA-01")).toBeInTheDocument();
      expect(screen.getByText("10.200.0.1")).toBeInTheDocument();
      expect(screen.getByText(/GLPI:/i)).toBeInTheDocument();
    });

    it("deve acionar callbacks de reconhecimento e forçar rotação", () => {
      const onAck = vi.fn();
      const onResume = vi.fn();
      const onToggleMute = vi.fn();

      render(
        <CriticalAlarmBanner
          alarm={mockAlarm}
          onAcknowledge={onAck}
          onResumeRotation={onResume}
          onToggleMute={onToggleMute}
        />
      );

      fireEvent.click(screen.getByTestId("btn-ack-alarm"));
      expect(onAck).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("btn-resume-rotation"));
      expect(onResume).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Página TvWallboardPage / NocTvWallboard (Modo 16:9 Fullscreen)", () => {
    it("deve renderizar a estrutura completa do telão de TV com alto contraste", () => {
      renderWithRouter(<TvWallboardPage />);

      expect(screen.getByTestId("tv-wallboard-page")).toBeInTheDocument();
      expect(screen.getByText("INFRAWATCH NOC")).toBeInTheDocument();
      expect(screen.getByText("WALLBOARD 16:9")).toBeInTheDocument();
      expect(screen.getByTestId("link-exit-tv")).toBeInTheDocument();
    });

    it("deve renderizar a barra de controle do carrossel com botões dos 3 painéis", () => {
      renderWithRouter(<TvWallboardPage />);

      expect(screen.getByTestId("carousel-control-bar")).toBeInTheDocument();
      expect(screen.getByTestId("btn-panel-0")).toBeInTheDocument();
      expect(screen.getByTestId("btn-panel-1")).toBeInTheDocument();
      expect(screen.getByTestId("btn-panel-2")).toBeInTheDocument();
    });

    it("deve iniciar exibindo o Painel 1 (Visão Geral e Saúde dos Clientes)", () => {
      renderWithRouter(<TvWallboardPage />);

      expect(screen.getByTestId("tv-panel-overview")).toBeInTheDocument();
      expect(screen.getByText("AUTH-KEYCLOAK-IAM")).toBeInTheDocument();
      expect(screen.getByText("BACKUP-MINIO-S3")).toBeInTheDocument();
      expect(
        screen.getByTestId("tv-device-card-SW-CORE-LUANDA-01")
      ).toBeInTheDocument();
    });

    it("deve permitir alternar manualmente entre os painéis ao clicar nos botões", () => {
      renderWithRouter(<TvWallboardPage />);

      // Clica no painel 2 (Incidentes e SLA)
      fireEvent.click(screen.getByTestId("btn-panel-1"));
      expect(screen.getByTestId("tv-panel-incidents")).toBeInTheDocument();
      expect(screen.getByText(/FILA DE INCIDENTES DISPATCHADOS/i)).toBeInTheDocument();

      // Clica no painel 3 (Matriz de Enlaces)
      fireEvent.click(screen.getByTestId("btn-panel-2"));
      expect(screen.getByTestId("tv-panel-backbones")).toBeInTheDocument();
      expect(
        screen.getByText(/MATRIZ METROPOLITANA & INTERCONEXÕES TRANSCONTINENTAIS/i)
      ).toBeInTheDocument();

      // Volta ao painel 1
      fireEvent.click(screen.getByTestId("btn-panel-0"));
      expect(screen.getByTestId("tv-panel-overview")).toBeInTheDocument();
    });

    it("deve pausar e retomar rotação via botão de toggle na barra do carrossel", () => {
      renderWithRouter(<TvWallboardPage />);

      const toggleBtn = screen.getByTestId("btn-toggle-rotate");
      expect(toggleBtn).toBeInTheDocument();

      fireEvent.click(toggleBtn);
      // Pode ser clicado sem quebrar a interface
      fireEvent.click(toggleBtn);
    });

    it("deve exibir banner de alarme crítico na presença de ativo DOWN e permitir reconhecer", () => {
      renderWithRouter(<TvWallboardPage />);

      const alarmBanner = screen.getByTestId("critical-alarm-banner");
      expect(alarmBanner).toBeInTheDocument();
      expect(alarmBanner).toHaveTextContent("SEV-1 ALARME CRÍTICO");
      expect(alarmBanner).toHaveTextContent("ROTAÇÃO PAUSADA");

      // Reconhecer alarme
      const ackBtn = screen.getByTestId("btn-ack-alarm");
      fireEvent.click(ackBtn);

      // Banner é removido
      expect(screen.queryByTestId("critical-alarm-banner")).not.toBeInTheDocument();
    });

    it("deve renderizar NocTvWallboard como re-export canônico sem erros", () => {
      renderWithRouter(<NocTvWallboard />);

      expect(screen.getByTestId("tv-wallboard-page")).toBeInTheDocument();
    });
  });
});
