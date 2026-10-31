import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type {
  AuthStore,
  AuthUser,
  LoginCredentials,
  LoginResult,
  UserRole,
} from "../types/auth";
import { authApi } from "../services/authApi";

const getInitialState = () => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  mfaPendingToken: null,
});

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...getInitialState(),

        login: async (credentials: LoginCredentials): Promise<LoginResult> => {
          set({ isLoading: true, mfaPendingToken: null });
          try {
            const res = await authApi.login(credentials);

            if ("mfa_required" in res && res.mfa_required) {
              set({
                mfaPendingToken: res.mfa_pending_token,
                isLoading: false,
              });
              return {
                success: false,
                mfaRequired: true,
                mfaPendingToken: res.mfa_pending_token,
              };
            }

            const tokenRes = res as import("../types/auth").TokenResponse;
            const authUser: AuthUser = {
              id: tokenRes.user?.id || "",
              email: tokenRes.user?.email || credentials.email,
              name: tokenRes.user?.full_name || "",
              role: tokenRes.user?.role || "CLIENT_VIEWER",
              organization_id: tokenRes.user?.organization_id,
              is_active: tokenRes.user?.is_active ?? true,
              mfa_enabled: tokenRes.user?.mfa_enabled ?? false,
            };

            set({
              user: authUser,
              accessToken: tokenRes.access_token,
              refreshToken: tokenRes.refresh_token,
              isAuthenticated: true,
              isLoading: false,
              mfaPendingToken: null,
            });

            return {
              success: true,
              user: authUser,
              accessToken: tokenRes.access_token,
              mfaRequired: false,
            };
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        submitMfaChallenge: async (code: string): Promise<AuthUser> => {
          const { mfaPendingToken } = get();
          if (!mfaPendingToken) {
            throw new Error("Sessão MFA pendente expirada ou inexistente.");
          }

          set({ isLoading: true });
          try {
            const tokenRes = await authApi.loginMfaChallenge({
              mfa_pending_token: mfaPendingToken,
              code,
            });

            const authUser: AuthUser = {
              id: tokenRes.user?.id || "",
              email: tokenRes.user?.email || "",
              name: tokenRes.user?.full_name || "",
              role: tokenRes.user?.role || "CLIENT_VIEWER",
              organization_id: tokenRes.user?.organization_id,
              is_active: tokenRes.user?.is_active ?? true,
              mfa_enabled: true,
            };

            set({
              user: authUser,
              accessToken: tokenRes.access_token,
              refreshToken: tokenRes.refresh_token,
              isAuthenticated: true,
              isLoading: false,
              mfaPendingToken: null,
            });

            return authUser;
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        completeGoogleLogin: async (code: string, state: string): Promise<AuthUser> => {
          set({ isLoading: true });
          try {
            const tokenRes = await authApi.googleCallback(code, state);

            const authUser: AuthUser = {
              id: tokenRes.user?.id || "",
              email: tokenRes.user?.email || "",
              name: tokenRes.user?.full_name || "",
              role: tokenRes.user?.role || "CLIENT_VIEWER",
              organization_id: tokenRes.user?.organization_id,
              is_active: tokenRes.user?.is_active ?? true,
              mfa_enabled: tokenRes.user?.mfa_enabled ?? false,
            };

            set({
              user: authUser,
              accessToken: tokenRes.access_token,
              refreshToken: tokenRes.refresh_token,
              isAuthenticated: true,
              isLoading: false,
              mfaPendingToken: null,
            });

            return authUser;
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        setSession: (user: AuthUser, token: string): void => {
          set({
            user,
            accessToken: token,
            isAuthenticated: true,
            isLoading: false,
          });
        },

        setTokens: (accessToken: string | null, refreshToken: string | null): void => {
          set((state) => ({
            accessToken,
            refreshToken: refreshToken !== null ? refreshToken : state.refreshToken,
            isAuthenticated: Boolean(accessToken),
          }));
        },

        setUser: (user: AuthUser | null): void => {
          set((state) => ({
            user,
            isAuthenticated: Boolean(user && state.accessToken),
          }));
        },

        logout: async (): Promise<void> => {
          try {
            await authApi.logout();
          } catch {
            // Logout resiliente: limpa credenciais locais mesmo com erro de rede
          } finally {
            set(getInitialState());
            try {
              localStorage.removeItem("infrawatch_auth");
              localStorage.removeItem("infrawatch_refresh_token");
              sessionStorage.clear();
            } catch {
              // Silencioso em ambientes restritos
            }
          }
        },

        clearMfaPending: (): void => {
          set({ mfaPendingToken: null });
        },

        hasRole: (roles: UserRole | UserRole[]): boolean => {
          const { user } = get();
          if (!user) return false;
          if (Array.isArray(roles)) {
            return roles.includes(user.role);
          }
          return user.role === roles;
        },

        reset: (): void => {
          set(getInitialState());
        },
      }),
      {
        name: "infrawatch_auth",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          user: state.user,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: "AuthStore" }
  )
);

export default useAuthStore;
