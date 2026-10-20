/**
 * Serviços de Comunicação para Gestão de Segurança, MFA TOTP e Sessões Ativas.
 * Mapeia os endpoints de /api/v1/mfa e /api/v1/users/me/sessions.
 */

import { apiRequest } from "./apiClient";
import type {
  MfaEnableResponse,
  MfaSetupResponse,
  SessionListResponse,
} from "../types/auth";

export const securityApi = {
  /**
   * Inicia o fluxo de configuração do TOTP gerando a chave Base32 e a URI otpauth://.
   */
  async setupMfa(): Promise<MfaSetupResponse> {
    return apiRequest<MfaSetupResponse>("/api/v1/mfa/setup", {
      method: "POST",
    });
  },

  /**
   * Valida o primeiro código TOTP de 6 dígitos gerado e retorna 10 códigos de backup descartáveis.
   */
  async enableMfa(code: string): Promise<MfaEnableResponse> {
    return apiRequest<MfaEnableResponse>("/api/v1/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  /**
   * Desativa o MFA mediante confirmação com senha e código TOTP/backup.
   */
  async disableMfa(password: string, code: string): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
  },

  /**
   * Regenera 10 novos códigos de backup de emergência.
   */
  async regenerateBackupCodes(
    password: string,
    code: string
  ): Promise<{ backup_codes: string[] }> {
    return apiRequest<{ backup_codes: string[] }>("/api/v1/mfa/backup-codes/regenerate", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
  },

  /**
   * Lista todas as sessões e dispositivos conectados do usuário autenticado.
   */
  async listSessions(): Promise<SessionListResponse> {
    return apiRequest<SessionListResponse>("/api/v1/users/me/sessions", {
      method: "GET",
    });
  },

  /**
   * Encerra remotamente uma sessão específica identificada por seu ID de refresh token.
   */
  async revokeSession(sessionId: string): Promise<{ message: string; revoked_count: number }> {
    return apiRequest<{ message: string; revoked_count: number }>(
      `/api/v1/users/me/sessions/${sessionId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Encerra todas as sessões ativas do usuário conectado.
   */
  async revokeAllSessions(): Promise<{ message: string; revoked_count: number }> {
    return apiRequest<{ message: string; revoked_count: number }>("/api/v1/users/me/sessions", {
      method: "DELETE",
    });
  },
};
