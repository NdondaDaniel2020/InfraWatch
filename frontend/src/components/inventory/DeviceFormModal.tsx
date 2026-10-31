import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { deviceSchema, type DeviceFormData } from "../../schemas/deviceSchema";
import {
  Server,
  X,
  BadgeAlert,
  Radar,
  Sliders,
  Hourglass,
  Zap,
  ArrowRight,
  MapPin,
  CheckCircle2,
  Globe,
  Radio,
  Boxes,
  Network,
  Activity,
} from "lucide-react";
import { devicesApi } from "../../services/devicesApi";
import { toast } from "sonner";
import type { CreateDeviceRequest, ProberProtocol, DeviceCategory } from "../../types/inventory";

const protocolOptions: { value: ProberProtocol; label: string; icon: React.ReactNode }[] = [
  { value: "ICMP", label: "ICMP Ping", icon: <Radio className="w-3.5 h-3.5" /> },
  { value: "HTTP", label: "HTTP/S", icon: <Globe className="w-3.5 h-3.5" /> },
  { value: "TCP", label: "Porta TCP", icon: <Network className="w-3.5 h-3.5" /> },
  { value: "DOCKER", label: "Docker", icon: <Boxes className="w-3.5 h-3.5" /> },
  { value: "SNMP", label: "SNMP v1/v2c/v3", icon: <Activity className="w-3.5 h-3.5" /> },
];

const categoryOptions: { value: DeviceCategory; label: string }[] = [
  { value: "ROUTER", label: "Backbone Core (Roteador)" },
  { value: "SWITCH", label: "Switch de Acesso / Distribuição" },
  { value: "FIREWALL", label: "Firewall de Borda" },
  { value: "SERVER", label: "Servidores / Kubernetes" },
  { value: "DATABASE", label: "Bancos de Dados" },
  { value: "LOAD_BALANCER", label: "Load Balancer" },
  { value: "OTHER", label: "Outros Equipamentos" },
];

interface DeviceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateDeviceRequest) => Promise<void>;
  isLoading?: boolean;
  initialData?: Partial<DeviceFormData>;
  mode?: "create" | "edit";
}

export const DeviceFormModal: React.FC<DeviceFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  initialData,
  mode = "create",
}) => {
  const [testingConn, setTestingConn] = useState(false);
  const [testConnMessage, setTestConnMessage] = useState<string | null>(null);
  const [testConnStatus, setTestConnStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  const defaultValues: Partial<DeviceFormData> = {
    name: "",
    hostname: "",
    ipAddress: "",
    protocol: "ICMP",
    category: "ROUTER",
    intervalSeconds: 30,
    description: "Datacenter Luanda Sul • Rack R-04",
    slaExemption48h: true,
    thresholds: {
      latencyWarningMs: 250,
      latencyCriticalMs: 3, // 3 falhas de timeout
    },
    snmpConfig: {
      version: "v2c",
      port: 161,
      community: "public",
      securityLevel: "authPriv",
      timeoutSeconds: 5,
    },
    ...initialData,
  };

  const {
    register,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<DeviceFormData>({
    resolver: zodResolver(deviceSchema),
    defaultValues,
    mode: "onChange",
  });

  const protocol = watch("protocol", "ICMP");
  const intervalSeconds = watch("intervalSeconds", 30);
  const latencyWarningMs = watch("thresholds.latencyWarningMs", 250);
  const latencyCriticalMs = watch("thresholds.latencyCriticalMs", 3);
  const snmpVersion = watch("snmpConfig.version", "v2c");

  React.useEffect(() => {
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

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    const currentIp = getValues("ipAddress");
    if (!currentIp || currentIp.trim() === "") {
      setTestConnStatus("error");
      setTestConnMessage("Informe o IP do ativo antes de testar");
      toast.error("Informe o Endereço IP para executar o teste preliminar");
      return;
    }

    setTestingConn(true);
    setTestConnStatus("testing");
    setTestConnMessage("Disparando sonda de rede em tempo real...");

    try {
      const currentValues = getValues();
      const response = await devicesApi.testProbe({
        ipAddress: currentValues.ipAddress,
        port: currentValues.port || 0,
        protocol: currentValues.protocol,
        timeoutMs: 3000,
        snmpConfig: currentValues.snmpConfig,
        httpConfig: currentValues.httpConfig ? {
          ...currentValues.httpConfig,
          method: currentValues.httpConfig.method,
          expectedStatusCodes: currentValues.httpConfig.expectedStatusCodes.split(",").map(Number).filter(Boolean),
        } : undefined,
        tcpConfig: currentValues.tcpConfig,
        dockerConfig: currentValues.dockerConfig,
      });

      setTestConnMessage(response.message);
      if (response.success) {
        setTestConnStatus("success");
        toast.success(response.message);
      } else {
        setTestConnStatus("error");
        toast.error(response.message);
      }
    } catch (err: any) {
      const errMsg = err?.message || "Falha na comunicação com o serviço de sonda";
      setTestConnStatus("error");
      setTestConnMessage(`Erro: ${errMsg}`);
      toast.error(errMsg);
    } finally {
      setTestingConn(false);
    }
  };

  const handleFormSubmit = async (data: DeviceFormData) => {
    const payload: CreateDeviceRequest = {
      name: data.name,
      hostname: data.hostname,
      ipAddress: data.ipAddress,
      port: data.port,
      protocol: data.protocol,
      category: data.category,
      intervalSeconds: data.intervalSeconds,
      description: data.description,
      tags: data.tags,
      thresholds: data.thresholds,
      httpConfig: data.httpConfig
        ? {
            ...data.httpConfig,
            method: data.httpConfig.method as "GET" | "POST" | "HEAD",
            expectedStatusCodes: data.httpConfig.expectedStatusCodes.split(",").map(Number).filter(Boolean),
          }
        : undefined,
      tcpConfig: data.tcpConfig,
      dockerConfig: data.dockerConfig,
      snmpConfig: data.snmpConfig,
    };
    await onSubmit(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[720px] max-h-[92vh] bg-[#0e1524]/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden my-auto backdrop-blur-xl">
        {/* HEADER DO MODAL (IDÊNTICO AO MOCKUP) */}
        <header className="px-7 py-5 flex items-start justify-between border-b border-slate-800/80 bg-[#080c14]/60 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/20">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="modal-title" className="font-display text-lg font-bold text-white tracking-tight">
                  {mode === "create" ? "Cadastrar Novo Ativo" : "Editar Ativo de Monitoramento"}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                  Novo Nó
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Parâmetros de sondagem de rede, limiares de tolerância e telemetria
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar Modal de Cadastro"
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl p-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* CORPO DO FORMULÁRIO */}
        <form
          id="device-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = watch() as DeviceFormData;
            handleFormSubmit(data);
          }}
          className="flex-1 overflow-y-auto p-7 space-y-7"
        >
          {/* SEÇÃO 1: IDENTIFICAÇÃO DO ATIVO */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <h3 className="font-display font-semibold text-sm text-slate-200 flex items-center gap-2">
                <BadgeAlert className="w-4 h-4 text-emerald-400" />
                Identificação & Localização
              </h3>
              <span className="text-[11px] font-mono text-slate-500">* Campos Obrigatórios</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hostname */}
              <div className="space-y-1.5">
                <label htmlFor="device-hostname" className="text-xs text-slate-300 font-medium block">
                  Hostname / FQDN *
                </label>
                <div className="relative">
                  <input
                    id="device-hostname"
                    type="text"
                    {...register("hostname")}
                    placeholder="ex: SW-CORE-LUANDA-01"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-colors"
                  />
                  <CheckCircle2 className="w-4 h-4 absolute right-3 top-2.5 text-emerald-400" />
                </div>
                {errors.hostname && <p className="text-[11px] text-rose-400">{errors.hostname.message}</p>}
              </div>

              {/* Organização / Nome Descritivo */}
              <div className="space-y-1.5">
                <label htmlFor="device-name" className="text-xs text-slate-300 font-medium block">
                  Nome do Ativo *
                </label>
                <input
                  id="device-name"
                  type="text"
                  {...register("name")}
                  placeholder="ex: Switch Core Luanda 01"
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-colors"
                />
                {errors.name && <p className="text-[11px] text-rose-400">{errors.name.message}</p>}
              </div>

              {/* Categoria Operacional */}
              <div className="space-y-1.5">
                <label htmlFor="device-category" className="text-xs text-slate-300 font-medium block">
                  Categoria Operacional *
                </label>
                <select
                  id="device-category"
                  {...register("category")}
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer transition-colors"
                >
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Localização Física */}
              <div className="space-y-1.5">
                <label htmlFor="device-location" className="text-xs text-slate-300 font-medium block">
                  Localização / Datacenter *
                </label>
                <div className="relative">
                  <input
                    id="device-location"
                    type="text"
                    {...register("description")}
                    placeholder="Datacenter Luanda Sul • Rack R-04"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-slate-200 text-xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-colors"
                  />
                  <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: MÉTODO DE SONDAGEM DE REDE */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <h3 className="font-display font-semibold text-sm text-slate-200 flex items-center gap-2">
                <Radar className="w-4 h-4 text-emerald-400" />
                Método de Sondagem & Parâmetros
              </h3>
              <span className="text-xs font-mono text-emerald-400 font-medium">Worker: AO-LUANDA-CORE-01</span>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-1.5 bg-[#080c14] rounded-xl border border-slate-800/80">
              {protocolOptions.map((p) => {
                const isSelected = protocol === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setValue("protocol", p.value, { shouldValidate: true })}
                    className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent"
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Parâmetros Específicos do Protocolo */}
            {protocol === "ICMP" && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 rounded-xl bg-[#080c14]/60 border border-slate-800/80">
                <div className="sm:col-span-6 space-y-1.5">
                  <label htmlFor="icmp-ip" className="text-xs text-slate-300 font-medium block">
                    Endereço IP / Hostname Endpoint *
                  </label>
                  <input
                    id="icmp-ip"
                    type="text"
                    {...register("ipAddress")}
                    placeholder="10.200.0.1"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  {errors.ipAddress && <p className="text-[11px] text-rose-400">{errors.ipAddress.message}</p>}
                </div>
                <div className="sm:col-span-3 space-y-1.5">
                  <label htmlFor="icmp-count" className="text-xs text-slate-300 font-medium block">
                    Probes por Ciclo
                  </label>
                  <input
                    id="icmp-count"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    defaultValue="3"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white text-center focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="sm:col-span-3 space-y-1.5">
                  <label htmlFor="icmp-timeout" className="text-xs text-slate-300 font-medium block">
                    Timeout
                  </label>
                  <input
                    id="icmp-timeout"
                    type="text"
                    defaultValue="3000ms"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white text-center focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {protocol === "HTTP" && (
              <div className="space-y-4 p-4 rounded-xl bg-[#080c14]/60 border border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-8 space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">URL Endpoint HTTP/S *</label>
                    <input
                      type="url"
                      {...register("httpConfig.url")}
                      placeholder="https://10.200.0.1/healthz"
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div className="sm:col-span-4 space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">Método</label>
                    <select
                      {...register("httpConfig.method")}
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="HEAD">HEAD</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">Status Codes Esperados</label>
                    <input
                      type="text"
                      defaultValue="200,201,204"
                      {...register("httpConfig.expectedStatusCodes")}
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">IP de Conexão</label>
                    <input
                      type="text"
                      {...register("ipAddress")}
                      placeholder="10.200.0.1"
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {protocol === "TCP" && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 rounded-xl bg-[#080c14]/60 border border-slate-800/80">
                <div className="sm:col-span-8 space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium block">IP Endpoint de Destino *</label>
                  <input
                    type="text"
                    {...register("ipAddress")}
                    placeholder="10.200.0.1"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-4 space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium block">Porta TCP *</label>
                  <input
                    type="number"
                    aria-label="Porta TCP"
                    {...register("tcpConfig.port", { valueAsNumber: true })}
                    placeholder="443"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white text-center focus:outline-none focus:border-emerald-500"
                  />
                  {errors.tcpConfig?.port && <p className="text-[11px] text-rose-400">{errors.tcpConfig.port.message}</p>}
                </div>
              </div>
            )}

            {protocol === "DOCKER" && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 rounded-xl bg-[#080c14]/60 border border-slate-800/80">
                <div className="sm:col-span-7 space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium block">Nome do Container *</label>
                  <input
                    type="text"
                    {...register("dockerConfig.containerName")}
                    placeholder="traefik-proxy"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-5 space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium block">Host IP</label>
                  <input
                    type="text"
                    {...register("ipAddress")}
                    placeholder="10.200.0.1"
                    className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* SNMP PROTOCOL CONFIGURATION (v1, v2c e v3) */}
            {protocol === "SNMP" && (
              <div className="space-y-4 p-4 rounded-xl bg-[#080c14]/60 border border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-6 space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">IP Endpoint do Ativo SNMP *</label>
                    <input
                      type="text"
                      {...register("ipAddress")}
                      placeholder="10.200.0.1"
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    {errors.ipAddress && <p className="text-[11px] text-rose-400">{errors.ipAddress.message}</p>}
                  </div>
                  <div className="sm:col-span-3 space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">Versão SNMP *</label>
                    <select
                      data-testid="snmp-version-select"
                      {...register("snmpConfig.version")}
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="v1">SNMP v1</option>
                      <option value="v2c">SNMP v2c</option>
                      <option value="v3">SNMP v3 (USM)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 space-y-1.5">
                    <label className="text-xs text-slate-300 font-medium block">Porta UDP</label>
                    <input
                      type="number"
                      defaultValue={161}
                      {...register("snmpConfig.port", { valueAsNumber: true })}
                      className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white text-center focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Monitoramento nativo via Simple Network Management Protocol. Suporta métricas de interfaces de rede, CPU, memória e status via OID.
                </p>

                {/* Parâmetros SNMP v1 / v2c */}
                {(snmpVersion === "v1" || snmpVersion === "v2c") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/80 pt-3">
                    <div className="space-y-1.5">
                      <label htmlFor="snmp-community" className="text-xs text-slate-300 font-medium block">
                        SNMP Community String *
                      </label>
                      <input
                        id="snmp-community"
                        type="password"
                        placeholder="public"
                        {...register("snmpConfig.community")}
                        className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-300 font-medium block">OID Base de Consulta</label>
                      <input
                        type="text"
                        placeholder="1.3.6.1.2.1.1.3.0 (sysUpTime)"
                        {...register("snmpConfig.oid")}
                        className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* Parâmetros SNMP v3 */}
                {snmpVersion === "v3" && (
                  <div className="space-y-3 border-t border-slate-800/80 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="snmp-v3-username" className="text-xs text-slate-300 font-medium block">
                          Usuário SNMP v3 (Security Name) *
                        </label>
                        <input
                          id="snmp-v3-username"
                          type="text"
                          placeholder="snmp_noc_admin"
                          {...register("snmpConfig.username")}
                          className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="snmp-v3-security-level" className="text-xs text-slate-300 font-medium block">
                          Nível de Segurança
                        </label>
                        <select
                          id="snmp-v3-security-level"
                          {...register("snmpConfig.securityLevel")}
                          className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="authPriv">authPriv (Autenticação + Criptografia AES)</option>
                          <option value="authNoPriv">authNoPriv (Autenticação apenas)</option>
                          <option value="noAuthNoPriv">noAuthNoPriv (Sem autenticação)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="snmp-v3-auth-protocol" className="text-xs text-slate-300 font-medium block">
                          Protocolo de Autenticação
                        </label>
                        <select
                          id="snmp-v3-auth-protocol"
                          {...register("snmpConfig.authProtocol")}
                          className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="SHA256">SHA-256 (Recomendado)</option>
                          <option value="SHA">SHA-1</option>
                          <option value="MD5">MD5</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="snmp-v3-priv-protocol" className="text-xs text-slate-300 font-medium block">
                          Protocolo de Privacidade
                        </label>
                        <select
                          id="snmp-v3-priv-protocol"
                          {...register("snmpConfig.privProtocol")}
                          className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="AES128">AES-128</option>
                          <option value="AES256">AES-256</option>
                          <option value="DES">DES</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEÇÃO 3: LIMIARES OPERACIONAIS & SLA (IDÊNTICO AO MOCKUP) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <h3 className="font-display font-semibold text-sm text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Limiares de Alerta & Tolerância
              </h3>
              <span className="text-[11px] font-mono text-slate-500">Matriz SLA</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Intervalo de Sondagem */}
              <div className="bg-[#080c14]/70 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <label htmlFor="device-interval" className="text-slate-400 font-medium cursor-pointer">
                    Intervalo de Sondagem (segundos)
                  </label>
                  <div className="flex items-center gap-0.5 font-mono text-emerald-400 font-bold">
                    <input
                      id="device-interval"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Intervalo de Sondagem (segundos)"
                      value={intervalSeconds === undefined || Number.isNaN(intervalSeconds) ? "" : intervalSeconds}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setValue("intervalSeconds", val === "" ? (0 as any) : Number(val), { shouldValidate: true });
                      }}
                      className="w-8 bg-transparent text-right focus:outline-none focus:ring-0 p-0 font-mono text-emerald-400 font-bold cursor-text selection:bg-emerald-500/30"
                    />
                    <span>s</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  aria-label="Controle deslizante de intervalo"
                  value={Math.min(Math.max(intervalSeconds || 5, 5), 120)}
                  onChange={(e) => setValue("intervalSeconds", Number(e.target.value), { shouldValidate: true })}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-slate-500">Sondagem contínua</p>
                  {errors.intervalSeconds && (
                    <p className="text-[11px] text-rose-400 font-medium">{errors.intervalSeconds.message}</p>
                  )}
                </div>
              </div>

              {/* Limiar de Degradação (Amber Alert) */}
              <div className="bg-[#080c14]/70 p-4 rounded-xl border border-amber-500/20 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-300 font-medium">Limiar Degradação</span>
                  <span className="font-mono text-amber-400 font-bold">{latencyWarningMs}ms</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  aria-label="Limiar degradação"
                  {...register("thresholds.latencyWarningMs", { valueAsNumber: true })}
                  className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">Alerta se RTT &gt; {latencyWarningMs}ms</p>
              </div>

              {/* Limiar Crítico DOWN */}
              <div className="bg-[#080c14]/70 p-4 rounded-xl border border-rose-500/20 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-rose-300 font-medium">Limiar Crítico</span>
                  <span className="font-mono text-rose-400 font-bold">{latencyCriticalMs} falhas</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  aria-label="Limiar crítico"
                  {...register("thresholds.latencyCriticalMs", { valueAsNumber: true })}
                  className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">Dispara chamado GLPI</p>
              </div>
            </div>

            {/* Switch: Isenção de SLA Inicial */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[#080c14]/70 border border-slate-800">
              <div className="flex items-center gap-3">
                <Hourglass className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    Isenção de SLA Inicial (Aquecimento / Homologação)
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Período de teste de 48h sem penalização de SLA</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" {...register("slaExemption48h")} className="sr-only peer" />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          {/* FOOTER COM BOTÕES DE AÇÃO */}
          <div className="border-t border-slate-800/80 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              {testConnStatus === "idle" && (
                <span className="text-slate-500 text-[11px]">Nenhum teste prévio executado</span>
              )}
              {testConnStatus === "testing" && (
                <div className="flex items-center gap-2 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true"></span>
                  <span data-testid="test-conn-message">{testConnMessage}</span>
                </div>
              )}
              {testConnStatus === "success" && (
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
                  <span data-testid="test-conn-message">{testConnMessage}</span>
                </div>
              )}
              {testConnStatus === "error" && (
                <div className="flex items-center gap-2 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-400" aria-hidden="true"></span>
                  <span data-testid="test-conn-message">{testConnMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConn}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-400 ${testingConn ? "animate-spin" : ""}`} />
                <span>{testingConn ? "Testando..." : "Testar Conexão"}</span>
              </button>

              <button
                type="submit"
                disabled={isLoading || isSubmitting || !isValid}
                aria-label={mode === "create" ? "Cadastrar Ativo" : "Salvar Alterações"}
                data-testid="device-form-submit"
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950/30 cursor-pointer"
              >
                <span>{mode === "create" ? "Cadastrar Ativo" : "Salvar Alterações"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
