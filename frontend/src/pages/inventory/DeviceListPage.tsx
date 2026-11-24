import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useInRouterContext } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MoreHorizontal,
  Server,
  CheckCircle2,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { Button, Badge, Skeleton } from "../../components/ui";
import { DeviceFormModal } from "../../components/inventory/DeviceFormModal";
import { PauseDeviceModal } from "../../components/inventory/PauseDeviceModal";
import { MaintenanceModal } from "../../components/inventory/MaintenanceModal";
import { DeviceActionMenu } from "../../components/inventory/DeviceActionMenu";
import { RfcErrorBanner } from "../../components/common";
import { devicesApi } from "../../services/devicesApi";
import type {
  DeviceListItem,
  DeviceFilters,
  DeviceHealthStatus,
  ProberProtocol,
  DeviceCategory,
} from "../../types/inventory";
import { toast } from "sonner";

const BreadcrumbLink: React.FC<{
  to: string;
  className?: string;
  children: React.ReactNode;
}> = ({ to, className, children }) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

const statusConfig: Record<
  DeviceHealthStatus,
  { variant: "healthy" | "degraded" | "critical" | "maintenance" | "neutral"; label: string }
> = {
  UP: { variant: "healthy", label: "UP" },
  DOWN: { variant: "critical", label: "DOWN" },
  DEG: { variant: "degraded", label: "DEG" },
  MAINT: { variant: "maintenance", label: "MAINT" },
  PAUSED: { variant: "neutral", label: "PAUSED" },
};

const protocolIcons: Record<ProberProtocol, string> = {
  ICMP: "📡",
  HTTP: "🌐",
  TCP: "🔌",
  DOCKER: "🐳",
  HEARTBEAT: "💓",
  SNMP: "📊",
};

const categoryOptions: { value: DeviceCategory | "CONTAINER"; label: string }[] = [
  { value: "ROUTER", label: "Roteador" },
  { value: "SWITCH", label: "Switch" },
  { value: "FIREWALL", label: "Firewall" },
  { value: "SERVER", label: "Servidor" },
  { value: "DATABASE", label: "Banco de Dados" },
  { value: "LOAD_BALANCER", label: "Load Balancer" },
  { value: "CONTAINER", label: "Container" },
  { value: "OTHER", label: "Outro" },
];

const statusOptions: { value: DeviceHealthStatus; label: string }[] = [
  { value: "UP", label: "UP" },
  { value: "DOWN", label: "DOWN" },
  { value: "DEG", label: "Degradado" },
  { value: "MAINT", label: "Manutenção" },
  { value: "PAUSED", label: "Pausado" },
];

const SkeletonRow: React.FC = () => (
  <tr className="border-b border-obsidian-800/60 h-14">
    <td className="py-3 px-4"><Skeleton width="60%" height="18px" /></td>
    <td className="py-3 px-4"><Skeleton width="50%" height="16px" /></td>
    <td className="py-3 px-4"><Skeleton width="80px" height="22px" /></td>
    <td className="py-3 px-4"><Skeleton width="60px" height="16px" /></td>
    <td className="py-3 px-4 text-right"><Skeleton width="100px" height="24px" /></td>
  </tr>
);

const EmptyState: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-obsidian-950 border border-obsidian-800 flex items-center justify-center text-slate-500 mb-4 shadow-sm">
      <MoreHorizontal size={32} />
    </div>
    <h3 className="text-base font-bold text-white mb-1.5 font-display">
      Nenhum ativo cadastrado
    </h3>
    <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
      Comece adicionando seu primeiro dispositivo de monitoramento. Suportamos ICMP, HTTP, TCP, Docker, SNMP e Heartbeat.
    </p>
    <button
      type="button"
      onClick={onCreate}
      className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-obsidian-950 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
    >
      <Plus size={16} />
      <span>Adicionar Primeiro Ativo</span>
    </button>
  </div>
);

const DeviceRow: React.FC<{
  device: DeviceListItem;
  onViewDetails: (id: string) => void;
  onPause?: (id: string, reason: string) => void;
  onResume?: (id: string) => void;
  onMaintenance?: (id: string, payload: { until: string; title: string; reason: string }) => void;
}> = ({
  device,
  onViewDetails,
  onPause,
  onResume,
  onMaintenance,
}) => {
  const rawStatus = String(device.healthStatus || (device as any).status || ((device as any).is_paused ? "PAUSED" : "UP")).toUpperCase();
  const statusKey: DeviceHealthStatus =
    rawStatus === "DOWN" ? "DOWN" :
    rawStatus === "DEG" || rawStatus === "DEGRADED" ? "DEG" :
    rawStatus === "MAINT" || rawStatus === "MAINTENANCE" ? "MAINT" :
    rawStatus === "PAUSED" || (device as any).is_paused ? "PAUSED" : "UP";

  const status = statusConfig[statusKey] || statusConfig.UP;
  const protocolKey = String(device.protocol || "ICMP").toUpperCase() as ProberProtocol;
  const protocolIcon = protocolIcons[protocolKey] || "❓";
  const ipDisplay = device.ipAddress || (device as any).ip_address || "—";
  const hostnameDisplay = device.hostname || (device as any).name || ipDisplay;

  return (
    <tr className="border-b border-obsidian-800/60 hover:bg-obsidian-850/50 transition-colors font-sans text-xs">
      <td className="py-3 px-4">
        <div
          onClick={() => onViewDetails(device.id)}
          className="cursor-pointer group flex flex-col gap-0.5"
          title={`Ver detalhes do ativo ${device.name}`}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white group-hover:text-emerald-400 group-hover:underline transition-colors font-sans">
              {device.name}
            </span>
            <Badge variant="neutral" size="sm" dot={false} className="text-[10px]">
              {device.category}
            </Badge>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {hostnameDisplay}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div
          onClick={() => onViewDetails(device.id)}
          className="cursor-pointer group flex flex-col gap-0.5"
          title={`Ver detalhes do endpoint ${ipDisplay}`}
        >
          <span className="font-mono text-xs text-slate-200 group-hover:text-emerald-400 group-hover:underline transition-colors">
            {ipDisplay}{device.port ? `:${device.port}` : ""}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>{protocolIcon}</span>
            <span className="font-mono uppercase font-semibold">{protocolKey}</span>
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <Badge variant={status?.variant ?? "healthy"} size="md" pulse={statusKey === "DOWN"}>
          {status?.label ?? "UP"}
        </Badge>
      </td>
      <td className="py-3 px-4">
        <span className="font-mono text-xs text-slate-300">
          {device.intervalSeconds}s
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(device.id)}
            aria-label={`Detalhes para ${device.name}`}
            data-testid={`device-details-${device.id}`}
            title="Acessar página de detalhes e telemetria do ativo"
            className="h-7 text-xs px-2.5"
          >
            Detalhe
          </Button>
          {onPause && onResume && onMaintenance && (
            <DeviceActionMenu
              deviceId={device.id}
              deviceName={device.name}
              healthStatus={statusKey}
              onPause={onPause}
              onResume={onResume}
              onMaintenance={onMaintenance}
            />
          )}
        </div>
      </td>
    </tr>
  );
};

export const DeviceListPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DeviceFilters>({
    page: 1,
    pageSize: 10,
    search: "",
    category: undefined,
    healthStatus: undefined,
    protocol: undefined,
  });
  const [searchDebounce, setSearchDebounce] = useState("");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceListItem | null>(null);
  const [pauseDeviceId, setPauseDeviceId] = useState<string | null>(null);
  const [maintenanceDeviceId, setMaintenanceDeviceId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const isActionLoading = Object.values(actionLoading).some((v) => v);

  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchDebounce, page: 1 }));
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchDebounce]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["devices", filters],
    queryFn: () => devicesApi.listDevices(filters),
    placeholderData: (previous) => previous,
  });

  const pauseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => devicesApi.pauseDevice(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Monitoramento pausado");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao pausar monitoramento"),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => devicesApi.resumeDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Monitoramento retomado com sucesso");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao retomar monitoramento"),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { until: string; title: string; reason: string } }) =>
      devicesApi.setMaintenance(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Janela de manutenção agendada");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao agendar manutenção"),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof devicesApi.createDevice>[0]) => devicesApi.createDevice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Ativo cadastrado com sucesso");
      setIsFormModalOpen(false);
      setEditingDevice(null);
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao cadastrar ativo"),
  });

  const handlePause = useCallback((deviceId: string, reason: string) => {
    setActionLoading((prev) => ({ ...prev, [deviceId]: true }));
    pauseMutation.mutate({ id: deviceId, reason }, {
      onSettled: () => setActionLoading((prev) => ({ ...prev, [deviceId]: false })),
    });
  }, [pauseMutation]);

  const handleResume = useCallback((deviceId: string) => {
    setActionLoading((prev) => ({ ...prev, [deviceId]: true }));
    resumeMutation.mutate(deviceId, {
      onSettled: () => setActionLoading((prev) => ({ ...prev, [deviceId]: false })),
    });
  }, [resumeMutation]);

  const handleMaintenance = useCallback((deviceId: string, payload: { until: string; title: string; reason: string }) => {
    setActionLoading((prev) => ({ ...prev, [deviceId]: true }));
    maintenanceMutation.mutate({ id: deviceId, payload }, {
      onSettled: () => setActionLoading((prev) => ({ ...prev, [deviceId]: false })),
    });
  }, [maintenanceMutation]);

  const handleCreateDevice = useCallback(async (payload: Parameters<typeof devicesApi.createDevice>[0]) => {
    await createMutation.mutateAsync(payload);
  }, [createMutation]);

  const handleViewDetails = useCallback((deviceId: string) => {
    navigate(`/devices/${deviceId}`);
  }, [navigate]);

  const handlePageChange = useCallback((newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setFilters((prev) => ({ ...prev, pageSize: newPageSize, page: 1 }));
  }, []);

  const handleCategoryChange = useCallback((category: DeviceCategory | undefined) => {
    setFilters((prev) => ({ ...prev, category: category || undefined, page: 1 }));
  }, []);

  const handleCategoryChangeFromEvent = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value.trim();
    handleCategoryChange(val ? (val as DeviceCategory) : undefined);
  }, [handleCategoryChange]);

  const handleStatusChange = useCallback((healthStatus: DeviceHealthStatus | undefined) => {
    setFilters((prev) => ({ ...prev, healthStatus: healthStatus || undefined, page: 1 }));
  }, []);

  const handleProtocolChange = useCallback((protocol: ProberProtocol | undefined) => {
    setFilters((prev) => ({ ...prev, protocol: protocol || undefined, page: 1 }));
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchDebounce(value);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 10;
  const devices = data?.items ?? [];

  // Estatísticas calculadas dinamicamente para o Grid Tático de KPIs
  const stats = useMemo(() => {
    let up = 0;
    let down = 0;
    let deg = 0;
    let maint = 0;

    for (const d of devices) {
      const st = String(d.healthStatus || (d as any).status || ((d as any).is_paused ? "PAUSED" : "UP")).toUpperCase();
      if (st === "DOWN") down++;
      else if (st === "DEG" || st === "DEGRADED") deg++;
      else if (st === "MAINT" || st === "MAINTENANCE" || (d as any).is_paused) maint++;
      else up++;
    }

    return { total: totalItems, up, down, deg, maint };
  }, [devices, totalItems]);

  return (
    <main
      data-testid="devices-page"
      role="main"
      className="p-4 md:p-6 flex flex-col gap-6 w-full text-slate-100 bg-obsidian-950 min-h-screen"
    >
      {/* 1. Header Institucional com Breadcrumb & Ações Rápidas */}
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800">
        <div className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono">
            <BreadcrumbLink to="/noc" className="text-slate-400 hover:text-slate-200 transition-colors">
              Cockpit NOC
            </BreadcrumbLink>
            <span className="text-obsidian-700">/</span>
            <span className="text-emerald-400 font-semibold">
              Inventário de Ativos
            </span>
          </nav>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
              Inventário de Ativos
            </h1>
            <span className="px-2 py-0.5 rounded bg-obsidian-900 border border-obsidian-800 text-xs font-mono text-slate-300">
              {totalItems} ativos
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
            Catálogo unificado de infraestrutura física e virtual. Gerenciamento de ciclos de sondagem, protocolos (ICMP, SNMP, TCP, HTTP) e janelas de manutenção com supressão de alarmes.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5 shrink-0">
          <Button
            onClick={() => {
              setEditingDevice(null);
              setIsFormModalOpen(true);
            }}
            icon={<Plus size={16} />}
            data-testid="new-device-button"
            className="h-9 px-4 text-xs font-bold"
          >
            Novo Ativo
          </Button>
        </div>
      </header>

      {/* Estado de Erro RFC (Gerenciado automaticamente via ciclo da API) */}
      {isError && (
        <RfcErrorBanner
          title="FALHA NO SERVIÇO DE SINCRONIZAÇÃO DE ATIVOS DE REDE"
          rfcCode="RFC 5424 • ERR_INVENTORY_SYNC_FAILURE"
          error={error}
          onRetry={() => refetch()}
        />
      )}

      {/* 2. Grid Tático de KPIs (DNA Visual do InfraWatch) */}
      <section
        aria-label="Indicadores de Inventário"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="inventory-kpis-grid"
      >
        {isLoading && devices.length === 0 ? (
          <>
            <div className="h-28 bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3 w-24 bg-obsidian-850 rounded" />
              <div className="h-7 w-16 bg-obsidian-800 rounded" />
              <div className="h-2.5 w-32 bg-obsidian-850/60 rounded" />
            </div>
            <div className="h-28 bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3 w-24 bg-obsidian-850 rounded" />
              <div className="h-7 w-16 bg-obsidian-800 rounded" />
              <div className="h-2.5 w-32 bg-obsidian-850/60 rounded" />
            </div>
            <div className="h-28 bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3 w-24 bg-obsidian-850 rounded" />
              <div className="h-7 w-16 bg-obsidian-800 rounded" />
              <div className="h-2.5 w-32 bg-obsidian-850/60 rounded" />
            </div>
            <div className="h-28 bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3 w-24 bg-obsidian-850 rounded" />
              <div className="h-7 w-16 bg-obsidian-800 rounded" />
              <div className="h-2.5 w-32 bg-obsidian-850/60 rounded" />
            </div>
          </>
        ) : (
          <>
            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
                  Total de Ativos
                </span>
                <Server size={18} className="text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">
                  {totalItems}
                </span>
                <span className="text-xs font-mono text-emerald-400">
                  {stats.up} UP
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">
                Inventário cadastrado na base
              </span>
            </article>

            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
                  Operacionais (UP)
                </span>
                <CheckCircle2 size={18} className="text-emerald-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                  {stats.up}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Sondas nominal
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">
                Respostas de sondagem dentro do SLA
              </span>
            </article>

            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
                  Críticos (DOWN)
                </span>
                <AlertTriangle
                  size={18}
                  className={stats.down > 0 ? "text-rose-400 animate-pulse" : "text-slate-500"}
                />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    stats.down > 0 ? "text-rose-400" : "text-white"
                  }`}
                >
                  {stats.down}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  falha ativa
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">
                Requer triagem imediata no NOC
              </span>
            </article>

            <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
                  Manutenção / Pausados
                </span>
                <Wrench size={18} className="text-sky-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-white tabular-nums">
                  {stats.maint + stats.deg}
                </span>
                <span className="text-xs font-mono text-sky-400">
                  Isenção SLA
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">
                Supressão de alarmes ativa
              </span>
            </article>
          </>
        )}
      </section>

      {/* 3. Barra Tática de Filtros e Busca */}
      <section
        aria-label="Filtros de Inventário"
        className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-sm"
      >
        <div className="flex items-center gap-2.5 flex-1 flex-wrap">
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <label
              htmlFor="device-search"
              className="sr-only"
            >
              Buscar por nome, hostname, IP
            </label>
            <input
              id="device-search"
              type="text"
              placeholder="Buscar por nome, hostname, IP..."
              value={searchDebounce}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-obsidian-950 border border-obsidian-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:border-emerald-500 font-sans"
              data-testid="device-search-input"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="device-category-filter"
              className="sr-only"
            >
              Categoria
            </label>
            <select
              id="device-category-filter"
              value={filters.category || ""}
              onChange={handleCategoryChangeFromEvent}
              className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 cursor-pointer"
              data-testid="device-category-filter"
            >
              <option value="">Todas as categorias</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <label
              htmlFor="device-status-filter"
              className="sr-only"
            >
              Status
            </label>
            <select
              id="device-status-filter"
              value={filters.healthStatus || ""}
              onChange={(e) => {
                const val = e.target.value.trim();
                handleStatusChange(val ? (val as DeviceHealthStatus) : undefined);
              }}
              className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 cursor-pointer"
              data-testid="device-status-filter"
            >
              <option value="">Todos os status</option>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <label
              htmlFor="device-protocol-filter"
              className="sr-only"
            >
              Protocolo
            </label>
            <select
              id="device-protocol-filter"
              value={filters.protocol || ""}
              onChange={(e) => {
                const val = e.target.value.trim();
                handleProtocolChange(val ? (val as ProberProtocol) : undefined);
              }}
              className="bg-obsidian-950 border border-obsidian-800 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 cursor-pointer"
              data-testid="device-protocol-filter"
            >
              <option value="">Todos os protocolos</option>
              {Object.entries(protocolIcons).map(([key, icon]) => (
                <option key={key} value={key}>
                  {icon} {key}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end lg:self-auto">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />}
            onClick={handleRefresh}
            isLoading={isLoading}
            data-testid="refresh-button"
            className="h-8 text-xs gap-1.5"
          >
            Atualizar
          </Button>
        </div>
      </section>

      {/* 4. Tabela Tática de Ativos */}
      <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading && devices.length === 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            onCreate={() => {
              setEditingDevice(null);
              setIsFormModalOpen(true);
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="border-b border-obsidian-800 bg-obsidian-950/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-semibold">Nome / Hostname</th>
                    <th className="py-2.5 px-4 font-semibold">Endpoint / IP</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Intervalo</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-obsidian-800/60 font-mono">
                  {devices.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      onViewDetails={handleViewDetails}
                      onPause={handlePause}
                      onResume={handleResume}
                      onMaintenance={handleMaintenance}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação Tática */}
            <div className="p-3.5 border-t border-obsidian-800 bg-obsidian-950/50 flex items-center justify-between flex-wrap gap-3 font-mono text-xs text-slate-400">
              <div>
                Mostrando <strong className="text-white">{((currentPage - 1) * pageSize) + 1}</strong> a{" "}
                <strong className="text-white">{Math.min(currentPage * pageSize, totalItems)}</strong> de{" "}
                <strong className="text-white">{totalItems}</strong> ativos
              </div>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="page-size-select"
                  className="sr-only"
                >
                  Itens por página
                </label>
                <select
                  id="page-size-select"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="bg-obsidian-950 border border-obsidian-800 rounded px-2 py-1 font-mono text-xs text-slate-300 focus-visible:outline-none focus-visible:border-emerald-500 cursor-pointer"
                  data-testid="page-size-select"
                >
                  {[10].map((size) => (
                    <option key={size} value={size}>
                      {size} por página
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={14} />}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Página anterior"
                    data-testid="prev-page-button"
                    className="h-7 w-7 p-0 flex items-center justify-center text-slate-400 hover:text-white"
                  />
                  <span className="text-xs font-mono text-slate-400 min-w-[70px] text-center">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight size={14} />}
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Próxima página"
                    data-testid="next-page-button"
                    className="h-7 w-7 p-0 flex items-center justify-center text-slate-400 hover:text-white"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Modais de Gestão do Ativo */}
      <DeviceFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingDevice(null);
        }}
        onSubmit={handleCreateDevice}
        isLoading={createMutation.isPending}
        initialData={
          editingDevice
            ? {
                name: editingDevice.name,
                hostname: editingDevice.hostname,
                ipAddress: editingDevice.ipAddress,
                port: editingDevice.port,
                protocol: editingDevice.protocol,
                category: editingDevice.category,
                intervalSeconds: editingDevice.intervalSeconds,
              }
            : undefined
        }
        mode={editingDevice ? "edit" : "create"}
        data-testid="device-form-modal"
      />

      <PauseDeviceModal
        isOpen={pauseDeviceId !== null}
        onClose={() => setPauseDeviceId(null)}
        deviceName={devices.find((d) => d.id === pauseDeviceId)?.name || ""}
        onConfirm={(reason) => {
          if (pauseDeviceId) {
            handlePause(pauseDeviceId, reason);
            setPauseDeviceId(null);
          }
        }}
        isLoading={isActionLoading && pauseMutation.variables?.id === pauseDeviceId}
        data-testid="pause-device-modal"
      />

      <MaintenanceModal
        isOpen={maintenanceDeviceId !== null}
        onClose={() => setMaintenanceDeviceId(null)}
        deviceName={devices.find((d) => d.id === maintenanceDeviceId)?.name || ""}
        onConfirm={(payload) => {
          if (maintenanceDeviceId) {
            handleMaintenance(maintenanceDeviceId, payload);
            setMaintenanceDeviceId(null);
          }
        }}
        isLoading={isActionLoading && maintenanceMutation.variables?.id === maintenanceDeviceId}
        data-testid="maintenance-modal"
      />
    </main>
  );
};
