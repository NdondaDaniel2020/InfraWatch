import { apiClient } from "./apiClient";
import type { ClientNotification } from "../types/clientPortal";

export interface NotificationsResponse {
  unreadCount: number;
  items: ClientNotification[];
}

interface BackendNotificationItem {
  id: number;
  user_id: string;
  channel: string;
  event_type: string;
  title: string;
  message: string;
  read: boolean;
  details?: Record<string, unknown> | null;
  created_at: string;
}

interface BackendNotificationList {
  items: BackendNotificationItem[];
  total: number;
  unread_count: number;
}

export const notificationsApi = {
  /**
   * Obtém a contagem de notificações não lidas diretamente do backend.
   */
  async getUnreadCount(): Promise<number> {
    try {
      const resp = await apiClient.get<{ unread_count: number }>("/api/v1/notifications/unread-count");
      return typeof resp?.unread_count === "number" ? resp.unread_count : 0;
    } catch {
      return 0;
    }
  },

  /**
   * Lista as notificações do cliente a partir do backend.
   */
  async listNotifications(): Promise<ClientNotification[]> {
    try {
      const resp = await apiClient.get<BackendNotificationList>("/api/v1/notifications");
      if (resp && Array.isArray(resp.items)) {
        if (resp.items.length === 0) return [];
        return resp.items.map((item): ClientNotification => {
          const isSuccess = item.event_type.includes("resolved") || item.event_type.includes("success");
          const isWarning = item.event_type.includes("warning") || item.event_type.includes("maintenance");
          return {
            id: String(item.id),
            title: item.title,
            summary: item.message,
            timestampWat: new Date(item.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            }) + " WAT",
            impactSlaFormatted: typeof item.details?.impact_sla === "string" ? item.details.impact_sla : "0m",
            isRead: item.read,
            type: item.event_type.includes("maintenance")
              ? "maintenance"
              : item.event_type.includes("resolved")
                ? "resolved"
                : "advisory",
            severity: isSuccess ? "success" : isWarning ? "warning" : "info",
          };
        });
      }
    } catch {
      // Falha de rede: retorna lista vazia
    }
    return [];
  },

  /**
   * Marca todas as notificações como lidas no backend.
   */
  async markAllAsRead(): Promise<{ success: boolean; unreadCount: number }> {
    try {
      await apiClient.post("/api/v1/notifications/read-all", {});
    } catch {
      // Fallback gracioso
    }
    return { success: true, unreadCount: 0 };
  },

  /**
   * Sincronização Catch-Up após reconexão de rede ou SSE.
   */
  async syncSince(sinceId?: string): Promise<ClientNotification[]> {
    try {
      const url = sinceId ? `/api/v1/notifications/sync?since_id=${encodeURIComponent(sinceId)}` : "/api/v1/notifications/sync";
      const resp = await apiClient.get<{ events?: BackendNotificationItem[]; items?: BackendNotificationItem[] }>(url);
      const list = resp.events || resp.items || [];
      return list.map((item): ClientNotification => ({
        id: String(item.id),
        title: item.title,
        summary: item.message,
        timestampWat: new Date(item.created_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }) + " WAT",
        impactSlaFormatted: typeof item.details?.impact_sla === "string" ? item.details.impact_sla : "0m",
        isRead: item.read,
        type: "advisory",
        severity: "info",
      }));
    } catch {
      // Fallback
    }
    return [];
  },
};
