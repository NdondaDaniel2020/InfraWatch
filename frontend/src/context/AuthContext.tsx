import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthContextValue, AuthState } from "../types/auth";
import { useAuthStore } from "../stores/authStore";
import { authApi } from "../services/authApi";

export interface AuthProviderProps {
  children: React.ReactNode;
  initialState?: Partial<AuthState>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provedor de compatibilidade e gerenciamento de ciclo de vida da sessão.
 * No bootstrap, valida o refreshToken armazenado via /api/v1/auth/refresh,
 * mantendo o accessToken estritamente em memória volátil (ADR-033).
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialState,
}) => {
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(!initialState);

  useEffect(() => {
    if (initialState) {
      useAuthStore.setState((prev) => ({
        ...prev,
        ...initialState,
      }));
      setIsBootstrapping(false);
      return;
    }

    let isMounted = true;

    const bootstrapSession = async () => {
      const state = useAuthStore.getState();
      const storedRefreshToken = state.refreshToken;

      if (state.accessToken) {
        if (isMounted) setIsBootstrapping(false);
        return;
      }

      if (storedRefreshToken) {
        useAuthStore.setState({ isLoading: true });
        try {
          const res = await authApi.refresh(storedRefreshToken);
          if (isMounted) {
            useAuthStore.getState().setTokens(res.access_token, res.refresh_token);
            if (res.user) {
              useAuthStore.getState().setUser({
                id: res.user.id || "",
                email: res.user.email || "",
                name: res.user.full_name || "",
                role: res.user.role || "CLIENT_VIEWER",
                organization_id: res.user.organization_id,
                is_active: res.user.is_active ?? true,
                mfa_enabled: res.user.mfa_enabled ?? false,
              });
            }
          }
        } catch {
          if (isMounted) {
            useAuthStore.getState().reset();
          }
        } finally {
          if (isMounted) {
            useAuthStore.setState({ isLoading: false });
            setIsBootstrapping(false);
          }
        }
      } else {
        if (isMounted) setIsBootstrapping(false);
      }
    };

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [initialState]);

  const store = useAuthStore();
  const contextValue: AuthContextValue = {
    ...store,
    isLoading: store.isLoading || isBootstrapping,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook universal de consumo de autenticação e sessão.
 * Consome a store centralizada do Zustand (Issue #276).
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context) {
    return context;
  }
  return useAuthStore();
}

export default useAuth;
