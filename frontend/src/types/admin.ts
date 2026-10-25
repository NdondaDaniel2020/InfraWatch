/**
 * Tipagens para Governança e Gestão Administrativa de Usuários e Organizações (ADR-003, ADR-012).
 */

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "SUPER_ADMIN" | "NOC_OPERATOR" | "ORG_ADMIN" | "CLIENT_VIEWER" | string;
  is_active: boolean;
  is_verified: boolean;
  organization_id: string | null;
  organization_name?: string;
  created_at: string;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  cnpj?: string | null;
  is_active: boolean;
  created_at: string;
  users_count?: number;
}

export interface AdminOrganizationListResponse {
  items: AdminOrganization[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  cnpj?: string;
}

export interface UpdateUserRoleInput {
  role: string;
}
