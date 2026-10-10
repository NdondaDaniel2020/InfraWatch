import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SSEConnectionStatus,
  SSEEventPayload,
  UseSSEOptions,
  UseSSEReturn,
} from "../types/sse";

const DEFAULT_URL = "/api/v1/events/stream";
const DEFAULT_INITIAL_BACKOFF = 1000; // 1s
const DEFAULT_MAX_BACKOFF = 16000; // 16s
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_HEARTBEAT_TIMEOUT = 35000; // 35s (backend emite ping a cada 15s)
const DEFAULT_BUFFER_LIMIT = 100;
const WATCHDOG_CHECK_INTERVAL = 5000; // 5s

/**
 * Atualiza o cache do TanStack Query de forma cirúrgica sem invalidar consultas inteiras.
 * Evita piscamento de tela e refetch de rede desnecessário.
 */
function updateTanStackCache(queryClient: any, payload: SSEEventPayload) {
  if (!queryClient?.setQueryData) return;

  const { event_type, device_id } = payload;

  // Atualização granular por dispositivo
  if (device_id) {
    queryClient.setQueryData(["device", device_id], (old: any) => {
      if (!old) return { ...payload, updatedAt: new Date().toISOString() };
      return {
        ...old,
        ...payload,
        updatedAt: new Date().toISOString(),
      };
    });

    queryClient.setQueryData(["devices"], (oldList: any) => {
      if (!Array.isArray(oldList)) return oldList;
      return oldList.map((dev: any) => {
        if (dev.id === device_id || dev.device_id === device_id) {
          return {
            ...dev,
            ...payload,
            updatedAt: new Date().toISOString(),
          };
        }
        return dev;
      });
    });
  }

  // Atualização granular de incidentes/alarmes
  if (
    event_type === "AlarmTriggered" ||
    event_type === "AlertTriggered" ||
    event_type === "BetaAlarmTriggered"
  ) {
    queryClient.setQueryData(["alerts"], (oldAlerts: any) => {
      if (!Array.isArray(oldAlerts)) return [payload];
      const exists = oldAlerts.some(
        (a: any) =>
          (payload.event_id && a.event_id === payload.event_id) ||
          (payload.incident_id && a.incident_id === payload.incident_id)
      );
      if (exists) return oldAlerts;
      return [payload, ...oldAlerts];
    });
  } else if (event_type === "AlarmResolved" || event_type === "AlertResolved") {
    queryClient.setQueryData(["alerts"], (oldAlerts: any) => {
      if (!Array.isArray(oldAlerts)) return oldAlerts;
      return oldAlerts.filter(
        (a: any) =>
          !(
            (payload.event_id && a.event_id === payload.event_id) ||
            (payload.incident_id && a.incident_id === payload.incident_id)
          )
      );
    });
  }
}

/**
 * Hook customizado useSSE para consumo resiliente de Server-Sent Events em tempo real.
 * Possui auto-reconexão com backoff exponencial, buffer local de telemetria e heartbeat watchdog.
 */
export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const {
    url = DEFAULT_URL,
    token = null,
    enabled = true,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF,
    maxBackoffMs = DEFAULT_MAX_BACKOFF,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT,
    bufferLimit = DEFAULT_BUFFER_LIMIT,
  } = options;

  const [status, setStatus] = useState<SSEConnectionStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<SSEEventPayload | null>(null);
  const [eventBuffer, setEventBuffer] = useState<SSEEventPayload[]>([]);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Refs para manter valores estáveis dentro dos callbacks assíncronos e evitar re-renders
  const statusRef = useRef<SSEConnectionStatus>("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const watchdogIntervalRef = useRef<any>(null);
  const retryCountRef = useRef<number>(0);
  const isManuallyClosedRef = useRef<boolean>(false);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Atualização segura de status notificando callback externo
  const updateStatus = useCallback(
    (newStatus: SSEConnectionStatus) => {
      statusRef.current = newStatus;
      setStatus(newStatus);
      optionsRef.current.onStatusChange?.(newStatus);
    },
    []
  );

  // Adiciona evento ao buffer circular respeitando o limite
  const appendToBuffer = useCallback(
    (payload: SSEEventPayload) => {
      setLastEvent(payload);
      setEventBuffer((prev) => {
        const next = [payload, ...prev];
        if (next.length > bufferLimit) {
          return next.slice(0, bufferLimit);
        }
        return next;
      });
    },
    [bufferLimit]
  );

  // Processa dados recebidos e distribui aos listeners
  const handleIncomingData = useCallback(
    (rawString: string, defaultType: string = "message") => {
      lastActivityTimeRef.current = Date.now();
      const now = new Date();
      setLastHeartbeatAt(now);

      if (!rawString || rawString.trim() === "" || rawString.trim() === "ping") {
        return;
      }

      try {
        const parsed: SSEEventPayload = JSON.parse(rawString);
        if (!parsed.event_type) {
          parsed.event_type = defaultType;
        }

        appendToBuffer(parsed);
        optionsRef.current.onMessage?.(parsed);

        // Notifica listener específico se houver
        if (parsed.event_type && optionsRef.current.onEvent?.[parsed.event_type]) {
          optionsRef.current.onEvent[parsed.event_type](parsed);
        }

        // Atualização de cache reativa do TanStack Query
        if (optionsRef.current.updateQueryCache !== false && optionsRef.current.queryClient) {
          updateTanStackCache(optionsRef.current.queryClient, parsed);
        }
      } catch {
        // Formato não JSON (ex: texto simples ou comentário repassado)
        const textPayload: SSEEventPayload = {
          event_type: defaultType,
          message: rawString,
        };
        appendToBuffer(textPayload);
        optionsRef.current.onMessage?.(textPayload);
      }
    },
    [appendToBuffer]
  );

  // Fecha conexão ativa e limpa timers pendentes
  const cleanupConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.onopen = null;
      eventSourceRef.current.onmessage = null;
      eventSourceRef.current.onerror = null;
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Função principal de conexão e gerenciamento de EventSource
  const connect = useCallback(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return;
    }

    cleanupConnection();
    isManuallyClosedRef.current = false;

    // Constrói URL com token de autenticação JWT se fornecido
    let fullUrl = url;
    if (token) {
      const separator = fullUrl.includes("?") ? "&" : "?";
      fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
    }

    try {
      const es = new window.EventSource(fullUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        retryCountRef.current = 0;
        setRetryCount(0);
        lastActivityTimeRef.current = Date.now();
        setLastHeartbeatAt(new Date());
        updateStatus("connected");
        optionsRef.current.onOpen?.();
      };

      es.onmessage = (event: MessageEvent) => {
        handleIncomingData(event.data, "message");
      };

      // Listener para eventos de ping / heartbeat se emitidos nominalmente
      es.addEventListener("ping", (event: any) => {
        lastActivityTimeRef.current = Date.now();
        setLastHeartbeatAt(new Date());
        if (event.data) {
          handleIncomingData(event.data, "ping");
        }
      });

      // Listeners para eventos conhecidos do domínio NOC
      const standardEvents = [
        "DeviceLatencyMeasured",
        "DeviceStateChanged",
        "AlarmTriggered",
        "AlarmResolved",
        "AlertTriggered",
        "AlertResolved",
        "SecretAlphaIncident",
        "BetaAlarmTriggered",
      ];

      standardEvents.forEach((evtName) => {
        es.addEventListener(evtName, (event: any) => {
          handleIncomingData(event.data, evtName);
        });
      });

      // Listeners para qualquer outro evento customizado configurado no options.onEvent
      if (optionsRef.current.onEvent) {
        Object.keys(optionsRef.current.onEvent).forEach((customEvent) => {
          if (!standardEvents.includes(customEvent) && customEvent !== "ping") {
            es.addEventListener(customEvent, (event: any) => {
              handleIncomingData(event.data, customEvent);
            });
          }
        });
      }

      es.onerror = (err: Event) => {
        optionsRef.current.onError?.(err);

        // Se fechado manualmente pelo usuário ou componente, não reconecta
        if (isManuallyClosedRef.current) {
          updateStatus("disconnected");
          return;
        }

        // Encerra a conexão atual antes de programar o retry
        cleanupConnection();
        updateStatus("reconnecting");

        // Cálculo de Backoff Exponencial: min(initial * multiplier^retry, max)
        const currentRetry = retryCountRef.current + 1;
        retryCountRef.current = currentRetry;
        setRetryCount(currentRetry);

        const exponent = Math.max(0, currentRetry - 1);
        const calculatedDelay = Math.min(
          initialBackoffMs * Math.pow(backoffMultiplier, exponent),
          maxBackoffMs
        );

        // Jitter leve (0 a 150ms) para desincronizar múltiplos clientes reconectando simultaneamente
        const jitter = Math.floor(Math.random() * 150);
        const totalDelay = calculatedDelay + jitter;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, totalDelay);
      };
    } catch {
      updateStatus("disconnected");
    }
  }, [
    cleanupConnection,
    handleIncomingData,
    initialBackoffMs,
    maxBackoffMs,
    backoffMultiplier,
    token,
    updateStatus,
    url,
  ]);

  // Força reconexão imediata
  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    updateStatus("connecting");
    connect();
  }, [connect, updateStatus]);

  // Desconecta intencionalmente
  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    cleanupConnection();
    updateStatus("disconnected");
  }, [cleanupConnection, updateStatus]);

  // Limpa o buffer de eventos em memória
  const clearBuffer = useCallback(() => {
    setEventBuffer([]);
    setLastEvent(null);
  }, []);

  // Efeito de conexão e ciclo de vida
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    updateStatus("connecting");
    connect();

    // Heartbeat Watchdog periódico
    watchdogIntervalRef.current = setInterval(() => {
      if (isManuallyClosedRef.current) return;

      const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
      // Se estiver marcado como conectado mas não houver nenhuma atividade dentro da janela de timeout
      if (statusRef.current === "connected" && timeSinceLastActivity >= heartbeatTimeoutMs) {
        // Conexão perdida silenciosamente (silent drop)
        cleanupConnection();
        updateStatus("reconnecting");

        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);

        const exponent = Math.max(0, retryCountRef.current - 1);
        const delay = Math.min(
          initialBackoffMs * Math.pow(backoffMultiplier, exponent),
          maxBackoffMs
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    }, WATCHDOG_CHECK_INTERVAL);

    return () => {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
      cleanupConnection();
    };
  }, [
    enabled,
    connect,
    cleanupConnection,
    disconnect,
    heartbeatTimeoutMs,
    initialBackoffMs,
    maxBackoffMs,
    backoffMultiplier,
    updateStatus,
  ]);

  return {
    status,
    isConnected: status === "connected",
    isReconnecting: status === "reconnecting",
    isConnecting: status === "connecting",
    isDisconnected: status === "disconnected",
    lastEvent,
    eventBuffer,
    lastHeartbeatAt,
    retryCount,
    reconnect,
    disconnect,
    clearBuffer,
  };
}
