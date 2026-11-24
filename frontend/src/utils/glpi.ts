/**
 * Utilitário centralizado para resolução e geração de URLs da interface Web do GLPI ITSM.
 * Segue o padrão híbrido:
 * 1. Prioridade para a URL direta recebida do backend (incident.glpi_url).
 * 2. Variável de ambiente configurada no frontend (VITE_GLPI_UI_URL ou VITE_GLPI_BASE_URL).
 * 3. Sem fallback arbitrário de URL externa: utiliza caminho relativo caso omitida.
 */

const rawGlpiUiUrl = (
  import.meta.env?.VITE_GLPI_UI_URL ??
  import.meta.env?.VITE_GLPI_BASE_URL ??
  ""
).trim();

// Remove /apirest.php (caso alguém passe a URL da API por engano) e barras finais redundantes
const normalizedGlpiBase = rawGlpiUiUrl
  ? rawGlpiUiUrl.replace(/\/apirest\.php\/?$/, "").replace(/\/+$/, "")
  : "";

export const DEFAULT_GLPI_BASE_URL = normalizedGlpiBase;

/**
 * Retorna a Base URL da interface Web do GLPI para o navegador.
 */
export function getGlpiBaseUrl(customBase?: string | null): string {
  if (customBase && customBase.trim()) {
    return customBase.trim().replace(/\/apirest\.php\/?$/, "").replace(/\/+$/, "");
  }
  return DEFAULT_GLPI_BASE_URL;
}

/**
 * Retorna o link navegável para um chamado específico no GLPI.
 * @param ticketId ID do chamado no GLPI (ex: 8492)
 * @param backendUrl URL completa opcional vinda da API
 */
export function getGlpiTicketUrl(
  ticketId?: number | string | null,
  backendUrl?: string | null
): string {
  if (backendUrl && backendUrl.trim()) {
    return backendUrl.trim();
  }
  if (!ticketId) {
    return DEFAULT_GLPI_BASE_URL ? `${DEFAULT_GLPI_BASE_URL}/front/ticket.php` : "/front/ticket.php";
  }
  const cleanId = String(ticketId).trim().replace(/^#/, "");
  return DEFAULT_GLPI_BASE_URL
    ? `${DEFAULT_GLPI_BASE_URL}/front/ticket.form.php?id=${cleanId}`
    : `/front/ticket.form.php?id=${cleanId}`;
}

/**
 * Retorna o link navegável para a central de Helpdesk / listagem de chamados do GLPI.
 */
export function getGlpiHelpdeskUrl(backendUrl?: string | null): string {
  if (backendUrl && backendUrl.trim()) {
    return backendUrl.includes("/front/ticket.form.php")
      ? backendUrl.replace(/\/front\/ticket\.form\.php.*$/, "/front/ticket.php")
      : backendUrl.trim();
  }
  return DEFAULT_GLPI_BASE_URL ? `${DEFAULT_GLPI_BASE_URL}/front/ticket.php` : "/front/ticket.php";
}
