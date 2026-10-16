---
name: docker-compose-secrets-pattern
description: Diretrizes e padrão arquitetural para gerenciamento seguro de segredos e senhas no Docker Compose utilizando Docker Secrets em vez de variáveis de ambiente em texto puro. Cobre montagem em /run/secrets, convenção _FILE, leitura nativa na aplicação, scripts de inicialização com chmod 600 e integração com Makefile.
---

# Padrão de Compose Seguro com Docker Secrets (Docker Compose Secrets Pattern)

Esta skill padroniza o gerenciamento seguro de senhas, chaves de API, tokens e certificados em ambientes multi-container orquestrados com **Docker Compose**. Ela elimina o risco crítico de vazamento de credenciais em variáveis de ambiente (`environment:` / `.env`) e orienta a transição completa para **Docker Secrets** montados em memória (`/run/secrets/`).

---

## 🚫 Por que NUNCA colocar senhas em `environment:` ou `.env`?

Declarar senhas diretamente no bloco `environment:` do compose ou depender exclusivamente de arquivos `.env` apresenta quatro vulnerabilidades graves:

| Vetor de Risco | Como o vazamento ocorre |
| :--- | :--- |
| **`docker inspect`** | Qualquer operador ou script com acesso ao daemon Docker pode rodar `docker inspect <container>` e ler todas as variáveis de ambiente em **texto puro**. |
| **Tabela de Processos (`/proc`)** | O Linux expõe as variáveis de ambiente em `/proc/<pid>/environ`. Qualquer usuário no host ou ferramenta de monitoramento que inspecione processos pode ler as credenciais. |
| **Herança de Processos Filhos** | Todo processo filho (fork/exec) herda todas as variáveis do processo pai, propagando senhas para comandos de terceiros, sub-shells e scripts utilitários. |
| **Crash Dumps & Logs** | Frameworks web, APMs e ferramentas de tracing frequentemente realizam dump de `os.environ` / `process.env` em erros 500, gravando senhas em arquivos de log e plataformas externas (ex.: Sentry). |
| **Vazamento no Git** | Arquivos `.env` ou `docker-compose.yml` com senhas em texto puro são frequentemente versionados por engano em commits públicos ou semi-privados. |

---

## 🏛️ A Arquitetura do Docker Secrets

Com Docker Secrets, as credenciais não residem em variáveis de ambiente globais. Em vez disso:
1. O host lê o segredo de um arquivo local protegido por permissão restrita (`chmod 600`).
2. O Docker monta esse segredo dentro do container como um arquivo isolado em um sistema de arquivos virtual em memória RAM (**tmpfs**) em `/run/secrets/<nome_do_segredo>`.
3. O segredo nunca é gravado no disco do container nem exposto no `docker inspect`.

---

## 🔧 Os 4 Padrões Canônicos de Consumo

### 1. Padrão A: Imagens Oficiais com Suporte à Convenção `_FILE`
Imagens de bancos de dados modernos (PostgreSQL, MariaDB, MySQL) possuem suporte nativo à leitura de segredos via sufixo `_FILE`.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: infrawatch-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: infrawatch_db
      POSTGRES_USER: infrawatch_user
      # ✅ NUNCA POSTGRES_PASSWORD! Aponte para o arquivo do secret:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password

  mariadb:
    image: mariadb:10.11
    container_name: infrawatch-mariadb
    environment:
      MYSQL_DATABASE: glpidb
      MYSQL_USER: glpi
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/glpi_db_root_password
      MYSQL_PASSWORD_FILE: /run/secrets/glpi_db_password
    secrets:
      - glpi_db_root_password
      - glpi_db_password

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  glpi_db_root_password:
    file: ./secrets/glpi_db_root_password.txt
  glpi_db_password:
    file: ./secrets/glpi_db_password.txt
```

---

### 2. Padrão B: Inicialização via Comando / Flags (`cat /run/secrets/...`)
Para containers que aceitam senhas via parâmetros de CLI (ex.: Redis), leia o conteúdo do secret no comando de inicialização com expansão escapada (`$$`):

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: infrawatch-redis
    restart: unless-stopped
    # ✅ Usa $$ para que o Compose não expanda no host, mas sim dentro do sh do container:
    command: ["/bin/sh", "-c", "redis-server --appendonly yes --requirepass $$(cat /run/secrets/redis_password)"]
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a $$(cat /run/secrets/redis_password) ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 5
    secrets:
      - redis_password

secrets:
  redis_password:
    file: ./secrets/redis_password.txt
```

---

### 3. Padrão C: Aplicações Próprias com Entrypoint Wrapper no Dockerfile (`entrypoint.sh`)
Em aplicações desenvolvidas internamente (Python/FastAPI, Node.js, Go), **NUNCA acople o código da aplicação lendo caminhos de `/run/secrets/`**. O código deve permanecer 100% agnóstico à infraestrutura e em conformidade com o **12-Factor App**, consumindo apenas variáveis de ambiente normais (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, etc.).

A responsabilidade de extrair os segredos montados pelo Docker e exportá-los para o ambiente do processo é da **camada de container**, através de um script de entrypoint (`entrypoint.sh`):

**`backend/entrypoint.sh`:**
```bash
#!/bin/sh
set -e

# Exporta segredos de /run/secrets/ como variáveis de ambiente no container
if [ -d "/run/secrets" ]; then
    for secret_path in /run/secrets/*; do
        if [ -f "$secret_path" ]; then
            secret_name=$(basename "$secret_path")
            secret_val=$(cat "$secret_path" 2>/dev/null | tr -d '\r\n')

            case "$secret_name" in
                postgres_password) export POSTGRES_PASSWORD="$secret_val" ;;
                redis_password)    export REDIS_PASSWORD="$secret_val" ;;
                secret_key)        export SECRET_KEY="$secret_val" ;;
                whatsapp_token)    export WHATSAPP_API_TOKEN="$secret_val" ;;
                *)
                    env_var=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')
                    export "$env_var"="$secret_val"
                    ;;
            esac
        fi
    done
fi

# Executa o comando da aplicação (uvicorn, python -m worker, etc.)
exec "$@"
```

**`backend/Dockerfile.api` / `Dockerfile.worker`:**
```dockerfile
COPY --chown=appuser:appgroup entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

No `docker-compose.yml`:
```yaml
services:
  infrawatch-api:
    build:
      context: ./backend
      dockerfile: Dockerfile.api
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_USER: infrawatch_user
      POSTGRES_DB: infrawatch_db
      # ✅ Zero senhas aqui! O entrypoint exportará POSTGRES_PASSWORD, REDIS_PASSWORD e SECRET_KEY:
    secrets:
      - postgres_password
      - redis_password
      - secret_key
```

---

### 4. Padrão D: Imagens de Terceiros com Wrapper de Entrypoint
Para containers de terceiros legados que só aceitam credenciais via variáveis de ambiente específicas (ex.: gateways, webhooks, Evolution API), utilize um wrapper no `entrypoint` que lê o secret e exporta temporariamente antes do binário principal:

```yaml
services:
  infrawatch-whatsapp-gateway:
    image: atendai/evolution-api:v2.2.3
    container_name: infrawatch-whatsapp-gateway
    restart: unless-stopped
    # ✅ Lê do secret no boot e executa o processo principal sem gravar em disco:
    entrypoint: ["/bin/sh", "-c", "export AUTHENTICATION_API_KEY=$$(cat /run/secrets/whatsapp_token 2>/dev/null || echo \"$$AUTHENTICATION_API_KEY\"); exec npm run start:prod"]
    environment:
      SERVER_URL: http://localhost:8085
    secrets:
      - whatsapp_token

secrets:
  whatsapp_token:
    file: ./secrets/whatsapp_token.txt
```

---

## 🛠️ Automação e Ciclo de Vida Local (Makefile + Git)

Para que a equipe de desenvolvimento não sofra fricção ao clonar o projeto e subir a infraestrutura:

### 1. Estrutura de Diretórios
```text
projeto/
├── secrets/                   # Ignorado pelo Git (exceto .gitkeep)
│   ├── .gitkeep
│   ├── postgres_password.txt  # Permissão 600 (gerado localmente)
│   ├── redis_password.txt     # Permissão 600
│   └── secret_key.txt         # Permissão 600
├── scripts/
│   └── init-secrets.sh        # Script automatizado com idempotência
├── Makefile                   # Alvos automáticos secrets-init e secrets-clean
└── docker-compose.yml         # Declaração dos secrets apontando para ./secrets/
```

### 2. Regra Estrita no `.gitignore`
```gitignore
# Segredos locais e credenciais do Docker Compose
secrets/*.txt
secrets/*.key
secrets/*.pem
!secrets/.gitkeep
```

### 3. Script de Inicialização Idempotente (`scripts/init-secrets.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"
mkdir -p "${SECRETS_DIR}"

create_secret_if_missing() {
    local file_path="${SECRETS_DIR}/$1"
    local default_val="$2"

    if [[ ! -f "${file_path}" ]]; then
        echo -n "${default_val}" > "${file_path}"
        chmod 600 "${file_path}"
        echo "[+] Segredo criado: secrets/$1"
    else
        echo "[.] Segredo já existente: secrets/$1"
    fi
}

echo "=== Inicializando segredos do Docker Compose ==="
create_secret_if_missing "postgres_password.txt" "${POSTGRES_PASSWORD:-infrawatch_secure_password_2026}"
create_secret_if_missing "redis_password.txt" "${REDIS_PASSWORD:-redis_secure_password_2026}"
create_secret_if_missing "secret_key.txt" "${SECRET_KEY:-infrawatch_dev_secret_key_change_in_production}"
create_secret_if_missing "whatsapp_token.txt" "${WHATSAPP_API_TOKEN:-infrawatch_whatsapp_secret_token_2026}"
chmod 600 "${SECRETS_DIR}"/*.txt 2>/dev/null || true
echo "=== Todos os segredos configurados com permissões restritas (600) ==="
```

### 4. Integração no `Makefile`
Garanta que qualquer comando que execute `docker compose up` dependa de `secrets-init`:

```makefile
.PHONY: secrets-init secrets-clean up down

secrets-init:
	@./scripts/init-secrets.sh

secrets-clean:
	@echo "Removendo arquivos de segredos locais..."
	@rm -f secrets/*.txt
	@echo "Segredos locais removidos com sucesso."

# ✅ Sempre inicializa os segredos antes de subir os containers
up: secrets-init
	docker compose up -d

down:
	docker compose down
```

---

## 📌 Fixação Estrita de Versões de Imagens (Proibição Absoluta de `:latest`)

Usar `:latest` ou tags flutuantes (ex.: `*-latest`, `latest-*`) em imagens de containers é uma **má prática crítica** que compromete a reprodutibilidade, estabilidade e segurança do projeto:

### ⚠️ Por que `:latest` é Proibido?
1. **Quebra Silenciosa de Compatibilidade:** Atualizações automáticas de versão upstream podem introduzir breaking changes em engines de banco de dados (ex.: migração de formato interno de páginas ou extensões no PostgreSQL/TimescaleDB), corrompendo ou invalidando dados persistidos em volumes locais.
2. **Inconsistência entre Ambientes:** Dois desenvolvedores que rodarem `docker compose pull` em dias diferentes baixarão binários distintos com comportamentos divergentes, tornando bugs intermitentes e difíceis de reproduzir.
3. **Quebra de Pipelines de CI/CD:** Builds determinísticos tornam-se imprevisíveis caso a tag `latest` passe a apontar para uma nova major/minor com incompatibilidades de dependências ou flags de inicialização.

### 🛡️ Regra Arquitetural
- **Definir Especificamente a Versão ou Adotar a Penúltima Versão Estável:**
  - Sempre especificar tags semver imutáveis (ex.: `timescale/timescaledb:2.16.1-pg16`, `redis:7.4-alpine`, `zabbix/zabbix-server-pgsql:alpine-7.0.31`, `tecnativa/docker-socket-proxy:0.1.1`).
  - Para ferramentas e bancos de dados corporativos, priorizar a **versão específica testada** ou a **penúltima versão estável/LTS**, garantindo maturidade de patches e ausência de regressões de versões recém-lançadas.
  - Caso o repositório upstream de uma imagem de terceiro não disponibilize tags semver no registro de contêineres (ex.: `diouxx/glpi`, que mantém apenas a base `latest` e faz download interno de releases), deve-se fixar estritamente a versão da aplicação via variável de ambiente (ex.: `VERSION_GLPI: "10.0.16"`).
  - **Exemplos Canônicos:**
    - ❌ `image: timescale/timescaledb:latest-pg16`
    - ✅ `image: timescale/timescaledb:2.16.1-pg16`
    - ❌ `image: zabbix/zabbix-server-pgsql:alpine-7.0-latest`
    - ✅ `image: zabbix/zabbix-server-pgsql:alpine-7.0.31`
    - ❌ `image: redis:latest`
    - ✅ `image: redis:7.4-alpine`
    - ❌ `image: tecnativa/docker-socket-proxy:latest`
    - ✅ `image: tecnativa/docker-socket-proxy:0.1.1`

---

## 📋 Checklist de Auditoria para PRs de Docker Compose

Antes de aprovar ou commitar qualquer alteração em arquivos `docker-compose*.yml`, valide:

- [ ] **Zero Senhas em `environment`:** Nenhuma variável terminada em `_PASSWORD`, `_SECRET`, `_KEY` ou `_TOKEN` está declarada em texto plano no bloco `environment:`.
- [ ] **Bloco `secrets:` nos Serviços:** Cada container que necessita de credenciais declara formalmente os segredos em sua seção `secrets:`.
- [ ] **Bloco `secrets:` na Raiz:** Todos os segredos consumidos estão mapeados no topo do compose apontando para `./secrets/<nome>.txt`.
- [ ] **Permissões 600:** Os arquivos em `./secrets/` foram criados com `chmod 600` (somente leitura/escrita pelo proprietário).
- [ ] **Gitignore Protegido:** O `.gitignore` ignora `secrets/*.txt` para impedir commit acidental no repositório.
- [ ] **Idempotência no Makefile:** O `make up` chama `secrets-init` automaticamente sem quebrar ambientes de CI ou desenvolvedores recém-chegados.
- [ ] **Fixação Estrita de Versões (Zero `:latest`):** Nenhuma imagem declarada em `image:` utiliza `:latest`, `*-latest` ou tags dinâmicas não versionadas. Todas as imagens possuem versões específicas ou penúltima versão estável fixadas.
