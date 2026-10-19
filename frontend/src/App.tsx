import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TelemetryProvider } from "./context/TelemetryContext";
import { AppRoutes } from "./routes/AppRoutes";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TelemetryProvider>
          <AppRoutes />
        </TelemetryProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
