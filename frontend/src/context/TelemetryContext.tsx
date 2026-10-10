import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSSE } from "../hooks/useSSE";
import type {
  SSEConnectionStatus,
  SSEEventPayload,
} from "../types/sse";

export interface DeviceTelemetryMetric {
  device_id: string;
  latency_ms?: number;
  status?: string;
  previous_status?: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface TelemetryContextValue {
  status: SSEConnectionStatus;
  isConnected: boolean;
  isReconnecting: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  lastEvent: SSEEventPayload | null;
  recentEvents: SSEEventPayload[];
  lastHeartbeatAt: Date | null;
  retryCount: number;
  deviceMetrics: Record<string, DeviceTelemetryMetric>;
  activeAlerts: SSEEventPayload[];
  activeAlertsCount: number;
  reconnect: () => void;
  disconnect: () => void;
  clearBuffer: () => void;
  subscribeToEvent: (
    eventType: string,
    handler: (payload: SSEEventPayload) => void
  ) => () => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export interface TelemetryProviderProps {
  children: React.ReactNode;
  url?: string;
  token?: string | null;
  enabled?: boolean;
  bufferLimit?: number;
  heartbeatTimeoutMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  queryClient?: any;
}

/**
 * Hook seguro para obter o QueryClient do TanStack Query sem lançar erro
 * caso o componente seja renderizado fora de um QueryClientProvider.
 */
function useOptionalQueryClient(overrideClient?: any) {
  if (overrideClient) return overrideClient;
  try {
    return useQueryClient();
  } catch {
    return undefined;
  }
}

export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({
  children,
  url = "/api/v1/events/stream",
  token = null,
  enabled = true,
  bufferLimit = 100,
  heartbeatTimeoutMs = 35000,
  initialBackoffMs = 1000,
  maxBackoffMs = 16000,
  queryClient: explicitQueryClient,
}) => {
  const queryClient = useOptionalQueryClient(explicitQueryClient);

  const [deviceMetrics, setDeviceMetrics] = useState<
    Record<string, DeviceTelemetryMetric>
  >({});
  const [activeAlerts, setActiveAlerts] = useState<SSEEventPayload[]>([]);

  // Subscrições dinâmicas de eventos (listeners registrados em runtime)
  const subscribersRef = useRef<
    Map<string, Set<(payload: SSEEventPayload) => void>>
  >(new Map());

  const handleMessage = useCallback((payload: SSEEventPayload) => {
    // 1. Atualiza métricas agregadas de dispositivos
    if (payload.device_id) {
      setDeviceMetrics((prev) => ({
        ...prev,
        [payload.device_id!]: {
          device_id: payload.device_id!,
          latency_ms: payload.latency_ms ?? prev[payload.device_id!]?.latency_ms,
          status: payload.status ?? prev[payload.device_id!]?.status,
          previous_status:
            payload.previous_status ?? prev[payload.device_id!]?.previous_status,
          updatedAt: new Date().toISOString(),
          ...payload,
        },
      }));
    }

    // 2. Atualiza estado de alertas ativos
    if (
      payload.event_type === "AlarmTriggered" ||
      payload.event_type === "AlertTriggered" ||
      payload.event_type === "BetaAlarmTriggered"
    ) {
      setActiveAlerts((prev) => {
        const id = payload.event_id || payload.incident_id || payload.device_id;
        const exists = prev.some(
          (a) => (a.event_id || a.incident_id || a.device_id) === id
        );
        if (exists) return prev;
        return [payload, ...prev];
      });
    } else if (
      payload.event_type === "AlarmResolved" ||
      payload.event_type === "AlertResolved"
    ) {
      setActiveAlerts((prev) => {
        const id = payload.event_id || payload.incident_id || payload.device_id;
        return prev.filter(
          (a) => (a.event_id || a.incident_id || a.device_id) !== id
        );
      });
    }

    // 3. Notifica subscritores dinâmicos registrados para este tipo de evento
    if (payload.event_type) {
      const handlers = subscribersRef.current.get(payload.event_type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(payload);
          } catch (err) {
            console.error(
              `Erro no subscriber do evento ${payload.event_type}:`,
              err
            );
          }
        });
      }
    }
  }, []);

  const sse = useSSE({
    url,
    token,
    enabled,
    bufferLimit,
    heartbeatTimeoutMs,
    initialBackoffMs,
    maxBackoffMs,
    queryClient,
    updateQueryCache: true,
    onMessage: handleMessage,
  });

  const subscribeToEvent = useCallback(
    (eventType: string, handler: (payload: SSEEventPayload) => void) => {
      let set = subscribersRef.current.get(eventType);
      if (!set) {
        set = new Set();
        subscribersRef.current.set(eventType, set);
      }
      set.add(handler);

      return () => {
        const currentSet = subscribersRef.current.get(eventType);
        if (currentSet) {
          currentSet.delete(handler);
          if (currentSet.size === 0) {
            subscribersRef.current.delete(eventType);
          }
        }
      };
    },
    []
  );

  const contextValue = useMemo<TelemetryContextValue>(
    () => ({
      status: sse.status,
      isConnected: sse.isConnected,
      isReconnecting: sse.isReconnecting,
      isConnecting: sse.isConnecting,
      isDisconnected: sse.isDisconnected,
      lastEvent: sse.lastEvent,
      recentEvents: sse.eventBuffer,
      lastHeartbeatAt: sse.lastHeartbeatAt,
      retryCount: sse.retryCount,
      deviceMetrics,
      activeAlerts,
      activeAlertsCount: activeAlerts.length,
      reconnect: sse.reconnect,
      disconnect: sse.disconnect,
      clearBuffer: sse.clearBuffer,
      subscribeToEvent,
    }),
    [
      sse.status,
      sse.isConnected,
      sse.isReconnecting,
      sse.isConnecting,
      sse.isDisconnected,
      sse.lastEvent,
      sse.eventBuffer,
      sse.lastHeartbeatAt,
      sse.retryCount,
      deviceMetrics,
      activeAlerts,
      sse.reconnect,
      sse.disconnect,
      sse.clearBuffer,
      subscribeToEvent,
    ]
  );

  return (
    <TelemetryContext.Provider value={contextValue}>
      {children}
    </TelemetryContext.Provider>
  );
};

/**
 * Hook de conveniência para acessar o contexto de telemetria em tempo real.
 */
export function useTelemetry(): TelemetryContextValue {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error(
      "useTelemetry deve ser utilizado dentro de um <TelemetryProvider>."
    );
  }
  return context;
}
