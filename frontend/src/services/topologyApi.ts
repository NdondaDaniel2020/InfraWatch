import { apiClient } from "./apiClient";
import {
  AvailableTopologyDevice,
  CreateTopologyEdgePayload,
  CreateTopologyNodePayload,
  TopologyDeviceCategory,
  TopologyDeviceData,
  TopologyEdgeData,
  TopologyGraphResponse,
  TopologyHealthStatus,
  UpdateTopologyEdgePayload,
} from "../types/topology";

export interface BackendTopologyNode {
  id: string;
  label: string;
  node_type: string;
  organization_id: string;
  device_id?: string | null;
  ip_address?: string | null;
  cluster?: string | null;
  position_x?: number | null;
  position_y?: number | null;
  device_status?: string | null;
  model?: string | null;
  vendor?: string | null;
  serial_number?: string | null;
  firmware?: string | null;
  temperature?: string | null;
  uptime?: string | null;
  latency_ms?: number | null;
  packet_loss?: number | null;
  cpu_usage?: number | null;
  mem_usage?: number | null;
  ports_active?: number | null;
  ports_total?: number | null;
}

export interface BackendTopologyEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  organization_id: string;
  link_type: string;
  bandwidth_gbps?: number | null;
  port_src?: string | null;
  port_dst?: string | null;
}

export interface BackendTopologyGraphResponse {
  nodes: BackendTopologyNode[];
  edges: BackendTopologyEdge[];
  total_nodes: number;
  total_edges: number;
  cluster?: string | null;
}

export interface ProbeDispatchResponse {
  probe_id: string;
  node_id: string;
  ip_address: string;
  sse_channel: string;
  message: string;
}

export interface PingTraceDispatch {
  probeId: string;
  nodeId: string;
  ipAddress: string;
  sseChannel: string;
  message: string;
  rttMs?: number;
  packetLoss?: number;
}

const mapHealthStatus = (status: string | null | undefined): TopologyHealthStatus => {
  switch (status) {
    case "UP":
      return "UP";
    case "DEGRADED":
      return "DEGRADED";
    case "DOWN":
      return "CRITICAL_DOWN";
    case "MAINTENANCE":
    case "PAUSED":
      return "MAINTENANCE";
    default:
      return "UNKNOWN";
  }
};

export const topologyApi = {
  /**
   * Obtém a estrutura em grafo de nós e enlaces da topologia.
   * Conecta ao backend FastAPI (/api/v1/topology/graph).
   */
  getTopologyGraph: async (organizationId?: string | null): Promise<TopologyGraphResponse> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    const data = await apiClient.get<BackendTopologyGraphResponse>(`/api/v1/topology/graph${params}`);

    const mappedNodes: TopologyDeviceData[] = data.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      category: (n.node_type || "device") as TopologyDeviceCategory,
      status: mapHealthStatus(n.device_status),
      statusText: n.device_status ?? undefined,
      deviceId: n.device_id ?? undefined,
      ip: n.ip_address ?? undefined,
      positionX: n.position_x ?? undefined,
      positionY: n.position_y ?? undefined,
      model: n.model ?? undefined,
      serialNumber: n.serial_number ?? undefined,
      firmware: n.firmware ?? undefined,
      temperature: n.temperature ?? undefined,
      uptime: n.uptime ?? undefined,
      latencyMs: typeof n.latency_ms === "number" ? n.latency_ms : undefined,
      cpuUsage: typeof n.cpu_usage === "number" ? Math.round(n.cpu_usage) : undefined,
      memUsage: typeof n.mem_usage === "number" ? Math.round(n.mem_usage) : undefined,
      portsActiveCount: n.ports_active ?? undefined,
      portsTotalCount: n.ports_total ?? undefined,
    }));

    const mappedEdges: TopologyEdgeData[] = data.edges.map((e) => {
      const bandwidth =
        e.bandwidth_gbps !== null && e.bandwidth_gbps !== undefined
          ? `${e.bandwidth_gbps} Gbps`
          : undefined;

      return {
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        bandwidth,
        linkType: e.link_type,
        bandwidthGbps: e.bandwidth_gbps ?? undefined,
        portSrc: e.port_src ?? undefined,
        portDst: e.port_dst ?? undefined,
        status: "unknown",
        statusText: [e.link_type, bandwidth].filter(Boolean).join(" • ") || undefined,
      };
    });

    return {
      nodes: mappedNodes,
      edges: mappedEdges,
      totalNodes: data.total_nodes ?? mappedNodes.length,
      totalEdges: data.total_edges ?? mappedEdges.length,
      cluster: data.cluster ?? null,
    };
  },

  /**
   * Despacha teste tático de diagnóstico (Ping / Traceroute) em nó específico.
   * O resultado é entregue de forma assíncrona pelo ProbeWorker via SSE.
   */
  runPingTrace: async (nodeId: string): Promise<PingTraceDispatch> => {
    const res = await apiClient.post<ProbeDispatchResponse>(
      `/api/v1/topology/nodes/${nodeId}/probe`,
      {}
    );

    if (!res.probe_id) {
      throw new Error("O coletor não confirmou o despacho da sonda.");
    }

    return {
      probeId: res.probe_id,
      nodeId: res.node_id,
      ipAddress: res.ip_address,
      sseChannel: res.sse_channel,
      message: res.message,
    };
  },

  /**
   * Isola um nó com defeito da rota de trânsito OSPF/BGP.
   * Conecta ao endpoint real do backend (/api/v1/topology/nodes/{nodeId}/isolate).
   */
  isolateNode: async (
    nodeId: string
  ): Promise<{ success: boolean; message: string; nodeId?: string }> => {
    return apiClient.post<{ success: boolean; message: string; nodeId?: string }>(
      `/api/v1/topology/nodes/${nodeId}/isolate`,
      {}
    );
  },

  /**
   * Lista dispositivos do inventário da organização indicando se já estão na topologia.
   */
  getAvailableDevices: async (organizationId?: string | null): Promise<AvailableTopologyDevice[]> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.get<AvailableTopologyDevice[]>(`/api/v1/topology/available-devices${params}`);
  },

  /**
   * Cria um novo nó na topologia da organização.
   */
  createNode: async (
    payload: CreateTopologyNodePayload,
    organizationId?: string | null
  ): Promise<BackendTopologyNode> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.post<BackendTopologyNode>(`/api/v1/topology/nodes${params}`, payload);
  },

  /**
   * Atualiza as coordenadas visuais (x, y) de um nó no canvas.
   */
  updateNodePosition: async (
    nodeId: string,
    position: { position_x: number; position_y: number },
    organizationId?: string | null
  ): Promise<BackendTopologyNode> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.patch<BackendTopologyNode>(
      `/api/v1/topology/nodes/${nodeId}/position${params}`,
      position
    );
  },

  /**
   * Remove um nó da topologia e seus enlaces conectados.
   */
  deleteNode: async (nodeId: string, organizationId?: string | null): Promise<void> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.delete<void>(`/api/v1/topology/nodes/${nodeId}${params}`);
  },

  /**
   * Cria um enlace entre dois nós na topologia da organização.
   */
  createEdge: async (
    payload: CreateTopologyEdgePayload,
    organizationId?: string | null
  ): Promise<BackendTopologyEdge> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.post<BackendTopologyEdge>(`/api/v1/topology/edges${params}`, payload);
  },

  /**
   * Atualiza os atributos (tipo, largura de banda, portas) de um enlace.
   */
  updateEdge: async (
    edgeId: string,
    payload: UpdateTopologyEdgePayload,
    organizationId?: string | null
  ): Promise<BackendTopologyEdge> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.patch<BackendTopologyEdge>(`/api/v1/topology/edges/${edgeId}${params}`, payload);
  },

  /**
   * Remove um enlace entre dois nós.
   */
  deleteEdge: async (edgeId: string, organizationId?: string | null): Promise<void> => {
    const params = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return apiClient.delete<void>(`/api/v1/topology/edges/${edgeId}${params}`);
  },
};
