import type {
  DeviceDetail,
  TimescaleMetricsResponse,
  TimescaleMetricsBucket,
  OpticalInterfaceItem,
  DeviceSlaMetrics,
  DeviceIncidentSummary,
  ManualProbeResult,
  TimescalePeriod,
} from "../types/deviceDetail";

export const createMockDeviceDetail = (overrides: Partial<DeviceDetail> = {}): DeviceDetail => ({
  id: "dev-1",
  name: "SW-CORE-LUANDA-01",
  hostname: "sw-core-luanda-01.infrawatch.local",
  ipAddress: "10.0.1.1",
  macAddress: "70:7B:E8:4A:12:00",
  model: "CloudEngine 6800",
  vendor: "Huawei",
  firmwareVersion: "V200R021C00",
  protocol: "SNMP",
  category: "SWITCH",
  healthStatus: "UP",
  uptimeSeconds: 15947445,
  uptimeDisplay: "184d 12h 45m",
  location: "Datacenter Luanda Sul",
  rack: "R-04",
  description: "Core Switch do backbone de Luanda - Cluster AO-LAD-PRD-01",
  tags: ["backbone", "core", "producao", "luanda"],
  lastCheckAt: "2024-01-15T17:42:01Z",
  nextCheckAt: "2024-01-15T17:42:16Z",
  createdAt: "2023-07-15T10:00:00Z",
  updatedAt: "2024-01-15T17:42:01Z",
  ...overrides,
});

export const createMockTimescaleMetrics = (
  period: TimescalePeriod = "24h",
  overrides: Partial<TimescaleMetricsResponse> = {}
): TimescaleMetricsResponse => {
  const buckets: TimescaleMetricsBucket[] = [];
  const now = new Date();
  const points = period === "1h" ? 360 : period === "24h" ? 8640 : period === "7d" ? 60480 : 259200;
  const interval = period === "1h" ? 10000 : period === "24h" ? 10000 : period === "7d" ? 600000 : 3600000;

  for (let i = points; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * interval).toISOString();
    const baseRtt = 2.1;
    const spike = i === 420 ? 14.2 : i === 840 ? 8.5 : 0;
    const noise = (Math.random() - 0.5) * 0.8;

    buckets.push({
      timestamp,
      rttMinMs: Math.max(0.5, baseRtt - 0.5 + noise),
      rttP95Ms: baseRtt + noise + (spike || 0),
      rttMaxMs: baseRtt + 1.5 + noise + (spike || 0),
      packetLossPct: spike ? 0.1 : Math.max(0, (Math.random() - 0.5) * 0.02),
    });
  }

  return {
    buckets,
    period,
    summary: {
      minMs: 1.8,
      p95Ms: 2.1,
      maxMs: 14.2,
      avgLossPct: 0.0,
    },
    ...overrides,
  };
};

export const mockOpticalInterfaces: OpticalInterfaceItem[] = [
  { portNumber: 1, portName: "100GE 1/0/1", speed: "25G", status: "UP", description: "Uplink RT-EDGE-01 (100GE LACP Trunk)", rxPowerDbm: "-3.2 dBm", txPowerDbm: "-3.1 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 2, portName: "100GE 1/0/2", speed: "25G", status: "UP", description: "Uplink Redundante RT-EDGE-01", rxPowerDbm: "-3.4 dBm", txPowerDbm: "-3.3 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 3, portName: "100GE 1/0/3", speed: "25G", status: "UP", description: "Distribuição SW-DIST-01", rxPowerDbm: "-2.8 dBm", txPowerDbm: "-2.7 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 4, portName: "100GE 1/0/4", speed: "25G", status: "UP", description: "Distribuição SW-DIST-02", rxPowerDbm: "-2.9 dBm", txPowerDbm: "-2.8 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 5, portName: "100GE 1/0/5", speed: "25G", status: "UP", description: "Cluster Local DC Luanda", rxPowerDbm: "-3.1 dBm", txPowerDbm: "-3.0 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 6, portName: "100GE 1/0/6", speed: "25G", status: "UP", description: "Cluster Local DC Luanda", rxPowerDbm: "-3.0 dBm", txPowerDbm: "-2.9 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 7, portName: "100GE 1/0/7", speed: "25G", status: "UP", description: "VLAN 10 Gestão mTLS", rxPowerDbm: "-3.3 dBm", txPowerDbm: "-3.2 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 8, portName: "100GE 1/0/8", speed: "25G", status: "UP", description: "VLAN 20 Telemetria SSE", rxPowerDbm: "-3.5 dBm", txPowerDbm: "-3.4 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 9, portName: "100GE 1/0/9", speed: "25G", status: "UP", description: "VLAN 30 DMZ / Ingress", rxPowerDbm: "-2.7 dBm", txPowerDbm: "-2.6 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 10, portName: "100GE 1/0/10", speed: "25G", status: "UP", description: "Mirror Wireshark Probe", rxPowerDbm: "-3.6 dBm", txPowerDbm: "-3.5 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 11, portName: "100GE 1/0/11", speed: "25G", status: "UP", description: "Storage NVMe-oF Primário", rxPowerDbm: "-3.0 dBm", txPowerDbm: "-2.9 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 12, portName: "100GE 1/0/12", speed: "25G", status: "UP", description: "Storage NVMe-oF Secundário", rxPowerDbm: "-3.1 dBm", txPowerDbm: "-3.0 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 13, portName: "100GE 1/0/13", speed: "25G", status: "UP", description: "VLAN 40 Voz & Telefonia", rxPowerDbm: "-3.2 dBm", txPowerDbm: "-3.1 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 14, portName: "100GE 1/0/14", speed: "25G", status: "UP", description: "VLAN 50 Backup Replication", rxPowerDbm: "-3.4 dBm", txPowerDbm: "-3.3 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 15, portName: "100GE 1/0/15", speed: "25G", status: "UP", description: "Cluster K8s Worker 01", rxPowerDbm: "-2.9 dBm", txPowerDbm: "-2.8 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 16, portName: "100GE 1/0/16", speed: "25G", status: "UP", description: "Cluster K8s Worker 02", rxPowerDbm: "-2.8 dBm", txPowerDbm: "-2.7 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 17, portName: "100GE 1/0/17", speed: "25G", status: "UP", description: "Cluster K8s Worker 03", rxPowerDbm: "-3.0 dBm", txPowerDbm: "-2.9 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 18, portName: "100GE 1/0/18", speed: "25G", status: "UP", description: "Enlace Secundário Luanda", rxPowerDbm: "-3.1 dBm", txPowerDbm: "-3.0 dBm", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 19, portName: "100GE 1/0/19", speed: "25G", status: "DEG", description: "Taxa de Erro CRC elevada: 142 erros/min", rxPowerDbm: "-11.4 dBm", txPowerDbm: "-11.2 dBm", crcErrorsPerMin: 142, packetLossPct: 1.4, mtu: 9216, duplex: "Full" },
  { portNumber: 20, portName: "100GE 1/0/20", speed: "25G", status: "FREE", description: "Porta SFP28 disponível para alocação", rxPowerDbm: "N/A", txPowerDbm: "N/A", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 21, portName: "100GE 1/0/21", speed: "25G", status: "FREE", description: "Porta SFP28 disponível para alocação", rxPowerDbm: "N/A", txPowerDbm: "N/A", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 22, portName: "100GE 1/0/22", speed: "25G", status: "FREE", description: "Porta SFP28 disponível para alocação", rxPowerDbm: "N/A", txPowerDbm: "N/A", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 23, portName: "100GE 1/0/23", speed: "25G", status: "FREE", description: "Porta SFP28 disponível para alocação", rxPowerDbm: "N/A", txPowerDbm: "N/A", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
  { portNumber: 24, portName: "100GE 1/0/24", speed: "25G", status: "FREE", description: "Porta SFP28 disponível para alocação", rxPowerDbm: "N/A", txPowerDbm: "N/A", crcErrorsPerMin: 0, packetLossPct: 0, mtu: 9216, duplex: "Full" },
];

export const mockSlaMetrics: DeviceSlaMetrics = {
  availabilityPct: 99.98,
  targetAvailabilityPct: 99.5,
  marginPct: 0.48,
  mttrSeconds: 494,
  mttrTargetSeconds: 900,
  mtbfHours: 418,
  tier: "TIER-1",
};

export const mockIncidentSummaries: DeviceIncidentSummary[] = [
  {
    id: "inc-1",
    title: "Atenuação Óptica Porta 19",
    status: "EM_ANALISE",
    durationMinutes: 28,
    glpiTicketId: "8493",
    createdAt: "2024-01-15T15:14:00Z",
  },
  {
    id: "inc-2",
    title: "Manutenção Firmware V200",
    status: "RESOLVIDO",
    durationMinutes: 852,
    glpiTicketId: "8115",
    createdAt: "2024-01-10T08:00:00Z",
  },
];

export const mockManualProbeResult: ManualProbeResult = {
  success: true,
  rttMs: 2.1,
  packetLossPct: 0,
  packetsSent: 5,
  packetsReceived: 5,
  timestamp: new Date().toISOString(),
};

export const periodOptions: { value: TimescalePeriod; label: string }[] = [
  { value: "1h", label: "1 Hora" },
  { value: "24h", label: "24 Horas" },
  { value: "7d", label: "7 Dias" },
  { value: "30d", label: "30 Dias" },
];