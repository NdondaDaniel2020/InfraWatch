import { describe, it, expect } from "vitest";
import {
  createMaintenanceSchema,
  slaTargetSchema,
} from "../../src/schemas/slaSchema";

describe("SLA & Maintenance Schemas (Issue #278)", () => {
  describe("createMaintenanceSchema", () => {
    it("deve validar payload completo de parada técnica", () => {
      const validPayload = {
        title: "Atualização de Firmware Core Router",
        description: "Manutenção programada de upgrade de IOS-XE com desvio prévio de tráfego BGP.",
        targetDeviceInput: "SW-CORE-LUANDA-01, SW-CORE-LUANDA-02",
        clientName: "Unitel Angola (Backbone Core)",
        startTime: "2026-11-01T02:00",
        endTime: "2026-11-01T04:00",
        alarmSuppression: true,
        slaExemption: true,
        rollbackPlan: "Reverter imagem de boot via TFTP em caso de erro nos primeiros 15 minutos.",
      };

      const result = createMaintenanceSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("deve falhar se a data de término for anterior ou igual à data de início", () => {
      const invalidDates = {
        title: "Upgrade de Switch",
        description: "Procedimento técnico detalhado para upgrade de portas.",
        targetDeviceInput: "SW-01",
        clientName: "Unitel",
        startTime: "2026-11-01T04:00",
        endTime: "2026-11-01T02:00",
      };

      const result = createMaintenanceSchema.safeParse(invalidDates);
      expect(result.success).toBe(false);
      if (!result.success) {
        const dateIssue = result.error.issues.find((i) => i.path.includes("endTime"));
        expect(dateIssue).toBeDefined();
        expect(dateIssue?.message).toContain("posterior à data/hora de início");
      }
    });

    it("deve falhar se o escopo/descrição tiver menos de 10 caracteres", () => {
      const invalidDesc = {
        title: "Upgrade",
        description: "Curto",
        targetDeviceInput: "SW-01",
        clientName: "Unitel",
        startTime: "2026-11-01T02:00",
        endTime: "2026-11-01T04:00",
      };

      const result = createMaintenanceSchema.safeParse(invalidDesc);
      expect(result.success).toBe(false);
    });

    it("deve exigir título da mudança com pelo menos 3 caracteres", () => {
      const invalidTitle = {
        title: "AB",
        description: "Procedimento técnico detalhado para atualização.",
        targetDeviceInput: "SW-01",
        clientName: "Unitel",
        startTime: "2026-11-01T02:00",
        endTime: "2026-11-01T04:00",
      };

      const result = createMaintenanceSchema.safeParse(invalidTitle);
      expect(result.success).toBe(false);
    });
  });

  describe("slaTargetSchema", () => {
    it("deve validar percentual de uptime entre 0% e 100%", () => {
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 99.95, mttrTargetMinutes: 30 }).success).toBe(true);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 100, mttrTargetMinutes: 10 }).success).toBe(true);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 0, mttrTargetMinutes: 60 }).success).toBe(true);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: -1, mttrTargetMinutes: 30 }).success).toBe(false);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 105, mttrTargetMinutes: 30 }).success).toBe(false);
    });

    it("deve validar MTTR alvo entre 1 minuto e 1440 minutos", () => {
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 99.9, mttrTargetMinutes: 0 }).success).toBe(false);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 99.9, mttrTargetMinutes: 1441 }).success).toBe(false);
      expect(slaTargetSchema.safeParse({ uptimeTargetPct: 99.9, mttrTargetMinutes: 120 }).success).toBe(true);
    });
  });
});
