import React from "react";
import { LoginTestPage } from "./LoginTestPage";

/**
 * Página de Login da aplicação.
 * Enquanto a Issue #216 (Tarefa 7.4 com desafio MFA TOTP e Google OAuth) não for implementada,
 * atua renderizando o ambiente de teste e seleção rápida de papéis RBAC.
 */
export const LoginPage: React.FC = () => {
  return <LoginTestPage testId="login-page" />;
};

export { LoginTestPage };
