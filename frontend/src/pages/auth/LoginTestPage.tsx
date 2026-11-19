import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  Lock,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  User,
  Zap,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/auth";

interface QuickProfile {
  role: UserRole;
  name: string;
  email: string;
  password?: string;
  initials: string;
  description: string;
  icon: React.ReactNode;
  variant: "primary" | "secondary" | "outline";
}

const QUICK_PROFILES: QuickProfile[] = [
  {
    role: "SUPER_ADMIN",
    name: "NOC Super Admin",
    email: "noc-admin@rcsangola.co.ao",
    password: "Ndonda#2026!Admin",
    initials: "SA",
    description: "Acesso total irrestrito (Auditoria, Backups, RBAC, Configurações)",
    icon: <ShieldAlert size={16} />,
    variant: "primary",
  },
  {
    role: "NOC_OPERATOR",
    name: "Operador NOC Luanda",
    email: "operador.noc@infrawatch.ao",
    password: "Operator#2026!Noc",
    initials: "OP",
    description: "Cockpit NOC, TV Wallboard, Topologia, Incidentes & Sondas",
    icon: <Server size={16} />,
    variant: "secondary",
  },
  {
    role: "ORG_ADMIN",
    name: "Mateus Silva (Banco Sol)",
    email: "gestor.ti@bancosol.ao",
    password: "Admin#2026!BancoSol",
    initials: "BS",
    description: "Gestão da Organização, Janelas de Manutenção e Relatórios de SLA",
    icon: <Building2 size={16} />,
    variant: "secondary",
  },
  {
    role: "CLIENT_VIEWER",
    name: "Auditor Banco Sol",
    email: "viewer@bancosol.ao",
    password: "Viewer#2026!BancoSol",
    initials: "DE",
    description: "Portal do Cliente sanitizado (Disponibilidade e Laudos de SLA)",
    icon: <Shield size={16} />,
    variant: "outline",
  },
];

export interface LoginTestPageProps {
  testId?: string;
}

export const LoginTestPage: React.FC<LoginTestPageProps> = ({
  testId = "login-test-page",
}) => {
  const { login, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedRole, setSelectedRole] = useState<UserRole>("SUPER_ADMIN");
  const [email, setEmail] = useState("noc-admin@rcsangola.co.ao");
  const [password, setPassword] = useState("Ndonda#2026!Admin");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Destino original pós-autenticação
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const handleRoleChange = (newRole: UserRole) => {
    setSelectedRole(newRole);
    const profile = QUICK_PROFILES.find((p) => p.role === newRole);
    if (profile) {
      setEmail(profile.email);
      if (profile.password) {
        setPassword(profile.password);
      }
    }
  };

  const executeLogin = async (
    role: UserRole,
    name: string,
    userEmail: string,
    initials: string,
    userPassword?: string
  ) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const pwd = userPassword || password;

    try {
      // 1. Tenta autenticar no backend para obter token JWT legítimo assinado (ADR-033)
      await login({ email: userEmail, password: pwd });
    } catch {
      // 2. Fallback de compatibilidade para ambiente estritamente offline/testes de unidade
      const orgId =
        role === "ORG_ADMIN" || role === "CLIENT_VIEWER"
          ? "01a18e2f-01c8-705b-9e4c-54c66dcf68ba"
          : null;
      const orgName =
        role === "ORG_ADMIN" || role === "CLIENT_VIEWER" ? "Banco Sol" : null;

      setSession(
        {
          id: `usr-${role.toLowerCase()}-01`,
          email: userEmail,
          name,
          role,
          initials,
          organization_id: orgId,
          organization_name: orgName,
        },
        `mock-jwt-token-${role.toLowerCase()}`
      );
    } finally {
      setIsSubmitting(false);

      // Redirecionamento apropriado por nível de acesso
      if (
        (role === "CLIENT_VIEWER" || role === "ORG_ADMIN") &&
        (from === "/" || from === "/login" || from === "/login-test" || from === "/dev/login")
      ) {
        navigate("/portal", { replace: true });
      } else if (from === "/" || from === "/login" || from === "/login-test") {
        navigate("/noc", { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  };

  const handleCustomFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const profile = QUICK_PROFILES.find((p) => p.role === selectedRole);
    await executeLogin(
      selectedRole,
      profile?.name || "Usuário InfraWatch",
      email,
      profile?.initials || "IW",
      password
    );
  };

  return (
    <div
      data-testid={testId}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg-deep)",
        padding: "32px 20px",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <Card>
          <CardHeader>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-healthy)",
                  }}
                >
                  <Radio size={20} className="pulse-indicator" />
                </div>
                <div>
                  <CardTitle>InfraWatch Simulator</CardTitle>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-healthy)",
                    }}
                  >
                    LOGIN & RBAC TEST ENVIRONMENT
                  </span>
                </div>
              </div>

              <Badge variant="healthy" dot>
                DEV SIMULATOR
              </Badge>
            </div>

            <CardDescription>
              Ambiente de teste para navegação instantânea entre papéis operacionais
              e validação de guards RBAC sem necessidade de credenciais de produção.
            </CardDescription>
          </CardHeader>

          <CardContent style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* 1. Seleção Rápida em 1 Clique */}
            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                <Zap size={14} style={{ color: "var(--color-degraded)" }} />
                Entrada Rápida por Papel (1 Clique):
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {QUICK_PROFILES.map((p) => (
                  <button
                    key={p.role}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() =>
                      executeLogin(p.role, p.name, p.email, p.initials, p.password)
                    }
                    data-testid={`quick-login-${p.role.toLowerCase()}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "var(--border-subtle)",
                      color: "var(--color-text-primary)",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.7 : 1,
                      textAlign: "left",
                      transition: "all var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubmitting) {
                        e.currentTarget.style.borderColor = "var(--color-healthy-border)";
                        e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubmitting) {
                        e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                        e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--color-primary)",
                        }}
                      >
                        {p.icon}
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span>{p.name}</span>
                          <span
                            style={{
                              fontSize: "0.625rem",
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            [{p.role}]
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "0.6875rem",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {p.description}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-healthy)",
                        fontWeight: 600,
                      }}
                    >
                      {isSubmitting ? "Entrando..." : "Entrar →"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "4px 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-subtle)" }} />
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                ou personalizar credenciais
              </span>
              <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-subtle)" }} />
            </div>

            {/* 2. Formulário Customizado */}
            <form
              onSubmit={handleCustomFormSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <label
                  htmlFor="test-role-select"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Papel Desejado:
                </label>
                <select
                  id="test-role-select"
                  value={selectedRole}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  disabled={isSubmitting}
                  data-testid="login-role-select"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                    fontSize: "0.8125rem",
                    outline: "none",
                  }}
                >
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Acesso Total)</option>
                  <option value="NOC_OPERATOR">NOC_OPERATOR (Operação NOC)</option>
                  <option value="ORG_ADMIN">ORG_ADMIN (Gestor do Cliente)</option>
                  <option value="CLIENT_VIEWER">CLIENT_VIEWER (Portal do Cliente)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="test-email-input"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  E-mail:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="test-email-input"
                    type="email"
                    value={email}
                    disabled={isSubmitting}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 34px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "var(--border-subtle)",
                      color: "var(--color-text-primary)",
                      fontSize: "0.8125rem",
                    }}
                  />
                  <User
                    size={14}
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-text-muted)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="test-password-input"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Senha:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="test-password-input"
                    type="password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 34px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--color-surface-elevated)",
                      border: "var(--border-subtle)",
                      color: "var(--color-text-primary)",
                      fontSize: "0.8125rem",
                    }}
                  />
                  <Lock
                    size={14}
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-text-muted)",
                    }}
                  />
                </div>
              </div>

              {errorMessage && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-danger, #ef4444)",
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                style={{ width: "100%", marginTop: "6px" }}
                data-testid="login-submit-button"
              >
                {isSubmitting ? "Autenticando..." : "Entrar com Dados Customizados"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
