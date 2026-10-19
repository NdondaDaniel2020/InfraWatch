import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, Radio, Shield, User } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/auth";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedRole, setSelectedRole] = useState<UserRole>("NOC_OPERATOR");
  const [email, setEmail] = useState("daniel.ndonda@infrawatch.io");
  const [password, setPassword] = useState("••••••••••••");

  // Destino original pós-autenticação
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login(
      {
        id: "usr-01",
        email,
        name: selectedRole === "CLIENT_VIEWER" ? "Cliente Corporativo" : "Daniel Ndonda",
        role: selectedRole,
        initials: selectedRole === "CLIENT_VIEWER" ? "CC" : "DN",
      },
      "fake-jwt-access-token-123456"
    );

    // Se cliente viewer, vai para /portal, senão destino original
    if (selectedRole === "CLIENT_VIEWER" && (from === "/" || from === "/login")) {
      navigate("/portal", { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div
      data-testid="login-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg-deep)",
        padding: "24px",
      }}
    >
      <Card style={{ maxWidth: "420px", width: "100%" }}>
        <CardHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
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
              <CardTitle>InfraWatch NOC</CardTitle>
              <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-healthy)" }}>
                AUTENTICAÇÃO CENTRALIZADA
              </span>
            </div>
          </div>
          <CardDescription>
            Entre com suas credenciais corporativas ou selecione um perfil de simulação.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label
                htmlFor="login-role"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Perfil de Acesso (RBAC):
              </label>
              <select
                id="login-role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface-elevated)",
                  border: "var(--border-subtle)",
                  color: "var(--color-text-primary)",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
                data-testid="login-role-select"
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN (Acesso Total)</option>
                <option value="NOC_OPERATOR">NOC_OPERATOR (Operação NOC)</option>
                <option value="ORG_ADMIN">ORG_ADMIN (Gestor do Cliente)</option>
                <option value="CLIENT_VIEWER">CLIENT_VIEWER (Portal do Cliente)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="login-email"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                E-mail Corporativo:
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                    fontSize: "0.875rem",
                  }}
                  required
                />
                <User
                  size={16}
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
                htmlFor="login-password"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Senha:
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "var(--border-subtle)",
                    color: "var(--color-text-primary)",
                    fontSize: "0.875rem",
                  }}
                  required
                />
                <Lock
                  size={16}
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
              style={{ width: "100%", marginTop: "8px" }}
              leftIcon={<Shield size={16} />}
              data-testid="login-submit-button"
            >
              Acessar Plataforma
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
