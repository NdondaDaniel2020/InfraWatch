/**
 * Tipos de Autenticação, Perfis de Acesso (RBAC), MFA e Gestão de Sessões do InfraWatch.
 * Conforme especificado na ADR-002, ADR-033 e Issue #216 (Tarefa 7.4).
 */

export type UserRole =
  | "SUPER_ADMIN"
  | "NOC_OPERATOR"
  | "ORG_ADMIN"
  | "CLIENT_VIEWER";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization_id?: string | null;
  organization_name?: string | null;
  initials?: string;
  is_active?: boolean;
  mfa_enabled?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    organization_id?: string | null;
    is_active?: boolean;
    mfa_enabled?: boolean;
  };
}

export interface MfaChallengeResponse {
  mfa_required: true;
  mfa_pending_token: string;
}

export type LoginResult =
  | { success: true; user: AuthUser; accessToken: string; mfaRequired: false }
  | { success: false; mfaRequired: true; mfaPendingToken: string };

export interface MfaChallengeCredentials {
  mfa_pending_token: string;
  code: string;
}

export interface MfaSetupResponse {
  secret: string;
  otpauth_uri: string;
}

export interface MfaEnableResponse {
  message: string;
  backup_codes: string[];
}

export interface ActiveSession {
  id: string;
  device_name?: string | null;
  ip_address?: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SessionListResponse {
  sessions: ActiveSession[];
  total: number;
}

export interface GoogleAuthUrlResponse {
  authorization_url: string;
  state: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaPendingToken: string | null;
}

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  submitMfaChallenge: (code: string) => Promise<AuthUser>;
  completeGoogleLogin: (code: string, state: string) => Promise<AuthUser>;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => Promise<void>;
  clearMfaPending: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}
