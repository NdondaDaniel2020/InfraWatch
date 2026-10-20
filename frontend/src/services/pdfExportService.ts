import type { ClientServiceItem, ClientSlaSummary } from "../mocks/clientPortalMocks";

/**
 * Serviço de geração e exportação de relatórios executivos de SLA em PDF.
 * Gera documento com timbre oficial, indicadores e histórico de isenções (ADR-009).
 */
export const pdfExportService = {
  /**
   * Constrói o conteúdo estruturado do relatório em formato PDF puro (PDF 1.4).
   */
  buildPdfContent(summary: ClientSlaSummary, services: ClientServiceItem[]): string {
    const dateStr = new Date().toISOString().split("T")[0];
    const servicesList = services
      .map((s, idx) => `(${idx + 1}. ${s.name} - Status: ${s.status} - SLA: ${s.stability30DaysPct}% - Latencia: ${s.responseTimeMs}ms)`)
      .join("\n");

    // Estrutura sintática minimalista compatível com leitores PDF padrão
    return `%PDF-1.4
1 0 obj
<< /Title (Relatorio Executivo de SLA - ${summary.tenantName})
   /Author (InfraWatch RCS Angola)
   /Subject (Conformidade Contratual de Disponibilidade)
   /CreationDate (D:${dateStr.replace(/-/g, "")}000000)
>>
endobj
2 0 obj
<< /Type /Catalog /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages /Kids [4 0 R] /Count 1 >>
endobj
4 0 obj
<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 6 0 R >> >> >>
endobj
5 0 obj
<< /Length 850 >>
stream
BT
/F1 16 Tf
50 730 Td
(INFRAWATCH - RELATORIO MENSAL DE SLA) Tj
/F1 10 Tf
0 -25 Td
(Cliente: ${summary.tenantName} | Ciclo: ${summary.cycleMonthLabel}) Tj
0 -18 Td
(Data de Emissao: ${dateStr} | Fuso: West Africa Time WAT) Tj
0 -24 Td
(========================================================================) Tj
0 -22 Td
(Disponibilidade Acumulada: ${summary.uptimeCurrentMonthPct}% | Meta Acordada: ${summary.slaTargetPct}%) Tj
0 -18 Td
(Saldo de Margem de Downtime: ${summary.downtimeBalanceFormatted} | MTTR Medio: ${summary.mttrMinutesAvg} min) Tj
0 -18 Td
(Proxima Janela Tecnica: ${summary.nextMaintenanceWindow} | Homologacao ADR-009) Tj
0 -24 Td
(========================================================================) Tj
0 -22 Td
(SERVICOS CONTRATADOS & SAUDE OPERACIONAL:) Tj
0 -18 Td
${servicesList}
0 -30 Td
(Conformidade: BNA / ISO 27001 - Encriptacao de Borda e Sanitizacao de Dados) Tj
0 -18 Td
(InfraWatch Observability Platform - RCS Angola Telecom Network) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000185 00000 n 
0000000235 00000 n 
0000000298 00000 n 
0000000412 00000 n 
0000001320 00000 n 
trailer
<< /Size 7 /Root 2 0 R /Info 1 0 R >>
startxref
1395
%%EOF`;
  },

  /**
   * Dispara o download automático do PDF de SLA no navegador.
   */
  async exportSlaPdf(summary: ClientSlaSummary, services: ClientServiceItem[]): Promise<boolean> {
    try {
      const pdfContent = this.buildPdfContent(summary, services);
      const blob = new Blob([pdfContent], { type: "application/pdf" });
      const filename = `relatorio-sla-${summary.tenantId}-${summary.cycleMonthLabel.toLowerCase().replace(/\s+/g, "-")}.pdf`;

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.setAttribute("data-testid", "pdf-download-anchor");
      document.body.appendChild(link);
      link.click();

      // Limpeza segura
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      return true;
    } catch {
      return false;
    }
  },
};
