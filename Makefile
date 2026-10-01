.PHONY: help dev run test lint format up down status

UV = ./.venv/bin/uv

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

dev:
	cd backend && $(UV) run python main.py

run: dev

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
