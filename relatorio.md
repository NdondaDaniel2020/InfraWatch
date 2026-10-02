# Relatório de Auditoria: Piores Inconformidades e Falhas Críticas

> **Projeto Auditado:** `InfraWatch` (`/spot/NdDaniel/Code/Estudo/InfraWatch`)  
> **Projeto de Referência:** `Auth` (`/spot/NdDaniel/Code/Estudo/Auth`)  
> **Documento de Regência:** `docs/DECISIONS.md` (ADRs 001 a 025)  
> **Status:** ✅ **Auditoria Concluída e 100% Remediada** — Todas as 7 Inconformidades Resolvidas, Testadas e Mergeadas na `main`.

---

## Executive Summary

O **InfraWatch** passou por auditoria rigorosa com base nas práticas defensivas do projeto de referência `Auth` e nos requisitos das ADRs (001 a 025). As **7 inconformidades graves** identificadas foram sistematicamente tratadas através de GitHub Issues dedicadas, branches isoladas, Conventional Commits em português e Pull Requests com testes automatizados:

1. ✅ **Migrações Alembic Sincronizadas:** Criada a migração `006_create_mfa_and_token_tables.py` com todas as 3 tabelas e 4 colunas ausentes, além de teste de integração que executa `alembic upgrade head` e `downgrade base`.
2. ✅ **Healthcheck do Dockerfile.api:** Corrigido o endpoint do `HEALTHCHECK` no `Dockerfile.api` de `/api/v1/monitoring/health` para `http://localhost:8000/api/health`.
3. ✅ **Proteção do Endpoint `/metrics`:** Protegido via HTTP Basic Auth e Bearer Token com `secrets.compare_digest` contra timing attacks conforme ADR-025.
4. ✅ **Validação de Segredos em Produção:** Implementado `@model_validator` em `Settings` que rejeita inicialização com segredos padrão, fracos (< 32 caracteres), chaves idênticas ou `DEBUG=True`.
5. ✅ **Agendamento dos Workers em Runtime:** Inicialização e encerramento gracioso de `OutboxRelayWorker` e `TokenCleanupWorker` no `lifespan.py`, com proteção anti-log storm e entrypoints CLI standalone (`python -m src.workers...`).
6. ✅ **TTL de Redefinição de Senha:** Parametrizado `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 15` (OWASP) e desacoplado `PaginatedResponse` para `src/core/pagination.py`, eliminando ciclos de importação.
7. ✅ **Testes Automatizados de Migração:** Integrado `test_alembic_migrations.py` na suíte de testes contínuos do `pytest`.

---

## Matriz de Severidade e Status de Resolução

| # | Inconformidade / Falha | ADR / Referência | Severidade | Impacto Original | Resolução / PR | Status |
| :-: | :--- | :---: | :---: | :--- | :---: | :---: |
| **01** | [Alembic Incompleto: 3 tabelas e 4 colunas ausentes](#1-alembic-incompleto-3-tabelas-e-4-colunas-ausentes-nas-migrações) | ADR-008, ADR-022 | 🔴 **CRÍTICO** | Erro de tabela inexistente (`relation does not exist`) no primeiro uso de MFA, reset ou verificação. | [PR #74](https://github.com/NdondaDaniel2020/InfraWatch/pull/74) (Issue #73) | ✅ **Resolvido** |
| **02** | [Healthcheck do Dockerfile.api aponta para rota 404](#2-healthcheck-do-dockerfileapi-inválido-rota-inexistente-404) | ADR-003 | 🔴 **CRÍTICO** | Container marcado permanentemente como `unhealthy`, causando crash loops em orquestradores. | [PR #76](https://github.com/NdondaDaniel2020/InfraWatch/pull/76) (Issue #75) | ✅ **Resolvido** |
| **03** | [Endpoint `/metrics` exposto publicamente sem autenticação](#3-exposição-pública-e-desprotegida-do-endpoint-metrics) | ADR-025 | 🟠 **ALTO** | Vazamento de topologia, latência e nomes internos de componentes para a internet. | [PR #82](https://github.com/NdondaDaniel2020/InfraWatch/pull/82) (Issue #81) | ✅ **Resolvido** |
| **04** | [Ausência de Validação de Segredos Fracos em Produção](#4-ausência-de-validação-de-segredos-padrão-em-produção) | `Auth` Core | 🟠 **ALTO** | Risco de boot com segredos padrão, permitindo falsificação de tokens JWT. | [PR #80](https://github.com/NdondaDaniel2020/InfraWatch/pull/80) (Issue #79) | ✅ **Resolvido** |
| **05** | [Workers `OutboxRelayWorker` e `TokenCleanupWorker` órfãos](#5-workers-outboxrelayworker-e-tokencleanupworker-órfãos-em-runtime) | ADR-002, ADR-024 | 🟡 **MÉDIO** | Eventos outbox estagnados no banco; tokens revogados nunca expurgados. | [PR #78](https://github.com/NdondaDaniel2020/InfraWatch/pull/78) (Issue #77) | ✅ **Resolvido** |
| **06** | [TTL de Token de Redefinição de Senha Excessivo (1h vs 15m)](#6-ttl-excessivo-no-token-de-recuperação-de-senha-1-hora-vs-15-min) | ADR-022 / OWASP | 🟡 **MÉDIO** | Janela de interceptação 4x maior do que a recomendação do OWASP ASVS. | [PR #84](https://github.com/NdondaDaniel2020/InfraWatch/pull/84) (Issue #83) | ✅ **Resolvido** |
| **07** | [Fixtures mascarando falhas estruturais via `create_all`](#7-suíte-de-testes-mascarando-defeitos-estruturais-com-create_all) | ADR-008 | 🟡 **MÉDIO** | Falsa sensação de segurança com testes passando enquanto o banco real falhava. | [PR #74](https://github.com/NdondaDaniel2020/InfraWatch/pull/74) (Issue #73) | ✅ **Resolvido** |

---

## Detalhamento Técnico das Falhas e Remediações

### 1. Alembic Incompleto: 3 tabelas e 4 colunas ausentes nas migrações

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #74](https://github.com/NdondaDaniel2020/InfraWatch/pull/74) (Issue #73)**  
> **Arquivo Criado:** [`backend/alembic/versions/006_create_mfa_and_token_tables.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/alembic/versions/006_create_mfa_and_token_tables.py)

#### Causa Raiz
As migrações anteriores (`001` a `005`) não continham as definições DDL para:
1. Tabela `mfa_methods` (TOTP e códigos de backup).
2. Tabela `password_reset_tokens`.
3. Tabela `email_verification_tokens`.
4. Colunas em `users`: `is_verified`, `mfa_enabled`, `mfa_type`.
5. Coluna em `refresh_tokens`: `device_name`.

#### Resolução Aplicada
- Criada a migração `006_create_mfa_and_token_tables.py` com suporte completo a batch mode para SQLite e PostgreSQL.
- Implementado teste de integração em [`test_alembic_migrations.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/tests/integration/test_alembic_migrations.py) executando `alembic upgrade head`, conferência das tabelas e colunas no schema, `downgrade base` e re-upgrade.

---

### 2. Healthcheck do `Dockerfile.api` Inválido (Rota inexistente 404)

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #76](https://github.com/NdondaDaniel2020/InfraWatch/pull/76) (Issue #75)**  
> **Arquivo Corrigido:** [`backend/Dockerfile.api`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/Dockerfile.api#L54-L56)

#### Causa Raiz
A diretiva `HEALTHCHECK` chamava `curl -f http://localhost:8000/api/v1/monitoring/health`, rota não registrada na aplicação FastAPI.

#### Resolução Aplicada
- Atualizada a linha do `HEALTHCHECK` no `Dockerfile.api` para a rota canônica:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
      CMD curl -f http://localhost:8000/api/health || exit 1
  ```
- Adicionado teste automatizado em `test_docker_compose_config.py` validando estaticamente a URL do healthcheck no Dockerfile.

---

### 3. Exposição Pública e Desprotegida do Endpoint `/metrics`

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #82](https://github.com/NdondaDaniel2020/InfraWatch/pull/82) (Issue #81)**  
> **Arquivos:** [`src/api/dependencies/metrics_auth.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/api/dependencies/metrics_auth.py), [`src/api/main.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/api/main.py#L55-L68)

#### Causa Raiz
O endpoint `/metrics` estava sem autenticação, violando a ADR-025.

#### Resolução Aplicada
- Configurações adicionadas em `Settings`: `PROMETHEUS_METRICS_USER`, `PROMETHEUS_METRICS_PASSWORD` e `METRICS_REQUIRE_AUTH`.
- Criada a dependência `verify_metrics_auth` aceitando HTTP Basic Auth e Bearer Token de serviço, com validação via `secrets.compare_digest` para neutralizar ataques de temporização.
- Rotas `/metrics` e `/api/v1/monitoring/metrics` protegidas.
- Suíte de testes unitários `test_metrics_auth.py` adicionada com 5 cenários (anônimo 401, inválido 401, Basic Auth 200, Bearer token 200 e bypass configurável).

---

### 4. Ausência de Validação de Segredos Padrão em Produção

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #80](https://github.com/NdondaDaniel2020/InfraWatch/pull/80) (Issue #79)**  
> **Arquivo Corrigido:** [`src/core/config.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/core/config.py)

#### Causa Raiz
Valores padrão inseguros de desenvolvimento eram aceitos silenciosamente mesmo com `ENVIRONMENT=production`.

#### Resolução Aplicada
- Adicionado `@model_validator(mode="after")` em `Settings`:
  - Rejeita segredos padrão (`infrawatch_insecure...`, `change-me`, `secret`, etc.).
  - Exige comprimento mínimo de 32 caracteres.
  - Exige que `REFRESH_SECRET_KEY != SECRET_KEY`.
  - Impede a subida com `DEBUG=True` em produção.
- Criada suíte de testes `test_production_config.py` com 7 asserções cobrindo todas as validações e mantendo ergonomia de desenvolvimento nos ambientes `development` e `test`.

---

### 5. Workers `OutboxRelayWorker` e `TokenCleanupWorker` Órfãos em Runtime

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #78](https://github.com/NdondaDaniel2020/InfraWatch/pull/78) (Issue #77)**  
> **Arquivos:** [`src/core/lifespan.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/core/lifespan.py), [`src/workers/`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/workers)

#### Causa Raiz
Os workers assíncronos não eram instanciados no lifespan da API nem possuíam entrypoints CLI para execução como daemons.

#### Resolução Aplicada
- **Lifespan FastAPI:** Adicionada inicialização assíncrona dos workers sob `ENABLE_BACKGROUND_WORKERS`:
  - `OutboxRelayWorker`: conectado com dispatcher que despacha para `ResilientEventBus` e repassa para o `SSEBroadcaster` para entrega in-app aos usuários.
  - `TokenCleanupWorker`: executado sob lock distribuído no Redis.
  - Teardown gracioso cancelando tasks com timeout seguro.
- **Entrypoints CLI Independentes:** Adicionados `run_standalone()` e blocos `if __name__ == "__main__":` em `outbox_relay_worker.py` e `token_cleanup_worker.py` para permitir execução autônoma via containers de workers.
- **Resiliência Anti-Log Storm:** Implementado backoff mínimo de segurança no loop do `OutboxRelayWorker` em caso de exceções não tratadas.
- Criada suíte de testes unitários `test_lifespan_workers.py` com 5 testes.

---

### 6. TTL Excessivo no Token de Recuperação de Senha (1 hora vs 15 min)

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #84](https://github.com/NdondaDaniel2020/InfraWatch/pull/84) (Issue #83)**  
> **Arquivos:** [`src/core/config.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/core/config.py), [`src/contexts/identity/services/auth_service.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/identity/services/auth_service.py), [`src/contexts/identity/services/user_service.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/contexts/identity/services/user_service.py)

#### Causa Raiz
O TTL de 1 hora estava gravado como constante literal (`timedelta(hours=1)`) no código do serviço.

#### Resolução Aplicada
- Adicionado `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = Field(default=15)` e `EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = Field(default=24)` em `Settings`.
- Desacoplado o schema `PaginatedResponse` para [`src/core/pagination.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/src/core/pagination.py), eliminando dependências circulares entre a camada de contexto e a API.
- Atualizados `auth_service.py` e `user_service.py` para usar dinamicamente as configurações.
- Criado teste unitário `test_password_reset_ttl.py` validando a precisão da expiração.

---

### 7. Suíte de Testes Mascarando Defeitos Estruturais com `create_all`

> [!NOTE]
> **Status:** ✅ **Resolvido via [PR #74](https://github.com/NdondaDaniel2020/InfraWatch/pull/74) (Issue #73)**  
> **Arquivo Criado:** [`backend/tests/integration/test_alembic_migrations.py`](file:///spot/NdDaniel/Code/Estudo/InfraWatch/backend/tests/integration/test_alembic_migrations.py)

#### Causa Raiz
As fixtures de teste geravam as tabelas em memória a partir de `Base.metadata.create_all`, ocultando completamente erros de migrações incompletas do Alembic.

#### Resolução Aplicada
- Implementado teste de integração automatizado executando `command.upgrade(alembic_cfg, "head")`, inspeção de tabelas e colunas, `command.downgrade(alembic_cfg, "base")` e re-upgrade.
- Agora qualquer divergência futura entre classes ORM e migrações Alembic quebrará a pipeline de CI/CD imediatamente.

---

## Conclusão da Auditoria

Com a resolução de todos os 7 tópicos:
- O banco de dados está **100% sincronizado** com os modelos ORM.
- Os contêineres Docker sobem com **healthcheck operacional**.
- O endpoint de métricas está **autenticado e protegido**.
- O ambiente de produção possui **validação estrita contra segredos fracos**.
- Os workers de segundo plano estão **ativos e gerenciados no ciclo de vida**.
- Os tokens atendem aos **padrões de segurança OWASP**.
- A suíte de testes agora conta com **177 testes passando com 100% de sucesso**.
