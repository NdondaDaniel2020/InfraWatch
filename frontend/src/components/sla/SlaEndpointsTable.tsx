import React, { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import type { SanitizedEndpoint } from "../../mocks/clientPortalMocks";

export interface SlaEndpointsTableProps {
  endpoints: SanitizedEndpoint[];
  targetSlaPct?: number;
  itemsPerPage?: number;
}

export const SlaEndpointsTable: React.FC<SlaEndpointsTableProps> = ({
  endpoints,
  targetSlaPct = 99.50,
  itemsPerPage = 5,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredEndpoints = useMemo(() => {
    if (!searchTerm.trim()) return endpoints;
    const term = searchTerm.toLowerCase();
    return endpoints.filter(
      (ep) =>
        ep.domainName.toLowerCase().includes(term) ||
        ep.serviceType.toLowerCase().includes(term) ||
        ep.datacenterRegion.toLowerCase().includes(term)
    );
  }, [endpoints, searchTerm]);

  // Reset page when search term changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEndpoints.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEndpoints = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return filteredEndpoints.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEndpoints, safeCurrentPage, itemsPerPage]);

  return (
    <section
      data-testid="sla-endpoints-table"
      aria-label="Detalhamento de SLA dos Endpoints Sanitizados"
      style={{
        backgroundColor: "var(--color-surface-elevated)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Cabeçalho da Tabela e Barra de Busca */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          borderBottom: "var(--border-subtle)",
          paddingBottom: "12px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Globe size={18} className="text-emerald-400" />
            <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Detalhamento de SLA por Endpoint Contratado
            </h3>
          </div>
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
            Conforme ADR-009 / ADR-012: Endereçamento público sanitizado e conformidade contratual
          </span>
        </div>

        {/* Campo de Busca */}
        <div style={{ position: "relative", minWidth: "240px" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
            }}
          />
          <input
            type="text"
            data-testid="sla-endpoint-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar endpoint, serviço ou DC..."
            style={{
              width: "100%",
              backgroundColor: "var(--color-surface-card)",
              border: "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px 6px 30px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Tabela de Dados */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            textAlign: "left",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "var(--border-subtle)",
                color: "var(--color-text-muted)",
                fontSize: "0.6875rem",
                textTransform: "uppercase",
              }}
            >
              <th style={{ padding: "10px 12px" }}>Endpoint / FQDN</th>
              <th style={{ padding: "10px 12px" }}>Serviço Contratado</th>
              <th style={{ padding: "10px 12px" }}>Protocolo</th>
              <th style={{ padding: "10px 12px", textAlign: "center" }}>Status Atual</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>SLA no Período</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Latência Média</th>
              <th style={{ padding: "10px 12px" }}>Região / DC</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Conformidade</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEndpoints.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Nenhum endpoint encontrado para o termo pesquisado.
                </td>
              </tr>
            ) : (
              paginatedEndpoints.map((ep) => {
                const isCompliant = ep.sla30dPct >= targetSlaPct;
                const isUp = ep.status === "UP";

                return (
                  <tr
                    key={ep.id}
                    data-testid={`sla-endpoint-row-${ep.id}`}
                    style={{
                      borderBottom: "var(--border-subtle)",
                      transition: "background-color var(--transition-fast)",
                    }}
                  >
                    <td style={{ padding: "12px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {ep.domainName}
                    </td>
                    <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>
                      {ep.serviceType}
                    </td>
                    <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{ep.protocol}</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          backgroundColor: isUp ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                          color: isUp ? "var(--color-healthy)" : "var(--color-warning)",
                          border: `1px solid ${isUp ? "var(--color-healthy-border)" : "var(--color-warning-border)"}`,
                        }}
                      >
                        {isUp ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        <span>{ep.status}</span>
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: isCompliant ? "var(--color-healthy)" : "var(--color-critical)",
                      }}
                    >
                      {ep.sla30dPct.toFixed(2)}%
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {ep.latencyAvgMs.toFixed(1)} ms
                    </td>
                    <td style={{ padding: "12px", color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" }}>
                      {ep.datacenterRegion}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          backgroundColor: isCompliant ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                          color: isCompliant ? "var(--color-healthy)" : "var(--color-critical)",
                          border: `1px solid ${isCompliant ? "var(--color-healthy-border)" : "var(--color-critical-border)"}`,
                        }}
                      >
                        {isCompliant ? "CONFORME" : "VIOLADO"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div
          data-testid="sla-endpoints-pagination"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "12px",
            borderTop: "var(--border-subtle)",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-muted)",
          }}
        >
          <span>
            Mostrando <strong>{paginatedEndpoints.length}</strong> de <strong>{filteredEndpoints.length}</strong> endpoints
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              data-testid="pagination-prev"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                color: safeCurrentPage <= 1 ? "var(--color-text-muted)" : "var(--color-text-primary)",
                cursor: safeCurrentPage <= 1 ? "not-allowed" : "pointer",
                opacity: safeCurrentPage <= 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={14} />
              <span>Anterior</span>
            </button>

            <span>
              Página <strong>{safeCurrentPage}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              data-testid="pagination-next"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--color-surface-card)",
                border: "var(--border-subtle)",
                color: safeCurrentPage >= totalPages ? "var(--color-text-muted)" : "var(--color-text-primary)",
                cursor: safeCurrentPage >= totalPages ? "not-allowed" : "pointer",
                opacity: safeCurrentPage >= totalPages ? 0.5 : 1,
              }}
            >
              <span>Próxima</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
