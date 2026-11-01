import { apiClient } from "./apiClient";
import {
  AdminOrganization,
  AdminOrganizationListResponse,
  AdminUser,
  AdminUserListResponse,
  CreateOrganizationInput,
  UpdateUserRoleInput,
} from "../types/admin";

export const adminApi = {
  /**
   * Lista usuários cadastrados com suporte a paginação e filtro por organização.
   */
  listUsers: async (params?: {
    page?: number;
    size?: number;
    organization_id?: string;
  }): Promise<AdminUserListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.size) searchParams.set("size", String(params.size));
    if (params?.organization_id) {
      searchParams.set("organization_id", params.organization_id);
    }
    const qs = searchParams.toString();
    const endpoint = qs ? `/api/v1/users?${qs}` : "/api/v1/users";
    const res = await apiClient.get<AdminUserListResponse>(endpoint);
    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para listagem de usuários.");
    }
    return res;
  },

  /**
   * Atualiza o papel de permissão RBAC de um usuário.
   */
  updateUserRole: async (userId: string, input: UpdateUserRoleInput): Promise<AdminUser> => {
    return await apiClient.put<AdminUser>(`/api/v1/users/${userId}/roles`, input);
  },

  /**
   * Reativa um usuário suspenso.
   */
  activateUser: async (userId: string): Promise<AdminUser> => {
    return await apiClient.post<AdminUser>(`/api/v1/users/${userId}/activate`);
  },

  /**
   * Lista organizações com paginação.
   */
  listOrganizations: async (params?: {
    page?: number;
    size?: number;
    }): Promise<AdminOrganizationListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.size) searchParams.set("size", String(params.size));
    const qs = searchParams.toString();
    const endpoint = qs ? `/api/v1/organizations?${qs}` : "/api/v1/organizations";
    const res = await apiClient.get<{
      items?: Array<Record<string, unknown>>;
      total?: number;
      page?: number;
      size?: number;
    }>(endpoint);

    if (!res || !Array.isArray(res.items)) {
      throw new Error("Resposta inválida do backend para a lista de organizações.");
    }

    const items: AdminOrganization[] = res.items.map((org) => ({
      id: String(org.id ?? ""),
      name: String(org.name ?? ""),
      slug: String(org.slug ?? ""),
      cnpj: typeof org.cnpj === "string" ? org.cnpj : null,
      is_active: Boolean(org.is_active),
      created_at: String(org.created_at ?? ""),
      ...(typeof org.users_count === "number"
        ? { users_count: org.users_count }
        : {}),
    }));

    return {
      items,
      total: typeof res.total === "number" ? res.total : items.length,
      page: typeof res.page === "number" ? res.page : params?.page || 1,
      page_size:
        typeof res.size === "number"
          ? res.size
          : params?.size || items.length,
    };
  },

  /**
   * Criação de uma nova organização tenant (restrito a SUPER_ADMIN).
   */
  createOrganization: async (data: CreateOrganizationInput): Promise<AdminOrganization> => {
    return await apiClient.post<AdminOrganization>("/api/v1/organizations", data);
  },
};
