/**
 * Schemas declarativos Zod para cadastro e edição de dispositivos e sondas de rede.
 * Alinhado aos modelos Pydantic do backend (ADR-004, ADR-014 e Issue #278).
 */

import { z } from "zod";

export const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export const isValidIpAddress = (val: string): boolean => {
  return ipv4Regex.test(val) || ipv6Regex.test(val);
};

export const baseDeviceSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  hostname: z
    .string()
    .min(1, "Hostname é obrigatório")
    .max(255, "Hostname deve ter no máximo 255 caracteres"),
  ipAddress: z
    .string()
    .min(1, "IP/Endereço é obrigatório")
    .max(255)
    .refine(isValidIpAddress, "Formato de IP inválido (IPv4 ou IPv6)"),
  port: z
    .number()
    .int()
    .min(1, "Porta deve ser entre 1 e 65535")
    .max(65535, "Porta deve ser entre 1 e 65535")
    .optional(),
  protocol: z.enum(["ICMP", "HTTP", "TCP", "DOCKER", "HEARTBEAT", "SNMP"]),
  category: z.enum([
    "ROUTER",
    "SWITCH",
    "FIREWALL",
    "SERVER",
    "DATABASE",
    "LOAD_BALANCER",
    "OTHER",
  ]),
  intervalSeconds: z
    .number()
    .int()
    .min(5, "Intervalo mínimo 5s")
    .max(3600, "Intervalo máximo 3600s"),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  slaExemption48h: z.boolean().default(true),
  thresholds: z
    .object({
      latencyWarningMs: z.number().int().min(1).optional(),
      latencyCriticalMs: z.number().int().min(1).optional(),
      packetLossWarningPct: z.number().min(0).max(100).optional(),
      packetLossCriticalPct: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export const httpConfigSchema = z.object({
  url: z.string().url("URL inválida").min(1, "URL é obrigatória"),
  method: z.enum(["GET", "POST", "HEAD"]).default("GET"),
  expectedStatusCodes: z
    .string()
    .refine(
      (val) => val.split(",").map(Number).filter(Boolean).length > 0,
      "Pelo menos um código esperado"
    ),
  followRedirects: z.boolean().default(true),
  verifySsl: z.boolean().default(true),
  timeoutSeconds: z.number().int().min(1).max(60).default(10),
});

export const tcpConfigSchema = z.object({
  port: z
    .number()
    .int()
    .min(1, "Porta deve ser entre 1 e 65535")
    .max(65535, "Porta deve ser entre 1 e 65535"),
  timeoutSeconds: z.number().int().min(1).max(60).default(5),
});

export const dockerConfigSchema = z.object({
  containerName: z.string().min(1, "Nome do container é obrigatório").max(255),
  socketPath: z.string().max(255).optional(),
});

export const snmpConfigSchema = z.object({
  version: z.enum(["v1", "v2c", "v3"]).default("v2c"),
  port: z.number().int().min(1).max(65535).default(161),
  community: z.string().max(100).optional(),
  oid: z.string().max(255).optional(),
  securityLevel: z
    .enum(["noAuthNoPriv", "authNoPriv", "authPriv"])
    .default("authPriv"),
  username: z.string().max(100).optional(),
  authProtocol: z.enum(["MD5", "SHA", "SHA256"]).optional(),
  authPassword: z.string().max(100).optional(),
  privProtocol: z.enum(["DES", "AES", "AES128", "AES256"]).optional(),
  privPassword: z.string().max(100).optional(),
  timeoutSeconds: z.number().int().min(1).max(60).default(5),
});

export const deviceSchema = baseDeviceSchema
  .extend({
    httpConfig: httpConfigSchema.optional(),
    tcpConfig: tcpConfigSchema.optional(),
    dockerConfig: dockerConfigSchema.optional(),
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
    if (
      data.protocol === "TCP" &&
      data.tcpConfig &&
      (!data.port || data.port < 1 || data.port > 65535)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Porta TCP deve estar entre 1 e 65535",
        path: ["port"],
      });
    }
    if (data.protocol === "SNMP" && data.snmpConfig) {
      if (
        (data.snmpConfig.version === "v1" || data.snmpConfig.version === "v2c") &&
        !data.snmpConfig.community
      ) {
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
      if (
        data.snmpConfig.version === "v3" &&
        (data.snmpConfig.securityLevel === "authNoPriv" ||
          data.snmpConfig.securityLevel === "authPriv") &&
        !data.snmpConfig.authPassword
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Senha de autenticação é obrigatória para securityLevel authNoPriv/authPriv",
          path: ["snmpConfig", "authPassword"],
        });
      }
      if (
        data.snmpConfig.version === "v3" &&
        data.snmpConfig.securityLevel === "authPriv" &&
        !data.snmpConfig.privPassword
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Senha de privacidade é obrigatória para securityLevel authPriv",
          path: ["snmpConfig", "privPassword"],
        });
      }
    }
  });

export type DeviceFormData = z.infer<typeof deviceSchema>;
export type BaseDeviceFormData = z.infer<typeof baseDeviceSchema>;
export type HttpConfigFormData = z.infer<typeof httpConfigSchema>;
export type TcpConfigFormData = z.infer<typeof tcpConfigSchema>;
export type DockerConfigFormData = z.infer<typeof dockerConfigSchema>;
export type SnmpConfigFormData = z.infer<typeof snmpConfigSchema>;
