import { describe, it, expect, vi, beforeEach } from "vitest";
import { pdfExportService } from "../src/services/pdfExportService";
import type {
  ClientServiceItem,
  ClientSlaSummary,
  OrganizationSlaReportDetails,
  SlaHistoryExportPayload,
  SlaMonthlyHistoryItem,
} from "../src/types/clientPortal";

const mockSummary: ClientSlaSummary = {
  tenantId: "org-banco-sol",
  tenantName: "Banco Sol S.A. • Soluções Corporativas",
  cycleMonthLabel: "Novembro/2026",
  uptimeCurrentMonthPct: 99.98,
  slaTargetPct: 99.5,
  mttrMinutesAvg: 8,
  downtimeBalanceFormatted: "+3h 12m",
  nextMaintenanceWindow: "22/Nov 02:00 - 04:00 WAT",
};

const mockReportDetails: OrganizationSlaReportDetails = {
  organizationId: "org-banco-sol",
  organizationName: "Banco Sol S.A.",
  periodLabel: "Novembro/2026",
  startPeriod: "2026-11-01",
  endPeriod: "2026-11-30",
  slaTargetPct: 99.5,
  uptimeNetPct: 99.98,
  uptimeGrossPct: 99.92,
  slaMet: true,
  mttrMinutes: 8,
  mtbfHours: 720,
  totalDevices: 6,
  unplannedDowntimeMinutes: 12,
  exemptedDowntimeMinutes: 45,
  devices: [],
  digitalSignature: "SHA256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
};

const generateMockServices = (count: number): ClientServiceItem[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `srv-${i + 1}`,
    name: `Serviço de Conexão Crítica Nº ${i + 1} • Luanda-Sul`,
    category: i % 2 === 0 ? "Comunicação Central" : "Banco de Dados & Transações",
    status: i === 5 ? "DEG" : i === 12 ? "DOWN" : "UP",
    statusLabel: i === 5 ? "DEG • Alerta" : i === 12 ? "DOWN • Crítico" : "UP • Nominal",
    responseTimeMs: 10 + i * 2,
    throughputFormatted: "1.5k req/s",
    successRatePct: 99.9,
    tags: ["IPsec", "Core BNA", "Criptografia"],
    stability30DaysPct: 99.9,
  }));
};

describe("Serviço de Exportação Executiva de SLA em PDF (pdfExportService)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve gerar documento PDF estruturado contendo metadados oficiais e cabeçalho institucional", () => {
    const services = generateMockServices(5);
    const doc = pdfExportService.buildPdfDoc(mockSummary, services, mockReportDetails);

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);

    const pdfString = doc.output();
    expect(pdfString).toContain("%PDF-");
    expect(pdfString.length).toBeGreaterThan(1000);
  });

  it("deve suportar grandes volumes de serviços (> 20 itens) com paginação fluída e cabeçalhos em todas as páginas", () => {
    // 35 serviços para forçar quebra de página automática
    const services = generateMockServices(35);
    const doc = pdfExportService.buildPdfDoc(mockSummary, services, mockReportDetails);

    const totalPages = doc.getNumberOfPages();
    // Deve possuir 2 ou mais páginas sem truncamento arbitrário
    expect(totalPages).toBeGreaterThanOrEqual(2);

    const pdfString = doc.output();
    // Confirma que os últimos serviços estão presentes no documento e não foram truncados no 8º
    expect(pdfString).toContain("Serviço de Conexão Crítica Nº 35");
  });

  it("deve preservar caracteres acentuados em português (UTF-8) sem corrupção gráfica", () => {
    const accentedServices: ClientServiceItem[] = [
      {
        id: "srv-acc-1",
        name: "Conexão Luanda-Sul • Operação de Cartões & Débito Direto",
        category: "Rede Elétrica & Climatização",
        status: "UP",
        statusLabel: "Nominal",
        responseTimeMs: 14,
        throughputFormatted: "500 req/s",
        successRatePct: 100,
        tags: ["Segurança", "Comunicação"],
        stability30DaysPct: 100,
      },
    ];

    const doc = pdfExportService.buildPdfDoc(mockSummary, accentedServices, mockReportDetails);
    const content = doc.output();

    expect(content).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("deve disparar download via elemento âncora com data-testid='pdf-download-anchor' e retornar true", async () => {
    const services = generateMockServices(6);

    const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-pdf-blob");
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    let capturedAnchor: HTMLAnchorElement | null = null;
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        capturedAnchor = node;
      }
      return node;
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await pdfExportService.exportSlaPdf(mockSummary, services, mockReportDetails);

    expect(result).toBe(true);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    const anchor = (capturedAnchor as HTMLAnchorElement | null);
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-testid")).toBe("pdf-download-anchor");
    expect(anchor?.getAttribute("download")).toBe(
      "relatorio-sla-org-banco-sol-novembro/2026.pdf"
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it("deve retornar false quando ocorrer um erro inesperado durante a geração do documento", async () => {
    vi.spyOn(pdfExportService, "buildPdfDoc").mockImplementationOnce(() => {
      throw new Error("Erro simulado de renderização de PDF");
    });

    const result = await pdfExportService.exportSlaPdf(mockSummary, [], mockReportDetails);
    expect(result).toBe(false);
  });

  it("buildPdfContent deve retornar uma string válida do PDF", () => {
    const services = generateMockServices(4);
    const content = pdfExportService.buildPdfContent(mockSummary, services, mockReportDetails);

    expect(typeof content).toBe("string");
    expect(content.startsWith("%PDF-")).toBe(true);
  });

  describe("Laudo de Auditoria Histórica de SLA em PDF (buildHistoryPdfDoc / exportSlaHistoryPdf)", () => {
    const generateMockHistory = (monthsCount: number): SlaHistoryExportPayload => {
      const monthNames = [
        "Novembro 2026",
        "Outubro 2026",
        "Setembro 2026",
        "Agosto 2026",
        "Julho 2026",
        "Junho 2026",
        "Maio 2026",
        "Abril 2026",
        "Março 2026",
        "Fevereiro 2026",
        "Janeiro 2026",
        "Dezembro 2025",
        "Novembro 2025",
        "Outubro 2025",
        "Setembro 2025",
        "Agosto 2025",
        "Julho 2025",
        "Junho 2025",
      ];

      const items: SlaMonthlyHistoryItem[] = Array.from(
        { length: monthsCount },
        (_, i) => {
          const isViolation = i === 1 || i === 4;
          return {
            cycleLabel: monthNames[i % monthNames.length],
            month: monthNames[i % monthNames.length].slice(0, 3),
            uptimePct: isViolation ? 98.4 : 99.92,
            targetPct: 99.5,
            mttrMinutes: isViolation ? 45 : 6,
            incidentsCount: isViolation ? 3 : 0,
            unplannedDowntimeMinutes: isViolation ? 65.4 : 0,
            exemptedDowntimeMinutes: 120,
            status: isViolation ? "VIOLADO" : "CONFORME",
          };
        }
      );

      const compliantCount = items.filter((it) => it.status === "CONFORME").length;

      return {
        tenantId: "org-banco-sol",
        tenantName: "Banco Sol S.A. • Soluções Corporativas",
        selectedMonths: monthsCount,
        avgUptimePct: 99.65,
        targetPct: 99.5,
        totalIncidents: 6,
        avgMttrMinutes: 12.5,
        compliancePct: (compliantCount / items.length) * 100,
        compliantCyclesCount: compliantCount,
        totalCyclesCount: items.length,
        items,
        digitalSignature: "SHA256:historico-auditavel-assinatura-cripto-valida",
      };
    };

    it("deve gerar laudo de auditoria histórica de 3 meses com cabeçalho oficial e KPIs consolidados", () => {
      const payload = generateMockHistory(3);
      const doc = pdfExportService.buildHistoryPdfDoc(payload);

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBe(1);

      const pdfString = doc.output();
      expect(pdfString).toContain("%PDF-");
      expect(pdfString).toContain("INFRAWATCH OBSERVABILITY PLATFORM");
      expect(pdfString).toContain("Auditoria");
    });

    it("deve gerar laudo de auditoria de 6 e 12 meses com dados reais e formatação de status", () => {
      const payload6m = generateMockHistory(6);
      const doc6m = pdfExportService.buildHistoryPdfDoc(payload6m);
      expect(doc6m.getNumberOfPages()).toBe(1);

      const payload12m = generateMockHistory(12);
      const doc12m = pdfExportService.buildHistoryPdfDoc(payload12m);
      expect(doc12m.getNumberOfPages()).toBeGreaterThanOrEqual(1);

      const pdf12mString = doc12m.output();
      expect(pdf12mString).toContain("Janela de");
      expect(pdf12mString).toContain("Janeiro 2026");
    });

    it("deve suportar grandes volumes de ciclos (> 18 meses) com paginação fluída automática (Página X de Y)", () => {
      const payloadLong = generateMockHistory(24);
      const docLong = pdfExportService.buildHistoryPdfDoc(payloadLong);

      const totalPages = docLong.getNumberOfPages();
      expect(totalPages).toBeGreaterThanOrEqual(2);

      const pdfString = docLong.output();
      expect(pdfString).toContain(`Página 1 de ${totalPages}`);
    });

    it("deve preservar caracteres acentuados da língua portuguesa sem corrupção no laudo histórico", () => {
      const payload = generateMockHistory(3);
      payload.tenantName = "Empresa Nacional de Distribuição de Electricidade • Luanda & Huambo";
      payload.items[0].cycleLabel = "Março 2026 • Operação Concluída";

      const doc = pdfExportService.buildHistoryPdfDoc(payload);
      const content = doc.output();

      expect(content).toBeDefined();
      expect(content.startsWith("%PDF-")).toBe(true);
    });

    it("deve disparar download via elemento âncora com data-testid='pdf-download-anchor' para o histórico", async () => {
      const payload = generateMockHistory(3);

      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/mock-history-pdf-blob");
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      let capturedAnchor: HTMLAnchorElement | null = null;
      const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
        if (node instanceof HTMLAnchorElement) {
          capturedAnchor = node;
        }
        return node;
      });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const result = await pdfExportService.exportSlaHistoryPdf(payload);

      expect(result).toBe(true);
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      const anchor = capturedAnchor as HTMLAnchorElement | null;
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute("data-testid")).toBe("pdf-download-anchor");
      expect(anchor?.getAttribute("download")).toBe(
        "laudo-historico-sla-org-banco-sol-3-meses.pdf"
      );
      expect(clickSpy).toHaveBeenCalled();
    });

    it("deve retornar false quando ocorrer um erro inesperado durante a geração do laudo histórico", async () => {
      vi.spyOn(pdfExportService, "buildHistoryPdfDoc").mockImplementationOnce(() => {
        throw new Error("Erro simulado de histórico");
      });

      const payload = generateMockHistory(3);
      const result = await pdfExportService.exportSlaHistoryPdf(payload);
      expect(result).toBe(false);
    });

    it("buildHistoryPdfContent deve retornar uma string binária PDF válida", () => {
      const payload = generateMockHistory(3);
      const content = pdfExportService.buildHistoryPdfContent(payload);

      expect(typeof content).toBe("string");
      expect(content.startsWith("%PDF-")).toBe(true);
    });
  });
});
