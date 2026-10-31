import { describe, it, expect } from "vitest";
import { normalizeDeviceListItem } from "../../src/services/devicesApi";

describe("devicesApi — Normalização e Resiliência de Dispositivos", () => {
  it("normaliza payload padrão vindo em snake_case do backend", () => {
    const raw = {
      id: "dev-01",
      name: "Gateway Core",
      status: "UP",
      ip_address: "172.28.0.1",
      protocol: "icmp",
      category: "ROUTER",
      is_paused: false,
    };

    const normalized = normalizeDeviceListItem(raw);

    expect(normalized.id).toBe("dev-01");
    expect(normalized.name).toBe("Gateway Core");
    expect(normalized.healthStatus).toBe("UP");
    expect(normalized.ipAddress).toBe("172.28.0.1");
    expect(normalized.protocol).toBe("ICMP");
    expect(normalized.category).toBe("ROUTER");
  });

  it("mapeia status DEGRADED para DEG e MAINTENANCE para MAINT", () => {
    const rawDeg = { id: "1", status: "DEGRADED", protocol: "tcp" };
    const rawMaint = { id: "2", status: "MAINTENANCE", protocol: "http" };
    const rawPaused = { id: "3", status: "UP", is_paused: true };

    expect(normalizeDeviceListItem(rawDeg).healthStatus).toBe("DEG");
    expect(normalizeDeviceListItem(rawMaint).healthStatus).toBe("MAINT");
    expect(normalizeDeviceListItem(rawPaused).healthStatus).toBe("PAUSED");
  });

  it("suporta objetos com campos ausentes sem disparar TypeError", () => {
    const normalized = normalizeDeviceListItem(null);

    expect(normalized.id).toBe("");
    expect(normalized.name).toBe("Sem Nome");
    expect(normalized.healthStatus).toBe("UP");
    expect(normalized.ipAddress).toBe("—");
    expect(normalized.hostname).toBe("—");
    expect(normalized.protocol).toBe("ICMP");
    expect(normalized.category).toBe("OTHER");
  });
});
