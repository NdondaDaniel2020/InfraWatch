import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@radix-ui/react-tabs";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { CreateDeviceRequest, ProberProtocol, DeviceCategory } from "../../types/inventory";

const protocolOptions: { value: ProberProtocol; label: string; icon: React.ReactNode }[] = [
  { value: "ICMP", label: "ICMP Ping", icon: "📡" },
  { value: "HTTP", label: "HTTP/S", icon: "🌐" },
  { value: "TCP", label: "Porta TCP", icon: "🔌" },
  { value: "DOCKER", label: "Docker", icon: "🐳" },
  { value: "HEARTBEAT", label: "Heartbeat", icon: "💓" },
  { value: "SNMP", label: "SNMP v1/v2c/v3", icon: "📊" },
];

const categoryOptions: DeviceCategory[] = [
  "ROUTER",
  "SWITCH",
  "FIREWALL",
  "SERVER",
  "DATABASE",
  "LOAD_BALANCER",
  "OTHER",
];

const baseSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  hostname: z.string().min(1, "Hostname é obrigatório").max(255),
  ipAddress: z.string().min(1, "IP/Endereço é obrigatório").max(255),
  port: z.number().int().min(1, "Porta deve ser entre 1 e 65535").max(65535).optional(),
  protocol: z.enum(["ICMP", "HTTP", "TCP", "DOCKER", "HEARTBEAT", "SNMP"]),
  category: z.enum(["ROUTER", "SWITCH", "FIREWALL", "SERVER", "DATABASE", "LOAD_BALANCER", "OTHER"]),
  intervalSeconds: z.number().int().min(10, "Intervalo mínimo 10s").max(3600, "Intervalo máximo 3600s"),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  thresholds: z
    .object({
      latencyWarningMs: z.number().int().min(1).optional(),
      latencyCriticalMs: z.number().int().min(1).optional(),
      packetLossWarningPct: z.number().min(0).max(100).optional(),
      packetLossCriticalPct: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

const httpConfigSchema = z.object({
  url: z.string().url("URL inválida").min(1, "URL é obrigatória"),
  method: z.enum(["GET", "POST", "HEAD"]).default("GET"),
  expectedStatusCodes: z
    .string()
    .refine((val) => val.split(",").map(Number).filter(Boolean).length > 0, "Pelo menos um código esperado"),
  followRedirects: z.boolean().default(true),
  verifySsl: z.boolean().default(true),
  timeoutSeconds: z.number().int().min(1).max(60).default(10),
});

const tcpConfigSchema = z.object({
  port: z.number().int().min(1, "Porta deve ser entre 1 e 65535").max(65535),
  timeoutSeconds: z.number().int().min(1).max(60).default(5),
});

const dockerConfigSchema = z.object({
  containerName: z.string().min(1, "Nome do container é obrigatório").max(255),
  socketPath: z.string().max(255).optional(),
});

const heartbeatConfigSchema = z.object({
  expectedIntervalSeconds: z.number().int().min(10).max(86400),
  gracePeriodSeconds: z.number().int().min(0).max(3600).default(60),
});

const snmpConfigSchema = z.object({
  version: z.enum(["v1", "v2c", "v3"]).default("v2c"),
  port: z.number().int().min(1).max(65535).default(161),
  community: z.string().max(100).optional(),
  oid: z.string().max(255).optional(),
  securityLevel: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).default("authPriv"),
  username: z.string().max(100).optional(),
  authProtocol: z.enum(["MD5", "SHA", "SHA256"]).optional(),
  authPassword: z.string().max(100).optional(),
  privProtocol: z.enum(["DES", "AES", "AES128", "AES256"]).optional(),
  privPassword: z.string().max(100).optional(),
  timeoutSeconds: z.number().int().min(1).max(60).default(5),
});

const fullSchema = baseSchema
  .extend({
    httpConfig: httpConfigSchema.optional(),
    tcpConfig: tcpConfigSchema.optional(),
    dockerConfig: dockerConfigSchema.optional(),
    heartbeatConfig: heartbeatConfigSchema.optional(),
    snmpConfig: snmpConfigSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.protocol === "HTTP" && !data.httpConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuração HTTP é obrigatória para protocolo HTTP",
        path: ["httpConfig"],
      });
    }
    if (data.protocol === "TCP" && !data.tcpConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuração TCP é obrigatória para protocolo TCP",
        path: ["tcpConfig"],
      });
    }
    if (data.protocol === "DOCKER" && !data.dockerConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuração Docker é obrigatória para protocolo Docker",
        path: ["dockerConfig"],
      });
    }
    if (data.protocol === "HEARTBEAT" && !data.heartbeatConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuração Heartbeat é obrigatória para protocolo Heartbeat",
        path: ["heartbeatConfig"],
      });
    }
    if (data.protocol === "TCP" && data.tcpConfig && (!data.port || data.port < 1 || data.port > 65535)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Porta TCP deve estar entre 1 e 65535",
        path: ["port"],
      });
    }
    if (data.protocol === "SNMP" && data.snmpConfig) {
      if ((data.snmpConfig.version === "v1" || data.snmpConfig.version === "v2c") && !data.snmpConfig.community) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Community SNMP é obrigatória para v1 e v2c",
          path: ["snmpConfig", "community"],
        });
      }
      if (data.snmpConfig.version === "v3" && !data.snmpConfig.username) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Usuário (Security Name) é obrigatório para SNMP v3",
          path: ["snmpConfig", "username"],
        });
      }
    }
  });

type DeviceFormData = z.infer<typeof fullSchema>;

interface DeviceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateDeviceRequest) => Promise<void>;
  isLoading?: boolean;
  initialData?: Partial<DeviceFormData>;
  mode?: "create" | "edit";
}

const Input: React.FC<{
  label: string;
  error?: string;
  children: React.ReactElement;
  helperText?: string;
  required?: boolean;
  id?: string;
}> = ({ label, error, children, helperText, required, id }) => {
  const generatedId = id || label.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  return (
    <div className="space-y-1.5">
      <label htmlFor={generatedId} className="block text-xs font-medium text-slate-200">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div>{React.cloneElement(children, { id: generatedId })}</div>
      {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
};

const StyledInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      className={`w-full px-3.5 py-2.5 bg-[#0b101b] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-sans ${className}`}
    />
  )
);
StyledInput.displayName = "StyledInput";

const StyledSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", ...props }, ref) => (
    <select
      ref={ref}
      {...props}
      className={`w-full px-3.5 py-2.5 bg-[#0b101b] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-sans cursor-pointer ${className}`}
    />
  )
);
StyledSelect.displayName = "StyledSelect";

const StyledTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      {...props}
      className={`w-full px-3.5 py-2.5 bg-[#0b101b] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-sans min-h-[88px] resize-y ${className}`}
    />
  )
);
StyledTextarea.displayName = "StyledTextarea";

const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      {...props}
      className={`w-4 h-4 rounded bg-[#0b101b] border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer ${className}`}
    />
  )
);
Checkbox.displayName = "Checkbox";

export const DeviceFormModal: React.FC<DeviceFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  initialData,
  mode = "create",
}) => {
  const defaultValues: Partial<DeviceFormData> = {
    name: "",
    hostname: "",
    ipAddress: "",
    protocol: "ICMP",
    category: "SERVER",
    intervalSeconds: 60,
    description: "",
    tags: [],
    thresholds: {},
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
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<DeviceFormData>({
    resolver: zodResolver(fullSchema),
    defaultValues,
    mode: "onChange",
  });

  const protocol = watch("protocol", "ICMP");
  const snmpVersion = watch("snmpConfig.version", "v2c");

  const initialDataApplied = React.useRef(false);

  React.useEffect(() => {
    if (initialDataApplied.current) return;
    if (initialData?.protocol) {
      setValue("protocol", initialData.protocol, { shouldValidate: true });
    }
    if (initialData?.httpConfig) {
      setValue("httpConfig", initialData.httpConfig, { shouldValidate: true });
    }
    if (initialData?.tcpConfig) {
      setValue("tcpConfig", initialData.tcpConfig, { shouldValidate: true });
    }
    if (initialData?.dockerConfig) {
      setValue("dockerConfig", initialData.dockerConfig, { shouldValidate: true });
    }
    if (initialData?.heartbeatConfig) {
      setValue("heartbeatConfig", initialData.heartbeatConfig, { shouldValidate: true });
    }
    if (initialData?.snmpConfig) {
      setValue("snmpConfig", initialData.snmpConfig, { shouldValidate: true });
    }
    initialDataApplied.current = true;
  }, [initialData, setValue]);

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
      heartbeatConfig: data.heartbeatConfig,
      snmpConfig: data.snmpConfig,
    };
    await onSubmit(payload);
  };

  const handleFormSubmitWrapper = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = watch() as DeviceFormData;
    handleFormSubmit(formData);
  };

  const renderHttpFields = () => (
    <div className="space-y-4 mb-4">
      <Controller
        name="httpConfig.url"
        control={control}
        rules={{ required: "URL é obrigatória" }}
        render={({ field }) => (
          <Input label="URL do Endpoint" error={errors.httpConfig?.url?.message} required>
            <StyledInput {...field} type="url" placeholder="https://api.exemplo.com/health" data-testid="http-url-input" />
          </Input>
        )}
      />
      <Controller
        name="httpConfig.method"
        control={control}
        render={({ field }) => (
          <Input label="Método HTTP" helperText="Método da requisição">
            <StyledSelect {...field} data-testid="http-method-select">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="HEAD">HEAD</option>
            </StyledSelect>
          </Input>
        )}
      />
      <Controller
        name="httpConfig.expectedStatusCodes"
        control={control}
        render={({ field }) => (
          <Input
            label="Códigos de Status Esperados"
            error={errors.httpConfig?.expectedStatusCodes?.message}
            required
            helperText="Separados por vírgula (ex: 200,201,204)"
          >
            <StyledInput
              {...field}
              type="text"
              placeholder="200,201,204"
              value={Array.isArray(field.value) ? field.value.join(",") : field.value}
              onChange={(e) => field.onChange(e.target.value)}
              data-testid="http-status-codes-input"
            />
          </Input>
        )}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Controller
          name="httpConfig.timeoutSeconds"
          control={control}
          render={({ field }) => (
            <Input label="Timeout (segundos)" helperText="1-60s">
              <StyledInput {...field} type="number" min="1" max="60" data-testid="http-timeout-input" />
            </Input>
          )}
        />
        <Controller
          name="httpConfig.followRedirects"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2.5 pt-6 cursor-pointer">
              <Checkbox
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                data-testid="http-follow-redirects-checkbox"
              />
              <span className="text-xs text-slate-200">Seguir redirects</span>
            </label>
          )}
        />
        <Controller
          name="httpConfig.verifySsl"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2.5 pt-6 cursor-pointer">
              <Checkbox
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                data-testid="http-verify-ssl-checkbox"
              />
              <span className="text-xs text-slate-200">Verificar SSL</span>
            </label>
          )}
        />
      </div>
    </div>
  );

  const renderTcpFields = () => (
    <div className="space-y-4 mb-4">
      <Controller
        name="tcpConfig.port"
        control={control}
        rules={{
          required: "Porta é obrigatória",
          min: { value: 1, message: "Porta mínima 1" },
          max: { value: 65535, message: "Porta máxima 65535" },
        }}
        render={({ field }) => (
          <Input label="Porta TCP" error={errors.tcpConfig?.port?.message} required helperText="Porta do serviço (1-65535)">
            <StyledInput {...field} type="number" min="1" max="65535" data-testid="tcp-port-input" />
          </Input>
        )}
      />
      <Controller
        name="tcpConfig.timeoutSeconds"
        control={control}
        render={({ field }) => (
          <Input label="Timeout (segundos)" helperText="1-60s">
            <StyledInput {...field} type="number" min="1" max="60" data-testid="tcp-timeout-input" />
          </Input>
        )}
      />
    </div>
  );

  const renderDockerFields = () => (
    <div className="space-y-4 mb-4">
      <Controller
        name="dockerConfig.containerName"
        control={control}
        rules={{ required: "Nome do container é obrigatório" }}
        render={({ field }) => (
          <Input label="Nome do Container" error={errors.dockerConfig?.containerName?.message} required>
            <StyledInput {...field} placeholder="meu-container-app" data-testid="docker-container-name-input" />
          </Input>
        )}
      />
      <Controller
        name="dockerConfig.socketPath"
        control={control}
        render={({ field }) => (
          <Input label="Socket Path (opcional)" helperText="Ex: /var/run/docker.sock ou tcp://host:2375">
            <StyledInput {...field} placeholder="/var/run/docker.sock" data-testid="docker-socket-path-input" />
          </Input>
        )}
      />
    </div>
  );

  const renderHeartbeatFields = () => (
    <div className="space-y-4 mb-4">
      <Controller
        name="heartbeatConfig.expectedIntervalSeconds"
        control={control}
        rules={{
          required: "Intervalo esperado é obrigatório",
          min: { value: 10, message: "Mínimo 10s" },
          max: { value: 86400, message: "Máximo 86400s (24h)" },
        }}
        render={({ field }) => (
          <Input
            label="Intervalo Esperado (segundos)"
            error={errors.heartbeatConfig?.expectedIntervalSeconds?.message}
            required
            helperText="Intervalo entre heartbeats esperados (10s - 24h)"
          >
            <StyledInput {...field} type="number" min="10" max="86400" data-testid="heartbeat-interval-input" />
          </Input>
        )}
      />
      <Controller
        name="heartbeatConfig.gracePeriodSeconds"
        control={control}
        render={({ field }) => (
          <Input label="Período de Graça (segundos)" helperText="Tolerância extra antes de alertar (0-3600s)">
            <StyledInput {...field} type="number" min="0" max="3600" data-testid="heartbeat-grace-input" />
          </Input>
        )}
      />
    </div>
  );

  const renderSnmpFields = () => (
    <div className="space-y-4 mb-4 p-4 rounded-lg bg-[#070b14] border border-slate-800/80">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Controller
          name="snmpConfig.version"
          control={control}
          render={({ field }) => (
            <Input label="Versão SNMP" required helperText="v1, v2c (Community) ou v3 (USM com Criptografia)">
              <StyledSelect {...field} data-testid="snmp-version-select">
                <option value="v1">SNMP v1 (Legado)</option>
                <option value="v2c">SNMP v2c (Padrão de Mercado)</option>
                <option value="v3">SNMP v3 (Autenticação & Criptografia Segura)</option>
              </StyledSelect>
            </Input>
          )}
        />
        <Controller
          name="snmpConfig.port"
          control={control}
          render={({ field }) => (
            <Input label="Porta SNMP" required helperText="Padrão UDP 161">
              <StyledInput {...field} type="number" min="1" max="65535" placeholder="161" data-testid="snmp-port-input" />
            </Input>
          )}
        />
      </div>

      {(snmpVersion === "v1" || snmpVersion === "v2c") && (
        <Controller
          name="snmpConfig.community"
          control={control}
          render={({ field }) => (
            <Input
              label="SNMP Community String"
              error={errors.snmpConfig?.community?.message}
              required
              helperText="Ex: public, monitor_ro, etc."
            >
              <StyledInput {...field} type="password" placeholder="public" data-testid="snmp-community-input" />
            </Input>
          )}
        />
      )}

      {snmpVersion === "v3" && (
        <div className="space-y-4 border-t border-slate-800/80 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Controller
              name="snmpConfig.username"
              control={control}
              render={({ field }) => (
                <Input
                  label="Usuário SNMP v3 (Security Name)"
                  error={errors.snmpConfig?.username?.message}
                  required
                  helperText="Nome de usuário configurado no agente SNMP"
                >
                  <StyledInput {...field} placeholder="snmp_user" data-testid="snmp-v3-username-input" />
                </Input>
              )}
            />
            <Controller
              name="snmpConfig.securityLevel"
              control={control}
              render={({ field }) => (
                <Input label="Nível de Segurança" required>
                  <StyledSelect {...field} data-testid="snmp-v3-security-level-select">
                    <option value="noAuthNoPriv">noAuthNoPriv (Sem autenticação / Sem privacidade)</option>
                    <option value="authNoPriv">authNoPriv (Com autenticação / Sem privacidade)</option>
                    <option value="authPriv">authPriv (Autenticação + Criptografia AES/DES)</option>
                  </StyledSelect>
                </Input>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Controller
              name="snmpConfig.authProtocol"
              control={control}
              render={({ field }) => (
                <Input label="Protocolo de Autenticação">
                  <StyledSelect {...field} data-testid="snmp-v3-auth-protocol-select">
                    <option value="SHA256">SHA-256 (Recomendado)</option>
                    <option value="SHA">SHA-1</option>
                    <option value="MD5">MD5</option>
                  </StyledSelect>
                </Input>
              )}
            />
            <Controller
              name="snmpConfig.authPassword"
              control={control}
              render={({ field }) => (
                <Input label="Senha de Autenticação (Auth Passphrase)">
                  <StyledInput {...field} type="password" placeholder="••••••••••••" data-testid="snmp-v3-auth-pass-input" />
                </Input>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Controller
              name="snmpConfig.privProtocol"
              control={control}
              render={({ field }) => (
                <Input label="Protocolo de Privacidade">
                  <StyledSelect {...field} data-testid="snmp-v3-priv-protocol-select">
                    <option value="AES128">AES-128 (Recomendado)</option>
                    <option value="AES256">AES-256</option>
                    <option value="DES">DES</option>
                  </StyledSelect>
                </Input>
              )}
            />
            <Controller
              name="snmpConfig.privPassword"
              control={control}
              render={({ field }) => (
                <Input label="Senha de Criptografia (Priv Passphrase)">
                  <StyledInput {...field} type="password" placeholder="••••••••••••" data-testid="snmp-v3-priv-pass-input" />
                </Input>
              )}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/80 pt-3">
        <Controller
          name="snmpConfig.oid"
          control={control}
          render={({ field }) => (
            <Input label="OID de Consulta Raiz (Opcional)" helperText="Padrão sysUpTime: 1.3.6.1.2.1.1.3.0">
              <StyledInput {...field} placeholder="1.3.6.1.2.1.1.3.0" data-testid="snmp-oid-input" />
            </Input>
          )}
        />
        <Controller
          name="snmpConfig.timeoutSeconds"
          control={control}
          render={({ field }) => (
            <Input label="Timeout SNMP (segundos)" helperText="Tempo de espera por pacote UDP">
              <StyledInput {...field} type="number" min="1" max="60" data-testid="snmp-timeout-input" />
            </Input>
          )}
        />
      </div>
    </div>
  );

  const renderThresholds = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Controller
        name="thresholds.latencyWarningMs"
        control={control}
        render={({ field }) => (
          <Input label="Latência Warning (ms)" helperText="Aviso de latência elevada">
            <StyledInput {...field} type="number" min="1" data-testid="threshold-latency-warning" />
          </Input>
        )}
      />
      <Controller
        name="thresholds.latencyCriticalMs"
        control={control}
        render={({ field }) => (
          <Input label="Latência Critical (ms)" helperText="Crítico - dispara alarme">
            <StyledInput {...field} type="number" min="1" data-testid="threshold-latency-critical" />
          </Input>
        )}
      />
      <Controller
        name="thresholds.packetLossWarningPct"
        control={control}
        render={({ field }) => (
          <Input label="Perda Pacotes Warning (%)" helperText="0-100%">
            <StyledInput
              {...field}
              type="number"
              min="0"
              max="100"
              step="0.1"
              data-testid="threshold-packetloss-warning"
            />
          </Input>
        )}
      />
      <Controller
        name="thresholds.packetLossCriticalPct"
        control={control}
        render={({ field }) => (
          <Input label="Perda Pacotes Critical (%)" helperText="0-100%">
            <StyledInput
              {...field}
              type="number"
              min="0"
              max="100"
              step="0.1"
              data-testid="threshold-packetloss-critical"
            />
          </Input>
        )}
      />
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "create" ? "Novo Ativo de Monitoramento" : "Editar Ativo"}
      description={
        mode === "create" ? "Configure uma nova sonda de monitoramento" : "Atualize as configurações do ativo"
      }
      maxWidth="760px"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading || isSubmitting}
            className="text-slate-300 hover:text-white hover:bg-slate-800/60"
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="device-form"
            isLoading={isLoading || isSubmitting}
            disabled={!isValid || isLoading || isSubmitting}
            data-testid="device-form-submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2 rounded-lg"
          >
            {mode === "create" ? "Cadastrar Ativo" : "Salvar Alterações"}
          </Button>
        </div>
      }
    >
      <form id="device-form" onSubmit={handleFormSubmitWrapper} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Nome do Ativo" error={errors.name?.message} required>
            <StyledInput {...register("name")} placeholder="Ex: Roteador Core SP" data-testid="device-name-input" />
          </Input>
          <Input label="Hostname / FQDN" error={errors.hostname?.message} required>
            <StyledInput
              {...register("hostname")}
              placeholder="router-core-sp.infrawatch.local"
              data-testid="device-hostname-input"
            />
          </Input>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Endereço IP" error={errors.ipAddress?.message} required>
            <StyledInput
              {...register("ipAddress")}
              placeholder="192.168.1.1 ou 2001:db8::1"
              data-testid="device-ip-input"
            />
          </Input>
          <Controller
            name="port"
            control={control}
            render={({ field }) => (
              <Input
                label="Porta (opcional)"
                error={errors.port?.message}
                helperText="Obrigatório para TCP, opcional para outros"
              >
                <StyledInput
                  {...field}
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="80, 443, 5432..."
                  data-testid="device-port-input"
                />
              </Input>
            )}
          />
        </div>

        <Input label="Categoria" error={errors.category?.message} required>
          <StyledSelect {...register("category")} data-testid="device-category-select">
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </StyledSelect>
        </Input>

        <Input
          label="Intervalo de Sondagem (segundos)"
          error={errors.intervalSeconds?.message}
          required
          helperText="10s a 3600s (1 hora)"
        >
          <StyledInput
            {...register("intervalSeconds", { valueAsNumber: true })}
            type="number"
            min="10"
            max="3600"
            data-testid="device-interval-input"
          />
        </Input>

        <Input label="Descrição (opcional)">
          <StyledTextarea
            {...register("description")}
            placeholder="Descrição do ativo, localização, responsável..."
            data-testid="device-description-input"
          />
        </Input>

        <div className="border-t border-slate-800/80 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Protocolo de Sondagem</h3>
          </div>
          <Tabs
            defaultValue={protocol}
            onValueChange={(v) => setValue("protocol", v as ProberProtocol, { shouldValidate: true })}
            data-testid="protocol-tabs"
          >
            <TabsList className="flex flex-wrap gap-2 border-b border-slate-800/80 pb-3 mb-4">
              {protocolOptions.map((p) => (
                <TabsTrigger
                  key={p.value}
                  value={p.value}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 border transition-all data-[state=active]:bg-blue-600/20 data-[state=active]:border-blue-500/60 data-[state=active]:text-blue-400 bg-[#0b101b] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="ICMP" className="focus:outline-none">
              <p className="text-xs text-slate-400 mb-4">
                Sonda ICMP Ping padrão. Mede latência RTT e perda de pacotes. Não requer configuração adicional.
              </p>
              {renderThresholds()}
            </TabsContent>

            <TabsContent value="HTTP" className="focus:outline-none">
              {renderHttpFields()}
              {renderThresholds()}
            </TabsContent>

            <TabsContent value="TCP" className="focus:outline-none">
              {renderTcpFields()}
              {renderThresholds()}
            </TabsContent>

            <TabsContent value="DOCKER" className="focus:outline-none">
              {renderDockerFields()}
              {renderThresholds()}
            </TabsContent>

            <TabsContent value="HEARTBEAT" className="focus:outline-none">
              <p className="text-xs text-slate-400 mb-4">
                Sonda passiva para jobs/cronjobs periódicos. O ativo envia heartbeat; se não receber no intervalo esperado + graça, alerta.
              </p>
              {renderHeartbeatFields()}
            </TabsContent>

            <TabsContent value="SNMP" className="focus:outline-none">
              <p className="text-xs text-slate-400 mb-4">
                Monitoramento nativo via Simple Network Management Protocol. Suporta métricas de interfaces de rede, CPU, memória e status via OID.
              </p>
              {renderSnmpFields()}
              {renderThresholds()}
            </TabsContent>
          </Tabs>
        </div>
      </form>
    </Modal>
  );
};
