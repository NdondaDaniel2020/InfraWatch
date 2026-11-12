/**
 * Serviço de comunicação com os endpoints da Central de Configurações (Issue #268).
 */

import { apiClient } from "./apiClient";
import type {
  GlpiTestRequest,
  GlpiTestResponse,
  InfraTestResponse,
  IntegrationStatusResponse,
  IntegrationUpdateResponse,
  NotificationTestRequest,
  NotificationTestResponse,
  ZabbixTestRequest,
  ZabbixTestResponse,
} from "../types/settings";

export const settingsApi = {
  getStatus: async (): Promise<IntegrationStatusResponse> => {
    return apiClient.get<IntegrationStatusResponse>("/api/v1/system/settings/status");
  },

  updateIntegration: async (
    name: string,
    payload: Record<string, unknown>
  ): Promise<IntegrationUpdateResponse> => {
    return apiClient.patch<IntegrationUpdateResponse>(
      `/api/v1/system/settings/integrations/${name}`,
      payload
    );
  },

  resetIntegration: async (name: string): Promise<IntegrationUpdateResponse> => {
    return apiClient.delete<IntegrationUpdateResponse>(
      `/api/v1/system/settings/integrations/${name}`
    );
  },

  testGlpi: async (payload?: GlpiTestRequest): Promise<GlpiTestResponse> => {
    return apiClient.post<GlpiTestResponse>("/api/v1/system/settings/test/glpi", payload ?? {});
  },

  testZabbix: async (payload?: ZabbixTestRequest): Promise<ZabbixTestResponse> => {
    return apiClient.post<ZabbixTestResponse>("/api/v1/system/settings/test/zabbix", payload ?? {});
  },

  testNotification: async (payload: NotificationTestRequest): Promise<NotificationTestResponse> => {
    return apiClient.post<NotificationTestResponse>("/api/v1/system/settings/test/notification", payload);
  },

  testInfra: async (): Promise<InfraTestResponse> => {
    return apiClient.post<InfraTestResponse>("/api/v1/system/settings/test/infra");
  },
};
