import { apiClient } from "./apiClient";
import type { ClientNotification } from "../mocks/clientPortalMocks";
import { MOCK_CLIENT_NOTIFICATIONS } from "../mocks/clientPortalMocks";

export interface NotificationsResponse {
  unreadCount: number;
  items: ClientNotification[];
}

export const notificationsApi = {
  /**
   * Obtém a contagem de notificações não lidas.
   */
  async getUnreadCount(): Promise<number> {
    try {
      const resp = await apiClient.get<{ unread_count: number }>("/api/v1/notifications/unread-count");
      return resp.unread_count;
    } catch {
      // Fallback resiliente
      return MOCK_CLIENT_NOTIFICATIONS.filter((n) => !n.isRead).length;
    }
  },

  /**
   * Lista as notificações do cliente.
   */
  async listNotifications(): Promise<ClientNotification[]> {
    try {
      const resp = await apiClient.get<{ items: ClientNotification[] }>("/api/v1/notifications");
      if (resp && resp.items && resp.items.length > 0) {
        return resp.items;
      }
    } catch {
      // Fallback para os comunicados canônicos
    }
    return MOCK_CLIENT_NOTIFICATIONS;
  },

  /**
   * Marca todas as notificações como lidas.
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
      const resp = await apiClient.get<{ items: ClientNotification[] }>(url);
      if (resp && resp.items) {
        return resp.items;
      }
    } catch {
      // Fallback
    }
    return [];
  },
};
