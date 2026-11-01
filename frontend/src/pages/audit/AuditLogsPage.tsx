import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileDown,
  Settings,
  ShieldCheck,
  Clock,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { auditApi } from "../../services/auditApi";
import {
  AuditFilterParams,
  AuditIntegrityVerificationResponse,
  AuditLogEntry,
  INITIAL_CUSTODY_STATUS,
} from "../../types/audit";
import { CustodyIntegrityBanner } from "../../components/audit/CustodyIntegrityBanner";
import { AuditFilterBar } from "../../components/audit/AuditFilterBar";
import { useAuth } from "../../context/AuthContext";
import { AuditLogTable } from "../../components/audit/AuditLogTable";
import { AuditPayloadInspector } from "../../components/audit/AuditPayloadInspector";

export const AuditLogsPage: React.FC = () => {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";
  const userOrgId = user?.organization_id;

  const [filters, setFilters] = useState<AuditFilterParams>({
    search: "",
    role: "ALL",
    action: "ALL",
    page: 1,
    page_size: 10,
    organization_id: !isGlobalAdmin && userOrgId ? userOrgId : undefined,
  });

  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isLiveStream, setIsLiveStream] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [custodyStatus, setCustodyStatus] =
    useState<AuditIntegrityVerificationResponse>(INITIAL_CUSTODY_STATUS);

  // Filtros efetivos garantem isolamento multi-tenant compulsório para clientes
  const effectiveFilters = React.useMemo(() => {
    if (!isGlobalAdmin && userOrgId) {
      return { ...filters, organization_id: userOrgId };
    }
    return filters;
  }, [filters, isGlobalAdmin, userOrgId]);

  // Consulta de logs paginados
  const {
    data: logsResponse,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["auditLogs", effectiveFilters],
    queryFn: async () => {
      const res = await auditApi.getAuditLogs(effectiveFilters);
      // Se não houver registro selecionado e houver itens, seleciona o primeiro por padrão
      if (!selectedLog && res.items.length > 0) {
        setSelectedLog(res.items[0]);
      }
      return res;
    },
    refetchInterval: isLiveStream ? 15000 : false,
  });

  // Disparo manual de verificação criptográfica
  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const res = await auditApi.verifyIntegrity();
      setCustodyStatus(res);
      if (res.is_valid) {
        toast.success("Verificação SHA-256 concluída: Cadeia íntegra e sem violações!");
      } else {
        toast.error("Alerta crítico: Violação de integridade detectada na cadeia de custódia!");
      }
    } catch {
      toast.error("Falha ao comunicar com o serviço de verificação criptográfica.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportLedger = () => {
    if (!logsResponse?.items || logsResponse.items.length === 0) {
      toast.error("Nenhum registro para exportação.");
      return;
    }
    auditApi.exportLedgerJson(logsResponse.items);
    toast.success("Download do Ledger criptográfico iniciado!");
  };

  const handleOpenRetentionPolicy = () => {
    toast.info(
      "Política BNA/INACOM: Retenção obrigatória de 5 anos para trilhas de auditoria criptografadas."
    );
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div
      data-testid="audit-logs-page"
      className="p-4 md:p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full"
    >
      {/* 1. Header da Página & Breadcrumb */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Link to={isGlobalAdmin ? "/noc" : "/portal"} className="text-slate-400 hover:text-slate-200 transition-colors">
              {isGlobalAdmin ? "Cockpit" : "Portal"}
            </Link>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">
              {isGlobalAdmin ? "Trilha de Auditoria Forense" : "Auditoria da Organização"}
            </span>
          </div>
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            {isGlobalAdmin
              ? "Trilha de Auditoria Forense & Compliance (Append-Only)"
              : "Trilha de Auditoria da Organização & Governança"}
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            {isGlobalAdmin
              ? "Registros imutáveis de alterações administrativas, chamadas de sistema e verificabilidade criptográfica via encadeamento SHA-256 HMAC para conformidade BNA, INACOM e auditorias externas."
              : "Registros auditáveis de acessos, solicitações de isenção de SLA e operações executadas pelos usuários da sua organização."}
          </p>
        </div>

        {/* Ações Rápidas do Topo */}
        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportLedger}
            className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <FileDown size={16} className="text-sky-400" />
            <span>Exportar Ledger (.json)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenRetentionPolicy}
            className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <Settings size={16} />
            <span>Retenção Legal</span>
          </button>

          {isGlobalAdmin && (
            <button
              type="button"
              data-testid="verify-chain-button"
              onClick={handleVerifyIntegrity}
              disabled={isVerifying}
              className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian-950 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <ShieldCheck size={18} />
              <span>{isVerifying ? "Verificando..." : "Validar Cadeia SHA-256"}</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Banner de Verificação Criptográfica da Cadeia de Custódia */}
      <CustodyIntegrityBanner
        status={custodyStatus}
        onVerify={handleVerifyIntegrity}
        isLoading={isVerifying}
      />

      {/* 3. Barra de Filtros e Busca em Tempo Real */}
      <AuditFilterBar
        filters={filters}
        onChange={setFilters}
        onRefresh={() => refetchLogs()}
        isLiveStream={isLiveStream}
        onToggleLiveStream={() => setIsLiveStream((prev) => !prev)}
        isLoading={isLoadingLogs}
        isGlobalAdmin={isGlobalAdmin}
      />

      {/* 4. Layout Bento de 2 Colunas: Tabela (7 cols) + Inspector JSONB (5 cols) */}
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5 items-start">
        <div className="2xl:col-span-7">
          <AuditLogTable
            logs={logsResponse?.items || []}
            selectedLogId={selectedLog?.id || null}
            onSelectLog={(log) => setSelectedLog(log)}
            isLoading={isLoadingLogs}
            totalCount={logsResponse?.total || 0}
            currentPage={filters.page || 1}
            pageSize={filters.page_size || 10}
            onPageChange={handlePageChange}
          />
        </div>

        <div className="2xl:col-span-5">
          <AuditPayloadInspector log={selectedLog} />
        </div>
      </div>

      {/* 5. Rodapé de Compliance & Atestação Legal BNA / INACOM */}
      <footer className="p-4 bg-obsidian-900 rounded-xl border border-obsidian-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-emerald-400 shrink-0" />
          <span>
            Conformidade com a <strong className="text-white">Norma de Retenção Regulamentar (BNA / INACOM)</strong>.
            Todos os registros possuem carimbo de tempo seguro (RFC 3161) e encadeamento imutável.
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0 font-mono text-[11px]">
          <span className="flex items-center gap-1.5">
            <Key size={12} className="text-sky-400" />
            <span>Chave Pública:</span>
            <code className="text-sky-400">ed25519:9f8a...4b01</code>
          </span>
          <span className="text-obsidian-700">|</span>
          <span className="text-emerald-400">RFC 5424 Syslog Válido</span>
        </div>
      </footer>
    </div>
  );
};
