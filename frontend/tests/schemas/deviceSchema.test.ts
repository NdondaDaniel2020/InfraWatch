import { describe, it, expect } from "vitest";
import {
  deviceSchema,
  baseDeviceSchema,
  isValidIpAddress,
  httpConfigSchema,
  tcpConfigSchema,
  snmpConfigSchema,
} from "../../src/schemas/deviceSchema";

describe("Device & Probe Schemas (Issue #278)", () => {
  describe("IP Address Validation (IPv4 / IPv6)", () => {
    it("deve validar endereços IPv4 válidos", () => {
      expect(isValidIpAddress("192.168.1.1")).toBe(true);
      expect(isValidIpAddress("10.0.0.1")).toBe(true);
      expect(isValidIpAddress("172.16.254.1")).toBe(true);
      expect(isValidIpAddress("127.0.0.1")).toBe(true);
    });

    it("deve rejeitar endereços IPv4 malformatados", () => {
      expect(isValidIpAddress("invalid-ip")).toBe(false);
      expect(isValidIpAddress("256.0.0.1")).toBe(false);
      expect(isValidIpAddress("192.168.1")).toBe(false);
      expect(isValidIpAddress("192.168.1.1.1")).toBe(false);
      expect(isValidIpAddress("")).toBe(false);
    });

    it("deve validar endereços IPv6 válidos", () => {
      expect(isValidIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
      expect(isValidIpAddress("::1")).toBe(true);
      expect(isValidIpAddress("fe80::1")).toBe(true);
    });
  });

  describe("Base Device Schema", () => {
    it("deve aceitar payload válido com valores mínimos", () => {
      const validPayload = {
        name: "Router Core 01",
        hostname: "router-01.infrawatch.ao",
        ipAddress: "10.0.0.1",
        protocol: "ICMP",
        category: "ROUTER",
        intervalSeconds: 30,
      };

      const result = baseDeviceSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("deve falhar se o nome tiver menos de 2 caracteres", () => {
      const invalid = {
        name: "R",
        hostname: "router-01.local",
        ipAddress: "10.0.0.1",
        protocol: "ICMP",
        category: "ROUTER",
        intervalSeconds: 30,
      };

      const result = baseDeviceSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("pelo menos 2 caracteres");
      }
    });

    it("deve falhar se intervalo de sondagem for menor que 5s ou maior que 3600s", () => {
      const tooLow = {
        name: "Router",
        hostname: "router.local",
        ipAddress: "10.0.0.1",
        protocol: "ICMP",
        category: "ROUTER",
        intervalSeconds: 2,
      };
      expect(baseDeviceSchema.safeParse(tooLow).success).toBe(false);

      const tooHigh = { ...tooLow, intervalSeconds: 5000 };
      expect(baseDeviceSchema.safeParse(tooHigh).success).toBe(false);
    });
  });

  describe("Conditional Protocol Configurations", () => {
    it("deve exigir httpConfig quando protocolo for HTTP", () => {
      const payload = {
        name: "Web Portal",
        hostname: "portal.local",
        ipAddress: "10.0.0.2",
        protocol: "HTTP",
        category: "SERVER",
        intervalSeconds: 15,
      };

      const result = deviceSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const httpIssue = result.error.issues.find((i) => i.path.includes("httpConfig"));
        expect(httpIssue).toBeDefined();
      }
    });

    it("deve aceitar httpConfig válido com status codes esperados", () => {
      const validConfig = {
        url: "https://portal.infrawatch.ao/health",
        method: "GET" as const,
        expectedStatusCodes: "200,204",
        followRedirects: true,
        verifySsl: true,
        timeoutSeconds: 10,
      };
      expect(httpConfigSchema.safeParse(validConfig).success).toBe(true);

      const validHttp = {
        name: "Web Portal",
        hostname: "portal.local",
        ipAddress: "10.0.0.2",
        protocol: "HTTP",
        category: "SERVER",
        intervalSeconds: 15,
        httpConfig: validConfig,
      };

      expect(deviceSchema.safeParse(validHttp).success).toBe(true);
    });

    it("deve validar portas TCP dentro da faixa permitida (1-65535)", () => {
      expect(tcpConfigSchema.safeParse({ port: 80, timeoutSeconds: 5 }).success).toBe(true);
      expect(tcpConfigSchema.safeParse({ port: 65535, timeoutSeconds: 5 }).success).toBe(true);
      expect(tcpConfigSchema.safeParse({ port: 0, timeoutSeconds: 5 }).success).toBe(false);
      expect(tcpConfigSchema.safeParse({ port: 70000, timeoutSeconds: 5 }).success).toBe(false);
    });

    it("deve exigir community para SNMP v1 e v2c", () => {
      const snmpV2WithoutCommunity = {
        name: "Switch Core",
        hostname: "sw-core.local",
        ipAddress: "10.0.1.1",
        protocol: "SNMP",
        category: "SWITCH",
        intervalSeconds: 30,
        snmpConfig: {
          version: "v2c" as const,
          port: 161,
        },
      };

      const result = deviceSchema.safeParse(snmpV2WithoutCommunity);
      expect(result.success).toBe(false);
    });

    it("deve exigir username para SNMP v3", () => {
      const snmpV3WithoutUser = {
        name: "Switch Core",
        hostname: "sw-core.local",
        ipAddress: "10.0.1.1",
        protocol: "SNMP",
        category: "SWITCH",
        intervalSeconds: 30,
        snmpConfig: {
          version: "v3" as const,
          port: 161,
          securityLevel: "noAuthNoPriv" as const,
        },
      };

      const result = deviceSchema.safeParse(snmpV3WithoutUser);
      expect(result.success).toBe(false);
    });

    it("deve aceitar SNMP v3 completo com autenticação e privacidade", () => {
      const snmpV3Config = {
        version: "v3" as const,
        port: 161,
        securityLevel: "authPriv" as const,
        username: "noc_operator",
        authProtocol: "SHA256" as const,
        authPassword: "SuperSecretAuthPassword123!",
        privProtocol: "AES256" as const,
        privPassword: "SuperSecretPrivPassword123!",
      };
      expect(snmpConfigSchema.safeParse(snmpV3Config).success).toBe(true);

      const snmpV3Valid = {
        name: "Switch Core",
        hostname: "sw-core.local",
        ipAddress: "10.0.1.1",
        protocol: "SNMP",
        category: "SWITCH",
        intervalSeconds: 30,
        snmpConfig: snmpV3Config,
      };

      expect(deviceSchema.safeParse(snmpV3Valid).success).toBe(true);
    });
  });
});
