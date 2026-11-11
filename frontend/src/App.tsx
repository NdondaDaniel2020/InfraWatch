import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TelemetryProvider } from "./context/TelemetryContext";
import { AppRoutes } from "./routes/AppRoutes";
import { Toaster } from "./components/ui/sonner";
import { useAuthStore } from "./stores/authStore";

const AuthenticatedTelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return <TelemetryProvider enabled={isAuthenticated}>{children}</TelemetryProvider>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedTelemetryProvider>
          <AppRoutes />
          <Toaster position="top-right" />
        </AuthenticatedTelemetryProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
