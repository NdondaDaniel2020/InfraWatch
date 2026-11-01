import { apiClient } from "./apiClient";
import {
  AuditFilterParams,
  AuditIntegrityVerificationResponse,
  AuditListResponse,
  AuditLogEntry,
} from "../types/audit";

export const auditApi = {
  /**
   * Consulta paginada dos registros de auditoria imutáveis.
   */
  getAuditLogs: async (params?: AuditFilterParams): Promise<AuditListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size) searchParams.set("page_size", String(params.page_size));
    if (params?.organization_id) searchParams.set("organization_id", params.organization_id);

    const qs = searchParams.toString();
    const endpoint = qs ? `/api/v1/audit/logs?${qs}` : "/api/v1/audit/logs";
    const res = await apiClient.get<AuditListResponse>(endpoint);
    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para trilha de auditoria.");
    }
    return res;
  },

  /**
   * Executa a verificação matemática de integridade do encadeamento SHA-256.
   */
  verifyIntegrity: async (
    organizationId?: string
  ): Promise<AuditIntegrityVerificationResponse> => {
    const url = organizationId
      ? `/api/v1/audit/verify?organization_id=${encodeURIComponent(organizationId)}`
      : "/api/v1/audit/verify";
    const res = await apiClient.post<AuditIntegrityVerificationResponse>(url);
    if (!res || typeof res.is_valid !== "boolean") {
      throw new Error("Resposta inválida do serviço de integridade criptográfica.");
    }
    return res;
  },

  /**
   * Serializa e gera download do Ledger de Auditoria em formato JSON legível.
   */
  exportLedgerJson: (logs: AuditLogEntry[]): void => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `infrawatch-audit-ledger-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },
};
