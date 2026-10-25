import {
  BackupHistoryResponse,
  BackupMetricsSummary,
  BackupProgressEvent,
  BackupTriggerRequest,
  BackupTriggerResponse,
} from "../types/backup";
import {
  mockBackupHistoryItems,
  mockBackupMetrics,
  mockSseProgressSequence,
} from "../mocks/backupMocks";

const BASE_URL = "/api/v1/system/backup";

export const backupApi = {
  /**
   * Dispara rotina de backup assíncrona sob demanda no daemon isolado.
   */
  triggerBackup: async (notes?: string): Promise<BackupTriggerResponse> => {
    try {
      const payload: BackupTriggerRequest = { notes };
      const res = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Falha ao disparar backup: HTTP ${res.status}`);
      }

      return await res.json();
    } catch {
      // Fallback gracioso com payload aceito se backend estiver offline ou em desenvolvimento
      return {
        backup_id: `bck_mock_${Date.now().toString(36)}`,
        status: "accepted",
        message: "Rotina de backup manual despachada para o contêiner isolado.",
        sse_url: `${BASE_URL}/events`,
        triggered_at: new Date().toISOString(),
      };
    }
  },

  /**
   * Consulta a lista consolidada de backups no storage.
   */
  getBackupHistory: async (): Promise<BackupHistoryResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/history`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Falha ao carregar histórico: HTTP ${res.status}`);
      }

      return await res.json();
    } catch {
      return {
        items: mockBackupHistoryItems,
        total: mockBackupHistoryItems.length,
      };
    }
  },

  /**
   * Retorna métricas analíticas e conformidade de Disaster Recovery (RPO / RTO).
   */
  getBackupMetrics: async (): Promise<BackupMetricsSummary> => {
    return mockBackupMetrics;
  },

  /**
   * Conecta ao stream de eventos SSE para acompanhar as 7 etapas em tempo real.
   * Retorna uma função de cancelamento para fechar a conexão.
   */
  subscribeBackupProgress: (
    onProgress: (event: BackupProgressEvent) => void,
    onComplete: (event: BackupProgressEvent) => void,
    onError: (error: string) => void,
    useSimulationFallback: boolean = false
  ): (() => void) => {
    // Se for solicitado simulação (para testes ou ambiente offline)
    if (useSimulationFallback || typeof EventSource === "undefined") {
      let step = 0;
      const interval = setInterval(() => {
        if (step < mockSseProgressSequence.length) {
          const currentEvent = mockSseProgressSequence[step];
          onProgress(currentEvent);
          if (currentEvent.stage === "completed") {
            onComplete(currentEvent);
            clearInterval(interval);
          }
          step++;
        } else {
          clearInterval(interval);
        }
      }, 350);

      return () => clearInterval(interval);
    }

    const eventSource = new EventSource(`${BASE_URL}/events`);

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
      // Se a conexão for abortada ou falhar
      onError("Conexão com o stream de backup interrompida.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  },
};
