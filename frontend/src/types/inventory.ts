export type ProberProtocol = "ICMP" | "HTTP" | "TCP" | "DOCKER" | "HEARTBEAT" | "SNMP";

export type DeviceCategory = "ROUTER" | "SWITCH" | "FIREWALL" | "SERVER" | "DATABASE" | "LOAD_BALANCER" | "OTHER";

export type DeviceHealthStatus = "UP" | "DOWN" | "DEG" | "MAINT" | "PAUSED";

export interface DeviceThresholds {
  latencyWarningMs?: number;
  latencyCriticalMs?: number;
  packetLossWarningPct?: number;
  packetLossCriticalPct?: number;
}

export interface DeviceListItem {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  port?: number;
  protocol: ProberProtocol;
  category: DeviceCategory;
  healthStatus: DeviceHealthStatus;
  intervalSeconds: number;
  lastCheckAt?: string;
  nextCheckAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceDetail extends DeviceListItem {
  description?: string;
  tags: string[];
  thresholds: DeviceThresholds;
  httpConfig?: {
    url: string;
    method: string;
    expectedStatusCodes: number[];
    followRedirects: boolean;
    verifySsl: boolean;
    timeoutSeconds: number;
  };
  tcpConfig?: {
    port: number;
    timeoutSeconds: number;
  };
  dockerConfig?: {
    containerName: string;
    socketPath?: string;
  };
  heartbeatConfig?: {
    expectedIntervalSeconds: number;
    gracePeriodSeconds: number;
  };
  snmpConfig?: {
    version: "v1" | "v2c" | "v3";
    port: number;
    community?: string;
    oid?: string;
    securityLevel?: "noAuthNoPriv" | "authNoPriv" | "authPriv";
    username?: string;
    authProtocol?: "MD5" | "SHA" | "SHA256";
    authPassword?: string;
    privProtocol?: "DES" | "AES" | "AES128" | "AES256";
    privPassword?: string;
    timeoutSeconds: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DeviceFilters {
  search?: string;
  category?: DeviceCategory;
  healthStatus?: DeviceHealthStatus;
  protocol?: ProberProtocol;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateDeviceRequest {
  name: string;
  hostname: string;
  ipAddress: string;
  port?: number;
  protocol: ProberProtocol;
  category: DeviceCategory;
  intervalSeconds: number;
  description?: string;
  tags?: string[];
  thresholds?: DeviceThresholds;
  httpConfig?: {
    url: string;
    method: string;
    expectedStatusCodes: number[];
    followRedirects: boolean;
    verifySsl: boolean;
    timeoutSeconds: number;
  };
  tcpConfig?: {
    port: number;
    timeoutSeconds: number;
  };
  dockerConfig?: {
    containerName: string;
    socketPath?: string;
  };
  heartbeatConfig?: {
    expectedIntervalSeconds: number;
    gracePeriodSeconds: number;
  };
  snmpConfig?: {
    version: "v1" | "v2c" | "v3";
    port: number;
    community?: string;
    oid?: string;
    securityLevel?: "noAuthNoPriv" | "authNoPriv" | "authPriv";
    username?: string;
    authProtocol?: "MD5" | "SHA" | "SHA256";
    authPassword?: string;
    privProtocol?: "DES" | "AES" | "AES128" | "AES256";
    privPassword?: string;
    timeoutSeconds: number;
  };
}

export interface UpdateDeviceRequest {
  name?: string;
  hostname?: string;
  ipAddress?: string;
  port?: number;
  protocol?: ProberProtocol;
  category?: DeviceCategory;
  intervalSeconds?: number;
  description?: string;
  tags?: string[];
  thresholds?: DeviceThresholds;
  httpConfig?: {
    url: string;
    method: string;
    expectedStatusCodes: number[];
    followRedirects: boolean;
    verifySsl: boolean;
    timeoutSeconds: number;
  };
  tcpConfig?: {
    port: number;
    timeoutSeconds: number;
  };
  dockerConfig?: {
    containerName: string;
    socketPath?: string;
  };
  heartbeatConfig?: {
    expectedIntervalSeconds: number;
    gracePeriodSeconds: number;
  };
  snmpConfig?: {
    version: "v1" | "v2c" | "v3";
    port: number;
    community?: string;
    oid?: string;
    securityLevel?: "noAuthNoPriv" | "authNoPriv" | "authPriv";
    username?: string;
    authProtocol?: "MD5" | "SHA" | "SHA256";
    authPassword?: string;
    privProtocol?: "DES" | "AES" | "AES128" | "AES256";
    privPassword?: string;
    timeoutSeconds: number;
  };
}

export interface PauseDeviceRequest {
  reason: string;
}

export interface ResumeDeviceRequest {
  reason?: string;
}

export interface SetMaintenanceRequest {
  until: string;
  title: string;
  reason: string;
}

export interface DeviceActionPayload {
  deviceId: string;
  action: "pause" | "resume" | "maintenance";
  reason?: string;
  until?: string;
  title?: string;
}

export interface TestProbeRequest {
  ipAddress: string;
  port?: number;
  protocol?: string;
  timeoutMs?: number;
  snmpConfig?: CreateDeviceRequest["snmpConfig"];
  httpConfig?: CreateDeviceRequest["httpConfig"];
  tcpConfig?: CreateDeviceRequest["tcpConfig"];
  dockerConfig?: CreateDeviceRequest["dockerConfig"];
}

export interface TestProbeResponse {
  status: "UP" | "DEGRADED" | "DOWN" | "TIMEOUT" | "ERROR";
  latencyMs: number;
  packetLossPct: number;
  message: string;
  success: boolean;
  errorMessage?: string | null;
}