import React, { createContext, useContext, useEffect } from "react";
import type { AuthContextValue, AuthState } from "../types/auth";
import { useAuthStore } from "../stores/authStore";

export interface AuthProviderProps {
  children: React.ReactNode;
  initialState?: Partial<AuthState>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provedor de compatibilidade retroativa para a árvore de componentes.
 * Sincroniza initialState com a store Zustand e repassa o estado reativo.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialState,
}) => {
  useEffect(() => {
    if (initialState) {
      useAuthStore.setState((prev) => ({
        ...prev,
        ...initialState,
      }));
    }
  }, [initialState]);

  const store = useAuthStore();

  return (
    <AuthContext.Provider value={store}>
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
