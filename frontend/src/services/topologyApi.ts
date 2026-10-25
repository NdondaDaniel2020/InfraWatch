import { TopologyGraphResponse, TopologyDeviceData, TopologyEdgeData } from "../types/topology";
import { mockTopologyNodes, mockTopologyEdges } from "../mocks/topologyMocks";

export const topologyApi = {
  /**
   * Obtém a estrutura em grafo de nós e enlaces da topologia.
   */
  getTopologyGraph: async (): Promise<TopologyGraphResponse> => {
    // Retorna a estrutura canônica sincronizada com sondas LLDP/SNMP
    return {
      nodes: mockTopologyNodes,
      edges: mockTopologyEdges,
      totalNodes: mockTopologyNodes.length,
      totalEdges: mockTopologyEdges.length,
      cluster: "CLUSTER LUANDA-01",
    };
  },

  /**
   * Dispara teste tático de diagnóstico (Ping / Traceroute) em nó específico.
   */
  runPingTrace: async (nodeId: string): Promise<{ rttMs: number; hops: string[]; packetLoss: number }> => {
    const isBenguela = nodeId === "RT-BRANCH-BENGUELA";
    if (isBenguela) {
      return {
        rttMs: 0,
        hops: ["10.0.0.1 (RT-EDGE-01)", "* * * (Fibra Rompida)"],
        packetLoss: 100,
      };
    }
    return {
      rttMs: 2.1,
      hops: ["10.0.0.1 (RT-EDGE-01)", "10.0.1.1 (SW-CORE-LUANDA-01)"],
      packetLoss: 0,
    };
  },

  /**
   * Isola um nó com defeito da rota de trânsito OSPF/BGP.
   */
  isolateNode: async (nodeId: string): Promise<{ success: boolean; message: string }> => {
    return {
      success: true,
      message: `Nó ${nodeId} isolado da rota de trânsito OSPF/BGP com sucesso.`,
    };
  },
};
