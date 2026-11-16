import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ClientServiceItem,
  ClientSlaSummary,
  OrganizationSlaReportDetails,
} from "../types/clientPortal";

/**
 * Serviço de geração e exportação de relatórios executivos de SLA em PDF.
 * Gera documento corporativo com timbre oficial, indicadores e histórico de isenções (ADR-009),
 * utilizando jsPDF e jspdf-autotable para paginação dinâmica e suporte UTF-8.
 */
export const pdfExportService = {
  /**
   * Constrói e retorna a instância estruturada do documento PDF com jsPDF e jspdf-autotable.
   * Suporta paginação dinâmica, formatação corporativa oficial e UTF-8 nativo sem truncamentos.
   */
  buildPdfDoc(
    summary: ClientSlaSummary,
    services: ClientServiceItem[],
    reportDetails: OrganizationSlaReportDetails
  ): jsPDF {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const marginX = 14;
    const contentWidth = pageWidth - marginX * 2; // 182mm

    // =========================================================================
    // 1. BANNER INSTITUCIONAL DE CABEÇALHO (Página 1)
    // =========================================================================
    // Fundo escuro azul-petróleo (Obsidian Theme)
    doc.setFillColor(13, 20, 36);
    doc.roundedRect(marginX, 14, contentWidth, 24, 2, 2, "F");

    // Linha de acento esmeralda
    doc.setFillColor(16, 185, 129);
    doc.rect(marginX, 36, contentWidth, 2, "F");

    // Título Principal
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("INFRAWATCH OBSERVABILITY PLATFORM", marginX + 6, 23);

    // Subtítulo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "RCS Angola Telecom Network • Laudo Executivo de SLA Contratual",
      marginX + 6,
      30
    );

    // Badge de Certificação à direita
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(16, 185, 129);
    doc.text("CONFORMIDADE AUDITADA", pageWidth - marginX - 6, 25, {
      align: "right",
    });

    // =========================================================================
    // 2. QUADRO EXECUTIVO DE METADADOS & INDICADORES CONTRATUAIS
    // =========================================================================
    const cardY = 42;
    const cardHeight = 36;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 2, 2, "FD");

    // Coluna 1: Identificação do Contrato
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Cliente: ${summary.tenantName}`, marginX + 5, cardY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Ciclo de Apuração: ${summary.cycleMonthLabel}`, marginX + 5, cardY + 13);
    doc.text(
      `Data de Emissão: ${new Date().toLocaleDateString("pt-PT")} | Fuso: WAT (UTC+1)`,
      marginX + 5,
      cardY + 19
    );
    doc.text(
      `Próxima Janela Técnica: ${summary.nextMaintenanceWindow} (Isenta ADR-009)`,
      marginX + 5,
      cardY + 25
    );

    // Linha divisória vertical
    const col2X = marginX + 96;
    doc.setDrawColor(226, 232, 240);
    doc.line(col2X - 4, cardY + 4, col2X - 4, cardY + cardHeight - 4);

    // Coluna 2: KPIs de Disponibilidade
    const isTargetMet = summary.uptimeCurrentMonthPct >= summary.slaTargetPct;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(
      isTargetMet ? 16 : 225,
      isTargetMet ? 185 : 29,
      isTargetMet ? 129 : 72
    );
    doc.text(
      `Disponibilidade Líquida: ${reportDetails.uptimeNetPct}% (Meta: ${summary.slaTargetPct}%)`,
      col2X,
      cardY + 7
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Uptime Bruto: ${reportDetails.uptimeGrossPct}% | MTTR Médio: ${summary.mttrMinutesAvg} min`,
      col2X,
      cardY + 13
    );
    doc.text(
      `Saldo de Downtime: ${summary.downtimeBalanceFormatted}`,
      col2X,
      cardY + 19
    );

    // Assinatura Digital no rodapé do cartão
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Assinatura Criptográfica: ${reportDetails.digitalSignature}`,
      marginX + 5,
      cardY + 32
    );

    // =========================================================================
    // 3. TABELA ZEBRADA DE SERVIÇOS CRÍTICOS (Paginação Dinâmica)
    // =========================================================================
    const tableBody = services.map((s, idx) => {
      const isUp = s.status === "UP";
      const isDeg = s.status === "DEG";
      const statusLabel = isUp
        ? "UP (Nominal)"
        : isDeg
        ? "DEG (Alerta)"
        : "DOWN (Crítico)";
      const responseTime =
        typeof s.responseTimeMs === "number" ? `${s.responseTimeMs} ms` : "N/D";
      const throughput = s.throughputFormatted ?? "N/D";
      const stability =
        typeof s.stability30DaysPct === "number"
          ? `${s.stability30DaysPct.toFixed(1)}%`
          : "N/D";
      const tags = s.tags.length > 0 ? s.tags.join(", ") : s.category;

      return [
        String(idx + 1),
        s.name,
        tags,
        statusLabel,
        responseTime,
        throughput,
        stability,
      ];
    });

    autoTable(doc, {
      startY: cardY + cardHeight + 6,
      head: [
        [
          "#",
          "Serviço Contratado",
          "Protocolo / Categoria",
          "Status",
          "Latência",
          "Vazão / Perda",
          "SLA 30 Dias",
        ],
      ],
      body: tableBody,
      margin: { top: 25, bottom: 25, left: marginX, right: marginX },
      showHead: "everyPage",
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        textColor: [30, 41, 59],
        fontSize: 7.5,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 36 },
        3: { cellWidth: 26, halign: "center" },
        4: { cellWidth: 20, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const val = String(data.cell.raw);
          if (val.includes("UP")) {
            data.cell.styles.textColor = [16, 185, 129];
            data.cell.styles.fontStyle = "bold";
          } else if (val.includes("DEG")) {
            data.cell.styles.textColor = [217, 119, 6];
            data.cell.styles.fontStyle = "bold";
          } else if (val.includes("DOWN")) {
            data.cell.styles.textColor = [225, 29, 72];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    // =========================================================================
    // 4. CABEÇALHOS E RODAPÉS DINÂMICOS EM TODAS AS PÁGINAS (Página X de Y)
    // =========================================================================
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);

      // Topo repetido apenas para páginas após a primeira
      if (page > 1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `InfraWatch • Laudo de SLA - ${summary.tenantName} (${summary.cycleMonthLabel})`,
          marginX,
          15
        );
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(marginX, 18, pageWidth - marginX, 18);
      }

      // Rodapé em todas as páginas
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(marginX, 284, pageWidth - marginX, 284);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        "Conformidade BNA / ISO 27001 • Encriptação de Borda e Sanitização (ADR-009/012) • Documento Oficial",
        marginX,
        289
      );

      doc.setFont("helvetica", "bold");
      doc.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, 289, {
        align: "right",
      });
    }

    return doc;
  },

  /**
   * Constrói o conteúdo estruturado do relatório em formato binário / string PDF.
   */
  buildPdfContent(
    summary: ClientSlaSummary,
    services: ClientServiceItem[],
    reportDetails: OrganizationSlaReportDetails
  ): string {
    const doc = this.buildPdfDoc(summary, services, reportDetails);
    return doc.output();
  },

  /**
   * Dispara o download automático do PDF de SLA no navegador com fidelidade e paginação.
   */
  async exportSlaPdf(
    summary: ClientSlaSummary,
    services: ClientServiceItem[],
    reportDetails: OrganizationSlaReportDetails
  ): Promise<boolean> {
    try {
      const doc = this.buildPdfDoc(summary, services, reportDetails);
      const filename = `relatorio-sla-${(summary.tenantId || "org")
        .toLowerCase()
        .replace(/\s+/g, "-")}-${summary.cycleMonthLabel
        .toLowerCase()
        .replace(/\s+/g, "-")}.pdf`;

      if (typeof window !== "undefined" && typeof document !== "undefined") {
        const blob = doc.output("blob");
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        link.setAttribute("data-testid", "pdf-download-anchor");
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        }, 150);
      } else {
        doc.save(filename);
      }

      return true;
    } catch {
      return false;
    }
  },
};
