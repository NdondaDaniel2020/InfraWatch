import React, { useState } from "react";
import { FileSpreadsheet, Code2, Loader2 } from "lucide-react";
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
          `"${d.ipAddress ?? "—"}"`,
          `"${d.tier ?? d.category ?? "—"}"`,
          d.nominalUptimePct.toFixed(2),
          d.netUptimePct.toFixed(2),
          d.exemptedMaintenanceMinutes,
          d.unplannedOutageMinutes ?? "N/D",
          `"${d.status}"`,
        ]);

        const targetLabel =
          typeof overview?.targetSlaPct === "number"
            ? `${overview.targetSlaPct.toFixed(2)}%`
            : "N/D";
        const uptimeLabel =
          typeof overview?.currentUptimePct === "number"
            ? `${overview.currentUptimePct.toFixed(2)}%`
            : "N/D";

        const csvContent =
          `# Relatorio de SLA Contratual - ${tenantName}\n` +
          `# Data de Extracao: ${new Date().toISOString()}\n` +
          `# Meta Contratual: ${targetLabel}\n` +
          `# Uptime Liquido Acumulado: ${uptimeLabel}\n\n` +
          headers.join(";") +
          "\n" +
          rows.map((r) => r.join(";")).join("\n");

        downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
      } else {
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={isExporting !== null}
        className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
      >
        {isExporting === "csv" ? (
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        ) : (
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
        )}
        <span>CSV</span>
      </button>

      <button
        type="button"
        onClick={() => handleExport("json")}
        disabled={isExporting !== null}
        className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
      >
        {isExporting === "json" ? (
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
        ) : (
          <Code2 className="w-4 h-4 text-sky-400" />
        )}
        <span>JSON</span>
      </button>
    </div>
  );
};
