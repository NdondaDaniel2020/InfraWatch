/**
 * Tipos e interfaces para streaming de telemetria e eventos via Server-Sent Events (SSE).
 * Alinhado com a arquitetura de tempo real do InfraWatch (ADR-004).
 */

export type SSEConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface SSEEventPayload<T = unknown> {
  event_type: string;
  event_id?: string;
  device_id?: string;
  organization_id?: string;
  timestamp?: string;
  latency_ms?: number;
  status?: string;
  previous_status?: string;
  severity?: "HEALTHY" | "DEGRADED" | "CRITICAL" | "MAINTENANCE";
  title?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

export interface UseSSEOptions {
  /** URL do endpoint SSE (padrão: /api/v1/events/stream) */
  url?: string;
  /** Token JWT para autenticação via query param ?token= */
  token?: string | null;
  /** Habilita ou desabilita a conexão automática (padrão: true) */
  enabled?: boolean;
  /** Backoff inicial para reconexão em milissegundos (padrão: 1000ms / 1s) */
  initialBackoffMs?: number;
  /** Backoff máximo para reconexão em milissegundos (padrão: 16000ms / 16s) */
  maxBackoffMs?: number;
  /** Fator multiplicador do backoff exponencial (padrão: 2) */
  backoffMultiplier?: number;
  /** Timeout em milissegundos sem atividade/heartbeat para detectar queda silenciosa (padrão: 35000ms / 35s) */
  heartbeatTimeoutMs?: number;
  /** Limite máximo de eventos mantidos no buffer local em memória (padrão: 100) */
  bufferLimit?: number;
  /** Callback executado ao receber qualquer evento de dados */
  onMessage?: (event: SSEEventPayload) => void;
  /** Mapa de callbacks específicos por tipo de evento (ex: 'DeviceLatencyMeasured') */
  onEvent?: Record<string, (event: SSEEventPayload) => void>;
  /** Callback disparado quando a conexão é estabelecida com sucesso */
  onOpen?: () => void;
  /** Callback disparado quando ocorre um erro na conexão */
  onError?: (error: Event) => void;
  /** Callback disparado quando o status da conexão é alterado */
  onStatusChange?: (status: SSEConnectionStatus) => void;
  /** Instância do QueryClient para atualização cirúrgica do cache */
  queryClient?: any;
  /** Habilita atualização cirúrgica do cache do TanStack Query (padrão: true se queryClient fornecido) */
  updateQueryCache?: boolean;
}

export interface UseSSEReturn {
  /** Status atual da conexão */
  status: SSEConnectionStatus;
  /** Indica se a conexão está ativa e saudável */
  isConnected: boolean;
  /** Indica se a conexão está tentando reconectar com backoff */
  isReconnecting: boolean;
  /** Indica se está na fase inicial de conexão */
  isConnecting: boolean;
  /** Indica se a conexão está explicitamente desconectada */
  isDisconnected: boolean;
  /** Último evento de telemetria recebido */
  lastEvent: SSEEventPayload | null;
  /** Buffer circular dos últimos eventos em memória */
  eventBuffer: SSEEventPayload[];
  /** Timestamp da última atividade ou heartbeat recebido */
  lastHeartbeatAt: Date | null;
  /** Número de tentativas consecutivas de reconexão */
  retryCount: number;
  /** Força reconexão imediata resetando a contagem de retentativas */
  reconnect: () => void;
  /** Encerra a conexão SSE */
  disconnect: () => void;
  /** Limpa o buffer local de eventos */
  clearBuffer: () => void;
}
