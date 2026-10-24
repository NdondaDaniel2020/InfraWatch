import type { DeviceListItem, DeviceDetail, PaginatedResponse, ProberProtocol, DeviceCategory, DeviceHealthStatus } from "../types/inventory";

export const createMockDevice = (overrides: Partial<DeviceListItem> = {}): DeviceListItem => ({
  id: "dev-1",
  name: "Roteador Core SP",
  hostname: "router-core-sp.infrawatch.local",
  ipAddress: "192.168.1.1",
  port: undefined,
  protocol: "ICMP",
  category: "ROUTER",
  healthStatus: "UP",
  intervalSeconds: 60,
  lastCheckAt: "2024-01-15T10:30:00Z",
  nextCheckAt: "2024-01-15T10:31:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockDeviceDetail = (overrides: Partial<DeviceDetail> = {}): DeviceDetail => ({
  id: "dev-1",
  name: "Roteador Core SP",
  hostname: "router-core-sp.infrawatch.local",
  ipAddress: "192.168.1.1",
  port: undefined,
  protocol: "ICMP",
  category: "ROUTER",
  healthStatus: "UP",
  intervalSeconds: 60,
  lastCheckAt: "2024-01-15T10:30:00Z",
  nextCheckAt: "2024-01-15T10:31:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  description: "Roteador de borda principal do backbone",
  tags: ["backbone", "core", "producao"],
  thresholds: {
    latencyWarningMs: 250,
    latencyCriticalMs: 500,
    packetLossWarningPct: 1,
    packetLossCriticalPct: 5,
  },
  ...overrides,
});

export const createMockResponse = <T>(
  items: T[],
  page = 1,
  pageSize = 20,
  total?: number
): PaginatedResponse<T> => ({
  items,
  total: total ?? items.length,
  page,
  pageSize,
  totalPages: Math.ceil((total ?? items.length) / pageSize),
});

export const mockDeviceList: DeviceListItem[] = [
  createMockDevice({ id: "dev-1", name: "Roteador Core SP", healthStatus: "UP" }),
  createMockDevice({ id: "dev-2", name: "Switch Acesso RJ", healthStatus: "DOWN", protocol: "TCP", port: 22 }),
  createMockDevice({ id: "dev-3", name: "Firewall DF", healthStatus: "DEG", protocol: "HTTP" }),
  createMockDevice({ id: "dev-4", name: "Servidor DB", healthStatus: "MAINT", protocol: "DOCKER" }),
  createMockDevice({ id: "dev-5", name: "Job Backup", healthStatus: "PAUSED", protocol: "HEARTBEAT" }),
];

export const mockPaginatedResponse = createMockResponse(mockDeviceList);

export const protocolOptions: { value: ProberProtocol; label: string; icon: string }[] = [
  { value: "ICMP", label: "ICMP Ping", icon: "📡" },
  { value: "HTTP", label: "HTTP/S", icon: "🌐" },
  { value: "TCP", label: "Porta TCP", icon: "🔌" },
  { value: "DOCKER", label: "Docker", icon: "🐳" },
  { value: "HEARTBEAT", label: "Heartbeat", icon: "💓" },
];

export const categoryOptions: { value: DeviceCategory; label: string }[] = [
  { value: "ROUTER", label: "Roteador" },
  { value: "SWITCH", label: "Switch" },
  { value: "FIREWALL", label: "Firewall" },
  { value: "SERVER", label: "Servidor" },
  { value: "DATABASE", label: "Banco de Dados" },
  { value: "LOAD_BALANCER", label: "Load Balancer" },
  { value: "OTHER", label: "Outro" },
];

export const statusOptions: { value: DeviceHealthStatus; label: string }[] = [
  { value: "UP", label: "UP" },
  { value: "DOWN", label: "DOWN" },
  { value: "DEG", label: "Degradado" },
  { value: "MAINT", label: "Manutenção" },
  { value: "PAUSED", label: "Pausado" },
];

export const mockHttpConfig = {
  url: "https://api.exemplo.com/health",
  method: "GET" as const,
  expectedStatusCodes: [200, 201, 204],
  followRedirects: true,
  verifySsl: true,
  timeoutSeconds: 10,
};

export const mockTcpConfig = {
  port: 443,
  timeoutSeconds: 5,
};

export const mockDockerConfig = {
  containerName: "nginx-proxy",
  socketPath: "/var/run/docker.sock",
};

export const mockHeartbeatConfig = {
  expectedIntervalSeconds: 300,
  gracePeriodSeconds: 60,
};

export const mockThresholds = {
  latencyWarningMs: 250,
  latencyCriticalMs: 500,
  packetLossWarningPct: 1,
  packetLossCriticalPct: 5,
};