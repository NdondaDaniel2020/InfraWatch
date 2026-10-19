import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  AuthContextValue,
  AuthState,
  AuthUser,
  UserRole,
} from "../types/auth";

export interface AuthProviderProps {
  children: React.ReactNode;
  initialState?: Partial<AuthState>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialState,
}) => {
  const [user, setUser] = useState<AuthUser | null>(
    initialState?.user ?? null
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    initialState?.accessToken ?? null
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    initialState?.isLoading ?? false
  );

  const isAuthenticated = Boolean(user && accessToken);

  const login = useCallback((authUser: AuthUser, token: string) => {
    setUser(authUser);
    setAccessToken(token);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setIsLoading(false);
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
      login,
      logout,
      hasRole,
    }),
    [user, accessToken, isAuthenticated, isLoading, login, logout, hasRole]
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
