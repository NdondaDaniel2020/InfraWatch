import { apiClient } from "./apiClient";
import {
  AdminOrganization,
  AdminOrganizationListResponse,
  AdminUser,
  AdminUserListResponse,
  CreateOrganizationInput,
  CreateUserInput,
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
   * Criação administrativa de novo usuário (restrito a SUPER_ADMIN e ORG_ADMIN).
   */
  createUser: async (input: CreateUserInput): Promise<AdminUser> => {
    return await apiClient.post<AdminUser>("/api/v1/users", input);
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
   * Desativa/suspende a conta de um usuário e revoga tokens ativos.
   */
  deactivateUser: async (userId: string): Promise<AdminUser> => {
    return await apiClient.post<AdminUser>(`/api/v1/users/${userId}/deactivate`);
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
      contact_email: typeof org.contact_email === "string" ? org.contact_email : null,
      contact_phone: typeof org.contact_phone === "string" ? org.contact_phone : null,
      tier: typeof org.tier === "string" ? org.tier : "STANDARD",
      sla_target_default:
        typeof org.sla_target_default === "number" || typeof org.sla_target_default === "string"
          ? org.sla_target_default
          : "99.50",
      cnpj: typeof org.cnpj === "string" ? org.cnpj : null,
      is_active: Boolean(org.is_active),
      created_at: String(org.created_at ?? ""),
      users_count: typeof org.users_count === "number" ? org.users_count : 0,
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
