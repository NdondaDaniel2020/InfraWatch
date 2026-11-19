import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Building2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  Shield,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../../services/adminApi";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { CreateOrganizationInput, CreateUserInput } from "../../types/admin";

export const AdminManagementPage: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = isSuperAdmin || user?.role === "ORG_ADMIN";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"users" | "organizations">("users");
  const [searchUser, setSearchUser] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Estado do Modal de Usuário
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"SUPER_ADMIN" | "NOC_OPERATOR" | "ORG_ADMIN" | "CLIENT_VIEWER">("CLIENT_VIEWER");
  const [newUserOrgId, setNewUserOrgId] = useState("");

  // Estado do Modal de Organização
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [newOrgContactEmail, setNewOrgContactEmail] = useState("");
  const [newOrgContactPhone, setNewOrgContactPhone] = useState("");
  const [newOrgTier, setNewOrgTier] = useState<"STANDARD" | "PROFESSIONAL" | "ENTERPRISE_GOLD">("STANDARD");
  const [newOrgSlaTarget, setNewOrgSlaTarget] = useState<number>(99.50);

  // Query de Usuários
  const {
    data: usersData,
    isLoading: isLoadingUsers,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => adminApi.listUsers(),
  });

  // Query de Organizações
  const { data: orgsData } = useQuery({
    queryKey: ["adminOrgs"],
    queryFn: () => adminApi.listOrganizations(),
  });

  // Mutação para Alterar Papel
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.updateUserRole(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast.success("Papel RBAC atualizado com sucesso!");
    },
    onError: () => {
      toast.error("Falha ao atualizar papel do usuário.");
    },
  });

  // Mutação para Reativar Usuário
  const activateUserMutation = useMutation({
    mutationFn: (userId: string) => adminApi.activateUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast.success("Usuário reativado com sucesso!");
    },
    onError: () => {
      toast.error("Falha ao reativar usuário.");
    },
  });

  // Mutação para Desativar / Suspender Usuário
  const deactivateUserMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deactivateUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast.success("Conta de usuário suspensa com sucesso.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Falha ao suspender conta de usuário.");
    },
  });

  // Mutação para Criar Usuário
  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserInput) => adminApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["adminOrgs"] });
      toast.success("Usuário cadastrado e ativado com sucesso!");
      setIsCreateUserModalOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("CLIENT_VIEWER");
      setNewUserOrgId("");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar usuário.");
    },
  });

  // Mutação para Criar Organização
  const createOrgMutation = useMutation({
    mutationFn: (data: CreateOrganizationInput) =>
      adminApi.createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminOrgs"] });
      toast.success("Organização cadastrada com sucesso!");
      setIsCreateOrgModalOpen(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setIsSlugManuallyEdited(false);
      setNewOrgContactEmail("");
      setNewOrgContactPhone("");
      setNewOrgTier("STANDARD");
      setNewOrgSlaTarget(99.50);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar organização.");
    },
  });

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      toast.error("Nome, e-mail e senha provisória são obrigatórios.");
      return;
    }
    createUserMutation.mutate({
      full_name: newUserName.trim(),
      email: newUserEmail.trim(),
      password: newUserPassword,
      role: newUserRole,
      organization_id: newUserOrgId || null,
    });
  };

  const handleCreateOrgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      toast.error("Nome e Slug são obrigatórios.");
      return;
    }
    createOrgMutation.mutate({
      name: newOrgName.trim(),
      slug: newOrgSlug.trim(),
      contact_email: newOrgContactEmail.trim() || undefined,
      contact_phone: newOrgContactPhone.trim() || undefined,
      tier: newOrgTier,
      sla_target_default: newOrgSlaTarget,
    });
  };

  const filteredUsers = (usersData?.items || []).filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div
      data-testid="admin-management-page"
      className="p-4 md:p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full"
    >
      {/* 1. Header Administrativo */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Link to="/noc" className="text-slate-400 hover:text-slate-200">
              Cockpit
            </Link>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">Administração &amp; RBAC</span>
          </div>
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Gestão Administrativa de Usuários e Organizações
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Painel unificado de governança e controle de acesso baseado em papéis (RBAC). Gerenciamento
            de contas, provisionamento de clientes corporativos e auditoria de perfis.
          </p>
        </div>

        {/* Alternador de Abas */}
        <div className="flex items-center gap-2 bg-obsidian-900 p-1 rounded-xl border border-obsidian-800 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "users"
                ? "bg-emerald-500 text-obsidian-950 font-bold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Users size={16} />
            <span>Usuários &amp; Perfis ({usersData?.total || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("organizations")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "organizations"
                ? "bg-emerald-500 text-obsidian-950 font-bold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Building2 size={16} />
            <span>Organizações Clientes ({orgsData?.total || 0})</span>
          </button>
        </div>
      </section>

      {/* 2. Aba de Usuários */}
      {activeTab === "users" && (
        <section className="flex flex-col gap-4">
          {/* Barra de Filtros e Ações */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-obsidian-900 p-3 rounded-xl border border-obsidian-800">
            <div className="flex items-center gap-2.5 flex-1">
              <div className="relative w-full sm:w-80">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar usuário por nome ou email…"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-emerald-500"
                />
              </div>

              <select
                aria-label="Filtrar por papel"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500"
              >
                <option value="ALL">Todos os Papéis</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="NOC_OPERATOR">NOC_OPERATOR</option>
                <option value="ORG_ADMIN">ORG_ADMIN</option>
                <option value="CLIENT_VIEWER">CLIENT_VIEWER</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => refetchUsers()}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw size={14} className={isLoadingUsers ? "animate-spin" : ""} />
                <span>Atualizar</span>
              </Button>

              {canManage && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setIsCreateUserModalOpen(true)}
                  className="h-8 text-xs gap-1.5"
                  data-testid="create-user-btn"
                >
                  <UserPlus size={14} />
                  <span>Novo Usuário</span>
                </Button>
              )}
            </div>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-obsidian-800 bg-obsidian-950/40 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Usuário</th>
                  <th className="py-2.5 px-4">Organização</th>
                  <th className="py-2.5 px-3">Papel RBAC</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-800/60 font-mono">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      Nenhum usuário corresponde aos filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-obsidian-850/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white font-sans">{u.full_name}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>

                      <td className="py-3 px-4 font-sans text-slate-300">
                        {u.organization_name || (u.organization_id ? "Organização Cliente" : "InfraWatch Core (Global)")}
                      </td>

                      <td className="py-3 px-3">
                        {isSuperAdmin ? (
                          <select
                            aria-label={`Alterar papel de ${u.full_name}`}
                            value={u.role}
                            onChange={(e) =>
                              updateRoleMutation.mutate({ userId: u.id, role: e.target.value })
                            }
                            className="bg-obsidian-950 border border-obsidian-800 rounded px-2 py-1 text-[11px] text-slate-200 focus-visible:border-emerald-500"
                          >
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            <option value="NOC_OPERATOR">NOC_OPERATOR</option>
                            <option value="ORG_ADMIN">ORG_ADMIN</option>
                            <option value="CLIENT_VIEWER">CLIENT_VIEWER</option>
                          </select>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-300 px-2 py-1 bg-obsidian-950 rounded border border-obsidian-800/80">
                            {u.role}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {u.is_active ? (
                          <Badge variant="healthy" className="text-[10px]">
                            ATIVO
                          </Badge>
                        ) : (
                          <Badge variant="critical" className="text-[10px]">
                            SUSPENSO
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!u.is_active && canManage && (
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() => activateUserMutation.mutate(u.id)}
                              className="h-7 text-[10px] px-2.5"
                            >
                              Reativar
                            </Button>
                          )}

                          {u.is_active && canManage && u.id !== user?.id && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (window.confirm(`Tem certeza que deseja suspender a conta de ${u.full_name}? As sessões ativas serão desconectadas imediatamente.`)) {
                                  deactivateUserMutation.mutate(u.id);
                                }
                              }}
                              className="h-7 text-[10px] px-2.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
                            >
                              Suspender
                            </Button>
                          )}

                          {u.id === user?.id && (
                            <span className="text-[10px] font-mono text-slate-500 italic px-1">
                              Sua Conta
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 3. Aba de Organizações */}
      {activeTab === "organizations" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-obsidian-900 p-3 rounded-xl border border-obsidian-800">
            <div className="text-xs text-slate-400">
              Total de Clientes Multi-Tenant Cadastrados:{" "}
              <strong className="text-white">{orgsData?.total || 0}</strong>
            </div>

            {isSuperAdmin && (
              <Button
                type="button"
                variant="primary"
                onClick={() => setIsCreateOrgModalOpen(true)}
                className="h-8 text-xs gap-1.5"
                data-testid="create-organization-btn"
              >
                <Plus size={14} />
                <span>Nova Organização</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(orgsData?.items || []).map((org) => (
              <div
                key={org.id}
                className="bg-obsidian-900 rounded-xl border border-obsidian-800 p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-white text-sm">{org.name}</h4>
                      <span className="text-[11px] font-mono text-slate-400">slug: {org.slug}</span>
                    </div>
                  </div>
                  <Badge variant={org.is_active ? "healthy" : "critical"}>
                    {org.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-slate-300 font-sans pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Shield size={12} className="text-emerald-400" />
                    <span>Tier: <strong className="text-white font-mono">{org.tier || "STANDARD"}</strong></span>
                    <span className="text-obsidian-700">|</span>
                    <span>Meta SLA: <strong className="text-white font-mono">{org.sla_target_default}%</strong></span>
                  </div>
                  {org.contact_email && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Mail size={12} className="text-sky-400" />
                      <span className="truncate">{org.contact_email}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-obsidian-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Usuários: <strong className="text-white">{org.users_count ?? 0}</strong></span>
                  <span className="text-emerald-400 font-semibold">{org.tier || "STANDARD"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal de Criação de Usuário */}
      {isCreateUserModalOpen && (
        <div className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
              <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
                <UserPlus size={18} className="text-emerald-400" />
                <span>Novo Usuário Administrativo</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateUserModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="flex flex-col gap-3 font-sans text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ana Paula Silva"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">E-mail Corporativo *</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: ana.silva@empresa.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Senha Inicial Provisória *</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Papel RBAC *</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as any)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono text-xs"
                  >
                    <option value="CLIENT_VIEWER">CLIENT_VIEWER</option>
                    <option value="ORG_ADMIN">ORG_ADMIN</option>
                    {isSuperAdmin && <option value="NOC_OPERATOR">NOC_OPERATOR</option>}
                    {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Organização Tenant</label>
                  <select
                    value={newUserOrgId}
                    onChange={(e) => setNewUserOrgId(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono text-xs"
                  >
                    <option value="">InfraWatch Core (Global)</option>
                    {(orgsData?.items || []).map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-obsidian-800 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateUserModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? "Cadastrando..." : "Cadastrar Usuário"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação de Organização */}
      {isCreateOrgModalOpen && (
        <div className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
              <h3 className="font-display font-bold text-white text-base">Nova Organização Cliente</h3>
              <button
                type="button"
                onClick={() => setIsCreateOrgModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrgSubmit} className="flex flex-col gap-3 font-sans text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Nome da Organização *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Banco Sol S.A."
                  value={newOrgName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewOrgName(val);
                    if (!isSlugManuallyEdited) {
                      setNewOrgSlug(
                        val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                      );
                    }
                  }}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Slug Identificador *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: banco-sol"
                  value={newOrgSlug}
                  onChange={(e) => {
                    setIsSlugManuallyEdited(true);
                    setNewOrgSlug(e.target.value);
                  }}
                  className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">E-mail de Contato</label>
                  <input
                    type="email"
                    placeholder="contato@cliente.ao"
                    value={newOrgContactEmail}
                    onChange={(e) => setNewOrgContactEmail(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Telefone de Suporte</label>
                  <input
                    type="text"
                    placeholder="+244 923 000 000"
                    value={newOrgContactPhone}
                    onChange={(e) => setNewOrgContactPhone(e.target.value)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Nível de Serviço (Tier)</label>
                  <select
                    value={newOrgTier}
                    onChange={(e) => setNewOrgTier(e.target.value as any)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono text-xs"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="PROFESSIONAL">PROFESSIONAL</option>
                    <option value="ENTERPRISE_GOLD">ENTERPRISE_GOLD</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Meta de SLA (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="80"
                    max="100"
                    value={newOrgSlaTarget}
                    onChange={(e) => setNewOrgSlaTarget(parseFloat(e.target.value) || 99.50)}
                    className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg p-2 text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-obsidian-800 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOrgModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={createOrgMutation.isPending}>
                  {createOrgMutation.isPending ? "Cadastrando..." : "Cadastrar Organização"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
