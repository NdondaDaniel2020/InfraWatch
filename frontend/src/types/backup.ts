/**
 * Tipos e Interfaces para Backup e Disaster Recovery (ADR-032 / Issue #224).
 * Sincronizados com os schemas do backend (FastAPI) e pipeline de backup do shell script.
 */

export type BackupStage =
  | "started"
  | "timescaledb"
  | "redis"
  | "secrets"
  | "packaging"
  | "upload_gdrive"
  | "upload_r2"
  | "pruning"
  | "completed"
  | "error";

export type BackupOperationStatus = "idle" | "running" | "completed" | "failed";

export type BackupTargetStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "IN_PROGRESS";

export interface BackupTargets {
  local: BackupTargetStatus;
  gdrive: BackupTargetStatus;
  r2: BackupTargetStatus;
}

export interface BackupProgressEvent {
  stage: BackupStage;
  percent: number;
  message: string;
  filename?: string;
  size_human?: string;
  sha256?: string;
  error?: string;
}

export interface BackupTriggerRequest {
  notes?: string;
}

export interface BackupTriggerResponse {
  backup_id: string;
  status: string;
  message: string;
  sse_url: string;
  triggered_at: string;
}

export interface BackupHistoryItem {
  filename: string;
  size_bytes: number;
  size_human: string;
  created_at: string;
  sha256?: string;
  storage_path: string;
  targets?: BackupTargets;
  trigger?: "manual" | "scheduled";
  notes?: string;
}

export interface BackupHistoryResponse {
  items: BackupHistoryItem[];
  total: number;
}

export interface BackupMetricsSummary {
  lastBackupAt: string;
  totalBackupsCount: number;
  totalStorageUsed: string;
  rpoTargetMinutes: number;
  rpoCurrentMinutes: number;
  rtoTargetMinutes: number;
  isCompliant: boolean;
}

export interface PipelineStageConfig {
  id: BackupStage;
  order: number;
  label: string;
  description: string;
  estimatedPercent: number;
}

export const BACKUP_PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    id: "started",
    order: 1,
    label: "Iniciando Rotina",
    description: "Carregamento seguro de segredos e verificação de integridade",
    estimatedPercent: 5,
  },
  {
    id: "timescaledb",
    order: 2,
    label: "Exportando TimescaleDB",
    description: "Dump das hypertables de telemetria e catálogo relacional",
    estimatedPercent: 20,
  },
  {
    id: "redis",
    order: 3,
    label: "Snapshot do Redis",
    description: "Sincronização BGSAVE do cache em memória e streams",
    estimatedPercent: 40,
  },
  {
    id: "secrets",
    order: 4,
    label: "Criptografando Credenciais",
    description: "Cifragem de tokens e chaves mestras com OpenSSL AES-256 PBKDF2",
    estimatedPercent: 55,
  },
  {
    id: "packaging",
    order: 5,
    label: "Empacotamento & Checksum",
    description: "Compactação tar.gz e cálculo do hash imutável SHA-256",
    estimatedPercent: 70,
  },
  {
    id: "upload_gdrive",
    order: 6,
    label: "Envio para Google Drive",
    description: "Replicação primária offsite via Rclone (Storage Frio)",
    estimatedPercent: 80,
  },
  {
    id: "upload_r2",
    order: 7,
    label: "Envio para Cloudflare R2",
    description: "Replicação secundária geodistribuída S3 compatível (Zero Egress)",
    estimatedPercent: 90,
  },
  {
    id: "pruning",
    order: 8,
    label: "Limpeza & Retenção",
    description: "Aplicação da política de retenção de 30 dias (Grandfather-Father-Son)",
    estimatedPercent: 95,
  },
  {
    id: "completed",
    order: 9,
    label: "Concluído com Sucesso",
    description: "Backup consolidado e telemetria registrada no canal operacional",
    estimatedPercent: 100,
  },
];
