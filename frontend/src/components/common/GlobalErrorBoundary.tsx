import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Captura exceções não tratadas durante a renderização do React,
 * impedindo a tela inteira de ficar branca e fornecendo mecanismo de recuperação.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error("GlobalErrorBoundary capturou uma falha não tratada:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="global-error-boundary"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--color-bg-deep)",
            padding: "24px",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          <div
            style={{
              maxWidth: "560px",
              width: "100%",
              backgroundColor: "var(--color-surface-card)",
              border: "1px solid var(--color-critical-border)",
              borderRadius: "var(--radius-lg)",
              padding: "32px",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-critical-bg)",
                  color: "var(--color-critical)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                  Falha Inesperada no Cockpit
                </h2>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--color-text-secondary)",
                    margin: "4px 0 0 0",
                  }}
                >
                  Ocorreu uma exceção crítica na camada visual de observabilidade.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  border: "var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 16px",
                  fontSize: "0.8125rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-critical)",
                  wordBreak: "break-all",
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                borderTop: "var(--border-subtle)",
                paddingTop: "16px",
              }}
            >
              <Button
                variant="primary"
                onClick={this.handleReset}
                leftIcon={<RefreshCw size={16} />}
              >
                Recarregar Cockpit
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
