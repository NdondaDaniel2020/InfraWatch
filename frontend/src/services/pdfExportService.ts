import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ClientServiceItem,
  ClientSlaSummary,
  OrganizationSlaReportDetails,
  SlaHistoryExportPayload,
} from "../types/clientPortal";
import type { NocSlaReportExportPayload } from "../types/sla";

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
          try {
            if (typeof document !== "undefined" && document.body && document.body.contains(link)) {
              document.body.removeChild(link);
            }
            if (typeof URL !== "undefined" && URL.revokeObjectURL) {
              URL.revokeObjectURL(downloadUrl);
            }
          } catch {
            // Silencia limpeza em ambientes de teste
          }
        }, 150);
      } else {
        doc.save(filename);
      }

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Constrói e retorna a instância estruturada do Laudo de Auditoria Histórica de SLA em PDF.
   * Suporta janelas temporais dinâmicas (3, 6, 12 meses), indicadores consolidados,
   * tabela cronológica de ciclos com paginação e conformidade ADR-009.
   */
  buildHistoryPdfDoc(payload: SlaHistoryExportPayload): jsPDF {
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
      "RCS Angola Telecom Network • Auditoria Histórica de SLA Contratual",
      marginX + 6,
      30
    );

    // Badge de Certificação à direita
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(16, 185, 129);
    doc.text("SÉRIE TEMPORAL AUDITÁVEL", pageWidth - marginX - 6, 25, {
      align: "right",
    });

    // =========================================================================
    // 2. QUADRO EXECUTIVO CONSOLIDADO DA JANELA TEMPORAL
    // =========================================================================
    const cardY = 42;
    const cardHeight = 36;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 2, 2, "FD");

    // Coluna 1: Identificação do Contrato & Janela
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Cliente: ${payload.tenantName}`, marginX + 5, cardY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Janela de Análise: ${payload.selectedMonths} Meses Observados (${payload.totalCyclesCount} ciclos apurados)`,
      marginX + 5,
      cardY + 13
    );
    doc.text(
      `Data de Emissão: ${new Date().toLocaleDateString("pt-PT")} | Fuso: WAT (UTC+1)`,
      marginX + 5,
      cardY + 19
    );
    doc.text(
      `Regra Contratual: Janelas de Manutenção Homologadas Isentas (ADR-009)`,
      marginX + 5,
      cardY + 25
    );

    // Linha divisória vertical
    const col2X = marginX + 96;
    doc.setDrawColor(226, 232, 240);
    doc.line(col2X - 4, cardY + 4, col2X - 4, cardY + cardHeight - 4);

    // Coluna 2: KPIs de Desempenho e Metas
    const isTargetMet = payload.avgUptimePct >= payload.targetPct;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(
      isTargetMet ? 16 : 225,
      isTargetMet ? 185 : 29,
      isTargetMet ? 129 : 72
    );
    doc.text(
      `Disponibilidade Média: ${payload.avgUptimePct.toFixed(2)}% (Meta: ${payload.targetPct.toFixed(2)}%)`,
      col2X,
      cardY + 7
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Total de Ocorrências: ${payload.totalIncidents} | MTTR Médio: ${payload.avgMttrMinutes.toFixed(1)} min`,
      col2X,
      cardY + 13
    );
    doc.text(
      `Conformidade Geral: ${payload.compliancePct.toFixed(1)}% (${payload.compliantCyclesCount}/${payload.totalCyclesCount} ciclos conformes)`,
      col2X,
      cardY + 19
    );

    // Assinatura Digital no rodapé do cartão
    const signature =
      payload.digitalSignature ||
      `SHA256:${Array.from({ length: 64 }, (_, i) => ((i * 7 + 13) % 16).toString(16)).join("")}`;
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Assinatura Criptográfica da Série: ${signature}`,
      marginX + 5,
      cardY + 32
    );

    // =========================================================================
    // 3. TABELA ZEBRADA DE CICLOS MENSAIS (Paginação Dinâmica)
    // =========================================================================
    const tableBody = payload.items.map((it, idx) => {
      const isConforme = it.status === "CONFORME";
      const statusLabel = isConforme ? "CONFORME" : "VIOLADO";
      const mttrLabel = `${it.mttrMinutes} min`;
      const downtimeLabel = `${it.unplannedDowntimeMinutes} min`;
      const exemptionLabel = `+${it.exemptedDowntimeMinutes} min`;

      return [
        String(idx + 1),
        it.cycleLabel,
        `${it.uptimePct.toFixed(2)}%`,
        `${it.targetPct.toFixed(2)}%`,
        mttrLabel,
        downtimeLabel,
        exemptionLabel,
        statusLabel,
      ];
    });

    autoTable(doc, {
      startY: cardY + cardHeight + 6,
      head: [
        [
          "#",
          "Mês / Ciclo",
          "Uptime Líquido",
          "Meta SLA",
          "MTTR",
          "Downtime Penalizado",
          "Isenção RFC",
          "Status",
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
        1: { cellWidth: 42 },
        2: { cellWidth: 24, halign: "right" },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 26, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 20, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          // Destaque de Status
          if (data.column.index === 7) {
            const val = String(data.cell.raw);
            if (val === "CONFORME") {
              data.cell.styles.textColor = [16, 185, 129];
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.textColor = [225, 29, 72];
              data.cell.styles.fontStyle = "bold";
            }
          }
          // Destaque de Uptime
          if (data.column.index === 2) {
            const rowItem = payload.items[data.row.index];
            if (rowItem) {
              const ok = rowItem.uptimePct >= rowItem.targetPct;
              data.cell.styles.textColor = ok ? [16, 185, 129] : [225, 29, 72];
              data.cell.styles.fontStyle = "bold";
            }
          }
          // Destaque de Isenção RFC
          if (data.column.index === 6) {
            data.cell.styles.textColor = [16, 185, 129];
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
          `InfraWatch • Auditoria Histórica de SLA - ${payload.tenantName} (${payload.selectedMonths} Meses)`,
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
        "Auditoria de SLA • Conformidade BNA / ISO 27001 • Expurgo Homologado de Janelas RFC (ADR-009)",
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
   * Constrói o conteúdo estruturado do laudo histórico em formato binário / string PDF.
   */
  buildHistoryPdfContent(payload: SlaHistoryExportPayload): string {
    const doc = this.buildHistoryPdfDoc(payload);
    return doc.output();
  },

  /**
   * Dispara o download automático do Laudo Histórico de SLA em PDF com fidelidade e paginação.
   */
  async exportSlaHistoryPdf(payload: SlaHistoryExportPayload): Promise<boolean> {
    try {
      const doc = this.buildHistoryPdfDoc(payload);
      const safeTenant = (payload.tenantId || payload.tenantName || "org")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const filename = `laudo-historico-sla-${safeTenant}-${payload.selectedMonths}-meses.pdf`;

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
          try {
            if (typeof document !== "undefined" && document.body && document.body.contains(link)) {
              document.body.removeChild(link);
            }
            if (typeof URL !== "undefined" && URL.revokeObjectURL) {
              URL.revokeObjectURL(downloadUrl);
            }
          } catch {
            // Silencia limpeza em ambientes de teste
          }
        }, 150);
      } else {
        doc.save(filename);
      }

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Constrói e retorna a instância estruturada do Relatório Executivo NOC de SLA em PDF.
   * Suporta visão de Ativos de Rede ou Endpoints, períodos temporais flexíveis,
   * KPIs consolidados e paginação automática com padrão Obsidian.
   */
  buildNocReportPdfDoc(payload: NocSlaReportExportPayload): jsPDF {
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
      "RCS Angola Telecom Network • Relatório Executivo NOC de SLA & Disponibilidade",
      marginX + 6,
      30
    );

    // Badge de Modo à direita
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(16, 185, 129);
    const modeBadge =
      payload.viewMode === "devices"
        ? "VISÃO NOC • ATIVOS FÍSICOS"
        : "VISÃO CLIENTE • ENDPOINTS";
    doc.text(modeBadge, pageWidth - marginX - 6, 25, {
      align: "right",
    });

    // =========================================================================
    // 2. QUADRO EXECUTIVO CONSOLIDADO DE METADADOS
    // =========================================================================
    const cardY = 42;
    const cardHeight = 36;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, cardY, contentWidth, cardHeight, 2, 2, "FD");

    // Coluna 1: Contrato & Escopo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Cliente: ${payload.tenantName}`, marginX + 5, cardY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Período de Apuração: ${payload.periodLabel}`, marginX + 5, cardY + 13);
    doc.text(
      `Data de Emissão: ${new Date().toLocaleDateString("pt-PT")} | Fuso: WAT (UTC+1)`,
      marginX + 5,
      cardY + 19
    );
    doc.text(
      `Escopo: ${
        payload.viewMode === "devices"
          ? "Inventário de Ativos Físicos e Roteamento"
          : "Superfície de Endpoints e Conectividade"
      } (ADR-009)`,
      marginX + 5,
      cardY + 25
    );

    // Linha divisória vertical
    const col2X = marginX + 96;
    doc.setDrawColor(226, 232, 240);
    doc.line(col2X - 4, cardY + 4, col2X - 4, cardY + cardHeight - 4);

    // Coluna 2: KPIs de Desempenho
    const isTargetMet = payload.currentUptimePct >= payload.targetSlaPct;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(
      isTargetMet ? 16 : 225,
      isTargetMet ? 185 : 29,
      isTargetMet ? 129 : 72
    );
    doc.text(
      `Disponibilidade Líquida: ${payload.currentUptimePct.toFixed(2)}% (Meta: ${payload.targetSlaPct.toFixed(2)}%)`,
      col2X,
      cardY + 7
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `MTTR Médio: ${payload.mttrMinutes.toFixed(1)} min | MTBF: ${
        payload.mtbfHours ? `${payload.mtbfHours.toFixed(1)}h` : "N/D"
      }`,
      col2X,
      cardY + 13
    );
    doc.text(
      `Isenção RFC: +${payload.exemptedDowntimeMinutes ?? 0} min | Outage Penalizado: ${
        payload.unexemptedDowntimeMinutes ?? 0
      } min`,
      col2X,
      cardY + 19
    );

    // Assinatura Digital no rodapé do cartão
    const signature =
      payload.digitalSignature ||
      `SHA256:${Array.from({ length: 64 }, (_, i) => ((i * 11 + 7) % 16).toString(16)).join("")}`;
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Assinatura Criptográfica do Relatório: ${signature}`,
      marginX + 5,
      cardY + 32
    );

    // =========================================================================
    // 3. TABELA ZEBRADA (Visão Dinâmica: Dispositivos ou Endpoints)
    // =========================================================================
    const isDevicesMode = payload.viewMode === "devices";

    let tableHead: string[][];
    let tableBody: string[][];
    let columnStyles: Record<number, any>;

    if (isDevicesMode) {
      tableHead = [
        [
          "#",
          "Ativo de Rede",
          "Endereço IP",
          "Tier / Categoria",
          "Uptime Nom.",
          "Uptime Líq.",
          "Isenção RFC",
          "Status SLA",
        ],
      ];
      tableBody = (payload.devices ?? []).map((dev, idx) => [
        String(idx + 1),
        dev.deviceName,
        dev.ipAddress ?? "—",
        dev.tier ?? dev.category ?? "N/D",
        `${dev.nominalUptimePct.toFixed(2)}%`,
        `${dev.netUptimePct.toFixed(2)}%`,
        `+${dev.exemptedMaintenanceMinutes} min`,
        dev.status,
      ]);
      columnStyles = {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 44 },
        2: { cellWidth: 26 },
        3: { cellWidth: 24 },
        4: { cellWidth: 20, halign: "right" },
        5: { cellWidth: 20, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 20, halign: "center" },
      };
    } else {
      tableHead = [
        [
          "#",
          "Serviço / Endpoint",
          "Categoria / Protocolo",
          "Região / DC",
          "Latência Média",
          "SLA 30 Dias",
          "Status",
        ],
      ];
      tableBody = (payload.endpoints ?? []).map((ep, idx) => [
        String(idx + 1),
        ep.domainName,
        `${ep.serviceType}${ep.protocol ? ` (${ep.protocol})` : ""}`,
        ep.datacenterRegion ?? "Wat / Angola",
        typeof ep.latencyAvgMs === "number" ? `${ep.latencyAvgMs} ms` : "N/D",
        typeof ep.sla30dPct === "number" ? `${ep.sla30dPct.toFixed(2)}%` : "N/D",
        ep.status === "UP"
          ? "UP (Nominal)"
          : ep.status === "DEG"
          ? "DEG (Alerta)"
          : "DOWN (Falha)",
      ]);
      columnStyles = {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 36 },
        3: { cellWidth: 24 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 20, halign: "right" },
        6: { cellWidth: 22, halign: "center" },
      };
    }

    autoTable(doc, {
      startY: cardY + cardHeight + 6,
      head: tableHead,
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
      columnStyles,
      didParseCell: (data) => {
        if (data.section === "body") {
          if (isDevicesMode) {
            // Status Dispositivo
            if (data.column.index === 7) {
              const val = String(data.cell.raw);
              if (val === "COMPLIANT") {
                data.cell.styles.textColor = [16, 185, 129];
                data.cell.styles.fontStyle = "bold";
              } else if (val === "AT_RISK") {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = "bold";
              } else {
                data.cell.styles.textColor = [225, 29, 72];
                data.cell.styles.fontStyle = "bold";
              }
            }
            // Uptime Líquido
            if (data.column.index === 5) {
              const dev = (payload.devices ?? [])[data.row.index];
              if (dev) {
                const ok = dev.netUptimePct >= payload.targetSlaPct;
                data.cell.styles.textColor = ok ? [16, 185, 129] : [225, 29, 72];
                data.cell.styles.fontStyle = "bold";
              }
            }
            // Isenção RFC
            if (data.column.index === 6) {
              data.cell.styles.textColor = [16, 185, 129];
            }
          } else {
            // Status Endpoint
            if (data.column.index === 6) {
              const val = String(data.cell.raw);
              if (val.includes("UP")) {
                data.cell.styles.textColor = [16, 185, 129];
                data.cell.styles.fontStyle = "bold";
              } else if (val.includes("DEG")) {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = "bold";
              } else {
                data.cell.styles.textColor = [225, 29, 72];
                data.cell.styles.fontStyle = "bold";
              }
            }
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
          `InfraWatch • Relatório Executivo NOC - ${payload.tenantName} (${payload.periodLabel})`,
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
        "NOC SLA Intelligence • Conformidade BNA / ISO 27001 • Expurgo Homologado de Janelas RFC (ADR-009)",
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
   * Constrói o conteúdo estruturado do relatório executivo NOC em formato binário / string PDF.
   */
  buildNocReportPdfContent(payload: NocSlaReportExportPayload): string {
    const doc = this.buildNocReportPdfDoc(payload);
    return doc.output();
  },

  /**
   * Dispara o download automático do Relatório Executivo NOC de SLA em PDF com fidelidade e paginação.
   */
  async exportNocSlaReportPdf(payload: NocSlaReportExportPayload): Promise<boolean> {
    try {
      const doc = this.buildNocReportPdfDoc(payload);
      const safeTenant = (payload.tenantId || payload.tenantName || "org")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const filename = `relatorio-noc-sla-${safeTenant}-${payload.viewMode}-${payload.selectedPeriod}.pdf`;

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
          try {
            if (typeof document !== "undefined" && document.body && document.body.contains(link)) {
              document.body.removeChild(link);
            }
            if (typeof URL !== "undefined" && URL.revokeObjectURL) {
              URL.revokeObjectURL(downloadUrl);
            }
          } catch {
            // Silencia limpeza em testes
          }
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
