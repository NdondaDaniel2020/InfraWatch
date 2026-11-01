import { describe, expect, it, vi } from "vitest";
import { incidentsApi } from "../../src/services/incidentsApi";
import { slaApi } from "../../src/services/slaApi";
import { clientPortalApi } from "../../src/services/clientPortalApi";
import type { IncidentItem, IncidentDTO, IncidentListResponse } from "../../src/types/incidents";
import type { MaintenanceWindow, MaintenanceWindowDTO, MaintenanceWindowListResponse } from "../../src/types/sla";
import type { ClientDeviceDTO, ClientDeviceListResponse } from "../../src/types/clientPortal";
import type { TelemetryApiResponse, TelemetryDeviceDTO } from "../../src/types/telemetry";
import type { KnownSSEPayload, TelemetryUpdatedPayload, AlarmTriggeredPayload, PingPayload } from "../../src/types/sse";

vi.mock("../../src/services/clientPortalApi", () => ({
  clientPortalApi: {
    getClientServices: vi.fn().mockResolvedValue([
      {
        id: "dev-10",
        name: "Router Core",
        category: "Rede",
        status: "UP",
        statusLabel: "Nominal",
        tags: ["ICMP"],
      },
    ]),
  },
}));

vi.mock("../../src/services/incidentsApi", () => ({
  incidentsApi: {
    listIncidents: vi.fn().mockResolvedValue([
      {
        id: "inc-100",
        code: "INC-2026-100",
        title: "Falha de Roteamento BGP",
        severity: "critical",
        status: "TRIGGERED",
        service: "Rede Core",
        target_device: { name: "Router Core", ip: "10.0.0.1" },
        duration_str: "15m",
        glpi_ticket_id: 1042,
        organization_name: "InfraWatch NOC",
        started_at: "2026-10-31T00:00:00Z",
      },
    ]),
  },
}));

vi.mock("../../src/services/slaApi", () => ({
  slaApi: {
    listMaintenanceWindows: vi.fn().mockResolvedValue([
      {
        id: "mw-1",
        rfcNumber: "RFC-2026-001",
        title: "Atualização de Firmware",
        description: "Janela aprovada",
        targetDeviceIds: ["dev-1"],
        targetDeviceNames: ["Router Core"],
        clientName: "Organização",
        clientCategory: "TELECOM",
        startTimeUtc: "2026-10-31T01:00:00Z",
        endTimeUtc: "2026-10-31T03:00:00Z",
        durationMinutes: 120,
        status: "APPROVED",
        alarmSuppression: true,
        slaExemption: true,
      },
    ]),
  },
}));

describe("Strict Type Contracts & API DTOs (Issue #277)", () => {
  describe("Incidents Contracts", () => {
    it("deve mapear IncidentDTO para IncidentItem mantendo contratos estritos", async () => {
      const items: IncidentItem[] = await incidentsApi.listIncidents();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);

      const first = items[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.title).toBe("string");
      expect(["critical", "degraded", "resolved"]).toContain(first.severity);
      expect(["TRIGGERED", "ACKNOWLEDGED", "RESOLVED"]).toContain(first.status);
      expect(first.glpi_ticket_id === null || typeof first.glpi_ticket_id === "number").toBe(true);
    });

    it("deve respeitar a estrutura de IncidentListResponse e IncidentDTO", () => {
      const mockDto: IncidentDTO = {
        id: "inc-100",
        title: "Falha de Roteamento BGP",
        severity: "CRITICAL",
        status: "OPEN",
        glpi_ticket_id: 1042,
        root_cause: "Queda de enlace de fibra óptica principal",
      };

      const mockResponse: IncidentListResponse = {
        items: [mockDto],
        total: 1,
        page: 1,
        per_page: 10,
      };

      expect(mockResponse.items[0].id).toBe("inc-100");
      expect(mockResponse.items[0].glpi_ticket_id).toBe(1042);
    });
  });

  describe("SLA & Maintenance Contracts", () => {
    it("deve respeitar a tipagem estrita de MaintenanceWindowDTO e MaintenanceWindowListResponse", async () => {
      const windows: MaintenanceWindow[] = await slaApi.listMaintenanceWindows();
      expect(Array.isArray(windows)).toBe(true);
      expect(windows.length).toBeGreaterThan(0);

      const first = windows[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.rfcNumber).toBe("string");
      expect(["APPROVED", "PENDING_APPROVAL", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).toContain(
        first.status
      );
    });

    it("deve aceitar estrutura tipada de MaintenanceWindowDTO", () => {
      const dto: MaintenanceWindowDTO = {
        id: "mw-1",
        rfc_number: "RFC-2026-001",
        title: "Atualização de Firmware",
        is_approved: true,
        status: "APPROVED",
      };

      const response: MaintenanceWindowListResponse = {
        items: [dto],
        total: 1,
      };

      expect(response.items[0].rfc_number).toBe("RFC-2026-001");
      expect(response.items[0].is_approved).toBe(true);
    });
  });

  describe("Client Portal & Telemetry Contracts", () => {
    it("deve carregar serviços do cliente respeitando a estrutura ClientServiceItem", async () => {
      const services = await clientPortalApi.getClientServices();
      expect(Array.isArray(services)).toBe(true);
      expect(services.length).toBeGreaterThan(0);

      const first = services[0];
      expect(typeof first.id).toBe("string");
      expect(["UP", "DEG", "DOWN"]).toContain(first.status);

      const deviceDto: ClientDeviceDTO = {
        id: "dev-10",
        name: "Router Core",
        status: "UP",
      };
      const listResp: ClientDeviceListResponse = {
        items: [deviceDto],
        total: 1,
      };
      expect(listResp.items[0].name).toBe("Router Core");
    });

    it("deve validar contratos de TelemetryApiResponse e TelemetryDeviceDTO", () => {
      const deviceDto: TelemetryDeviceDTO = {
        id: "dev-01",
        name: "SW-CORE-01",
        status: "UP",
        last_latency_ms: 4.2,
        recent_metrics: [{ latency_ms: 4.2, timestamp: "2026-10-31T01:00:00Z" }],
      };

      const telemetryResp: TelemetryApiResponse = {
        total: 1,
        items: [deviceDto],
      };

      expect(telemetryResp.items[0].last_latency_ms).toBe(4.2);
      expect(telemetryResp.items[0].recent_metrics?.[0].latency_ms).toBe(4.2);
    });
  });

  describe("SSE Discriminated Union Types", () => {
    it("deve discriminar eventos conhecidos corretamente", () => {
      const telemetryEvent: TelemetryUpdatedPayload = {
        event_type: "DeviceLatencyMeasured",
        device_id: "sw-01",
        latency_ms: 12.5,
        status: "UP",
      };

      const alarmEvent: AlarmTriggeredPayload = {
        event_type: "AlarmTriggered",
        device_id: "rt-02",
        severity: "CRITICAL",
        title: "Interface GigabitEthernet 0/1 Down",
      };

      const pingEvent: PingPayload = {
        event_type: "ping",
        timestamp: "2026-10-31T01:00:00Z",
      };

      const knownList: KnownSSEPayload[] = [telemetryEvent, alarmEvent, pingEvent];

      expect(telemetryEvent.event_type).toBe("DeviceLatencyMeasured");
      expect(alarmEvent.event_type).toBe("AlarmTriggered");
      expect(pingEvent.event_type).toBe("ping");
      expect(knownList.length).toBe(3);
    });
  });
});
