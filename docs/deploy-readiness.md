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
  - [x] **Ponto 5**: Exposição segura de dados via VIEWs sanitizadas no PostgreSQL (`v_users_safe` com mascaramento de e-mails, `v_system_settings_masked` sem segredos em texto puro e concessão estrita de acesso à role `infrawatch_readonly`).
  - [x] **Ponto 6**: Privilégio `CREATE` revogado de `PUBLIC` no schema `public`.
  - [x] **Ponto 8**: Ações de leitura sensível registradas na trilha de auditoria (`SLA_REPORT_DOWNLOADED`, `CREDENTIAL_ACCESSED`).

## 4. Observability & Health
- [ ] Endpoint `/api/live` retorna 200 com payload `{"status": "alive"}`.
- [ ] Endpoint `/api/health` retorna 200 com payload `{"status": "healthy"}` (PostgreSQL e Redis com latência < 50ms).
- [ ] Endpoint `/metrics` protegido por Basic Auth retornando telemetria Prometheus.

## 5. Esteira de CI/CD (GitHub Actions Gates)
- [ ] **Type Check** (`type-check.yml`): Mypy 0 erros + TypeScript `npx tsc --noEmit` 0 erros.
- [ ] **Format** (`format.yml`): Ruff format check aprovado.
- [ ] **Lint** (`lint.yml`): Ruff check 0 erros + validação de tipos TypeScript e bundle Vite.
- [ ] **Tests** (`tests.yml`): 862 testes backend + 343 testes frontend aprovados com zero regressões.
- [ ] **Coverage** (`coverage.yml`): Cobertura de código testada com piso mínimo de 85% (cobertura atual: 85.11%).
- [ ] **Migrations** (`migrations.yml`): Head único, rollback/re-apply e auditoria de hardening aprovados contra container TimescaleDB real.
- [ ] **Smoke Test** (`smoke.yml`): Inicialização FastAPI e endpoints de saúde validados.
- [ ] **Docker Build** (`docker-build.yml`): Compilação dry-run dos Dockerfiles (API, Worker, Backup, Front) e validação Compose.
- [ ] **E2E Playwright** (`npm run test:e2e`): Suíte de testes visuais, autenticação e navegação aprovada em stack Docker (`auth-flow.spec.ts` e `noc-navigation.spec.ts`).
- [ ] **Build & Publish** (`build-deploy.yml`): Publicação manual de imagens no GHCR via workflow_dispatch.

---

## 6. Diretrizes para Desenvolvedores: Consultas e Views Sanitizadas (Ponto 5)

Ao desenvolver novos relatórios, integrações de auditoria, BI ou ao conceder acessos a terceiros:

1. **Princípio do Menor Privilégio (PoLP):**
   - Usuários de suporte, auditoria e ferramentas de BI devem se conectar utilizando a role `infrawatch_readonly` (ou herdando dela).
   - O acesso `SELECT` às tabelas brutas `users` e `system_settings` é **estritamente proibido** para essa role.

2. **Uso Obrigatório das Views Sanitizadas:**
   - **Usuários:** Sempre consultar `public.v_users_safe`. Ela mascara e-mails (`jo***@empresa.ao`), preserva a integridade de queries de auditoria e exclui totalmente `hashed_password` e `google_id`.
   - **Configurações:** Sempre consultar `public.v_system_settings_masked`. Chaves marcadas com `is_secret = true` são mascaradas como `••••••••`.

3. **Criação de Novas Views Sanitizadas:**
   - Toda nova view criada para expor dados a perfis de leitura deve ser declarada com `WITH (security_barrier = true)` para impedir vazamento de dados confidenciais por ataques de canal lateral via cláusulas `WHERE`.
   - Migrations DDL devem registrar as concessões na role `infrawatch_readonly` e incluir verificação correspondente no script `backend/scripts/audit_database_hardening.sql`.
