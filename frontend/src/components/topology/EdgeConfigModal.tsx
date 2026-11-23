import React, { useState, useEffect } from "react";
import { X, Network, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { topologyApi } from "../../services/topologyApi";
import { CreateTopologyEdgePayload, UpdateTopologyEdgePayload } from "../../types/topology";

export interface EdgeConfigModalData {
  id?: string;
  source_node_id: string;
  target_node_id: string;
  source_label?: string;
  target_label?: string;
  link_type?: string;
  bandwidth_gbps?: number;
  port_src?: string;
  port_dst?: string;
}

interface EdgeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialData: EdgeConfigModalData | null;
  effectiveOrgId?: string | null;
  onSaved: () => void;
  onDeleted?: () => void;
}

export const EdgeConfigModal: React.FC<EdgeConfigModalProps> = ({
  isOpen,
  onClose,
  mode,
  initialData,
  effectiveOrgId,
  onSaved,
  onDeleted,
}) => {
  const [linkType, setLinkType] = useState("fiber");
  const [bandwidthGbps, setBandwidthGbps] = useState<number | string>(10);
  const [portSrc, setPortSrc] = useState("");
  const [portDst, setPortDst] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialData) {
      setLinkType(initialData.link_type || "fiber");
      setBandwidthGbps(
        initialData.bandwidth_gbps !== undefined && initialData.bandwidth_gbps !== null
          ? initialData.bandwidth_gbps
          : 10
      );
      setPortSrc(initialData.port_src || "");
      setPortDst(initialData.port_dst || "");
      setConfirmDelete(false);
    }
  }, [initialData, isOpen]);

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

  if (!isOpen || !initialData) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bw = Number(bandwidthGbps);
    if (isNaN(bw) || bw <= 0) {
      toast.error("A largura de banda deve ser um número positivo (ex: 10).");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const payload: CreateTopologyEdgePayload = {
          source_node_id: initialData.source_node_id,
          target_node_id: initialData.target_node_id,
          link_type: linkType,
          bandwidth_gbps: bw,
          port_src: portSrc.trim() || null,
          port_dst: portDst.trim() || null,
        };
        await topologyApi.createEdge(payload, effectiveOrgId);
        toast.success("Enlace de rede criado com sucesso.");
      } else if (mode === "edit" && initialData.id) {
        const payload: UpdateTopologyEdgePayload = {
          link_type: linkType,
          bandwidth_gbps: bw,
          port_src: portSrc.trim() || null,
          port_dst: portDst.trim() || null,
        };
        await topologyApi.updateEdge(initialData.id, payload, effectiveOrgId);
        toast.success("Enlace de rede atualizado com sucesso.");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar enlace de rede.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setIsDeleting(true);
    try {
      await topologyApi.deleteEdge(initialData.id, effectiveOrgId);
      toast.success("Enlace de rede removido.");
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover enlace.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edge-modal-title"
      data-testid="edge-config-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[560px] bg-[#0e1524]/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto backdrop-blur-xl">
        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-[#080c14]/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="edge-modal-title" className="font-display text-base font-bold text-white tracking-tight">
                  {mode === "create" ? "Criar Enlace de Rede" : "Configurar Enlace de Rede"}
                </h2>
                <span className="px-2 py-0.5 text-[9px] font-mono font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                  {linkType}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina os parâmetros de enlace, capacidade e portas de interface
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

        {/* Nós Envolvidos */}
        <div className="px-6 py-3 bg-[#0a0f1a]/70 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-400">Origem:</span>
            <span className="text-white font-bold truncate">
              {initialData.source_label || initialData.source_node_id.slice(0, 8)}
            </span>
          </div>
          <ArrowRight size={14} className="text-emerald-400 shrink-0 mx-2" />
          <div className="flex items-center gap-2 truncate text-right">
            <span className="text-slate-400">Destino:</span>
            <span className="text-white font-bold truncate">
              {initialData.target_label || initialData.target_node_id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Meio de Transmissão / Tipo *
              </label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value)}
                className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
              >
                <option value="fiber">Fibra Óptica (fiber)</option>
                <option value="ethernet">Ethernet / 10G / UTP (ethernet)</option>
                <option value="vpn">Túnel VPN / IPsec (vpn)</option>
                <option value="wireless">Rádio / Sem Fio (wireless)</option>
                <option value="logical">Enlace Lógico / BGP (logical)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Largura de Banda (Gbps) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={bandwidthGbps}
                onChange={(e) => setBandwidthGbps(e.target.value)}
                placeholder="Ex: 10 ou 100"
                className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Porta de Origem
              </label>
              <input
                type="text"
                placeholder="Ex: Te1/0/1, GE0/0/1, eth0"
                value={portSrc}
                onChange={(e) => setPortSrc(e.target.value)}
                className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">
                Porta de Destino
              </label>
              <input
                type="text"
                placeholder="Ex: Te1/0/2, GE0/0/2, eth1"
                value={portDst}
                onChange={(e) => setPortDst(e.target.value)}
                className="w-full px-3 py-2 bg-obsidian-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Footer de Ações */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 mt-2">
            <div>
              {mode === "edit" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    confirmDelete
                      ? "bg-rose-600 text-white font-bold"
                      : "text-rose-400 hover:bg-rose-500/10 border border-rose-500/30"
                  }`}
                >
                  <Trash2 size={14} />
                  {confirmDelete ? "Confirmar Exclusão?" : "Remover Enlace"}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-obsidian-950 flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950/30"
              >
                {isSubmitting
                  ? "Salvando..."
                  : mode === "create"
                  ? "Criar Enlace"
                  : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
