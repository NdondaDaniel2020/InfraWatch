/**
 * Tipagens para a Topologia de Rede Interativa com Nós e Enlaces Dinâmicos (Issue #168).
 */

export type TopologyDeviceCategory =
  | "router"
  | "switch"
  | "workload"
  | "server"
  | "database"
  | "container"
  | "device"
  | "service"
  | "external"
  | "cluster";

export type TopologyHealthStatus =
  | "UP"
  | "DEGRADED"
  | "CRITICAL_DOWN"
  | "MAINTENANCE"
  | "UNKNOWN";

export interface TopologyPort {
  id: number;
  status: "UP" | "DEG" | "FREE";
  speed: string;
  label: string;
  opticPower?: string;
}

export interface TopologyLldpNeighbor {
  name: string;
  port: string;
}

export interface TopologyDeviceData {
  id: string;
  label: string;
  category: TopologyDeviceCategory;
  status: TopologyHealthStatus;
  statusText?: string;
  deviceId?: string;
  ip?: string;
  model?: string;
  serialNumber?: string;
  firmware?: string;
  temperature?: string;
  uptime?: string;
  latencyMs?: number;
  cpuUsage?: number;
  memUsage?: number;
  traffic?: string;
  portsTitle?: string;
  portsActiveCount?: number;
  portsTotalCount?: number;
  ports?: TopologyPort[];
  ingressGbps?: string;
  egressGbps?: string;
  lldpNeighbors?: TopologyLldpNeighbor[];
  positionX?: number;
  positionY?: number;
  selected?: boolean;
}

export interface TopologyEdgeData {
  id: string;
  source: string;
  target: string;
  latencyMs?: number;
  bandwidth?: string;
  linkType?: string;
  bandwidthGbps?: number;
  portSrc?: string;
  portDst?: string;
  status?: "healthy" | "degraded" | "broken" | "unknown";
  statusText?: string;
  trafficLabel?: string;
}

export interface AvailableTopologyDevice {
  id: string;
  name: string;
  category: string;
  ip_address: string;
  status: string;
  is_in_topology: boolean;
}

export interface CreateTopologyNodePayload {
  label: string;
  node_type?: string;
  device_id?: string | null;
  ip_address?: string | null;
  cluster?: string | null;
  position_x?: number | null;
  position_y?: number | null;
}

export interface CreateTopologyEdgePayload {
  source_node_id: string;
  target_node_id: string;
  link_type?: string;
  bandwidth_gbps?: number | null;
  port_src?: string | null;
  port_dst?: string | null;
}

export interface UpdateTopologyEdgePayload {
  link_type?: string;
  bandwidth_gbps?: number | null;
  port_src?: string | null;
  port_dst?: string | null;
}

export interface TopologyGraphResponse {
  nodes: TopologyDeviceData[];
  edges: TopologyEdgeData[];
  totalNodes: number;
  totalEdges: number;
  cluster: string | null;
}
