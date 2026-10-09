.PHONY: help dev run api app worker-probe worker-outbox worker-cleanup worker-zabbix workers test lint format up down status container container-stop glpi-up glpi-down test-glpi secrets-init secrets-clean

UV = uv

help:
	@echo "Comandos disponíveis:"
	@echo "  make dev            - Roda tudo: containers -> workers -> app no fim"
	@echo "  make app            - Inicia apenas a aplicação backend FastAPI com hot-reload (alias: run, api)"
	@echo "  make run            - Inicia a aplicação backend (alias para app)"
	@echo "  make api            - Inicia a aplicação backend (alias para app)"
	@echo "  make workers        - Inicia os daemons de workers em segundo plano"
	@echo "  make worker-probe   - Inicia o Daemon de Sondas (Probe Worker) para pings e checagens"
	@echo "  make worker-outbox  - Inicia o worker de Outbox Relay independente"
	@echo "  make worker-cleanup - Inicia o worker de expurgo de tokens independente"
	@echo "  make worker-zabbix  - Inicia o worker de sincronização de telemetria Zabbix"
	@echo "  make test           - Executa os testes automatizados com uv run pytest"
	@echo "  make lint           - Executa checagem de código com uv run ruff"
	@echo "  make format         - Formata o código com uv run ruff format"
	@echo "  make secrets-init   - Inicializa arquivos locais em secrets/ para Docker Compose"
	@echo "  make secrets-clean  - Remove arquivos de segredos locais de secrets/"
	@echo "  make up             - Sobe os containers da infraestrutura com Docker Compose"
	@echo "  make down           - Encerra os containers do Docker Compose"
	@echo "  make status         - Exibe o status dos containers"
	@echo "  make container      - Sobe apenas containers de Postgres e Redis sem Compose"
	@echo "  make container-stop - Para os containers locais de Postgres e Redis"
	@echo "  make glpi-up        - Sobe os containers do GLPI e MariaDB para testes"
	@echo "  make glpi-down      - Encerra os containers do GLPI e MariaDB"

dev: container
	@bash -c "trap 'kill 0' SIGINT SIGTERM EXIT; \
		sleep 1; \
		(cd backend && $(UV) run python main.py)"

app:
	cd backend && $(UV) run python main.py

run: app

api: app

worker-probe:
	cd backend && $(UV) run python -m src.workers.daemons.probe_worker

worker-outbox:
	cd backend && $(UV) run python -m src.workers.daemons.outbox_relay_worker

worker-cleanup:
	cd backend && $(UV) run python -m src.workers.daemons.token_cleanup_worker

worker-zabbix:
	cd backend && $(UV) run python -m src.workers.daemons.zabbix_sync_worker


workers:
	@echo "Iniciando Daemons de workers..."
	@bash -c "trap 'kill 0' SIGINT SIGTERM EXIT; \
		(cd backend && $(UV) run python -m src.workers.daemons.probe_worker) & \
		(cd backend && $(UV) run python -m src.workers.daemons.outbox_relay_worker) & \
		(cd backend && $(UV) run python -m src.workers.daemons.token_cleanup_worker) & \
		wait"

test:
	cd backend && $(UV) run pytest tests -v

lint:
	cd backend && $(UV) run ruff check .

format:
	cd backend && $(UV) run ruff check --fix . && $(UV) run ruff format .

secrets-init:
	@./scripts/init-secrets.sh

secrets-clean:
	@echo "Removendo arquivos de segredos locais..."
	@rm -f secrets/*.txt
	@echo "Segredos removidos."

up: secrets-init
	docker compose up -d postgres redis

down:
	docker compose down

status:
	docker compose ps

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

container-stop:
	@docker stop infrawatch-redis infrawatch-postgres 2>/dev/null || true
	@docker rm infrawatch-redis infrawatch-postgres 2>/dev/null || true

glpi-up: secrets-init
	docker compose -f docker-compose.glpi.yml up -d

glpi-down:
	docker compose -f docker-compose.glpi.yml down

test-glpi:
	@echo "Executando teste de integração com GLPI..."
	@cd backend && .venv/bin/python ../scripts/test_glpi.py

zabbix-up: secrets-init
	docker compose -f docker-compose.zabbix.yml up -d

zabbix-down:
	docker compose -f docker-compose.zabbix.yml down

test-zabbix:
	@echo "Executando teste de integração com Zabbix..."
	@cd backend && .venv/bin/python ../scripts/test_zabbix.py

