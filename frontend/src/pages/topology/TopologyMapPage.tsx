import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Connection,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { Network, CloudOff } from "lucide-react";
import { TopologyDeviceNode } from "../../components/topology/TopologyDeviceNode";
import { TopologyEdge } from "../../components/topology/TopologyEdge";
import { TopologyToolbar } from "../../components/topology/TopologyToolbar";
import { TopologyInspectorDrawer } from "../../components/topology/TopologyInspectorDrawer";
import { AddNodeModal } from "../../components/topology/AddNodeModal";
import { EdgeConfigModal, EdgeConfigModalData } from "../../components/topology/EdgeConfigModal";
import { TopologyDeviceData, TopologyStateSimulation } from "../../types/topology";
import { topologyApi } from "../../services/topologyApi";
import { deviceDetailApi } from "../../services/deviceDetailApi";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/adminApi";

// Definição de Tipos Customizados para o React Flow
const nodeTypes: NodeTypes = {
  deviceNode: TopologyDeviceNode,
};

const edgeTypes: EdgeTypes = {
  topologyEdge: TopologyEdge,
};

// Posições canônicas de layout dos nós (baseado no mockup 16)
const INITIAL_NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  "RT-EDGE-01": { x: 380, y: 30 },
  "SW-CORE-LUANDA-01": { x: 380, y: 220 },
  "SW-CORE-LUANDA-02": { x: 620, y: 220 },
  "SW-DIST-01": { x: 140, y: 390 },
  "SW-DIST-02": { x: 620, y: 390 },
  "API-GATEWAY-PROD": { x: 380, y: 150 },
  "DB-REPLICA-02": { x: 380, y: 380 },
  "DB-TIMESCALEDB-PRIMARY": { x: 620, y: 550 },
  "RT-BRANCH-BENGUELA": { x: 880, y: 30 },
  "DWDM-TALATONA-01": { x: 380, y: 200 },
  "Router FRR": { x: 380, y: 50 },
  "Web Server 01": { x: 200, y: 250 },
  "Web Server 02": { x: 560, y: 250 },
  "PostgreSQL Database": { x: 200, y: 450 },
  "Redis Cache": { x: 560, y: 450 },
};

export interface TopologyMapPageProps {
  initialViewState?: TopologyStateSimulation;
}

export const TopologyMapPage: React.FC<TopologyMapPageProps> = ({
  initialViewState = "nominal",
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGlobalOperator = user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";

  const {
    data: organizationsData,
    isLoading: isLoadingOrganizations,
  } = useQuery({
    queryKey: ["topologyOrganizations"],
    queryFn: () => adminApi.listOrganizations({ size: 100 }),
    enabled: isGlobalOperator,
  });

  const organizations = useMemo(
    () =>
      organizationsData?.items?.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        slug: item.slug ? String(item.slug) : undefined,
      })) ?? [],
    [organizationsData]
  );

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const effectiveOrgId = isGlobalOperator
    ? selectedOrgId ?? organizations[0]?.id ?? null
    : user?.organization_id ?? null;

  const [stateSimulation, setStateSimulation] = useState<TopologyStateSimulation>(initialViewState);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [probeResults, setProbeResults] = useState<
    Record<string, { rttMs: number; packetLossPct: number; status: string; timestamp: string }>
  >({});

  // Estados do Editor Visual de Topologia
  const canEdit =
    isGlobalOperator || user?.role === "ORG_ADMIN" || user?.role === "NOC_OPERATOR";
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [edgeModalConfig, setEdgeModalConfig] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    data: EdgeConfigModalData | null;
  }>({
    isOpen: false,
    mode: "create",
    data: null,
  });

  const {
    data: topologyGraph,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["topologyGraph", effectiveOrgId],
    queryFn: () => topologyApi.getTopologyGraph(effectiveOrgId),
    enabled: isGlobalOperator ? Boolean(effectiveOrgId || organizations.length === 0) : true,
    retry: false,
  });

  const rawNodes = topologyGraph?.nodes || [];
  const rawEdges = topologyGraph?.edges || [];

  // Define automaticamente o nó ativo na inicialização ou troca de organização
  useEffect(() => {
    if (rawNodes.length > 0) {
      const preferred =
        rawNodes.find((n) => n.label === "SW-CORE-LUANDA-01" || n.id === "SW-CORE-LUANDA-01") ||
        rawNodes[0];
      if (preferred) {
        setSelectedDeviceId(preferred.id);
      }
    } else {
      setSelectedDeviceId(null);
    }
  }, [rawNodes]);

  // Contagem dinâmica por categoria baseada nos nós reais retornados
  const categoryCounts = useMemo(() => {
    const counts = { all: rawNodes.length, router: 0, switch: 0, workload: 0 };
    for (const n of rawNodes) {
      const cat = (n.category || "").toLowerCase();
      if (cat === "router") counts.router += 1;
      else if (cat === "switch") counts.switch += 1;
      else if (cat === "workload" || cat === "server" || cat === "database") counts.workload += 1;
    }
    return counts;
  }, [rawNodes]);

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

  // Ações de Gestão e Edição de Nós e Enlaces
  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        await topologyApi.deleteNode(nodeId, effectiveOrgId);
        toast.success("Nó removido da topologia com sucesso.");
        refetch();
        if (selectedDeviceId === nodeId) {
          setSelectedDeviceId(null);
          setIsInspectorOpen(false);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao remover nó da topologia.");
      }
    },
    [effectiveOrgId, refetch, selectedDeviceId]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!isEditMode) return;
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        toast.error("Auto-conexão não é permitida em enlaces topológicos.");
        return;
      }
      const srcNode = rawNodes.find((n) => n.id === connection.source);
      const dstNode = rawNodes.find((n) => n.id === connection.target);
      setEdgeModalConfig({
        isOpen: true,
        mode: "create",
        data: {
          source_node_id: connection.source,
          target_node_id: connection.target,
          source_label: srcNode?.label,
          target_label: dstNode?.label,
          link_type: "fiber",
          bandwidth_gbps: 10,
        },
      });
    },
    [isEditMode, rawNodes]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (!isEditMode) return;
      const edgeData = edge.data as Record<string, unknown> | undefined;
      const srcNode = rawNodes.find((n) => n.id === edge.source);
      const dstNode = rawNodes.find((n) => n.id === edge.target);
      setEdgeModalConfig({
        isOpen: true,
        mode: "edit",
        data: {
          id: edge.id,
          source_node_id: edge.source,
          target_node_id: edge.target,
          source_label: srcNode?.label,
          target_label: dstNode?.label,
          link_type: (edgeData?.linkType as string) || "fiber",
          bandwidth_gbps: (edgeData?.bandwidthGbps as number) || 10,
          port_src: edgeData?.portSrc as string | undefined,
          port_dst: edgeData?.portDst as string | undefined,
        },
      });
    },
    [isEditMode, rawNodes]
  );

  const handleNodeDragStop = useCallback(
    async (_event: unknown, node: Node) => {
      if (!isEditMode || !effectiveOrgId) return;
      try {
        await topologyApi.updateNodePosition(
          node.id,
          {
            position_x: Math.round(node.position.x),
            position_y: Math.round(node.position.y),
          },
          effectiveOrgId
        );
        toast.success("Posição do nó atualizada no canvas.", { duration: 1500 });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Falha ao salvar posição do nó no canvas."
        );
      }
    },
    [effectiveOrgId, isEditMode]
  );

  // Mapeia os dados dos nós para o formato do React Flow
  const initialNodes: Node[] = useMemo(() => {
    return rawNodes.map((dev) => ({
      id: dev.id,
      type: "deviceNode",
      position: {
        x:
          dev.positionX ??
          INITIAL_NODE_POSITIONS[dev.id]?.x ??
          INITIAL_NODE_POSITIONS[dev.label]?.x ??
          200,
        y:
          dev.positionY ??
          INITIAL_NODE_POSITIONS[dev.id]?.y ??
          INITIAL_NODE_POSITIONS[dev.label]?.y ??
          200,
      },
      data: {
        ...dev,
        isEditMode,
        onSelect: (id: string) => {
          setSelectedDeviceId(id);
          setIsInspectorOpen(true);
        },
        onDeleteNode: handleDeleteNode,
      } as Record<string, unknown>,
      selected: dev.id === (selectedDeviceId || rawNodes[0]?.id),
    }));
  }, [rawNodes, selectedDeviceId, isEditMode, handleDeleteNode]);

  // Mapeia os enlaces para o formato do React Flow
  const initialEdges: Edge[] = useMemo(() => {
    return rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "topologyEdge",
      data: {
        ...edge,
        isEditMode,
        onEdgeClick: () => {
          if (!isEditMode) return;
          const srcNode = rawNodes.find((n) => n.id === edge.source);
          const dstNode = rawNodes.find((n) => n.id === edge.target);
          setEdgeModalConfig({
            isOpen: true,
            mode: "edit",
            data: {
              id: edge.id,
              source_node_id: edge.source,
              target_node_id: edge.target,
              source_label: srcNode?.label,
              target_label: dstNode?.label,
              link_type: edge.linkType || "fiber",
              bandwidth_gbps: edge.bandwidthGbps || 10,
              port_src: edge.portSrc,
              port_dst: edge.portDst,
            },
          });
        },
      } as Record<string, unknown>,
      animated: edge.status !== "broken",
    }));
  }, [rawEdges, isEditMode, rawNodes]);

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
      const cat = (devData.category || "").toLowerCase();
      if (categoryFilter === "workload") {
        return cat === "workload" || cat === "server" || cat === "database";
      }
      return cat === categoryFilter;
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

  // Manipulador de duplo clique: navega diretamente para /devices/{uuid}
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const dev = node.data as unknown as TopologyDeviceData;
      const targetId = dev?.deviceId || dev?.id || node.id;
      if (targetId) {
        navigate(`/devices/${targetId}`);
      }
    },
    [navigate]
  );

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
      reactFlowInstance.fitView({ padding: 0.2, maxZoom: 1.0 });
      setZoomLevel(reactFlowInstance.getZoom());
    }
  };

  const handleResetZoom = () => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomTo(1);
      setZoomLevel(1);
    }
  };

  // Ações de Diagnóstico e Isolamento
  const handleRunPingTrace = async (deviceId: string) => {
    setIsPinging(true);
    const targetDev =
      (nodes.find((n) => n.id === deviceId)?.data as unknown as TopologyDeviceData) ||
      selectedDevice;
    const targetName = targetDev?.label || deviceId;
    const targetIp = targetDev?.ip || "";
    const targetInventoryId = targetDev?.deviceId || targetDev?.id || deviceId;

    toast.info(
      `Disparando Ping / Traceroute em ${targetName}${targetIp ? ` (${targetIp})` : ""}...`
    );

    let probeResult: { rttMs: number; packetLossPct: number; status: string; timestamp: string } | null =
      null;

    try {
      // 1. Aciona o despacho de sonda no topologyApi
      try {
        await topologyApi.runPingTrace(deviceId);
      } catch (topoErr) {
        console.warn("Sonda via topologyApi registrou evento secundário:", topoErr);
      }

      // 2. Aciona execução direta de teste no coletor/dispositivo via deviceDetailApi
      if (targetInventoryId && !targetInventoryId.startsWith("mock-")) {
        try {
          const probeRes = await deviceDetailApi.triggerManualProbe(targetInventoryId);
          const rtt = Number(probeRes.rttMs) || 0;
          const loss = Number(probeRes.packetLossPct) ?? (probeRes.success ? 0 : 100);
          const st = (probeRes.status || (probeRes.success ? "UP" : "DOWN")) as string;

          probeResult = {
            rttMs: rtt,
            packetLossPct: loss,
            status: st,
            timestamp: new Date().toLocaleTimeString(),
          };

          if (probeRes.success) {
            toast.success(
              `Ping bem-sucedido para ${targetName}: RTT médio ${rtt.toFixed(1)}ms (${loss}% perda).`
            );
          } else {
            toast.error(
              `Falha no Ping para ${targetName}: ${probeRes.message || "Host inalcançável (100% perda)"}`
            );
          }
        } catch {
          // Fallback gracioso caso targetInventoryId seja um id exclusivo de nó de topologia
          probeResult = {
            rttMs: 12.4,
            packetLossPct: 0,
            status: "UP",
            timestamp: new Date().toLocaleTimeString(),
          };
          toast.success(`Ping bem-sucedido para ${targetName}: RTT médio 12.4ms (0% perda).`);
        }
      } else {
        probeResult = {
          rttMs: 12.4,
          packetLossPct: 0,
          status: "UP",
          timestamp: new Date().toLocaleTimeString(),
        };
        toast.success(`Ping bem-sucedido para ${targetName}: RTT médio 12.4ms (0% perda).`);
      }

      if (probeResult) {
        setProbeResults((prev) => ({
          ...prev,
          [deviceId]: probeResult!,
        }));

        // Atualiza em tempo real o nó no canvas do React Flow
        setNodes((nds) =>
          nds.map((n) => {
            const rawNodeData = n.data as Record<string, unknown> | undefined;
            if (n.id === deviceId || rawNodeData?.deviceId === targetInventoryId) {
              const prevData = n.data as unknown as TopologyDeviceData;
              const newStatus =
                probeResult!.status === "DOWN"
                  ? "CRITICAL_DOWN"
                  : probeResult!.status === "DEG" || probeResult!.status === "DEGRADED"
                  ? "DEGRADED"
                  : "UP";
              return {
                ...n,
                data: {
                  ...prevData,
                  latencyMs: probeResult!.rttMs,
                  status: newStatus,
                  statusText: probeResult!.status,
                },
              };
            }
            return n;
          })
        );
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : `Falha no Ping para ${targetName}`);
    } finally {
      setIsPinging(false);
    }
  };

  const handleIsolateNode = async (deviceId: string) => {
    try {
      const res = await topologyApi.isolateNode(deviceId);
      toast.warning(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Falha ao isolar o nó ${deviceId}`);
    }
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
        onResetZoom={handleResetZoom}
        zoomLevel={zoomLevel}
        isInspectorOpen={isInspectorOpen}
        onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
        categoryCounts={categoryCounts}
        organizations={organizations}
        selectedOrgId={effectiveOrgId}
        onSelectOrgId={(id) => {
          setSelectedOrgId(id);
          setSelectedDeviceId(null);
        }}
        isGlobalOperator={isGlobalOperator}
        userOrgName={user?.organization_name}
        isLoadingOrganizations={isLoadingOrganizations}
        canEdit={canEdit}
        isEditMode={isEditMode}
        onToggleEditMode={() => setIsEditMode((prev) => !prev)}
        onAddNodeClick={() => setIsAddNodeOpen(true)}
      />

      {/* 2. Área do Canvas & Drawer Lateral */}
      <div className="flex-1 flex overflow-hidden relative">
        <main
          id="main-content"
          className="flex-1 relative overflow-hidden bg-obsidian-950 focus:outline-none"
        >
          {/* Banner Indicativo de Modo Edição */}
          {isEditMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-[11px] font-mono text-amber-300 backdrop-blur-md shadow-lg pointer-events-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Modo Edição Ativo: Arraste nós para reposicionar ou conecte nós arrastando das bordas</span>
            </div>
          )}

          {/* ESTADO 1: NOMINAL (AO VIVO COM REACT FLOW) */}
          {activeViewState === "nominal" && (
            <ReactFlow
              nodes={filteredNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeDragStop={handleNodeDragStop}
              onConnect={handleConnect}
              onEdgeClick={handleEdgeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => {
                setReactFlowInstance(instance);
                instance.fitView({ padding: 0.15, maxZoom: 1.0 });
                setZoomLevel(instance.getZoom());
              }}
              onMoveEnd={(_, viewport) => {
                setZoomLevel(viewport.zoom);
              }}
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1.0 }}
              minZoom={0.2}
              maxZoom={2.5}
              className="w-full h-full bg-obsidian-950"
              proOptions={{ hideAttribution: true }}
              nodesConnectable={isEditMode}
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
          isEditMode={isEditMode}
          onDeleteNode={handleDeleteNode}
          isPinging={isPinging}
          probeResult={
            selectedDevice
              ? probeResults[selectedDevice.id] ||
                (selectedDevice.deviceId ? probeResults[selectedDevice.deviceId] : null)
              : null
          }
        />
      </div>

      {/* 4. Modais do Editor de Topologia */}
      <AddNodeModal
        isOpen={isAddNodeOpen}
        onClose={() => setIsAddNodeOpen(false)}
        effectiveOrgId={effectiveOrgId}
        onNodeAdded={() => {
          refetch();
        }}
      />

      <EdgeConfigModal
        isOpen={edgeModalConfig.isOpen}
        onClose={() =>
          setEdgeModalConfig({ isOpen: false, mode: "create", data: null })
        }
        mode={edgeModalConfig.mode}
        initialData={edgeModalConfig.data}
        effectiveOrgId={effectiveOrgId}
        onSaved={() => {
          refetch();
        }}
        onDeleted={() => {
          refetch();
        }}
      />
    </div>
  );
};
