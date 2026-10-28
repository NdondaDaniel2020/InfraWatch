import React, { useState } from "react";
import { FileSpreadsheet, Code2, Loader2 } from "lucide-react";
import { Button } from "../ui";
import type { SlaExportFormat, SlaMetricOverview, SlaDeviceBreakdown } from "../../types/sla";
import { toast } from "sonner";

interface SlaExportActionsProps {
  tenantId: string;
  tenantName: string;
  overview?: SlaMetricOverview;
  deviceBreakdown?: SlaDeviceBreakdown[];
}

export const SlaExportActions: React.FC<SlaExportActionsProps> = ({
  tenantId,
  tenantName,
  overview,
  deviceBreakdown = [],
}) => {
  const [isExporting, setIsExporting] = useState<SlaExportFormat | null>(null);

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: SlaExportFormat) => {
    try {
      setIsExporting(format);
      const timestamp = new Date().toISOString().substring(0, 10);
      const filename = `relatorio-sla-${tenantId}-${timestamp}.${format}`;

      if (format === "csv") {
        // Gerar CSV analítico com cabeçalhos padrão
        const headers = [
          "Ativo",
          "IP",
          "Tier",
          "Uptime Nominal (%)",
          "Uptime Liquido Homologado (%)",
          "Downtime Isento Manutencao (min)",
          "Outage Nao Planejado (min)",
          "Status SLA",
        ];

        const rows = deviceBreakdown.map((d) => [
          `"${d.deviceName}"`,
          `"${d.ipAddress}"`,
          `"${d.tier}"`,
          (d.nominalUptimePct ?? 100).toFixed(2),
          (d.netUptimePct ?? 100).toFixed(2),
          d.exemptedMaintenanceMinutes,
          d.unplannedOutageMinutes,
          `"${d.status}"`,
        ]);

        const csvContent =
          `# Relatorio de SLA Contratual - ${tenantName}\n` +
          `# Data de Extracao: ${new Date().toISOString()}\n` +
          `# Meta Contratual: ${overview?.targetSlaPct || 99.50}%\n` +
          `# Uptime Liquido Acumulado: ${overview?.currentUptimePct || 99.98}%\n\n` +
          headers.join(";") +
          "\n" +
          rows.map((r) => r.join(";")).join("\n");

        downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
      } else {
        // Gerar JSON estruturado
        const jsonPayload = {
          reportTitle: `Relatório Analítico de SLA - ${tenantName}`,
          tenantId,
          generatedAt: new Date().toISOString(),
          overview,
          devices: deviceBreakdown,
        };

        downloadFile(
          JSON.stringify(jsonPayload, null, 2),
          filename,
          "application/json;charset=utf-8;"
        );
      }

      toast.success(`Relatório de SLA exportado em formato ${format.toUpperCase()}!`);
    } catch {
      toast.error("Falha ao exportar relatório analítico.");
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={isExporting !== null}
        variant="ghost"
        size="sm"
        icon={
          isExporting === "csv" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileSpreadsheet size={14} />
          )
        }
      >
        CSV
      </Button>

      <Button
        type="button"
        onClick={() => handleExport("json")}
        disabled={isExporting !== null}
        variant="ghost"
        size="sm"
        icon={
          isExporting === "json" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Code2 size={14} />
          )
        }
      >
        JSON
      </Button>
    </div>
  );
};
