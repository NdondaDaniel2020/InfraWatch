.PHONY: help dev run test lint format up down status

UV = uv

help:
	@echo "Comandos disponíveis:"
	@echo "  make dev       - Inicia o servidor backend FastAPI com hot-reload executando main.py"
	@echo "  make run       - Inicia o servidor backend (alias para dev)"
	@echo "  make test      - Executa os testes automatizados com uv run pytest"
	@echo "  make lint      - Executa checagem de código com uv run ruff"
	@echo "  make format    - Formata o código com uv run ruff format"
	@echo "  make up        - Sobe os containers da infraestrutura com Docker Compose"
	@echo "  make down      - Encerra os containers do Docker Compose"
	@echo "  make status    - Exibe o status dos containers"

dev: container run

run:
	cd backend && $(UV) run python main.py

test:
	cd backend && $(UV) run pytest tests -v

lint:
	cd backend && $(UV) run ruff check .

format:
	cd backend && $(UV) run ruff check --fix . && $(UV) run ruff format .

up:
	docker compose up -d postgres redis

down:
	docker compose down

status:
	docker compose ps

container:
	@echo "Starting Redis container..."
	@docker start infrawatch-redis 2>/dev/null || docker run -d \
		--name infrawatch-redis \
		-p 6379:6379 \
		-e REDIS_PASSWORD=redis_secure_password_2026 \
		-v infrawatch_redis_data:/data \
		redis:7-alpine \
		redis-server --appendonly yes --requirepass redis_secure_password_2026
	@echo "Starting Postgres container..."
	@docker start infrawatch-postgres 2>/dev/null || docker run -d \
		--name infrawatch-postgres \
		-p 5432:5432 \
		-e POSTGRES_DB=infrawatch_db \
		-e POSTGRES_USER=infrawatch_user \
		-e POSTGRES_PASSWORD=infrawatch_secure_password_2026 \
		-v infrawatch_postgres_data:/var/lib/postgresql/data \
		postgres:16-alpine

container-stop:
	@docker stop infrawatch-redis infrawatch-postgres 2>/dev/null || true
	@docker rm infrawatch-redis infrawatch-postgres 2>/dev/null || true
