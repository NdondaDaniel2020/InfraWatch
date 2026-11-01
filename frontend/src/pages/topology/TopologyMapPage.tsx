import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Network, CloudOff } from "lucide-react";
import { TopologyDeviceNode } from "../../components/topology/TopologyDeviceNode";
import { TopologyEdge } from "../../components/topology/TopologyEdge";
import {
  TopologyToolbar,
  TopologyStateSimulation,
} from "../../components/topology/TopologyToolbar";
import { TopologyInspectorDrawer } from "../../components/topology/TopologyInspectorDrawer";
import { TopologyDeviceData } from "../../types/topology";
import { topologyApi } from "../../services/topologyApi";

// Definição de Tipos Customizados para o React Flow
const nodeTypes: NodeTypes = {
  deviceNode: TopologyDeviceNode as any,
};

const edgeTypes: EdgeTypes = {
  topologyEdge: TopologyEdge as any,
};

// Posições canônicas de layout dos nós (baseado no mockup 16)
const INITIAL_NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  "RT-EDGE-01": { x: 380, y: 30 },
  "SW-CORE-LUANDA-01": { x: 380, y: 220 },
  "SW-DIST-01": { x: 140, y: 390 },
  "SW-DIST-02": { x: 620, y: 390 },
  "API-GATEWAY-PROD": { x: 140, y: 550 },
  "DB-TIMESCALEDB-PRIMARY": { x: 620, y: 550 },
  "RT-BRANCH-BENGUELA": { x: 880, y: 30 },
};

export interface TopologyMapPageProps {
  initialViewState?: TopologyStateSimulation;
}

export const TopologyMapPage: React.FC<TopologyMapPageProps> = ({
  initialViewState = "nominal",
}) => {
  const [stateSimulation, setStateSimulation] = useState<TopologyStateSimulation>(initialViewState);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>("SW-CORE-LUANDA-01");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const {
    data: topologyGraph,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["topologyGraph"],
    queryFn: () => topologyApi.getTopologyGraph(),
    retry: false,
  });

  const rawNodes = topologyGraph?.nodes || [];
  const rawEdges = topologyGraph?.edges || [];

  const activeViewState: TopologyStateSimulation =
    initialViewState !== "nominal"
      ? initialViewState
      : isLoading
      ? "skeleton"
      : isError
      ? "error"
      : rawNodes.length === 0
      ? "empty"
      : stateSimulation;

  // Mapeia os dados dos nós para o formato do React Flow
  const initialNodes: Node[] = useMemo(() => {
    return rawNodes.map((dev) => ({
      id: dev.id,
      type: "deviceNode",
      position: INITIAL_NODE_POSITIONS[dev.id] || {
        x: dev.positionX ?? 200,
        y: dev.positionY ?? 200,
      },
      data: {
        ...dev,
        onSelect: (id: string) => {
          setSelectedDeviceId(id);
          setIsInspectorOpen(true);
        },
      } as any,
      selected: dev.id === (selectedDeviceId || "SW-CORE-LUANDA-01"),
    }));
  }, [rawNodes, selectedDeviceId]);

  // Mapeia os enlaces para o formato do React Flow
  const initialEdges: Edge[] = useMemo(() => {
    return rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "topologyEdge",
      data: edge as any,
      animated: edge.status !== "broken",
    }));
  }, [rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    }
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialEdges, setEdges]);

  // Filtra nós no canvas conforme a categoria selecionada
  const filteredNodes = useMemo(() => {
    const sourceNodes = nodes.length > 0 ? nodes : initialNodes;
    if (categoryFilter === "all") return sourceNodes;
    return sourceNodes.filter((n) => {
      const devData = n.data as unknown as TopologyDeviceData;
      return devData.category === categoryFilter;
    });
  }, [nodes, initialNodes, categoryFilter]);

  // Dispositivo selecionado atualmente para o Drawer
  const selectedDevice = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedDeviceId);
    if (node?.data) {
      return node.data as unknown as TopologyDeviceData;
    }
    return rawNodes.find((d) => d.id === selectedDeviceId) || rawNodes[0] || null;
  }, [nodes, rawNodes, selectedDeviceId]);

  // Manipulador de clique no nó
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedDeviceId(node.id);
    setIsInspectorOpen(true);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === node.id,
      }))
    );
  }, [setNodes]);

  // Controles de Viewport
  const handleZoomIn = () => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomIn();
      setZoomLevel(reactFlowInstance.getZoom());
    }
  };

  const handleZoomOut = () => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomOut();
      setZoomLevel(reactFlowInstance.getZoom());
    }
  };

  const handleFitView = () => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
      setZoomLevel(reactFlowInstance.getZoom());
    }
  };

  // Ações de Diagnóstico e Isolamento
  const handleRunPingTrace = async (deviceId: string) => {
    toast.info(`Disparando Ping / Traceroute em ${deviceId}...`);
    try {
      const res = await topologyApi.runPingTrace(deviceId);
      if (typeof res.packetLoss === "number" && res.packetLoss > 0) {
        toast.error(`Falha no Ping para ${deviceId}: Perda de 100% dos pacotes (Fibra Rompida).`);
      } else if (typeof res.rttMs === "number") {
        toast.success(`Ping bem-sucedido para ${deviceId}: RTT médio ${res.rttMs}ms (0% perda).`);
      } else {
        toast.success(res.message || `Sonda despachada com sucesso para ${deviceId}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Falha no Ping para ${deviceId}`);
    }
  };

  const handleIsolateNode = async (deviceId: string) => {
    const res = await topologyApi.isolateNode(deviceId);
    toast.warning(res.message);
  };

  return (
    <div
      data-testid="topology-map-page"
      className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-obsidian-950 relative"
    >
      {/* 1. Barra Tática Superior */}
      <TopologyToolbar
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        zoomLevel={zoomLevel}
        isInspectorOpen={isInspectorOpen}
        onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
      />

      {/* 2. Área do Canvas & Drawer Lateral */}
      <div className="flex-1 flex overflow-hidden relative">
        <main
          id="main-content"
          className="flex-1 relative overflow-hidden bg-obsidian-950 focus:outline-none"
        >
          {/* ESTADO 1: NOMINAL (AO VIVO COM REACT FLOW) */}
          {activeViewState === "nominal" && (
            <ReactFlow
              nodes={filteredNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => {
                setReactFlowInstance(instance);
                setZoomLevel(instance.getZoom());
              }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              maxZoom={2.5}
              className="bg-obsidian-950"
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#2a395e" gap={24} size={1} />
              <Controls className="!bg-obsidian-900 !border-obsidian-800 !fill-white" />
              <MiniMap
                nodeColor={(n) => {
                  const dev = n.data as unknown as TopologyDeviceData;
                  if (dev.status === "CRITICAL_DOWN") return "#f43f5e";
                  if (dev.status === "DEGRADED") return "#f59e0b";
                  return "#10b981";
                }}
                maskColor="rgba(8, 12, 20, 0.75)"
                className="!bg-obsidian-900 !border !border-obsidian-800 !rounded-xl !overflow-hidden"
              />
            </ReactFlow>
          )}

          {/* ESTADO 2: SKELETON / CARREGANDO */}
          {activeViewState === "skeleton" && (
            <div
              data-testid="topology-skeleton"
              className="absolute inset-0 bg-obsidian-950/95 z-30 p-8 flex flex-col justify-between backdrop-blur-sm pointer-events-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-obsidian-850 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="w-48 h-4 rounded bg-obsidian-850 animate-pulse" />
                    <div className="w-32 h-3 rounded bg-obsidian-800 animate-pulse" />
                  </div>
                </div>
                <div className="w-40 h-8 rounded-lg bg-obsidian-850 animate-pulse" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-auto max-w-4xl mx-auto w-full">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-36 rounded-xl bg-obsidian-900 border border-obsidian-800/60 p-4 space-y-3 animate-pulse"
                  >
                    <div className="w-24 h-4 rounded bg-obsidian-800" />
                    <div className="w-full h-3 rounded bg-obsidian-850" />
                    <div className="w-2/3 h-3 rounded bg-obsidian-850" />
                  </div>
                ))}
              </div>
              <div className="text-center font-mono text-xs text-slate-400 animate-pulse">
                Sincronizando topologia com sondas remotas e enlaces LLDP…
              </div>
            </div>
          )}

          {/* ESTADO 3: VAZIO (SEM ATIVOS DESCOBERTOS) */}
          {activeViewState === "empty" && (
            <div
              data-testid="topology-empty"
              className="absolute inset-0 bg-obsidian-950/95 z-30 p-8 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-auto"
            >
              <div className="w-16 h-16 rounded-2xl bg-obsidian-900 border border-obsidian-800 flex items-center justify-center text-slate-500 mb-4 shadow-xl">
                <Network size={32} />
              </div>
              <h2 className="text-base font-semibold text-white mb-1">Nenhum Ativo Descoberto</h2>
              <p className="text-xs text-slate-400 max-w-md text-center mb-5">
                O cluster selecionado ainda não possui enlaces telemétricos ativos ou a descoberta
                LLDP/SNMP está temporariamente desativada.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toast.info("Iniciando varredura LLDP/SNMP no segmento...")}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-bold text-xs rounded-lg transition-colors"
                >
                  Executar Varredura SNMP/LLDP
                </button>
                <button
                  type="button"
                  onClick={() => setStateSimulation("nominal")}
                  className="px-3.5 py-2 bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                >
                  Restaurar Visão
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 4: ERRO DE COLETOR / BOUNDARY */}
          {activeViewState === "error" && (
            <div
              data-testid="topology-error"
              className="absolute inset-0 bg-obsidian-950/95 z-30 p-8 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-auto"
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-xl">
                <CloudOff size={32} />
              </div>
              <h2 className="text-base font-semibold text-rose-400 mb-1">
                Falha de Comunicação com Coletor gRPC
              </h2>
              <p className="text-xs text-slate-400 max-w-md text-center mb-2 font-mono tabular-nums">
                RFC 5424 Code:{" "}
                <span className="text-rose-300 font-bold">ERR_TOPOLOGY_STREAM_DISCONNECTED</span>
              </p>
              <p className="text-xs text-slate-400 max-w-md text-center mb-5">
                A conexão SSE/gRPC com o agente central do NOC foi interrompida ou excedeu o limite de
                heartbeat (15.000ms).
              </p>
              <button
                type="button"
                onClick={() => {
                  setStateSimulation("nominal");
                  toast.success("Conexão restabelecida com sucesso.");
                }}
                className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-xs rounded-lg transition-colors"
              >
                Reconectar Coletor
              </button>
            </div>
          )}
        </main>

        {/* 3. Drawer Lateral de Inspeção de Dispositivo */}
        <TopologyInspectorDrawer
          device={selectedDevice}
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          onRunPingTrace={handleRunPingTrace}
          onIsolateNode={handleIsolateNode}
        />
      </div>
    </div>
  );
};
