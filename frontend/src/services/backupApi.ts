import { apiClient, getInMemoryAccessToken } from "./apiClient";
import {
  BackupHistoryResponse,
  BackupMetricsSummary,
  BackupProgressEvent,
  BackupTriggerRequest,
  BackupTriggerResponse,
} from "../types/backup";
import { resolveApiUrl } from "../utils/env";

const BASE_URL = resolveApiUrl("/api/v1/system/backup");

function formatStorage(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function buildMetrics(history: BackupHistoryResponse): BackupMetricsSummary {
  const items = history.items;
  const latest = items.reduce<BackupHistoryResponse["items"][number] | null>(
    (current, item) => {
      if (!current) return item;
      return new Date(item.created_at).getTime() >
        new Date(current.created_at).getTime()
        ? item
        : current;
    },
    null
  );
  const totalBytes = items.reduce(
    (sum, item) => sum + (item.size_bytes ?? 0),
    0
  );
  const elapsedMinutes = latest
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 60000)
      )
    : undefined;

  return {
    ...(latest ? { lastBackupAt: latest.created_at } : {}),
    totalBackupsCount: history.total,
    totalStorageUsed: formatStorage(totalBytes),
    ...(typeof elapsedMinutes === "number"
      ? { rpoCurrentMinutes: elapsedMinutes }
      : {}),
  };
}

export const backupApi = {
  /**
   * Dispara rotina de backup assíncrona sob demanda no daemon isolado.
   */
  triggerBackup: async (notes?: string): Promise<BackupTriggerResponse> => {
    const payload: BackupTriggerRequest = { notes };
    return apiClient.post<BackupTriggerResponse>(BASE_URL, payload);
  },

  /**
   * Consulta a lista consolidada de backups no storage.
   */
  getBackupHistory: async (): Promise<BackupHistoryResponse> => {
    const res = await apiClient.get<BackupHistoryResponse>(
      `${BASE_URL}/history`
    );
    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para o histórico de backups.");
    }
    return {
      items: res.items,
      total: typeof res.total === "number" ? res.total : res.items.length,
    };
  },

  /**
   * Deriva métricas operacionais do histórico real de snapshots.
   * O backend ainda não expõe metas contratuais de RPO/RTO.
   */
  getBackupMetrics: async (): Promise<BackupMetricsSummary> => {
    const history = await backupApi.getBackupHistory();
    return buildMetrics(history);
  },

  /**
   * Conecta ao stream de eventos SSE para acompanhar as 7 etapas em tempo real.
   * Retorna uma função de cancelamento para fechar a conexão.
   */
  subscribeBackupProgress: (
    onProgress: (event: BackupProgressEvent) => void,
    onComplete: (event: BackupProgressEvent) => void,
    onError: (error: string) => void
  ): (() => void) => {
    if (typeof EventSource === "undefined") {
      onError("EventSource não está disponível neste ambiente.");
      return () => {};
    }

    const token = getInMemoryAccessToken();
    const url = token
      ? `${BASE_URL}/events?token=${encodeURIComponent(token)}`
      : `${BASE_URL}/events`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener("progress", (e: MessageEvent) => {
      try {
        const data: BackupProgressEvent = JSON.parse(e.data);
        onProgress(data);
        if (data.stage === "completed") {
          onComplete(data);
          eventSource.close();
        } else if (data.stage === "error") {
          onError(data.message || "Erro desconhecido durante o pipeline de backup.");
          eventSource.close();
        }
      } catch (err) {
        onError(`Falha ao decodificar evento SSE: ${String(err)}`);
      }
    });

    eventSource.onerror = () => {
      onError("Conexão com o stream de backup interrompida.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  },
};
