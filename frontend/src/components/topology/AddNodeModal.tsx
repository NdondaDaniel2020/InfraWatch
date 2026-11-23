import React, { useState, useEffect, useMemo } from "react";
import { X, Server, Layers, Plus, Search, CheckCircle2, Radio } from "lucide-react";
import { toast } from "sonner";
import { topologyApi, BackendTopologyNode } from "../../services/topologyApi";
import { AvailableTopologyDevice, CreateTopologyNodePayload } from "../../types/topology";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  effectiveOrgId?: string | null;
  onNodeAdded: (node: BackendTopologyNode) => void;
}

export const AddNodeModal: React.FC<AddNodeModalProps> = ({
  isOpen,
  onClose,
  effectiveOrgId,
  onNodeAdded,
}) => {
  const [activeTab, setActiveTab] = useState<"inventory" | "custom">("inventory");
  const [availableDevices, setAvailableDevices] = useState<AvailableTopologyDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Custom node state
  const [customLabel, setCustomLabel] = useState("");
  const [customNodeType, setCustomNodeType] = useState("router");
  const [customIp, setCustomIp] = useState("");
  const [customCluster, setCustomCluster] = useState("LUANDA-CORE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && effectiveOrgId) {
      setIsLoadingDevices(true);
      topologyApi
        .getAvailableDevices(effectiveOrgId)
        .then((devices) => {
          setAvailableDevices(devices);
          const firstAvailable = devices.find((d) => !d.is_in_topology);
          if (firstAvailable) {
            setSelectedDeviceId(firstAvailable.id);
          }
        })
        .catch((err) => {
          toast.error("Erro ao carregar dispositivos do inventário");
          console.error(err);
        })
        .finally(() => {
          setIsLoadingDevices(false);
        });
    }
  }, [isOpen, effectiveOrgId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return availableDevices;
    const q = searchQuery.toLowerCase();
    return availableDevices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.ip_address.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [availableDevices, searchQuery]);

  if (!isOpen) return null;

  const handleAddFromInventory = async () => {
    if (!selectedDeviceId) {
      toast.error("Selecione um dispositivo do inventário.");
      return;
    }
    const dev = availableDevices.find((d) => d.id === selectedDeviceId);
    if (!dev) return;

    setIsSubmitting(true);
    try {
      // Map category to valid node_type
      let nodeType = dev.category.toLowerCase();
      if (!["router", "switch", "server", "database", "workload", "container"].includes(nodeType)) {
        nodeType = "device";
      }

      const payload: CreateTopologyNodePayload = {
        label: dev.name,
        node_type: nodeType,
        device_id: dev.id,
        ip_address: dev.ip_address,
        cluster: customCluster || "LUANDA-CORE",
        position_x: 350 + Math.floor(Math.random() * 80) - 40,
        position_y: 250 + Math.floor(Math.random() * 80) - 40,
      };

      const createdNode = await topologyApi.createNode(payload, effectiveOrgId);
      toast.success(`Nó "${createdNode.label}" adicionado à topologia.`);
      onNodeAdded(createdNode);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar nó à topologia.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCustomNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLabel.trim()) {
      toast.error("Informe o rótulo/nome do nó.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateTopologyNodePayload = {
        label: customLabel.trim(),
        node_type: customNodeType,
        ip_address: customIp.trim() || null,
        cluster: customCluster.trim() || null,
        position_x: 350 + Math.floor(Math.random() * 80) - 40,
        position_y: 250 + Math.floor(Math.random() * 80) - 40,
      };

      const createdNode = await topologyApi.createNode(payload, effectiveOrgId);
      toast.success(`Nó "${createdNode.label}" criado com sucesso.`);
      onNodeAdded(createdNode);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar nó customizado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-node-modal-title"
      data-testid="add-node-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[640px] bg-[#0e1524]/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto backdrop-blur-xl">
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-[#080c14]/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/20">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="add-node-modal-title" className="font-display text-base font-bold text-white tracking-tight">
                  Adicionar Elemento à Topologia
                </h2>
                <span className="px-2 py-0.5 text-[9px] font-mono font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                  Editor NOC
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Vincule ativos do inventário desta organização ou crie nós externos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tabs de Seleção */}
        <div className="flex border-b border-slate-800/80 bg-[#0a0f1a]/50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "inventory"
                ? "border-emerald-500 text-emerald-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server size={14} />
            Dispositivos do Inventário ({availableDevices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "custom"
                ? "border-emerald-500 text-emerald-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers size={14} />
            Nó Externo / Lógico
          </button>
        </div>

        {/* Conteúdo Tab 1: Inventário */}
        {activeTab === "inventory" && (
          <div className="p-6 flex flex-col gap-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrar por nome, categoria ou IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {isLoadingDevices ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400 animate-pulse">
                  Carregando ativos do inventário...
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum dispositivo encontrado para os filtros selecionados.
                </div>
              ) : (
                filteredDevices.map((dev) => {
                  const isSelected = selectedDeviceId === dev.id;
                  const disabled = dev.is_in_topology;

                  return (
                    <div
                      key={dev.id}
                      onClick={() => {
                        if (!disabled) setSelectedDeviceId(dev.id);
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        disabled
                          ? "bg-obsidian-950/40 border-slate-800/40 opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "bg-emerald-500/10 border-emerald-500/50 cursor-pointer shadow-sm shadow-emerald-950/40"
                          : "bg-obsidian-950/70 border-slate-800 hover:border-slate-700 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            disabled
                              ? "bg-slate-800 text-slate-500"
                              : isSelected
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-slate-800/80 text-slate-300"
                          }`}
                        >
                          <Radio size={14} />
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate">{dev.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {dev.category}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            IP: <span className="text-slate-300">{dev.ip_address}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        {disabled ? (
                          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                            Já no Grafo
                          </span>
                        ) : isSelected ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">Selecionar</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddFromInventory}
                disabled={!selectedDeviceId || isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-obsidian-950 flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950/30"
              >
                {isSubmitting ? "Adicionando..." : "Adicionar Nó ao Grafo"}
              </button>
            </div>
          </div>
        )}

        {/* Conteúdo Tab 2: Custom Node */}
        {activeTab === "custom" && (
          <form onSubmit={handleAddCustomNode} className="p-6 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Rótulo do Nó *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: RT-EDGE-02 ou AWS-DIRECT-CONNECT"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Tipo de Elemento *
                </label>
                <select
                  value={customNodeType}
                  onChange={(e) => setCustomNodeType(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="router">Roteador / BGP Gateway (router)</option>
                  <option value="switch">Switch Core / Distribuição (switch)</option>
                  <option value="server">Servidor / Host Bare-Metal (server)</option>
                  <option value="database">Banco de Dados (database)</option>
                  <option value="workload">API Gateway / Workload (workload)</option>
                  <option value="container">Contêiner / Microsserviço (container)</option>
                  <option value="external">Nó Externo / Nuvem Pública (external)</option>
                  <option value="cluster">Zona / Cluster Agregado (cluster)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Endereço IP (opcional para ICMP)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 10.0.10.1 ou 192.168.1.1"
                  value={customIp}
                  onChange={(e) => setCustomIp(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Cluster / Zona Visual
                </label>
                <input
                  type="text"
                  placeholder="Ex: LUANDA-CORE, DC-SUL"
                  value={customCluster}
                  onChange={(e) => setCustomCluster(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !customLabel.trim()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-obsidian-950 flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950/30"
              >
                {isSubmitting ? "Criando..." : "Criar Nó"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
