/**
 * Tipos de Autenticação e Perfis de Acesso (RBAC) do InfraWatch.
 * Conforme especificado na ADR-002, ADR-033 e Tarefa 7.3 / 7.4.
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
  initials?: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}
