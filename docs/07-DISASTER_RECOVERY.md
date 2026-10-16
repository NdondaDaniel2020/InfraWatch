# Manual Operacional de Disaster Recovery e Backup Multi-Destino

> **Referência Arquitetural**: [ADR-032](file:///spot/NdDaniel/Code/Estudo/InfraWatch/docs/DECISIONS.md#adr-032-pipeline-de-backup-automatizado-multi-destino-e-disaster-recovery) | **Issue**: [#220](https://github.com/NdondaDaniel2020/InfraWatch/issues/220)  
> **Status**: Ativo & Homologado  
> **Versão**: 1.0.0

---

## 1. Visão Geral e Métricas de Resiliência

O InfraWatch adota uma estratégia de proteção de dados baseada no padrão **3-2-1** em leque (*fan-out*), garantindo a continuidade de negócios e a integridade de dados operacionais de telemetria, incidentes, trilhas de auditoria e configurações de rede.

### Métricas Contratuais e Objetivos de Recuperação

| Métrica | Meta Operacional | Descrição |
| :--- | :--- | :--- |
| **RPO** (*Recovery Point Objective*) | **< 1 hora** | Perda máxima tolerável de dados no pior cenário de desastre catastrófico. |
| **RTO** (*Recovery Time Objective*) | **< 15 minutos** | Tempo máximo para restabelecimento total dos serviços em um novo ambiente a partir do snapshot. |
| **Criptografia em Repouso** | **AES-256-CBC PBKDF2** | Todos os segredos e credenciais de infraestrutura são cifrados antes de sair do perímetro. |
| **Integridade de Trânsito** | **SHA-256 Checksum** | Todo bundle possui digest criptográfico verificado antes da descompactação. |

---

## 2. Topologia Multi-Destino em Leque (*Fan-Out*)

```
┌────────────────────────────────────────────────────────┐
│                   Host InfraWatch                      │
│                                                        │
│  [TimescaleDB]      [Redis 7.4]       [Docker Secrets] │
│   (pg_dump -Fc)      (BGSAVE)          (AES-256 PBKDF2)│
└───────────────┬──────────────────────────────┬─────────┘
                │                              │
                ▼                              ▼
      [ infrawatch_backup_TIMESTAMP.tar.gz + .sha256 ]
                │
        ┌───────┴──────────────────────────────┐
        │        Distribuição em Leque         │
        ▼                                      ▼
┌──────────────────┐               ┌──────────────────────────┐
│  Destino Local   │               │    Destinos em Nuvem     │
│  /var/backups/   │               │       (via rclone)       │
│  (Retenção 7 d)  │               └─────────────┬────────────┘
└──────────────────┘                             │
                        ┌────────────────────────┼────────────────────────┐
                        ▼                        ▼                        ▼
             ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
             │    Google Drive     │  │    Cloudflare R2    │  │    AWS S3 (Educate) │
             │  (15 GB Free / 2TB) │  │  (10 GB S3 No Egress)│  │ (Linha Preparada)  │
             └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### Provedores e Custos Operacionais

1. **Destino 1 (Onsite / Local)**:
   - Diretório: `/var/backups/` ou `./backups/` no host.
   - Poda automática (*pruning*): Exclusão automática de bundles locais com mais de 7 dias via `find -mtime +7`.
2. **Destino 2 (Offsite Cloud - Google Drive)**:
   - Capacidade: 15 GB gratuitos por conta ou planos corporativos (2 TB+).
   - Comunicação: `rclone` via OAuth2 (`gdrive:infrawatch-backups/`).
3. **Destino 3 (Offsite Cloud - Cloudflare R2)**:
   - Capacidade: 10 GB gratuitos permanentes com compatibilidade nativa com a API S3.
   - Taxa de transferência: Custo zero de tráfego de saída (*Zero Egress Fees*).
   - Comunicação: `rclone` via S3 API (`r2:infrawatch-backups/`).
4. **Destino 4 (Expansão Futura - AWS S3)**:
   - Preparado no script `scripts/backup.sh`: linha pronta para ativação com plano de estudante / AWS Educate:
     ```bash
     # rclone copy "${BUNDLE_PATH}" aws_s3:infrawatch-backups/
     ```

---

## 3. Comandos Operacionais

### 3.1. Execução via Makefile

```bash
# Executa o backup completo (Local + Google Drive + Cloudflare R2)
make backup

# Executa o backup apenas local ignorando os destinos de nuvem
make backup ARGS="--skip-remote"

# Executa simulação sem gerar ou alterar arquivos reais
make backup ARGS="--dry-run"

# Restaura o banco a partir de um bundle local específico
make restore ARGS="/var/backups/infrawatch_backup_20261016_230000.tar.gz"

# Baixa automaticamente do Cloudflare R2 e restaura
make restore ARGS="infrawatch_backup_20261016_230000.tar.gz --from=r2"

# Baixa automaticamente do Google Drive e restaura
make restore ARGS="infrawatch_backup_20261016_230000.tar.gz --from=gdrive"
```

### 3.2. Disparo Manual via API REST (NOC Cockpit)

A API disponibiliza um endpoint não-bloqueante protegido por RBAC (`SUPER_ADMIN`):

```http
POST /api/v1/system/backup HTTP/1.1
Host: api.infrawatch.internal
Authorization: Bearer <TOKEN_SUPER_ADMIN>
Content-Type: application/json

{
  "skip_remote": false,
  "dry_run": false
}
```

**Resposta Imediata (HTTP 202 Accepted)**:
```json
{
  "task_id": "backup_20261016_230000_a1b2c3",
  "status": "accepted",
  "message": "Backup disparado em segundo plano.",
  "started_at": "2026-10-16T23:00:00Z"
}
```

O dashboard do operador exibe o botão **"Gerar Backup Manual"** com feedback em tempo real e isolamento total de processos, garantindo que o loop assíncrono de telemetria permaneça sob 100ms.

---

## 4. Procedimento de Recuperação de Desastre (Disaster Recovery Step-by-Step)

### Cenário: Perda Total do Servidor (Reconstrução Bare-Metal)

1. **Provisionamento do Host**:
   - Clonar o repositório oficial do InfraWatch no novo servidor:
     ```bash
     git clone https://github.com/NdondaDaniel2020/InfraWatch.git /opt/infrawatch
     cd /opt/infrawatch
     ```
2. **Configuração de Credenciais do rclone**:
   - Copiar o arquivo modelo e preencher as chaves de acesso:
     ```bash
     cp scripts/rclone.conf.template rclone.conf
     nano rclone.conf
     ```
3. **Download e Restauração Automatizada**:
   - Iniciar os contêineres de banco e cache:
     ```bash
     make up
     ```
   - Baixar o backup mais recente do Cloudflare R2 ou Google Drive e restaurar:
     ```bash
     make restore ARGS="infrawatch_backup_LATEST.tar.gz --from=r2"
     ```
4. **Verificação da Integridade**:
   - O script `scripts/restore.sh` valida automaticamente:
     - Checksum SHA-256 comparado com o hash gravado.
     - Decriptação dos segredos usando a `BACKUP_ENCRYPTION_KEY`.
     - Injeção consistente no TimescaleDB via `pg_restore --clean --if-exists`.
     - Cópia do snapshot `dump.rdb` no volume do Redis 7.4.
5. **Reinicialização e Go-Live**:
   ```bash
   make dev
   curl -f http://localhost:8000/api/health
   ```
