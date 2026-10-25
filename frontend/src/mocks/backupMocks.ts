import {
  BackupHistoryItem,
  BackupMetricsSummary,
  BackupProgressEvent,
} from "../types/backup";

export const mockBackupHistoryItems: BackupHistoryItem[] = [
  {
    filename: "infrawatch_backup_2026-10-25_020000.tar.gz",
    size_bytes: 260714496,
    size_human: "248.6 MB",
    created_at: "2026-10-25T02:00:00Z",
    sha256: "9a8f4c21b8e734d0812f8e1a90f339b1a774c82b09ff8271923e110cf98e4d2a",
    storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-25_020000.tar.gz",
    targets: {
      local: "SUCCESS",
      gdrive: "SUCCESS",
      r2: "SUCCESS",
    },
    trigger: "scheduled",
    notes: "Rotina automática diária (Cron 02:00 UTC)",
  },
  {
    filename: "infrawatch_backup_2026-10-24_183015.tar.gz",
    size_bytes: 255983616,
    size_human: "244.1 MB",
    created_at: "2026-10-24T18:30:15Z",
    sha256: "4b72c918ef039822a16d80ff357a91bb3e18a992147f84610c492198be391a02",
    storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-24_183015.tar.gz",
    targets: {
      local: "SUCCESS",
      gdrive: "SUCCESS",
      r2: "SUCCESS",
    },
    trigger: "manual",
    notes: "Pré-manutenção preventiva no cluster TimescaleDB",
  },
  {
    filename: "infrawatch_backup_2026-10-24_020000.tar.gz",
    size_bytes: 264241152,
    size_human: "252.0 MB",
    created_at: "2026-10-24T02:00:00Z",
    sha256: "8e14f092b3392a8147d018fe930a4172bc91028741ff34e098a127814b62e912",
    storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-24_020000.tar.gz",
    targets: {
      local: "SUCCESS",
      gdrive: "SUCCESS",
      r2: "FAILED",
    },
    trigger: "scheduled",
    notes: "Alerta transitório de timeout no Cloudflare R2 (Replicado via GDrive)",
  },
  {
    filename: "infrawatch_backup_2026-10-23_020000.tar.gz",
    size_bytes: 251658240,
    size_human: "240.0 MB",
    created_at: "2026-10-23T02:00:00Z",
    sha256: "17a9e8b240182fc9304e8812fa9102bb47c89102374e8912fa8102378129fa01",
    storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-23_020000.tar.gz",
    targets: {
      local: "SUCCESS",
      gdrive: "SUCCESS",
      r2: "SUCCESS",
    },
    trigger: "scheduled",
    notes: "Rotina automática diária (Cron 02:00 UTC)",
  },
  {
    filename: "infrawatch_backup_2026-10-22_020000.tar.gz",
    size_bytes: 247463936,
    size_human: "236.0 MB",
    created_at: "2026-10-22T02:00:00Z",
    sha256: "33918a02bc7192418a098fe1270912fa38192a019842e819fa019237e89120ab",
    storage_path: "/var/backups/infrawatch/infrawatch_backup_2026-10-22_020000.tar.gz",
    targets: {
      local: "SUCCESS",
      gdrive: "SUCCESS",
      r2: "SUCCESS",
    },
    trigger: "scheduled",
    notes: "Rotina automática diária (Cron 02:00 UTC)",
  },
];

export const mockBackupMetrics: BackupMetricsSummary = {
  lastBackupAt: "2026-10-25T02:00:00Z",
  totalBackupsCount: 5,
  totalStorageUsed: "1.22 GB",
  rpoTargetMinutes: 15,
  rpoCurrentMinutes: 8,
  rtoTargetMinutes: 30,
  isCompliant: true,
};

export const mockSseProgressSequence: BackupProgressEvent[] = [
  {
    stage: "started",
    percent: 5,
    message: "Iniciando rotina de backup manual (Modo: manual)...",
  },
  {
    stage: "timescaledb",
    percent: 20,
    message: "Exportando catálogo TimescaleDB e hypertables telemétricas...",
  },
  {
    stage: "redis",
    percent: 40,
    message: "Gerando snapshot assíncrono do Redis (dump.rdb)...",
  },
  {
    stage: "secrets",
    percent: 55,
    message: "Criptografando credenciais com OpenSSL AES-256-CBC PBKDF2...",
  },
  {
    stage: "packaging",
    percent: 70,
    message: "Criando pacote consolidado tar.gz e gerando hash SHA-256...",
  },
  {
    stage: "upload_gdrive",
    percent: 80,
    message: "Sincronizando com Google Drive via Rclone...",
  },
  {
    stage: "upload_r2",
    percent: 90,
    message: "Replicando para Cloudflare R2 (Armazenamento S3 Resiliente)...",
  },
  {
    stage: "pruning",
    percent: 95,
    message: "Aplicando política de retenção de 30 dias (limpeza local e remota)...",
  },
  {
    stage: "completed",
    percent: 100,
    message: "Backup concluído com sucesso e verificado criptograficamente!",
    filename: "infrawatch_backup_2026-10-25_035000.tar.gz",
    size_human: "250.4 MB",
    sha256: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  },
];
