import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { ENV } from "../utils/env";
import type {
  SSEConnectionStatus,
  SSEEventPayload,
  UseSSEOptions,
  UseSSEReturn,
} from "../types/sse";

const DEFAULT_URL = ENV.SSE_STREAM_URL;
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
function updateTanStackCache(queryClient: QueryClient, payload: SSEEventPayload) {
  if (!queryClient?.setQueryData) return;

  const { event_type, device_id } = payload;

  // Atualização granular por dispositivo
  if (device_id) {
    queryClient.setQueryData<Record<string, unknown>>(["device", device_id], (old) => {
      if (!old) return { ...payload, updatedAt: new Date().toISOString() };
      return {
        ...old,
        ...payload,
        updatedAt: new Date().toISOString(),
      };
    });

    queryClient.setQueryData<Array<Record<string, unknown>>>(["devices"], (oldList) => {
      if (!Array.isArray(oldList)) return oldList;
      return oldList.map((dev) => {
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
    queryClient.setQueryData<Array<Record<string, unknown>>>(["alerts"], (oldAlerts) => {
      if (!Array.isArray(oldAlerts)) return [payload as unknown as Record<string, unknown>];
      const exists = oldAlerts.some(
        (a) =>
          (payload.event_id && a.event_id === payload.event_id) ||
          (payload.incident_id && a.incident_id === payload.incident_id)
      );
      if (exists) return oldAlerts;
      return [payload as unknown as Record<string, unknown>, ...oldAlerts];
    });
  } else if (event_type === "AlarmResolved" || event_type === "AlertResolved") {
    queryClient.setQueryData<Array<Record<string, unknown>>>(["alerts"], (oldAlerts) => {
      if (!Array.isArray(oldAlerts)) return oldAlerts;
      return oldAlerts.filter(
        (a) =>
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
 * Alinhado ao ADR-033: utiliza Fetch API com ReadableStream e cabeçalho Authorization: Bearer,
 * com fallback para EventSource e auto-reconexão com backoff exponencial e watchdog.
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
    transport,
  } = options;

  const [status, setStatus] = useState<SSEConnectionStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<SSEEventPayload | null>(null);
  const [eventBuffer, setEventBuffer] = useState<SSEEventPayload[]>([]);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Refs para manter valores estáveis dentro dos callbacks assíncronos e evitar re-renders
  const statusRef = useRef<SSEConnectionStatus>("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Fecha conexão ativa e limpa timers e streams pendentes
  const cleanupConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.onopen = null;
      eventSourceRef.current.onmessage = null;
      eventSourceRef.current.onerror = null;
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Parseia blocos textuais no formato SSE (RFC-8895)
  const parseSSEBlock = useCallback(
    (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventType = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith(":")) {
          // Comentário SSE / Heartbeat ping
          lastActivityTimeRef.current = Date.now();
          setLastHeartbeatAt(new Date());
          continue;
        }
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (eventType === "ping") {
        lastActivityTimeRef.current = Date.now();
        setLastHeartbeatAt(new Date());
      }

      if (dataLines.length > 0) {
        const dataString = dataLines.join("\n");
        handleIncomingData(dataString, eventType);
      }
    },
    [handleIncomingData]
  );

  // Agenda reconexão com backoff exponencial e jitter
  const scheduleReconnect = useCallback(() => {
    if (isManuallyClosedRef.current) {
      updateStatus("disconnected");
      return;
    }

    cleanupConnection();
    updateStatus("reconnecting");

    const currentRetry = retryCountRef.current + 1;
    retryCountRef.current = currentRetry;
    setRetryCount(currentRetry);

    const exponent = Math.max(0, currentRetry - 1);
    const calculatedDelay = Math.min(
      initialBackoffMs * Math.pow(backoffMultiplier, exponent),
      maxBackoffMs
    );

    const jitter = Math.floor(Math.random() * 150);
    const totalDelay = calculatedDelay + jitter;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, totalDelay);
  }, [
    cleanupConnection,
    initialBackoffMs,
    maxBackoffMs,
    backoffMultiplier,
    updateStatus,
  ]);

  // Função principal de conexão e gerenciamento de SSE
  const connect = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    cleanupConnection();
    isManuallyClosedRef.current = false;

    // Determina se deve usar Fetch com ReadableStream (ADR-033) ou EventSource legado
    const isMockEventSource =
      typeof window.EventSource !== "undefined" &&
      (window.EventSource.name === "MockEventSource" || (window.EventSource as any).isMock);

    const useFetchStream =
      transport === "fetch" ||
      (!transport && !isMockEventSource && typeof window.fetch === "function");

    // =========================================================================
    // 1. MOTOR FETCH COM READABLESTREAM (ADR-033)
    // =========================================================================
    if (useFetchStream) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              updateStatus("disconnected");
              optionsRef.current.onError?.(
                new Error(`HTTP ${response.status}: Autenticação necessária ou token expirado.`)
              );
              return;
            }
            throw new Error(`Falha na resposta HTTP do SSE: ${response.status}`);
          }

          if (!response.body) {
            throw new Error("Corpo de resposta ReadableStream não disponível.");
          }

          retryCountRef.current = 0;
          setRetryCount(0);
          lastActivityTimeRef.current = Date.now();
          setLastHeartbeatAt(new Date());
          updateStatus("connected");
          optionsRef.current.onOpen?.();

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              streamBuffer += decoder.decode(value, { stream: true });
              const blocks = streamBuffer.split(/\r?\n\r?\n/);
              streamBuffer = blocks.pop() ?? "";

              for (const block of blocks) {
                if (block.trim()) {
                  parseSSEBlock(block);
                }
              }
            }

            // Se a stream encerrou normalmente e não foi fechamento intencional, agenda retry
            if (!isManuallyClosedRef.current && !controller.signal.aborted) {
              scheduleReconnect();
            }
          } catch (readErr: any) {
            if (controller.signal.aborted || isManuallyClosedRef.current) {
              return;
            }
            optionsRef.current.onError?.(readErr);
            scheduleReconnect();
          }
        })
        .catch((fetchErr: any) => {
          if (controller.signal.aborted || isManuallyClosedRef.current) {
            return;
          }
          optionsRef.current.onError?.(fetchErr);
          scheduleReconnect();
        });

      return;
    }

    // =========================================================================
    // 2. MODO FALLBACK: EVENTSOURCE LEGADO
    // =========================================================================
    if (typeof window.EventSource === "undefined") {
      return;
    }

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

      es.addEventListener("ping", (event: MessageEvent<string>) => {
        lastActivityTimeRef.current = Date.now();
        setLastHeartbeatAt(new Date());
        if (event.data) {
          handleIncomingData(event.data, "ping");
        }
      });

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
        es.addEventListener(evtName, (event: MessageEvent<string>) => {
          handleIncomingData(event.data, evtName);
        });
      });

      if (optionsRef.current.onEvent) {
        Object.keys(optionsRef.current.onEvent).forEach((customEvent) => {
          if (!standardEvents.includes(customEvent) && customEvent !== "ping") {
            es.addEventListener(customEvent, (event: MessageEvent<string>) => {
              handleIncomingData(event.data, customEvent);
            });
          }
        });
      }

      es.onerror = (err: Event) => {
        optionsRef.current.onError?.(err);
        scheduleReconnect();
      };
    } catch {
      updateStatus("disconnected");
    }
  }, [
    cleanupConnection,
    handleIncomingData,
    parseSSEBlock,
    scheduleReconnect,
    token,
    updateStatus,
    url,
    transport,
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
      if (statusRef.current === "connected" && timeSinceLastActivity >= heartbeatTimeoutMs) {
        scheduleReconnect();
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
    scheduleReconnect,
    heartbeatTimeoutMs,
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
