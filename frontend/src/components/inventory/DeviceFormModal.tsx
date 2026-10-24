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
];

const categoryOptions: DeviceCategory[] = ["ROUTER", "SWITCH", "FIREWALL", "SERVER", "DATABASE", "LOAD_BALANCER", "OTHER"];

const baseSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  hostname: z.string().min(1, "Hostname é obrigatório").max(255),
  ipAddress: z.string().min(1, "IP/Endereço é obrigatório").max(255),
  port: z.number().int().min(1, "Porta deve ser entre 1 e 65535").max(65535).optional(),
  protocol: z.enum(["ICMP", "HTTP", "TCP", "DOCKER", "HEARTBEAT"]),
  category: z.enum(["ROUTER", "SWITCH", "FIREWALL", "SERVER", "DATABASE", "LOAD_BALANCER", "OTHER"]),
  intervalSeconds: z.number().int().min(10, "Intervalo mínimo 10s").max(3600, "Intervalo máximo 3600s"),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  thresholds: z.object({
    latencyWarningMs: z.number().int().min(1).optional(),
    latencyCriticalMs: z.number().int().min(1).optional(),
    packetLossWarningPct: z.number().min(0).max(100).optional(),
    packetLossCriticalPct: z.number().min(0).max(100).optional(),
  }).optional(),
});

const httpConfigSchema = z.object({
  url: z.string().url("URL inválida").min(1, "URL é obrigatória"),
  method: z.enum(["GET", "POST", "HEAD"]).default("GET"),
  expectedStatusCodes: z.string().refine((val) => val.split(",").map(Number).filter(Boolean).length > 0, "Pelo menos um código esperado"),
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

const fullSchema = baseSchema
  .extend({
    httpConfig: httpConfigSchema.optional(),
    tcpConfig: tcpConfigSchema.optional(),
    dockerConfig: dockerConfigSchema.optional(),
    heartbeatConfig: heartbeatConfigSchema.optional(),
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
  children: React.ReactNode;
  helperText?: string;
  required?: boolean;
}> = ({ label, error, children, helperText, required }) => (
  <div style={{ marginBottom: "16px" }}>
    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>
      {label} {required && <span style={{ color: "var(--color-critical)" }}>*</span>}
    </label>
    <div>{children}</div>
    {error && <p style={{ color: "var(--color-critical)", fontSize: "0.75rem", marginTop: "4px" }}>{error}</p>}
    {helperText && !error && <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginTop: "4px" }}>{helperText}</p>}
  </div>
);

const StyledInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ style, className, onFocus, onBlur, ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: "0.875rem",
        outline: "none",
        transition: "border-color var(--transition-fast)",
        ...style,
      }}
      className={className}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; onBlur?.(e); }}
    />
  )
);

const StyledSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ style, className, onFocus, onBlur, ...props }, ref) => (
    <select
      ref={ref}
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: "0.875rem",
        outline: "none",
        cursor: "pointer",
        transition: "border-color var(--transition-fast)",
        ...style,
      }}
      className={className}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; onBlur?.(e); }}
    />
  )
);

const StyledTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ style, className, onFocus, onBlur, ...props }, ref) => (
    <textarea
      ref={ref}
      {...props}
      style={{
        width: "100%",
        minHeight: "80px",
        padding: "10px 12px",
        backgroundColor: "var(--color-surface-card)",
        border: "var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: "0.875rem",
        resize: "vertical",
        outline: "none",
        transition: "border-color var(--transition-fast)",
        ...style,
      }}
      className={className}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-subtle)"; onBlur?.(e); }}
    />
  )
);

const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ style, className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      {...props}
      style={{
        width: "18px",
        height: "18px",
        accentColor: "var(--color-primary)",
        cursor: "pointer",
        ...style,
      }}
      className={className}
    />
  )
);



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
      httpConfig: data.httpConfig ? {
        ...data.httpConfig,
        method: data.httpConfig.method as "GET" | "POST" | "HEAD",
        expectedStatusCodes: data.httpConfig.expectedStatusCodes.split(",").map(Number).filter(Boolean),
      } : undefined,
      tcpConfig: data.tcpConfig,
      dockerConfig: data.dockerConfig,
      heartbeatConfig: data.heartbeatConfig,
    };
    await onSubmit(payload);
  };

  const handleFormSubmitWrapper = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = watch() as DeviceFormData;
    handleFormSubmit(formData);
  };

  const renderHttpFields = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
          <Input label="Códigos de Status Esperados" error={errors.httpConfig?.expectedStatusCodes?.message} required helperText="Separados por vírgula (ex: 200,201,204)">
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
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
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <Checkbox
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                data-testid="http-follow-redirects-checkbox"
              />
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-primary)" }}>Seguir redirecionamentos</span>
            </label>
          )}
        />
        <Controller
          name="httpConfig.verifySsl"
          control={control}
          render={({ field }) => (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <Checkbox
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                data-testid="http-verify-ssl-checkbox"
              />
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-primary)" }}>Verificar SSL</span>
            </label>
          )}
        />
      </div>
    </div>
  );

  const renderTcpFields = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Controller
        name="tcpConfig.port"
        control={control}
        rules={{ required: "Porta é obrigatória", min: { value: 1, message: "Porta mínima 1" }, max: { value: 65535, message: "Porta máxima 65535" } }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Controller
        name="heartbeatConfig.expectedIntervalSeconds"
        control={control}
        rules={{ required: "Intervalo esperado é obrigatório", min: { value: 10, message: "Mínimo 10s" }, max: { value: 86400, message: "Máximo 86400s (24h)" } }}
        render={({ field }) => (
          <Input label="Intervalo Esperado (segundos)" error={errors.heartbeatConfig?.expectedIntervalSeconds?.message} required helperText="Intervalo entre heartbeats esperados (10s - 24h)">
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

  const renderThresholds = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
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
            <StyledInput {...field} type="number" min="0" max="100" step="0.1" data-testid="threshold-packetloss-warning" />
          </Input>
        )}
      />
      <Controller
        name="thresholds.packetLossCriticalPct"
        control={control}
        render={({ field }) => (
          <Input label="Perda Pacotes Critical (%)" helperText="0-100%">
            <StyledInput {...field} type="number" min="0" max="100" step="0.1" data-testid="threshold-packetloss-critical" />
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
      description={mode === "create" ? "Configure uma nova sonda de monitoramento" : "Atualize as configurações do ativo"}
      maxWidth="720px"
      footer={
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
          <Button variant="ghost" onClick={onClose} disabled={isLoading || isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="device-form"
            isLoading={isLoading || isSubmitting}
            disabled={!isValid || isLoading || isSubmitting}
            data-testid="device-form-submit"
          >
            {mode === "create" ? "Cadastrar Ativo" : "Salvar Alterações"}
          </Button>
        </div>
      }
    >
      <form id="device-form" onSubmit={handleFormSubmitWrapper} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          <Input label="Nome do Ativo" error={errors.name?.message} required>
            <StyledInput {...register("name")} placeholder="Ex: Roteador Core SP" data-testid="device-name-input" />
          </Input>
          <Input label="Hostname / FQDN" error={errors.hostname?.message} required>
            <StyledInput {...register("hostname")} placeholder="router-core-sp.infrawatch.local" data-testid="device-hostname-input" />
          </Input>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          <Input label="Endereço IP" error={errors.ipAddress?.message} required>
            <StyledInput {...register("ipAddress")} placeholder="192.168.1.1 ou 2001:db8::1" data-testid="device-ip-input" />
          </Input>
          <Controller
            name="port"
            control={control}
            render={({ field }) => (
              <Input label="Porta (TCP)" error={errors.port?.message} helperText="Obrigatório para TCP, opcional para outros">
                <StyledInput {...field} type="number" min="1" max="65535" placeholder="80, 443, 5432..." data-testid="device-port-input" />
              </Input>
            )}
          />
        </div>

        <Input label="Categoria" error={errors.category?.message} required>
          <StyledSelect {...register("category")} data-testid="device-category-select">
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </StyledSelect>
        </Input>

        <Input label="Intervalo de Sondagem (segundos)" error={errors.intervalSeconds?.message} required helperText="10s a 3600s (1 hora)">
          <StyledInput {...register("intervalSeconds", { valueAsNumber: true })} type="number" min="10" max="3600" data-testid="device-interval-input" />
        </Input>

        <Input label="Descrição (opcional)">
          <StyledTextarea {...register("description")} placeholder="Descrição do ativo, localização, responsável..." data-testid="device-description-input" />
        </Input>

        <div style={{ borderTop: "var(--border-subtle)", paddingTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}>
              Protocolo de Sondagem
            </h3>
          </div>
          <Tabs defaultValue={protocol} onValueChange={(v) => setValue("protocol", v as ProberProtocol, { shouldValidate: true })} data-testid="protocol-tabs">
            <TabsList style={{ display: "flex", gap: "4px", borderBottom: "var(--border-subtle)", marginBottom: "16px" }}>
              {protocolOptions.map((p) => (
                <TabsTrigger key={p.value} value={p.value} style={{ padding: "8px 12px", fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="ICMP" style={{ animation: "fade-in 0.2s" }}>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginBottom: "16px" }}>
                Sonda ICMP Ping padrão. Mede latência RTT e perda de pacotes. Não requer configuração adicional.
              </p>
              {renderThresholds()}
            </TabsContent>
            <TabsContent value="HTTP" style={{ animation: "fade-in 0.2s" }}>
              {renderHttpFields()}
              {renderThresholds()}
            </TabsContent>
            <TabsContent value="TCP" style={{ animation: "fade-in 0.2s" }}>
              {renderTcpFields()}
              {renderThresholds()}
            </TabsContent>
            <TabsContent value="DOCKER" style={{ animation: "fade-in 0.2s" }}>
              {renderDockerFields()}
              {renderThresholds()}
            </TabsContent>
            <TabsContent value="HEARTBEAT" style={{ animation: "fade-in 0.2s" }}>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginBottom: "16px" }}>
                Sonda passiva para jobs/cronjobs periódicos. O ativo envia heartbeat; se não receber no intervalo esperado + graça, alerta.
              </p>
              {renderHeartbeatFields()}
            </TabsContent>
          </Tabs>
        </div>
      </form>
    </Modal>
  );
};