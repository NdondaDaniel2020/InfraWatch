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
  initials: string;
  description: string;
  icon: React.ReactNode;
  variant: "primary" | "secondary" | "outline";
}

const QUICK_PROFILES: QuickProfile[] = [
  {
    role: "SUPER_ADMIN",
    name: "Daniel Ndonda",
    email: "admin@infrawatch.io",
    initials: "DN",
    description: "Acesso total irrestrito (Auditoria, Backups, RBAC)",
    icon: <ShieldAlert size={16} />,
    variant: "primary",
  },
  {
    role: "NOC_OPERATOR",
    name: "Operador NOC Luanda",
    email: "noc.operator@infrawatch.io",
    initials: "OP",
    description: "Cockpit NOC, TV Wallboard, Incidentes & Sondas",
    icon: <Server size={16} />,
    variant: "secondary",
  },
  {
    role: "ORG_ADMIN",
    name: "Gestor TI Banco Sol",
    email: "ti.gestor@bancosol.ao",
    initials: "BS",
    description: "Gestão da Organização e Relatórios de SLA",
    icon: <Building2 size={16} />,
    variant: "secondary",
  },
  {
    role: "CLIENT_VIEWER",
    name: "Diretoria Executiva",
    email: "diretoria@bancosol.ao",
    initials: "DE",
    description: "Portal do Cliente sanitizado (Disponibilidade e SLA)",
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
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedRole, setSelectedRole] = useState<UserRole>("NOC_OPERATOR");
  const [email, setEmail] = useState("daniel.ndonda@infrawatch.io");
  const [password, setPassword] = useState("••••••••••••");

  // Destino original pós-autenticação
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const executeLogin = (
    role: UserRole,
    name: string,
    userEmail: string,
    initials: string
  ) => {
    setSession(
      {
        id: `usr-${role.toLowerCase()}-01`,
        email: userEmail,
        name,
        role,
        initials,
      },
      `mock-jwt-token-${role.toLowerCase()}`
    );

    // Se cliente viewer, vai para /portal, senão destino original
    if (
      role === "CLIENT_VIEWER" &&
      (from === "/" || from === "/login" || from === "/login-test" || from === "/dev/login")
    ) {
      navigate("/portal", { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  };

  const handleCustomFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const profile = QUICK_PROFILES.find((p) => p.role === selectedRole);
    executeLogin(
      selectedRole,
      profile?.name || "Usuário InfraWatch",
      email,
      profile?.initials || "IW"
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
                    onClick={() =>
                      executeLogin(p.role, p.name, p.email, p.initials)
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
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-healthy-border)";
                      e.currentTarget.style.backgroundColor = "var(--color-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                      e.currentTarget.style.backgroundColor = "var(--color-surface-elevated)";
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
                      Entrar →
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
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
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
                  Senha Simulada:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="test-password-input"
                    type="password"
                    value={password}
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

              <Button
                type="submit"
                variant="primary"
                style={{ width: "100%", marginTop: "6px" }}
                data-testid="login-submit-button"
              >
                Entrar com Dados Customizados
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
