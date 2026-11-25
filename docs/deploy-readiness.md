# InfraWatch Deploy Readiness Checklist

Documento de verificação obrigatória para aprovação de deploy em Staging e Produção.

## 1. Infrastructure Core
- [ ] PostgreSQL 16 com extensão **TimescaleDB 2.16+** provisionado e saudável.
- [ ] Redis 7.4+ configurado com persistência `appendonly yes` e autenticação com senha via secret.
- [ ] `tecnativa/docker-socket-proxy` ativo em modo estritamente read-only (`POST=0`).
- [ ] Nginx Gateway com certificados SSL/TLS provisionados e portas 80/443 expostas.

## 2. Environment Variables & Secrets
- [ ] `ENVIRONMENT=production`
- [ ] `DATABASE_URL=postgresql+asyncpg://<user>:<pass>@<host>:5432/<db>`
- [ ] `REDIS_URL=redis://:<pass>@<host>:6379/0`
- [ ] `SECRET_KEY` (chave criptográfica forte com no mínimo 32 bytes para HMAC-SHA256)
- [ ] `REFRESH_SECRET_KEY` (chave independente para rotação de tokens JWT)
- [ ] `CORS_ALLOWED_ORIGINS` (origens autorizadas restritas, sem wildcards permissivos)
- [ ] `APP_BASE_URL` (URL pública de produção)
- [ ] Canais de notificação: credenciais SMTP, Telegram Bot Token, WhatsApp Evolution API, GLPI App/User tokens e Zabbix API Token.

## 3. Database Hardening & Security (Checklist de 10 Pontos)
- [ ] `alembic upgrade head` aplicado com sucesso até a revisão mais recente.
- [ ] Script `backend/scripts/audit_database_hardening.sql` executado com 100% de sucesso:
  - [x] **Ponto 1 & 9**: FORCE ROW LEVEL SECURITY ativo em todas as 16 tabelas de dados relacionais.
  - [x] **Ponto 2**: `statement_timeout` configurado para 10s e `lock_timeout` para 5s.
  - [x] **Ponto 3**: `search_path = pg_catalog, public` fixado em funções do banco (`notify_outbox_event`, `block_audit_log_mutation`).
  - [x] **Ponto 4**: Check constraints de integridade ativas na camada de persistência (`metrics`, `devices`, `maintenance_windows`, `incidents`, `organizations`).
  - [x] **Ponto 6**: Privilégio `CREATE` revogado de `PUBLIC` no schema `public`.
  - [x] **Ponto 8**: Ações de leitura sensível registradas na trilha de auditoria (`SLA_REPORT_DOWNLOADED`, `CREDENTIAL_ACCESSED`).

## 4. Observability & Health
- [ ] Endpoint `/api/live` retorna 200 com payload `{"status": "alive"}`.
- [ ] Endpoint `/api/health` retorna 200 com payload `{"status": "healthy"}` (PostgreSQL e Redis com latência < 50ms).
- [ ] Endpoint `/metrics` protegido por Basic Auth retornando telemetria Prometheus.

## 5. Esteira de CI/CD (GitHub Actions Gates)
- [ ] **Type Check** (`type-check.yml`): Mypy 0 erros + TypeScript `npx tsc --noEmit` 0 erros.
- [ ] **Format** (`format.yml`): Ruff format check aprovado.
- [ ] **Lint** (`lint.yml`): Ruff check 0 erros + compilação de bundle Vite validada.
- [ ] **Tests** (`tests.yml`): 823 testes backend + 343 testes frontend aprovados com zero regressões.
- [ ] **Migrations** (`migrations.yml`): Head único, rollback/re-apply e auditoria de hardening aprovados contra container TimescaleDB real.
- [ ] **Smoke Test** (`smoke.yml`): Inicialização FastAPI e endpoints de saúde validados.
- [ ] **Coverage** (`coverage.yml`): Cobertura de código testada.
