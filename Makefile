.PHONY: help dev run api app worker-probe worker-outbox worker-cleanup worker-zabbix worker-integration workers test lint format up down status container container-stop glpi-up glpi-down test-glpi zabbix-up zabbix-down test-zabbix test-notif bootstrap-integrations secrets-init secrets-clean certs certs-clean whatsapp-up clab-deploy clab-destroy clab-inspect clab-graph migrate seed backup restore front-dev front-test front-build front-lint

UV := $(shell which uv 2>/dev/null)
ifeq ($(UV),)
  RUN_PY := .venv/bin/python
  RUN_PYTEST := .venv/bin/pytest
  RUN_RUFF := .venv/bin/ruff
else
  RUN_PY := uv run python
  RUN_PYTEST := uv run pytest
  RUN_RUFF := uv run ruff
endif

help:
	@echo "Comandos disponíveis:"
	@echo "  make dev            - Roda tudo: containers -> migrações -> workers -> app"
	@echo "  make app            - Inicia apenas a aplicação backend FastAPI com hot-reload (alias: run, api)"
	@echo "  make run            - Inicia a aplicação backend (alias para app)"
	@echo "  make api            - Inicia a aplicação backend (alias para app)"
	@echo "  make front-dev      - Inicia o servidor de desenvolvimento do Frontend Vite"
	@echo "  make front-test     - Executa os testes automatizados do frontend com Vitest"
	@echo "  make front-build    - Compila os artefatos estáticos de produção do frontend"
	@echo "  make front-lint     - Executa checagem de tipos estritos do frontend com tsc"
	@echo "  make migrate        - Executa migrações pendentes do Alembic (upgrade head)"
	@echo "  make seed           - Executa carga de dados base idempotente (roda migrate previamente)"
	@echo "  make backup         - Executa rotina de backup multi-destino (local, Google Drive, R2)"
	@echo "  make restore        - Restaura banco e segredos (FILE=<nome> FROM=local|gdrive|r2)"
	@echo "  make workers        - Inicia os daemons de workers em segundo plano"
	@echo "  make worker-probe   - Inicia o Daemon de Sondas (Probe Worker) para pings e checagens"
	@echo "  make worker-outbox  - Inicia o worker de Outbox Relay independente"
	@echo "  make worker-cleanup - Inicia o worker de expurgo de tokens independente"
	@echo "  make worker-zabbix  - Inicia o worker de sincronização de telemetria Zabbix"
	@echo "  make worker-integration - Inicia o worker de integração (Notificações e GLPI)"
	@echo "  make test           - Executa os testes automatizados com uv run pytest ou .venv"
	@echo "  make lint           - Executa checagem de código com uv run ruff ou .venv"
	@echo "  make format         - Formata o código com uv run ruff format ou .venv"
	@echo "  make secrets-init   - Inicializa arquivos locais em secrets/ para Docker Compose"
	@echo "  make secrets-clean  - Remove arquivos de segredos locais de secrets/"
	@echo "  make certs          - Gera certificados SSL autoassinados locais em certs/"
	@echo "  make certs-clean    - Remove certificados SSL locais de certs/"
	@echo "  make up             - Sobe os containers da infraestrutura com Docker Compose"
	@echo "  make down           - Encerra os containers do Docker Compose"
	@echo "  make status         - Exibe o status dos containers"
	@echo "  make container      - Sobe containers de Postgres, Redis e WhatsApp Gateway sem Compose"
	@echo "  make container-stop - Para os containers locais de Postgres, Redis e WhatsApp Gateway"
	@echo "  make glpi-up        - Sobe containers do GLPI e provisiona API e tokens automaticamente"
	@echo "  make glpi-down      - Encerra os containers do GLPI e MariaDB"
	@echo "  make zabbix-up      - Sobe containers do Zabbix e provisiona API token automaticamente"
	@echo "  make zabbix-down    - Encerra os containers do Zabbix Stack"
	@echo "  make bootstrap-integrations - Sincroniza tokens de API e credenciais no GLPI e Zabbix"

dev: container migrate 
	@echo "Iniciando Daemons de workers e aplicação FastAPI..."
	@bash -c "trap 'kill 0' SIGINT SIGTERM EXIT; \
		(cd backend && $(RUN_PY) -m src.workers.daemons.probe_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.outbox_relay_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.token_cleanup_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.zabbix_sync_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.integration_worker) & \
		sleep 1; \
		(cd backend && $(RUN_PY) main.py) & \
		sleep 1; \
		(cd frontend && npm run dev)"


app:
	cd backend && $(RUN_PY) main.py

run: app

api: app

worker-probe:
	cd backend && $(RUN_PY) -m src.workers.daemons.probe_worker

worker-outbox:
	cd backend && $(RUN_PY) -m src.workers.daemons.outbox_relay_worker

worker-cleanup:
	cd backend && $(RUN_PY) -m src.workers.daemons.token_cleanup_worker

worker-zabbix:
	cd backend && $(RUN_PY) -m src.workers.daemons.zabbix_sync_worker

worker-integration:
	cd backend && $(RUN_PY) -m src.workers.daemons.integration_worker

migrate:
	cd backend && $(RUN_PY) -m alembic upgrade head

seed: migrate
	cd backend && $(RUN_PY) ../scripts/seed_demo_devices.py


workers:
	@echo "Iniciando Daemons de workers..."
	@bash -c "trap 'kill 0' SIGINT SIGTERM EXIT; \
		(cd backend && $(RUN_PY) -m src.workers.daemons.probe_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.outbox_relay_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.token_cleanup_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.zabbix_sync_worker) & \
		(cd backend && $(RUN_PY) -m src.workers.daemons.integration_worker) & \
		wait"



test:
	cd backend && $(RUN_PYTEST) tests -v

lint:
	cd backend && $(RUN_RUFF) check .

format:
	cd backend && $(RUN_RUFF) check --fix . && $(RUN_RUFF) format .



secrets-init:
	@./scripts/init-secrets.sh

secrets-clean:
	@echo "Removendo arquivos de segredos locais..."
	@rm -f secrets/*.txt
	@echo "Segredos removidos."

certs:
	@./scripts/init-certs.sh

certs-clean:
	@echo "Removendo certificados SSL locais..."
	@rm -f certs/*.pem certs/*.key certs/*.crt
	@echo "Certificados removidos."

build:
	docker compose --profile whatsapp build

up: secrets-init certs
	docker compose up -d

down:
	docker compose --profile whatsapp down

status:
	docker compose --profile whatsapp ps



whatsapp-up: secrets-init
	docker compose --profile whatsapp up -d infrawatch-whatsapp-gateway

container: secrets-init
	@echo "Starting Redis container..."
	@REDIS_PASS=$$(cat secrets/redis_password.txt 2>/dev/null || echo "redis_secure_password_2026"); \
	docker start infrawatch-redis 2>/dev/null || docker run -d \
		--name infrawatch-redis \
		-p 6379:6379 \
		-e REDIS_PASSWORD=$$REDIS_PASS \
		-v infrawatch_redis_data:/data \
		redis:7-alpine \
		redis-server --appendonly yes --requirepass $$REDIS_PASS
	@echo "Starting Postgres container..."
	@PG_PASS=$$(cat secrets/postgres_password.txt 2>/dev/null || echo "infrawatch_secure_password_2026"); \
	docker start infrawatch-postgres 2>/dev/null || docker run -d \
		--name infrawatch-postgres \
		-p 5432:5432 \
		-e POSTGRES_DB=infrawatch_db \
		-e POSTGRES_USER=infrawatch_user \
		-e POSTGRES_PASSWORD=$$PG_PASS \
		-v infrawatch_postgres_data:/var/lib/postgresql/data \
		postgres:16-alpine

container-WhatsApp: container
	@echo "Starting WhatsApp Gateway container..."
	@WA_TOKEN=$$(cat secrets/whatsapp_token.txt 2>/dev/null || echo "infrawatch_whatsapp_secret_token_2026"); \
	PG_PASS=$$(cat secrets/postgres_password.txt 2>/dev/null || echo "infrawatch_secure_password_2026"); \
	REDIS_PASS=$$(cat secrets/redis_password.txt 2>/dev/null || echo "redis_secure_password_2026"); \
	docker start infrawatch-whatsapp-gateway 2>/dev/null || docker run -d \
		--name infrawatch-whatsapp-gateway \
		--network host \
		-e SERVER_PORT=8085 \
		-e SERVER_URL=http://localhost:8085 \
		-e AUTHENTICATION_API_KEY=$$WA_TOKEN \
		-e DATABASE_PROVIDER=postgresql \
		-e DATABASE_CONNECTION_URI="postgresql://infrawatch_user:$$PG_PASS@localhost:5432/infrawatch_db?schema=evolution" \
		-e CACHE_REDIS_ENABLED=true \
		-e CACHE_REDIS_URI="redis://:$$REDIS_PASS@localhost:6379/6" \
		-v infrawatch_evolution_instances:/evolution/instances \
		evoapicloud/evolution-api:v2.3.7

container-stop:
	@docker stop infrawatch-redis infrawatch-postgres infrawatch-whatsapp-gateway 2>/dev/null || true
	@docker rm infrawatch-redis infrawatch-postgres infrawatch-whatsapp-gateway 2>/dev/null || true



glpi-up: secrets-init
	docker compose -f test-monitoramento/docker-compose.glpi.yml up -d
	@./scripts/bootstrap_integrations.sh glpi

glpi-down:
	docker compose -f test-monitoramento/docker-compose.glpi.yml down

test-glpi:
	@echo "Executando teste de integração com GLPI..."
	@cd backend && .venv/bin/python ../scripts/test_glpi.py

zabbix-up: secrets-init
	docker compose -f test-monitoramento/docker-compose.zabbix.yml up -d
	@./scripts/bootstrap_integrations.sh zabbix

zabbix-down:
	docker compose -f test-monitoramento/docker-compose.zabbix.yml down

bootstrap-integrations: secrets-init
	@./scripts/bootstrap_integrations.sh all

test-zabbix:
	@echo "Executando teste de integração com Zabbix..."
	@cd backend && .venv/bin/python ../scripts/test_zabbix.py

test-notif:
	@echo "Executando teste de notifications..."
	@cd backend && .venv/bin/python ../scripts/test_notifications.py $(ARGS)



integration-up: glpi-up zabbix-up bootstrap-integrations

integration-down: glpi-down zabbix-down

integration-test: test-glpi test-zabbix test-notif



CLAB_CMD := docker run --rm --privileged --network host --pid host -v /var/run/docker.sock:/var/run/docker.sock -v /etc/hosts:/etc/hosts -v $$(pwd):$$(pwd) -w $$(pwd)/test-monitoramento ghcr.io/srl-labs/clab:latest /usr/bin/containerlab

clab-deploy:
	@echo "Implantando topologia Containerlab (lab-infrawatch)..."
	@$(CLAB_CMD) deploy -t lab-infrawatch.clab.yml --reconfigure

clab-destroy:
	@echo "Destruindo topologia Containerlab..."
	@$(CLAB_CMD) destroy -t lab-infrawatch.clab.yml --cleanup

clab-inspect:
	@$(CLAB_CMD) inspect -t lab-infrawatch.clab.yml

clab-graph:
	@$(CLAB_CMD) graph -t lab-infrawatch.clab.yml



monitoring-test-up: clab-deploy integration-up up


monitoring-test-down: clab-destroy integration-down down

# -----------------------------------------------------------------------------
# Backup & Disaster Recovery (ADR-032 / Issue #220)
# -----------------------------------------------------------------------------
backup:
	@echo "Executando rotina de backup do InfraWatch..."
	@if docker compose ps -q infrawatch-backup 2>/dev/null | grep -q .; then \
		docker compose exec infrawatch-backup /app/scripts/backup.sh manual; \
	else \
		bash scripts/backup.sh manual; \
	fi

restore:
	@echo "Executando rotina de restauração do InfraWatch (FILE=$(FILE), FROM=$(FROM))..."
	@if docker compose ps -q infrawatch-backup 2>/dev/null | grep -q .; then \
		docker compose exec infrawatch-backup /app/scripts/restore.sh "$(FILE)" "$(FROM)"; \
	else \
		bash scripts/restore.sh "$(FILE)" "$(FROM)"; \
	fi

# -----------------------------------------------------------------------------
# Frontend NOC Dashboard & TV Mode (Issue #219)
# -----------------------------------------------------------------------------
front-dev:
	cd frontend && npm run dev

front-test:
	cd frontend && npm test

front-build:
	cd frontend && npm run build

front-lint:
	cd frontend && npx tsc --noEmit
