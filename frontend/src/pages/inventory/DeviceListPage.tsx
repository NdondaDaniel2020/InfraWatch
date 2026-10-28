import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ChevronLeft, ChevronRight, RefreshCw, MoreHorizontal } from "lucide-react";
import { Button, Badge, Skeleton } from "../../components/ui";
import { DeviceFormModal } from "../../components/inventory/DeviceFormModal";
import { PauseDeviceModal } from "../../components/inventory/PauseDeviceModal";
import { MaintenanceModal } from "../../components/inventory/MaintenanceModal";
import { devicesApi } from "../../services/devicesApi";
import type { DeviceListItem, DeviceFilters, DeviceHealthStatus, ProberProtocol, DeviceCategory } from "../../types/inventory";
import { toast } from "sonner";

const statusConfig: Record<DeviceHealthStatus, { variant: "healthy" | "degraded" | "critical" | "maintenance" | "neutral"; label: string }> = {
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

const categoryOptions: { value: DeviceCategory; label: string }[] = [
  { value: "ROUTER", label: "Roteador" },
  { value: "SWITCH", label: "Switch" },
  { value: "FIREWALL", label: "Firewall" },
  { value: "SERVER", label: "Servidor" },
  { value: "DATABASE", label: "Banco de Dados" },
  { value: "LOAD_BALANCER", label: "Load Balancer" },
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
  <tr style={{ height: "56px" }}>
    <td style={{ padding: "12px 16px" }}><Skeleton width="60%" height="20px" /></td>
    <td style={{ padding: "12px 16px" }}><Skeleton width="50%" height="16px" /></td>
    <td style={{ padding: "12px 16px" }}><Skeleton width="80px" height="24px" /></td>
    <td style={{ padding: "12px 16px" }}><Skeleton width="60px" height="16px" /></td>
    <td style={{ padding: "12px 16px" }}><Skeleton width="120px" height="24px" /></td>
  </tr>
);

const EmptyState: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
    <MoreHorizontal style={{ fontSize: "48px", color: "var(--color-text-muted)", marginBottom: "16px" }} />
    <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>
      Nenhum ativo cadastrado
    </h3>
    <p style={{ color: "var(--color-text-secondary)", marginBottom: "24px", maxWidth: "320px" }}>
      Comece adicionando seu primeiro dispositivo de monitoramento. Suportamos ICMP, HTTP, TCP, Docker e Heartbeat.
    </p>
    <Button onClick={onCreate} icon={<Plus size={16} />} size="lg">
      Adicionar Primeiro Ativo
    </Button>
  </div>
);

const DeviceRow: React.FC<{
  device: DeviceListItem;
  onViewDetails: (id: string) => void;
}> = ({
  device,
  onViewDetails,
}) => {
  const status = statusConfig[device.healthStatus];
  const protocolIcon = protocolIcons[device.protocol] || "❓";

  return (
    <tr style={{ borderBottom: "var(--border-subtle)", transition: "background-color var(--transition-fast)" }}>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              {device.name}
            </span>
            <Badge variant={device.category === "ROUTER" || device.category === "SWITCH" ? "neutral" : "neutral"} size="sm" dot={false}>
              {device.category}
            </Badge>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            {device.hostname}
          </span>
        </div>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>
            {device.ipAddress}{device.port ? `:${device.port}` : ""}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
            <span>{protocolIcon}</span>
            <span style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{device.protocol}</span>
          </span>
        </div>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <Badge variant={status.variant} size="md" pulse={device.healthStatus === "DOWN"}>
          {status.label}
        </Badge>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
          {device.intervalSeconds}s
        </span>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button
            variant="ghost"
            size="sm"
            icon={<MoreHorizontal size={14} />}
            onClick={() => onViewDetails(device.id)}
            aria-label="Ver detalhes"
            data-testid={`device-details-${device.id}`}
          />
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
    pageSize: 20,
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

  const { data, isLoading, refetch } = useQuery({
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
    setFilters((prev) => ({ ...prev, category, page: 1 }));
  }, []);

  const handleCategoryChangeFromEvent = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    handleCategoryChange(e.target.value as DeviceCategory | undefined);
  }, []);

  const handleStatusChange = useCallback((healthStatus: DeviceHealthStatus | undefined) => {
    setFilters((prev) => ({ ...prev, healthStatus, page: 1 }));
  }, []);

  const handleProtocolChange = useCallback((protocol: ProberProtocol | undefined) => {
    setFilters((prev) => ({ ...prev, protocol, page: 1 }));
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
  const pageSize = data?.pageSize ?? 20;
  const devices = data?.items ?? [];

  return (
    <main
      data-testid="devices-page"
      role="main"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "24px",
        minHeight: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", borderBottom: "var(--border-subtle)", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)", letterSpacing: "-0.02em" }}>
            Inventário de Ativos
          </h1>
        </div>
        <Button
          onClick={() => { setEditingDevice(null); setIsFormModalOpen(true); }}
          icon={<Plus size={16} />}
          data-testid="new-device-button"
        >
          Novo Ativo
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "var(--color-surface-card)", border: "var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "280px", maxWidth: "400px" }}>
            <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", fontSize: "16px" }} />
            <label htmlFor="device-search" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" }}>
              Buscar por nome, hostname, IP
            </label>
            <input
              id="device-search"
              type="text"
              placeholder="Buscar por nome, hostname, IP..."
              value={searchDebounce}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                outline: "none",
                transition: "border-color var(--transition-fast)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-border-focus)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border-subtle)")}
              data-testid="device-search-input"
            />
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <label htmlFor="device-category-filter" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" }}>
              Categoria
            </label>
            <select
              id="device-category-filter"
              value={filters.category || ""}
              onChange={handleCategoryChangeFromEvent}
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                outline: "none",
                cursor: "pointer",
                minWidth: "160px",
              }}
              data-testid="device-category-filter"
            >
              <option value="">Todas as categorias</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label htmlFor="device-status-filter" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" }}>
              Status
            </label>
            <select
              id="device-status-filter"
              value={filters.healthStatus || ""}
              onChange={(e) => handleStatusChange(e.target.value as DeviceHealthStatus | undefined)}
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                outline: "none",
                cursor: "pointer",
                minWidth: "160px",
              }}
              data-testid="device-status-filter"
            >
              <option value="">Todos os status</option>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            <label htmlFor="device-protocol-filter" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" }}>
              Protocolo
            </label>
            <select
              id="device-protocol-filter"
              value={filters.protocol || ""}
              onChange={(e) => handleProtocolChange(e.target.value as ProberProtocol | undefined)}
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--color-surface-elevated)",
                border: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                outline: "none",
                cursor: "pointer",
                minWidth: "160px",
              }}
              data-testid="device-protocol-filter"
            >
              <option value="">Todos os protocolos</option>
              {Object.entries(protocolIcons).map(([key, icon]) => (
                <option key={key} value={key}>{icon} {key}</option>
              ))}
            </select>

            <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={handleRefresh} isLoading={isLoading} data-testid="refresh-button">
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: "var(--color-surface-card)", border: "var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {isLoading && devices.length === 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        ) : devices.length === 0 ? (
          <EmptyState onCreate={() => { setEditingDevice(null); setIsFormModalOpen(true); }} />
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "rgba(0,0,0,0.2)", borderBottom: "var(--border-subtle)" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-sans)" }}>Nome / Hostname</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-sans)" }}>Endpoint / IP</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-sans)" }}>Status</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-sans)" }}>Intervalo</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: "var(--color-text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-sans)" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: "16px", borderTop: "var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                Mostrando <strong>{((currentPage - 1) * pageSize) + 1}</strong> a <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> de <strong>{totalItems}</strong> ativos
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <label htmlFor="page-size-select" style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0" }}>
                  Itens por página
                </label>
                <select
                  id="page-size-select"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "var(--color-surface-elevated)",
                    border: "var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.875rem",
                    outline: "none",
                    cursor: "pointer",
                  }}
                  data-testid="page-size-select"
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>{size} por página</option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={14} />}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Página anterior"
                    data-testid="prev-page-button"
                  />
                  <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", minWidth: "60px", textAlign: "center" }}>
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight size={14} />}
                    iconPosition="right"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Próxima página"
                    data-testid="next-page-button"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <DeviceFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingDevice(null); }}
        onSubmit={handleCreateDevice}
        isLoading={createMutation.isPending}
        initialData={editingDevice ? {
          name: editingDevice.name,
          hostname: editingDevice.hostname,
          ipAddress: editingDevice.ipAddress,
          port: editingDevice.port,
          protocol: editingDevice.protocol,
          category: editingDevice.category,
          intervalSeconds: editingDevice.intervalSeconds,
        } : undefined}
        mode={editingDevice ? "edit" : "create"}
        data-testid="device-form-modal"
      />

      <PauseDeviceModal
        isOpen={pauseDeviceId !== null}
        onClose={() => setPauseDeviceId(null)}
        deviceName={devices.find((d) => d.id === pauseDeviceId)?.name || ""}
        onConfirm={(reason) => handlePause(pauseDeviceId!, reason)}
        isLoading={isActionLoading && pauseMutation.variables?.id === pauseDeviceId}
        data-testid="pause-device-modal"
      />

      <MaintenanceModal
        isOpen={maintenanceDeviceId !== null}
        onClose={() => setMaintenanceDeviceId(null)}
        deviceName={devices.find((d) => d.id === maintenanceDeviceId)?.name || ""}
        onConfirm={(payload) => handleMaintenance(maintenanceDeviceId!, payload)}
        isLoading={isActionLoading && maintenanceMutation.variables?.id === maintenanceDeviceId}
        data-testid="maintenance-modal"
      />
    </main>
  );
};