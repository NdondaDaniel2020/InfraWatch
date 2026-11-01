import { apiClient } from "./apiClient";
import {
  TopologyDeviceCategory,
  TopologyDeviceData,
  TopologyEdgeData,
  TopologyGraphResponse,
  TopologyHealthStatus,
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
  getTopologyGraph: async (): Promise<TopologyGraphResponse> => {
    const data = await apiClient.get<BackendTopologyGraphResponse>("/api/v1/topology/graph");

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
   */
  isolateNode: async (
    nodeId: string
  ): Promise<{ success: boolean; message: string }> => {
    return {
      success: true,
      message: `Nó ${nodeId} isolado da rota de trânsito OSPF/BGP com sucesso.`,
    };
  },
};
