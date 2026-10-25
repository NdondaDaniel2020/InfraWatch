import { apiClient } from "./apiClient";
import {
  AdminOrganization,
  AdminOrganizationListResponse,
  AdminUser,
  AdminUserListResponse,
  CreateOrganizationInput,
  UpdateUserRoleInput,
} from "../types/admin";
import { mockAdminOrganizations, mockAdminUsers } from "../mocks/auditMocks";

export const adminApi = {
  /**
   * Lista usuários cadastrados com suporte a paginação e filtro por organização.
   */
  listUsers: async (params?: {
    page?: number;
    size?: number;
    organization_id?: string;
  }): Promise<AdminUserListResponse> => {
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.size) searchParams.set("size", String(params.size));
      if (params?.organization_id) {
        searchParams.set("organization_id", params.organization_id);
      }
      const qs = searchParams.toString();
      const endpoint = qs ? `/api/v1/users?${qs}` : "/api/v1/users";
      return await apiClient.get<AdminUserListResponse>(endpoint);
    } catch {
      let items = [...mockAdminUsers];
      if (params?.organization_id) {
        items = items.filter((u) => u.organization_id === params.organization_id);
      }
      return {
        items,
        total: items.length,
        page: params?.page || 1,
        page_size: params?.size || 20,
      };
    }
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
    try {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.size) searchParams.set("size", String(params.size));
      const qs = searchParams.toString();
      const endpoint = qs ? `/api/v1/organizations?${qs}` : "/api/v1/organizations";
      return await apiClient.get<AdminOrganizationListResponse>(endpoint);
    } catch {
      return {
        items: mockAdminOrganizations,
        total: mockAdminOrganizations.length,
        page: params?.page || 1,
        page_size: params?.size || 20,
      };
    }
  },

  /**
   * Criação de uma nova organização tenant (restrito a SUPER_ADMIN).
   */
  createOrganization: async (data: CreateOrganizationInput): Promise<AdminOrganization> => {
    return await apiClient.post<AdminOrganization>("/api/v1/organizations", data);
  },
};
