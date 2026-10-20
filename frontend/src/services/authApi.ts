/**
 * Serviços de Comunicação com a API de Autenticação (IAM) do InfraWatch.
 * Mapeia os endpoints de login, MFA challenge, Google OAuth2, silent refresh e redefinição de senha.
 */

import { apiRequest } from "./apiClient";
import type {
  AuthUser,
  GoogleAuthUrlResponse,
  LoginCredentials,
  MfaChallengeCredentials,
  MfaChallengeResponse,
  TokenResponse,
} from "../types/auth";

export const authApi = {
  /**
   * Autenticação inicial com e-mail e senha.
   * Pode retornar TokenResponse ou MfaChallengeResponse caso MFA esteja ativo.
   */
  async login(credentials: LoginCredentials): Promise<TokenResponse | MfaChallengeResponse> {
    return apiRequest<TokenResponse | MfaChallengeResponse>("/api/v1/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify(credentials),
    });
  },

  /**
   * Conclusão do desafio MFA com código TOTP de 6 dígitos ou código de backup.
   */
  async loginMfaChallenge(credentials: MfaChallengeCredentials): Promise<TokenResponse> {
    return apiRequest<TokenResponse>("/api/v1/auth/login/mfa-challenge", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify(credentials),
    });
  },

  /**
   * Rotação de Refresh Token (Silent Refresh).
   */
  async refresh(refreshToken: string): Promise<TokenResponse> {
    return apiRequest<TokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  /**
   * Encerramento da sessão atual com revogação do refresh token.
   */
  async logout(refreshToken?: string | null): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken || "" }),
    });
  },

  /**
   * Encerramento de todas as sessões ativas do usuário.
   */
  async logoutAll(): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/auth/logout/all", {
      method: "POST",
    });
  },

  /**
   * Consulta os dados cadastrais do usuário autenticado no momento.
   */
  async getMe(): Promise<AuthUser> {
    interface BackendUserResponse {
      id: string;
      email: string;
      full_name: string;
      role: AuthUser["role"];
      organization_id?: string | null;
      is_active?: boolean;
      mfa_enabled?: boolean;
    }

    const res = await apiRequest<BackendUserResponse>("/api/v1/auth/me", {
      method: "GET",
    });

    const initials = res.full_name
      ? res.full_name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : res.email.slice(0, 2).toUpperCase();

    return {
      id: res.id,
      email: res.email,
      name: res.full_name,
      role: res.role,
      organization_id: res.organization_id,
      initials,
      is_active: res.is_active,
      mfa_enabled: res.mfa_enabled,
    };
  },

  /**
   * Obtém a URL de autorização do Google OAuth2.
   */
  async getGoogleAuthUrl(): Promise<GoogleAuthUrlResponse> {
    return apiRequest<GoogleAuthUrlResponse>("/api/v1/auth/google/url", {
      method: "GET",
      skipAuth: true,
    });
  },

  /**
   * Envia o código retornado pelo Google para validação e emissão de tokens.
   */
  async googleCallback(code: string, state: string): Promise<TokenResponse> {
    return apiRequest<TokenResponse>("/api/v1/auth/google/callback", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ code, state }),
    });
  },

  /**
   * Solicita envio de link de recuperação de senha por e-mail.
   */
  async requestPasswordReset(email: string): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/auth/password-reset/request", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Redefine a senha com o token recebido por e-mail.
   */
  async confirmPasswordReset(
    token: string,
    newPassword: string
  ): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  },

  /**
   * Confirma o endereço de e-mail do usuário.
   */
  async verifyEmail(token: string): Promise<{ status: string; message: string }> {
    return apiRequest<{ status: string; message: string }>("/api/v1/auth/verify-email", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ token }),
    });
  },
};
