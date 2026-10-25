import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AuthContextValue,
  AuthState,
  AuthUser,
  LoginCredentials,
  LoginResult,
  TokenResponse,
  UserRole,
} from "../types/auth";
import {
  getStoredRefreshToken,
  setInMemoryAccessToken,
  setOnTokenExpired,
  setStoredRefreshToken,
} from "../services/apiClient";
import { authApi } from "../services/authApi";

export interface AuthProviderProps {
  children: React.ReactNode;
  initialState?: Partial<AuthState>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialState,
}) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (initialState?.user) return initialState.user;
    try {
      const storedDevUser = sessionStorage.getItem("infrawatch_dev_user");
      return storedDevUser ? JSON.parse(storedDevUser) : null;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (initialState?.accessToken) return initialState.accessToken;
    try {
      return sessionStorage.getItem("infrawatch_dev_token");
    } catch {
      return null;
    }
  });
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(
    initialState?.mfaPendingToken ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (initialState?.isLoading !== undefined) return initialState.isLoading;
    if (initialState?.user) return false;
    try {
      if (sessionStorage.getItem("infrawatch_dev_user")) return false;
    } catch {
      // fallback
    }
    return true;
  });

  const isAuthenticated = Boolean(user && accessToken);

  // Sincroniza o token em memória no singleton do apiClient
  useEffect(() => {
    setInMemoryAccessToken(accessToken);
  }, [accessToken]);

  // Registra callback de sessão expirada do apiClient
  useEffect(() => {
    setOnTokenExpired(() => {
      setUser(null);
      setAccessToken(null);
      setMfaPendingToken(null);
      setInMemoryAccessToken(null);
      setStoredRefreshToken(null);
    });
  }, []);

  // Bootstrap da Aplicação: Silent Refresh automático ao carregar a página (F5)
  useEffect(() => {
    // Se o estado inicial já foi injetado (ex: em testes ou dev session), pula bootstrap
    if (
      initialState?.user !== undefined ||
      initialState?.isLoading === false ||
      Boolean(sessionStorage.getItem("infrawatch_dev_user"))
    ) {
      setIsLoading(false);
      return;
    }

    const bootstrapAuth = async () => {
      const storedRefresh = getStoredRefreshToken();
      if (!storedRefresh) {
        setIsLoading(false);
        return;
      }

      try {
        const tokens = await authApi.refresh(storedRefresh);
        setInMemoryAccessToken(tokens.access_token);
        setStoredRefreshToken(tokens.refresh_token);
        setAccessToken(tokens.access_token);

        const profile = await authApi.getMe();
        setUser(profile);
      } catch {
        // Refresh token inválido ou expirado: limpa storage
        setStoredRefreshToken(null);
        setInMemoryAccessToken(null);
        setUser(null);
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAuth();
  }, [initialState]);

  // Login inicial
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginResult> => {
      setIsLoading(true);
      try {
        const res = await authApi.login(credentials);

        if ("mfa_required" in res && res.mfa_required) {
          setMfaPendingToken(res.mfa_pending_token);
          setIsLoading(false);
          return {
            success: false,
            mfaRequired: true,
            mfaPendingToken: res.mfa_pending_token,
          };
        }

        const tokenRes = res as TokenResponse;
        setInMemoryAccessToken(tokenRes.access_token);
        setStoredRefreshToken(tokenRes.refresh_token);
        setAccessToken(tokenRes.access_token);
        setMfaPendingToken(null);

        let authUser: AuthUser;
        if (tokenRes.user) {
          const initials = tokenRes.user.full_name
            ? tokenRes.user.full_name
                .split(" ")
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            : tokenRes.user.email.slice(0, 2).toUpperCase();

          authUser = {
            id: tokenRes.user.id,
            email: tokenRes.user.email,
            name: tokenRes.user.full_name,
            role: tokenRes.user.role,
            organization_id: tokenRes.user.organization_id,
            initials,
            is_active: tokenRes.user.is_active,
            mfa_enabled: tokenRes.user.mfa_enabled,
          };
        } else {
          authUser = await authApi.getMe();
        }

        setUser(authUser);
        setIsLoading(false);
        return {
          success: true,
          user: authUser,
          accessToken: tokenRes.access_token,
          mfaRequired: false,
        };
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    []
  );

  // Resolução do desafio MFA TOTP ou Backup
  const submitMfaChallenge = useCallback(
    async (code: string): Promise<AuthUser> => {
      if (!mfaPendingToken) {
        throw new Error("Nenhum desafio MFA pendente para validar.");
      }

      setIsLoading(true);
      try {
        const tokenRes = await authApi.loginMfaChallenge({
          mfa_pending_token: mfaPendingToken,
          code,
        });

        setInMemoryAccessToken(tokenRes.access_token);
        setStoredRefreshToken(tokenRes.refresh_token);
        setAccessToken(tokenRes.access_token);
        setMfaPendingToken(null);

        let authUser: AuthUser;
        if (tokenRes.user) {
          const initials = tokenRes.user.full_name
            ? tokenRes.user.full_name
                .split(" ")
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            : tokenRes.user.email.slice(0, 2).toUpperCase();

          authUser = {
            id: tokenRes.user.id,
            email: tokenRes.user.email,
            name: tokenRes.user.full_name,
            role: tokenRes.user.role,
            organization_id: tokenRes.user.organization_id,
            initials,
            is_active: tokenRes.user.is_active,
            mfa_enabled: tokenRes.user.mfa_enabled,
          };
        } else {
          authUser = await authApi.getMe();
        }

        setUser(authUser);
        setIsLoading(false);
        return authUser;
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    [mfaPendingToken]
  );

  // Conclusão do Login com Google OAuth2
  const completeGoogleLogin = useCallback(
    async (code: string, state: string): Promise<AuthUser> => {
      setIsLoading(true);
      try {
        const tokenRes = await authApi.googleCallback(code, state);

        setInMemoryAccessToken(tokenRes.access_token);
        setStoredRefreshToken(tokenRes.refresh_token);
        setAccessToken(tokenRes.access_token);
        setMfaPendingToken(null);

        const authUser = await authApi.getMe();
        setUser(authUser);
        setIsLoading(false);
        return authUser;
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    []
  );

  // Injeção direta de sessão (utilizada em testes e no painel dev)
  const setSession = useCallback((authUser: AuthUser, token: string) => {
    setUser(authUser);
    setAccessToken(token);
    setInMemoryAccessToken(token);
    setMfaPendingToken(null);
    setIsLoading(false);
    try {
      sessionStorage.setItem("infrawatch_dev_user", JSON.stringify(authUser));
      sessionStorage.setItem("infrawatch_dev_token", token);
    } catch {
      // Ignora falhas de storage em ambientes restritos
    }
  }, []);

  // Logout e revogação
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const storedRefresh = getStoredRefreshToken();
      await authApi.logout(storedRefresh);
    } catch {
      // Ignora falhas de rede no logout
    } finally {
      setUser(null);
      setAccessToken(null);
      setMfaPendingToken(null);
      setInMemoryAccessToken(null);
      setStoredRefreshToken(null);
      try {
        sessionStorage.removeItem("infrawatch_dev_user");
        sessionStorage.removeItem("infrawatch_dev_token");
      } catch {
        // noop
      }
      setIsLoading(false);
    }
  }, []);

  const clearMfaPending = useCallback(() => {
    setMfaPendingToken(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole | UserRole[]) => {
      if (!user) return false;
      const targetRoles = Array.isArray(roles) ? roles : [roles];
      return targetRoles.includes(user.role);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated,
      isLoading,
      mfaPendingToken,
      login,
      submitMfaChallenge,
      completeGoogleLogin,
      setSession,
      logout,
      clearMfaPending,
      hasRole,
    }),
    [
      user,
      accessToken,
      isAuthenticated,
      isLoading,
      mfaPendingToken,
      login,
      submitMfaChallenge,
      completeGoogleLogin,
      setSession,
      logout,
      clearMfaPending,
      hasRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um <AuthProvider>.");
  }
  return context;
}
