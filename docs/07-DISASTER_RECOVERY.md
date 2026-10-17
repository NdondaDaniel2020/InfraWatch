# InfraWatch — Procedimento Operacional Padrão: Backup & Disaster Recovery (SOP)

> **Documento:** 07-DISASTER_RECOVERY.md  
> **Status:** Aprovado e Operacional  
> **Referência Técnica:** ADR-032 / Issue #220  
> **Estratégia:** Backup Automatizado Multi-Destino Dual-Cloud (3-2-1) com Blast Radius Zero

---

## 1. Visão Geral e Arquitetura

O sistema de Disaster Recovery do **InfraWatch** garante a integridade e alta disponibilidade das séries temporais de rede, dados relacionais do inventário, histórico de SLA e segredos de conexão de infraestrutura.

```
                  ┌──────────────────────────────────────────────┐
                  │          FastAPI (infrawatch-api)            │
                  │   POST /api/v1/system/backup (HTTP 202)      │
                  └──────────────────────┬───────────────────────┘
                                         │ Publica comando leve
                                         ▼
                             ┌───────────────────────┐
                             │  Redis: backup:trigger│
                             └───────────┬───────────┘
                                         │ Desperta daemon isolado
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│            Contêiner Isolado: infrawatch-backup (Alpine Linux)         │
│  - pg_dump -Fc (TimescaleDB)       - bgsave (Redis Snapshot)          │
│  - OpenSSL AES-256 PBKDF2 (Secrets)- SHA-256 Checksum Validation       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ 1. Local Host      │    │ 2. Google Drive    │    │ 3. Cloudflare R2   │
│ /var/backups/      │    │ gdrive:backups/    │    │ r2:backups/        │
│ (Retenção: 7 dias) │    │ (Retenção: 30 dias)│    │ (Retenção: 30 dias)│
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                     │
                                     ▼ (Preparado / Comentado)
                          ┌────────────────────┐
                          │ 4. AWS S3          │
                          │ aws_s3:backups/    │
                          └────────────────────┘
```

### Pilares de Confiabilidade:
1. **Blast Radius Zero:** Todo o processamento de dump, compactação e upload ocorre estritamente dentro do contêiner dedicado `infrawatch-backup`, blindando o loop de eventos assíncrono do FastAPI contra travamentos e latência.
2. **Segurança de Segredos:** O diretório de credenciais (`secrets/`) é compactado e cifrado via OpenSSL simétrico (AES-256-CBC PBKDF2 com 100.000 iterações de derivação de chave).
3. **Reaproveitamento de Credenciais Google Cloud:** O Rclone reaproveita o mesmo par `client_id` e `client_secret` já configurado em `secrets/google_client_id.txt` e `secrets/google_client_secret.txt`, dispensando a criação de projetos adicionais no Google Cloud Platform.
4. **Isolamento de Falhas (Fan-Out Resiliente):** A indisponibilidade de um provedor de nuvem (ex.: instabilidade temporária no Google Drive) não aborta o upload no Cloudflare R2 ou o salvamento local.

---

## 2. Configurações e Gestão de Segredos

### 2.1. Variáveis de Ambiente (`.env.production` / `.env.example`)

| Variável | Valor Padrão | Descrição |
| :--- | :--- | :--- |
| `BACKUP_ENABLED` | `true` | Habilita a execução das rotinas de backup. |
| `BACKUP_CRON_SCHEDULE` | `"0 2 * * *"` | Agendamento Cron automático diário (02:00 UTC). |
| `BACKUP_LOCAL_PATH` | `/var/backups/infrawatch` | Diretório no host para armazenamento local. |
| `BACKUP_RETENTION_LOCAL_DAYS` | `7` | Dias de retenção antes do expurgo automático local. |
| `BACKUP_RETENTION_REMOTE_DAYS` | `30` | Dias de retenção antes da rotação nas nuvens. |
| `BACKUP_GDRIVE_REMOTE_NAME` | `gdrive` | Nome do remote Google Drive no Rclone. |
| `BACKUP_GDRIVE_FOLDER` | `infrawatch-backups` | Pasta de destino no Google Drive. |
| `BACKUP_R2_REMOTE_NAME` | `r2` | Nome do remote Cloudflare R2 no Rclone. |
| `BACKUP_R2_BUCKET` | `infrawatch-backups` | Nome do bucket S3 compatível no Cloudflare R2. |
| `BACKUP_NOTIFICATIONS_ENABLED` | `true` | Envio de relatórios no Telegram e Webhooks. |

### 2.2. Docker Secrets (`secrets/` com `chmod 600`)

* `secrets/backup_encryption_key.txt`: Chave simétrica mestra para cifra AES-256.
* `secrets/rclone_config.txt`: Arquivo de remotos do Rclone estruturado conforme:
  ```ini
  [gdrive]
  type = drive
  client_id = <GOOGLE_CLIENT_ID>
  client_secret = <GOOGLE_CLIENT_SECRET>
  scope = drive
  token = {"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}

  [r2]
  type = s3
  provider = Cloudflare
  access_key_id = <CLOUDFLARE_R2_KEY>
  secret_access_key = <CLOUDFLARE_R2_SECRET>
  endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  acl = private

  # [aws_s3]
  # type = s3
  # provider = AWS
  # env_auth = false
  # access_key_id = <AWS_KEY>
  # secret_access_key = <AWS_SECRET>
  # region = us-east-1
  ```

---

## 3. Procedimentos Operacionais de Execução

### 3.1. Execução Automática (Rotina Diária)
O daemon do contêiner `infrawatch-backup` executa diariamente às 02:00 UTC sem intervenção humana, gerando o bundle compactado `infrawatch_backup_YYYYMMDD_HHMMSS.tar.gz` com seu arquivo de verificação `.sha256`.

### 3.2. Execução Manual via Linha de Comando (CLI)
Para acionar o backup sob demanda antes de uma manutenção programada:
```bash
make backup
```
*O comando detecta se o contêiner `infrawatch-backup` está ativo e executa a rotina internamente.*

### 3.3. Execução Manual via API REST
Disponível exclusivamente para credenciais com privilégio `SUPER_ADMIN` ou `ADMIN`:
```bash
curl -X POST "http://localhost:8000/api/v1/system/backup" \
     -H "Authorization: Bearer <SEU_JWT_ADMIN>" \
     -H "Content-Type: application/json" \
     -d '{"notes": "Backup pré-atualização de versão"}'
```
**Resposta (HTTP 202 Accepted):**
```json
{
  "backup_id": "bck_7a8b9c1d2e3f",
  "status": "accepted",
  "message": "Rotina de backup despachada para o contêiner isolado.",
  "sse_url": "/api/v1/system/backup/events",
  "triggered_at": "2026-10-17T02:00:00Z"
}
```

Para acompanhar o progresso em tempo real (SSE):
```bash
curl -N "http://localhost:8000/api/v1/system/backup/events" \
     -H "Authorization: Bearer <SEU_JWT_ADMIN>"
```

Para listar o histórico de backups locais gerados:
```bash
curl "http://localhost:8000/api/v1/system/backup/history" \
     -H "Authorization: Bearer <SEU_JWT_ADMIN>"
```

---

## 4. Procedimentos de Restauração (Disaster Recovery)

Em caso de falha de hardware, corrupção de dados ou migração de infraestrutura:

### 4.1. Cenário A: Restauração a partir do Armazenamento Local
Restaura o backup mais recente existente em `/var/backups/infrawatch`:
```bash
make restore
```
Ou especificando um arquivo particular:
```bash
make restore FILE=infrawatch_backup_20261017_020000.tar.gz
```

### 4.2. Cenário B: Restauração a partir do Google Drive
Caso o host tenha sofrido perda total do disco local:
```bash
make restore FILE=infrawatch_backup_20261017_020000.tar.gz FROM=gdrive
```

### 4.3. Cenário C: Restauração a partir do Cloudflare R2
```bash
make restore FILE=infrawatch_backup_20261017_020000.tar.gz FROM=r2
```

---

## 5. Validação de Integridade Pós-Restauração

Após a restauração, o operador deve executar o checklist de integridade:
1. **Conferência de Hash:** O script `scripts/restore.sh` valida automaticamente o checksum SHA-256 antes da extração.
2. **Saúde dos Serviços:**
   ```bash
   make status
   ```
3. **Disponibilidade da API e Conectividade do Banco:**
   ```bash
   curl http://localhost:8000/api/health
   ```
4. **Verificação de Telemetria e Hypertables:**
   ```bash
   docker compose exec postgres psql -U infrawatch_user -d infrawatch_db -c "SELECT count(*) FROM telemetry_metrics;"
   ```
