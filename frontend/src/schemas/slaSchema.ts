/**
 * Schemas declarativos Zod para agendamento de Janelas de Manutenção e Metas de SLA.
 * Alinhado aos padrões operacionais e de governança (ADR-009 e Issue #278).
 */

import { z } from "zod";

export const createMaintenanceSchema = z
  .object({
    title: z
      .string()
      .min(3, "Título da mudança deve ter pelo menos 3 caracteres")
      .max(200, "Título deve ter no máximo 200 caracteres"),
    description: z
      .string()
      .min(10, "Escopo e procedimento técnico deve ter pelo menos 10 caracteres")
      .max(2000, "Procedimento deve ter no máximo 2000 caracteres"),
    targetDeviceInput: z
      .string()
      .min(1, "Informe ao menos um ativo alvo"),
    clientName: z
      .string()
      .min(2, "Nome do cliente/contratante é obrigatório"),
    startTime: z
      .string()
      .min(1, "Início da parada é obrigatório"),
    endTime: z
      .string()
      .min(1, "Término estimado é obrigatório"),
    alarmSuppression: z.boolean().default(true),
    slaExemption: z.boolean().default(true),
    rollbackPlan: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);
      if (isNaN(start.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data de início inválida",
          path: ["startTime"],
        });
      }
      if (isNaN(end.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data de término inválida",
          path: ["endTime"],
        });
      }
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A data/hora de término deve ser posterior à data/hora de início.",
          path: ["endTime"],
        });
      }
    }
  });

export const slaTargetSchema = z.object({
  uptimeTargetPct: z
    .number()
    .min(0, "Meta mínima de disponibilidade é 0%")
    .max(100, "Meta máxima de disponibilidade é 100%"),
  mttrTargetMinutes: z
    .number()
    .int()
    .min(1, "MTTR alvo deve ser no mínimo 1 minuto")
    .max(1440, "MTTR alvo não pode exceder 24 horas (1440 min)"),
});

export type CreateMaintenanceFormData = z.infer<typeof createMaintenanceSchema>;
export type SlaTargetFormData = z.infer<typeof slaTargetSchema>;
