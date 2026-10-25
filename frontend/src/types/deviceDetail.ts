export interface DeviceDetail {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  model: string;
  vendor: string;
  firmwareVersion: string;
  protocol: string;
  category: string;
  healthStatus: "UP" | "DOWN" | "DEG" | "MAINT" | "PAUSED";
  uptimeSeconds: number;
  uptimeDisplay: string;
  location: string;
  rack: string;
  description?: string;
  tags: string[];
  lastCheckAt: string;
  nextCheckAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimescaleMetricsBucket {
  timestamp: string;
  rttMinMs: number;
  rttP95Ms: number;
  rttMaxMs: number;
  packetLossPct: number;
}

export interface TimescaleMetricsResponse {
  buckets: TimescaleMetricsBucket[];
  period: "1h" | "24h" | "7d" | "30d";
  summary: {
    minMs: number;
    p95Ms: number;
    maxMs: number;
    avgLossPct: number;
  };
}

export interface OpticalInterfaceItem {
  portNumber: number;
  portName: string;
  speed: string;
  status: "UP" | "DOWN" | "DEG" | "FREE";
  description: string;
  rxPowerDbm: string;
  txPowerDbm: string;
  crcErrorsPerMin: number;
  packetLossPct: number;
  mtu: number;
  duplex: "Full" | "Half";
}

export interface DeviceSlaMetrics {
  availabilityPct: number;
  targetAvailabilityPct: number;
  marginPct: number;
  mttrSeconds: number;
  mttrTargetSeconds: number;
  mtbfHours: number;
  tier: "TIER-1" | "TIER-2" | "TIER-3";
}

export interface DeviceIncidentSummary {
  id: string;
  title: string;
  status: "EM_ANALISE" | "RESOLVIDO" | "EM_ANDAMENTO";
  durationMinutes: number;
  glpiTicketId: string;
  createdAt: string;
}

export interface ManualProbeResult {
  success: boolean;
  rttMs: number;
  packetLossPct: number;
  packetsSent: number;
  packetsReceived: number;
  timestamp: string;
}

export type TimescalePeriod = "1h" | "24h" | "7d" | "30d";