import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveIndicator } from "../src/components/common/LiveIndicator";
import { TelemetryProvider, useTelemetry } from "../src/context/TelemetryContext";
import { useSSE } from "../src/hooks/useSSE";

/**
 * Mock determinístico para simular EventSource nativo em testes.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSED
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  listeners: Record<string, ((ev: any) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (ev: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (ev: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  close() {
    this.readyState = 2;
  }

  // Métodos auxiliares para acionar eventos nos testes
  simulateOpen() {
    this.readyState = 1;
    const ev = new Event("open");
    if (this.onopen) {
      this.onopen(ev);
    }
    if (this.listeners["open"]) {
      this.listeners["open"].forEach((fn) => fn(ev));
    }
  }

  simulateMessage(data: any) {
    const rawData = typeof data === "string" ? data : JSON.stringify(data);
    const event = { data: rawData, type: "message" };
    if (this.onmessage) {
      this.onmessage(event);
    }
    if (this.listeners["message"]) {
      this.listeners["message"].forEach((fn) => fn(event));
    }
  }

  simulateEvent(type: string, data: any) {
    const rawData = typeof data === "string" ? data : JSON.stringify(data);
    const event = { data: rawData, type };
    if (this.listeners[type]) {
      this.listeners[type].forEach((fn) => fn(event));
    }
  }

  simulateError() {
    const ev = new Event("error");
    if (this.onerror) {
      this.onerror(ev);
    }
    if (this.listeners["error"]) {
      this.listeners["error"].forEach((fn) => fn(ev));
    }
  }
}

describe("Hook useSSE & Telemetry Infrastructure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("1. useSSE - Ciclo de Vida e Conexão", () => {
    it("deve inicializar com status 'connecting' e instanciar EventSource com URL correta", () => {
      const { result } = renderHook(() =>
        useSSE({ url: "/api/v1/events/stream", token: "jwt-token-123" })
      );

      expect(result.current.status).toBe("connecting");
      expect(result.current.isConnecting).toBe(true);
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe(
        "/api/v1/events/stream?token=jwt-token-123"
      );
    });

    it("deve transicionar para 'connected' quando EventSource abrir com sucesso", () => {
      const onOpenMock = vi.fn();
      const onStatusChangeMock = vi.fn();

      const { result } = renderHook(() =>
        useSSE({
          url: "/api/v1/events/stream",
          onOpen: onOpenMock,
          onStatusChange: onStatusChangeMock,
        })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.isConnected).toBe(true);
      expect(result.current.retryCount).toBe(0);
      expect(onOpenMock).toHaveBeenCalledTimes(1);
      expect(onStatusChangeMock).toHaveBeenCalledWith("connected");
    });

    it("deve processar mensagem de dados e adicionar ao buffer local", () => {
      const onMessageMock = vi.fn();
      const { result } = renderHook(() =>
        useSSE({ bufferLimit: 5, onMessage: onMessageMock })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });

      const samplePayload = {
        event_type: "DeviceLatencyMeasured",
        device_id: "sw-core-01",
        latency_ms: 3.5,
      };

      act(() => {
        MockEventSource.instances[0].simulateMessage(samplePayload);
      });

      expect(result.current.lastEvent).toEqual(samplePayload);
      expect(result.current.eventBuffer).toHaveLength(1);
      expect(result.current.eventBuffer[0]).toEqual(samplePayload);
      expect(onMessageMock).toHaveBeenCalledWith(samplePayload);
    });

    it("deve respeitar o bufferLimit mantendo apenas os eventos mais recentes", () => {
      const { result } = renderHook(() => useSSE({ bufferLimit: 3 }));

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });

      for (let i = 1; i <= 5; i++) {
        act(() => {
          MockEventSource.instances[0].simulateMessage({
            event_type: "Metric",
            seq: i,
          });
        });
      }

      expect(result.current.eventBuffer).toHaveLength(3);
      // Ordem circular: mais recente no índice 0
      expect(result.current.eventBuffer[0].seq).toBe(5);
      expect(result.current.eventBuffer[1].seq).toBe(4);
      expect(result.current.eventBuffer[2].seq).toBe(3);
    });

    it("deve ouvir eventos nomeados específicos via listeners registrados", () => {
      const latencyHandler = vi.fn();
      const { result } = renderHook(() =>
        useSSE({
          onEvent: {
            DeviceLatencyMeasured: latencyHandler,
          },
        })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });

      const latencyEvent = {
        event_type: "DeviceLatencyMeasured",
        device_id: "router-gw-01",
        latency_ms: 12.8,
      };

      act(() => {
        MockEventSource.instances[0].simulateEvent(
          "DeviceLatencyMeasured",
          latencyEvent
        );
      });

      expect(latencyHandler).toHaveBeenCalledWith(latencyEvent);
      expect(result.current.lastEvent).toEqual(latencyEvent);
    });
  });

  describe("2. useSSE - Reconexão com Backoff Exponencial e Watchdog", () => {
    it("deve transicionar para 'reconnecting' ao sofrer erro e tentar reconectar após backoff", () => {
      const onErrorMock = vi.fn();
      const onStatusChangeMock = vi.fn();

      const { result } = renderHook(() =>
        useSSE({
          initialBackoffMs: 1000,
          maxBackoffMs: 16000,
          backoffMultiplier: 2,
          onError: onErrorMock,
          onStatusChange: onStatusChangeMock,
        })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });
      expect(result.current.status).toBe("connected");

      // Simula queda de conexão
      act(() => {
        MockEventSource.instances[0].simulateError();
      });

      expect(result.current.status).toBe("reconnecting");
      expect(result.current.isReconnecting).toBe(true);
      expect(result.current.retryCount).toBe(1);
      expect(onErrorMock).toHaveBeenCalledTimes(1);

      // Avança o relógio simulado para passar o backoff inicial (1000ms + até 150ms jitter)
      act(() => {
        vi.advanceTimersByTime(1200);
      });

      // Segunda tentativa instanciada
      expect(MockEventSource.instances).toHaveLength(2);

      // Segunda tentativa falha novamente -> incrementa retryCount
      act(() => {
        MockEventSource.instances[1].simulateError();
      });

      expect(result.current.retryCount).toBe(2);

      // Avança mais 2200ms (2000ms backoff + jitter)
      act(() => {
        vi.advanceTimersByTime(2200);
      });

      // Terceira tentativa instanciada
      expect(MockEventSource.instances).toHaveLength(3);

      // Agora reconecta com sucesso
      act(() => {
        MockEventSource.instances[2].simulateOpen();
      });

      expect(result.current.status).toBe("connected");
      expect(result.current.retryCount).toBe(0);
    });

    it("deve detectar perda silenciosa de conexão via Heartbeat Watchdog", () => {
      const { result } = renderHook(() =>
        useSSE({
          heartbeatTimeoutMs: 10000, // 10 segundos
          initialBackoffMs: 1000,
        })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });
      expect(result.current.status).toBe("connected");

      // Avança tempo além do timeout sem nenhuma mensagem/ping (10s timeout + tick do setInterval)
      act(() => {
        vi.advanceTimersByTime(15500);
      });

      // Watchdog deve ter acionado reconexão
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.retryCount).toBe(1);
    });

    it("deve permitir disconnect() e reconnect() manuais", () => {
      const { result } = renderHook(() => useSSE());

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });
      expect(result.current.status).toBe("connected");

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status).toBe("disconnected");
      expect(result.current.isDisconnected).toBe(true);

      // Não deve reconectar automaticamente com timers quando desconectado manualmente
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(MockEventSource.instances).toHaveLength(1);

      // Reconnect manual
      act(() => {
        result.current.reconnect();
      });

      expect(result.current.status).toBe("connecting");
      expect(MockEventSource.instances).toHaveLength(2);
    });
  });

  describe("3. useSSE - Integração com TanStack Query", () => {
    it("deve atualizar o cache do TanStack Query cirurgicamente sem causar refetch", () => {
      const mockQueryClient = {
        setQueryData: vi.fn(),
      };

      renderHook(() =>
        useSSE({
          queryClient: mockQueryClient,
          updateQueryCache: true,
        })
      );

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });

      const latencyPayload = {
        event_type: "DeviceLatencyMeasured",
        device_id: "sw-edge-05",
        latency_ms: 1.8,
      };

      act(() => {
        MockEventSource.instances[0].simulateMessage(latencyPayload);
      });

      // Verifica se setQueryData foi chamado para o dispositivo e lista
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ["device", "sw-edge-05"],
        expect.any(Function)
      );
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ["devices"],
        expect.any(Function)
      );

      // Simula alarme disparado
      const alertPayload = {
        event_type: "AlarmTriggered",
        event_id: "alarm-99",
        severity: "CRITICAL",
      };

      act(() => {
        MockEventSource.instances[0].simulateMessage(alertPayload);
      });

      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ["alerts"],
        expect.any(Function)
      );
    });
  });

  describe("4. TelemetryContext & Provedor Global", () => {
    it("deve disponibilizar dados agregados de dispositivos e alertas", () => {
      const TestConsumer = () => {
        const telemetry = useTelemetry();
        return (
          <div>
            <span data-testid="status">{telemetry.status}</span>
            <span data-testid="alerts-count">{telemetry.activeAlertsCount}</span>
            <span data-testid="device-latency">
              {telemetry.deviceMetrics["rtr-01"]?.latency_ms ?? "none"}
            </span>
          </div>
        );
      };

      render(
        <TelemetryProvider>
          <TestConsumer />
        </TelemetryProvider>
      );

      expect(screen.getByTestId("status")).toHaveTextContent("connecting");

      act(() => {
        MockEventSource.instances[0].simulateOpen();
      });
      expect(screen.getByTestId("status")).toHaveTextContent("connected");

      // Emite métrica de dispositivo
      act(() => {
        MockEventSource.instances[0].simulateMessage({
          event_type: "DeviceLatencyMeasured",
          device_id: "rtr-01",
          latency_ms: 8.4,
        });
      });

      expect(screen.getByTestId("device-latency")).toHaveTextContent("8.4");

      // Emite alerta
      act(() => {
        MockEventSource.instances[0].simulateMessage({
          event_type: "AlarmTriggered",
          event_id: "alt-01",
          title: "Link BGP Down",
        });
      });

      expect(screen.getByTestId("alerts-count")).toHaveTextContent("1");

      // Resolve o alerta
      act(() => {
        MockEventSource.instances[0].simulateMessage({
          event_type: "AlarmResolved",
          event_id: "alt-01",
        });
      });

      expect(screen.getByTestId("alerts-count")).toHaveTextContent("0");
    });
  });

  describe("5. Componente LiveIndicator", () => {
    it("deve renderizar estado 'Ao Vivo' em verde quando conectado", () => {
      render(
        <LiveIndicator
          status="connected"
          lastHeartbeatAt={new Date("2026-10-10T12:00:00Z")}
        />
      );

      expect(screen.getByText("Ao Vivo")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveAttribute(
        "aria-label",
        "Conexão de telemetria em tempo real ativa"
      );
    });

    it("deve sinalizar em amarelo 'Reconectando...' com contagem de retentativas durante queda de rede", () => {
      render(<LiveIndicator status="reconnecting" retryCount={3} />);

      expect(screen.getByText("Reconectando... (#3)")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveAttribute(
        "aria-label",
        "Conexão instável, tentando reconectar tentativa 3"
      );
    });

    it("deve renderizar botão de 'Reconectar' quando desconectado", () => {
      const reconnectSpy = vi.fn();
      render(
        <LiveIndicator status="disconnected" onReconnect={reconnectSpy} />
      );

      expect(screen.getByText("Desconectado")).toBeInTheDocument();
      const reconnectBtn = screen.getByRole("button", { name: /reconectar/i });
      expect(reconnectBtn).toBeInTheDocument();

      fireEvent.click(reconnectBtn);
      expect(reconnectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
