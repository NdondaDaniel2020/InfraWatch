# InfraWatch — Guia Definitivo do Ambiente de Testes, Seeds e Integrações

> **Documento:** 08-TESTING_ENVIRONMENT.md  
> **Status:** Aprovado e Operacional  
> **Referência Técnica:** ADR-015, ADR-028, ADR-031, ADR-034 / Issues #220, #231-#238  
> **Escopo:** Pirâmide de testes, execução de suítes, catálogo de seeds e credenciais, integrações externas (GLPI, Zabbix, WhatsApp, Containerlab) e troubleshooting operacional.

---

## 1. Visão Geral da Arquitetura de Testes

O ecossistema de testes do **InfraWatch** foi projetado seguindo os princípios de Arquitetura Hexagonal, Domain-Driven Design (DDD) e Test-Driven Development (TDD). A garantia de qualidade abrange múltiplos níveis de isolamento, desde regras puras de domínio sem efeitos colaterais até validação de carga de rede com roteamento real e simulação SNMP.

```
                            ▲
                           / \
                          / E2E \         Containerlab + GLPI + Zabbix + Webhook
                         /-------\
                        / Integra- \      TestClient FastAPI + Redis Streams + DB
                       /    ção     \
                      /---------------\
                     / Resiliência /   \   DLQ, Jitter, Idempotency Guard, Workers
                    /    Daemons        \
                   /---------------------\
                  /   Testes Unitários    \  Domínio, Handlers, Schemas, React Vitest
                 /_________________________\
```

### 1.1 Camadas da Pirâmide de Testes

| Camada | Escopo | Ferramentas | Localização dos Arquivos |
| :--- | :--- | :--- | :--- |
| **Unitários Backend** | Regras de negócio, Value Objects, Entidades, Mappers e Schemas. | `pytest`, `unittest.mock`, `pytest-asyncio` | `backend/tests/unit/` |
| **Unitários Frontend** | Renderização de componentes, acessibilidade (a11y), hooks, stores e regras de UI. | `vitest`, `@testing-library/react`, `jsdom` | `frontend/tests/` |
| **Integração Backend** | Rotas HTTP FastAPI, autenticação RBAC, persistência SQL, publicação em Redis Streams. | `FastAPI TestClient`, `httpx`, `pytest-mock` | `backend/tests/integration/` |
| **Resiliência de Daemons** | Workers assíncronos (`ProbeWorker`, `OutboxRelay`, `ZabbixSync`, `TokenCleanup`), backoff exponencial com jitter, DLQ e idempotência. | `pytest-asyncio`, `fakeredis`, `pytest` | `backend/tests/unit/workers/`, `backend/tests/unit/core/` |
| **Integrações Externas** | Validação end-to-end com serviços periféricos ativos (GLPI REST, Zabbix JSON-RPC, WhatsApp Gateway). | Python Scripts (`scripts/test_*.py`) | `scripts/` |
| **Rede & Topologia** | Simulação de topologia de rede ISP/NOC, roteamento BGP/OSPF, agentes SNMP e DNS. | `containerlab`, `snmpsim`, `frrouting` | `test-monitoramento/lab-infrawatch.clab.yml` |

---

## 2. Inicialização e Operação do Ambiente

Toda a infraestrutura de apoio do InfraWatch pode ser orquestrada via `Makefile` e `docker-compose.yml`.

### 2.1 Pré-requisitos
- **Docker Engine** 24.0+ e **Docker Compose** v2.20+
- **Python** 3.12+ (com ambiente virtual configurado em `backend/.venv`)
- **Node.js** 20+ e **npm** 10+ (para o frontend)
- **Make** (GNU Make)
- **Containerlab** 0.50+ (opcional, para testes de rede em `test-monitoramento/`)

### 2.2 Fluxo Rápido de Inicialização

```bash
# 1. Gerar arquivos de segredos locais (em ./secrets/)
make secrets-init

# 2. Inicializar banco de dados TimescaleDB e cache Redis
make container

# 3. Aplicar migrações do Alembic e semear dados de demonstração (Seeds)
make migrate
make seed

# 4. Inicializar GLPI, Zabbix e provisionar tokens de integração
make integration-up

# 5. Executar os servidores de desenvolvimento
make api        # Inicia FastAPI em http://localhost:8000
make front-dev  # Inicia Vite Frontend em http://localhost:3000
```

### 2.3 Orquestração Avançada via Makefile

| Comando Make | Descrição |
| :--- | :--- |
| `make test` | Executa a suíte completa de testes unitários e de integração do backend com `pytest`. |
| `make front-test` | Executa a suíte completa de testes do frontend com `vitest`. |
| `make dev` | Inicializa segredos, sobe containers essenciais e roda migrações automaticamente. |
| `make seed` | Executa a carga idempotente de dados de seed (`backend/src/core/database/seed.py`). |
| `make glpi-up` | Sobe os contêineres MariaDB e GLPI 10. |
| `make zabbix-up` | Sobe PostgreSQL Zabbix, Zabbix Server e Zabbix Web UI. |
| `make bootstrap-integrations` | Provisiona esquemas, tokens e permissões de API no GLPI e Zabbix automaticamente. |
| `make integration-up` | Orquestra GLPI + Zabbix + Bootstrap de tokens de uma só vez. |
| `make integration-test` | Executa scripts pontuais de validação das integrações (`test_glpi.py`, `test_zabbix.py`, `test_notif`). |
| `make clab-deploy` | Inicializa o laboratório de topologia de redes simuladas no Containerlab. |
| `make clab-destroy` | Finaliza e remove os nós virtuais do Containerlab. |
| `make monitoring-test-up` | Sobe a stack completa (Containerlab + GLPI + Zabbix + InfraWatch Core). |
| `make monitoring-test-down` | Derruba toda a stack de teste de forma graciosa. |

---

## 3. Catálogo de Seeds e Credenciais

O módulo `backend/src/core/database/seed.py` provê uma carga idempotente de entidades para testes de interface, validação de regras de acesso (RBAC), multi-tenancy e visualização de métricas de telemetria.

### 3.1 Organizações Semeadas (Multi-Tenant)

| Organização | Slug (`org_slug`) | Tier | SLA Alvo | E-mail de Contato | Finalidade |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **InfraWatch Lab Demo** | `infrawatch-lab` | `ENTERPRISE_GOLD` | 99.50% | `lab@infrawatch.internal` | Tenant principal do NOC e operadores globais. |
| **Banco Sol S.A.** | `banco-sol` | `ENTERPRISE_GOLD` | 99.50% | `gestor.ti@bancosol.ao` | Tenant cliente corporativo bancário. |
| **Unitel Angola** | `unitel-angola` | `ENTERPRISE_GOLD` | 99.90% | `noc.telecom@unitel.ao` | Tenant cliente de telecomunicações / operadora. |
| **Sonangol Logistics** | `sonangol` | `PROFESSIONAL` | 99.00% | `ti@sonangol.ao` | Tenant corporativo setor petrolífero / logística. |

---

### 3.2 Usuários, Perfis RBAC e Senhas

Todos os usuários abaixo são semeados com status `is_active=True`, `is_verified=True` e senhas com hashing criptográfico `Argon2id`:

| E-mail | Senha em Texto Claro | Papel RBAC (`role`) | Organização | Descrição / Uso em Testes |
| :--- | :--- | :--- | :--- | :--- |
| `noc-admin@rcsangola.co.ao` | `Ndonda#2026!Admin` | `SUPER_ADMIN` | `infrawatch-lab` | Administrador master do sistema (definido no `.env`). Acesso irrestrito a configurações, auditoria e todos os tenants. |
| `admin@infrawatch.internal` | `Admin#2026!Global` | `SUPER_ADMIN` | `infrawatch-lab` | Administrador técnico global secundário para testes automatizados. |
| `daniel.ndonda@infrawatch.ao` | `Admin#2026!Global` | `SUPER_ADMIN` | `infrawatch-lab` | Administrador sênior NOC. |
| `operator@infrawatch.internal` | `Operator#2026!Noc` | `NOC_OPERATOR` | `infrawatch-lab` | Operador do NOC nível 1/2. Gerencia incidentes, executa Acknowledge/Resolve e monitora alertas em tempo real. |
| `operador.noc@infrawatch.ao` | `Operator#2026!Noc` | `NOC_OPERATOR` | `infrawatch-lab` | Operador NOC Luanda para testes de escalonamento. |
| `gestor.ti@bancosol.ao` | `Admin#2026!BancoSol` | `ORG_ADMIN` | `banco-sol` | Administrador da organização cliente Banco Sol. Acesso exclusivo aos dados, inventário e relatórios do seu próprio tenant. |
| `viewer@infrawatch.internal` | `Viewer#2026!Client` | `CLIENT_VIEWER` | `infrawatch-lab` | Visualizador read-only do laboratório. Sem permissão de mutação ou ACK de incidentes. |
| `noc.telecom@unitel.ao` | `Viewer#2026!Unitel` | `CLIENT_VIEWER` | `unitel-angola` | Auditor / visualizador externo da Unitel Angola. |
| `viewer@bancosol.ao` | `Viewer#2026!BancoSol` | `CLIENT_VIEWER` | `banco-sol` | Auditor regulatório read-only do Banco Sol. |

---

### 3.3 Matriz de Permissões RBAC para Cenários de Teste

| Capacidade Operacional | `SUPER_ADMIN` | `NOC_OPERATOR` | `ORG_ADMIN` | `CLIENT_VIEWER` |
| :--- | :---: | :---: | :---: | :---: |
| Visualizar TV Wallboard NOC | Sim (Todos os tenants) | Sim (Todos os tenants) | Sim (Apenas seu tenant) | Sim (Apenas seu tenant) |
| Reconhecer Incidentes (`ACK`) | Sim | Sim | Não | Não |
| Resolver Incidentes (`RESOLVE`) | Sim | Sim | Não | Não |
| Criar Janelas de Manutenção | Sim | Sim | Sim (Seu tenant) | Não |
| Gerenciar Usuários da Organização | Sim (Global) | Não | Sim (Seu tenant) | Não |
| Configurar Integrações (GLPI/Zabbix) | Sim | Não | Não | Não |
| Disparar Backups Manuais | Sim | Não | Não | Não |
| Consultar Trilha de Auditoria | Sim (Global) | Sim (Leitura) | Sim (Seu tenant) | Não |

---

## 4. Dispositivos, Métricas e Topologia de Teste

A base semeada contém dispositivos de infraestrutura real e simulada cobrindo todos os protocolos suportados pelo motor de sondas (`ProbeWorker`):

### 4.1 Inventário de Dispositivos de Demonstração

| Nome do Dispositivo | Hostname / IP | Porta | Protocolo | Categoria | Thresholds de Alerta |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | `postgres` | 5432 | `tcp` | `DATABASE` | Latência > 50ms, Perda > 0% |
| **Redis Cache & Streams** | `redis` | 6379 | `tcp` | `DATABASE` | Latência > 30ms, Perda > 0% |
| **InfraWatch Backend API** | `infrawatch-api` | 8000 | `http` | `SERVER` | Latência > 200ms, Perda > 0% |
| **InfraWatch Frontend Web** | `infrawatch-api` | 3000 | `http` | `SERVER` | Latência > 300ms, Perda > 0% |
| **Localhost Gateway** | `infrawatch-api` | 0 | `icmp` | `ROUTER` | Latência > 10ms, Perda > 0% |
| **infrawatch-postgres** | `infrawatch-postgres` | 0 | `docker` | `CONTAINER` | Latência > 100ms, Perda > 0% |
| **infrawatch-redis** | `infrawatch-redis` | 0 | `docker` | `CONTAINER` | Latência > 100ms, Perda > 0% |
| **Router FRR (Core Router)** | `172.28.0.10` | 0 | `icmp` | `ROUTER` | Latência > 10ms, Perda > 0% |
| **Web Server 01 (Nginx)** | `172.28.0.21` | 80 | `http` | `SERVER` | Latência > 50ms, Perda > 0% |
| **Web Server 02 (Nginx)** | `172.28.0.22` | 80 | `http` | `SERVER` | Latência > 50ms, Perda > 0% |
| **DNS Server (CoreDNS)** | `172.28.0.53` | 53 | `tcp` | `SERVER` | Latência > 20ms, Perda > 0% |
| **SNMP Simulator Gateway** | `172.28.0.11` | 161 (UDP) | `snmp` / `icmp` | `ROUTER` | Latência > 10ms, Zabbix Host ID: 10683 |
| **SW-CORE-LUANDA-01** | `10.0.1.1` | 22 | `icmp` | `SWITCH` | Multi-tenant Unitel |
| **API-GATEWAY-PROD** | `10.0.2.15` | 443 | `http` | `SERVER` | Multi-tenant Banco Sol |

### 4.2 Topologia de Redes Virtuais (Containerlab)

O arquivo `test-monitoramento/lab-infrawatch.clab.yml` implementa um ambiente de laboratório para testes de roteamento e coleta de métricas em rede isolada:
- **Rede de Gerência:** `infrawatch-clab-mgmt` (`172.28.0.0/24`)
- **Roteador Core FRR:** `router01` (`172.28.0.10`)
- **Simulador SNMP:** `snmpsim` (`172.28.0.11:161/udp`), mapeado para o host na porta `1161/udp`
- **Servidores Web HTTP:** `web01` (`172.28.0.21:8085`), `web02` (`172.28.0.22:8086`)
- **Servidor DNS:** `dns01` (`172.28.0.53:1053`)

---

## 5. Integrações Externas, Portas e Credenciais de Teste

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INFRAWATCH TEST RUNTIME                         │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ Serviço            │ Endpoint / Porta   │ Credenciais / Tokens         │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ PostgreSQL / Times │ localhost:5432     │ infrawatch_user              │
│                    │                    │ secrets/postgres_password.txt│
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Redis 7.2          │ localhost:6379     │ secrets/redis_password.txt   │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Backend API        │ http://localhost:  │ JWT Bearer Token             │
│                    │ 8000               │ (via /api/v1/iam/login)      │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Frontend Web       │ http://localhost:  │ Login via browser ou mocks   │
│                    │ 3000               │                              │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ GLPI 10 Web UI     │ http://localhost:  │ User: glpi                   │
│                    │ 8080               │ Pass: glpi                   │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ GLPI REST API      │ http://localhost:  │ App-Token: secrets/          │
│                    │ 8080/apirest.php   │ glpi_app_token.txt           │
│                    │                    │ User-Token: secrets/         │
│                    │                    │ glpi_user_token.txt          │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Zabbix 7.0 Web UI  │ http://localhost:  │ User: Admin                  │
│                    │ 8081               │ Pass: zabbix                 │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Zabbix JSON-RPC    │ http://localhost:  │ API Token (Bearer):          │
│                    │ 8081/api_jsonrpc.  │ secrets/zabbix_api_token.txt │
│                    │ php                │                              │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Zabbix Webhook     │ POST /api/v1/      │ Header: X-Zabbix-Token       │
│                    │ alerting/webhook/  │ secrets/zabbix_webhook_      │
│                    │ zabbix             │ token.txt                    │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ WhatsApp Gateway   │ http://localhost:  │ secrets/whatsapp_api_key.txt │
│ (Baileys)          │ 3001               │                              │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

---

## 6. Guia de Execução de Testes Automatizados

### 6.1 Testes Unitários e de Integração do Backend

Para rodar os testes utilizando o virtualenv do backend:

```bash
# Rodar todos os testes do backend
cd backend
.venv/bin/pytest -v

# Rodar apenas testes unitários
.venv/bin/pytest tests/unit/ -v

# Rodar apenas testes de resiliência de mensageria e DLQ
.venv/bin/pytest tests/unit/core/test_resilient_bus.py -v

# Rodar apenas testes de integração HTTP / API
.venv/bin/pytest tests/integration/ -v

# Rodar com relatório de cobertura de código
.venv/bin/pytest --cov=src --cov-report=term-missing
```

### 6.2 Testes do Frontend (Vitest)

```bash
# Rodar testes do frontend em modo single-run
cd frontend
npm run test:run

# Rodar testes em modo interativo com hot-reload
npm run test

# Rodar com cobertura de código
npm run test:coverage
```

### 6.3 Scripts de Validação E2E e Integrações

Os scripts em `scripts/` validam os componentes integrados em tempo de execução real:

#### Validação da API do GLPI 10
Cria sessão REST, consulta inventário, abre um ticket de teste, adiciona acompanhamento privado e finaliza a sessão:
```bash
backend/.venv/bin/python scripts/test_glpi.py
```

#### Validação da API JSON-RPC do Zabbix 7.0
Valida o token de autenticação, consulta a versão da API e lista os hosts monitorados:
```bash
backend/.venv/bin/python scripts/test_zabbix.py
```

#### Validação do Subsistema de Notificações Multicanal
Testa os canais Telegram, WhatsApp, Webhooks e SMTP em modo simulado (`--dry-run`) ou modo real:
```bash
# Teste sintético (Dry-run) de todos os canais
backend/.venv/bin/python scripts/test_notifications.py --dry-run

# Teste disparando para canal específico
backend/.venv/bin/python scripts/test_notifications.py --channel telegram --severity CRITICAL
```

#### Validação do Webhook de Alertas do Zabbix
Simula a chegada de triggers de alta severidade com deduplicação e publicação no Redis Streams:
```bash
backend/.venv/bin/python scripts/test_zabbix_webhook.py --dry-run
```

#### Verificação Pontual dos Coletores de Telemetria (Probers)
Executa uma rodada ao vivo de coleta ICMP, TCP e HTTP contra os nós cadastrados e salva as métricas no banco:
```bash
backend/.venv/bin/python scripts/verify_probes.py
```

---

## 7. Troubleshooting e Resolução de Problemas no Ambiente de Testes

### 7.1 Cenário: Volumes do GLPI ou Zabbix foram Deletados
Se contêineres ou volumes forem recriados (`docker volume rm`), o provisionamento inicial deve ser refeito:

```bash
# Executar o bootstrap automatizado das integrações
bash scripts/bootstrap_integrations.sh
```

O script detecta automaticamente a ausência das tabelas, executa o `database:install` ou `database:configure`, injeta os tokens presentes em `secrets/` e configura os clientes de API sem restrição de IP de bridge.

### 7.2 Cenário: Erro `ERROR_NOT_ALLOWED_IP` no GLPI
- **Causa:** O GLPI restringe clientes REST por range de IP. Ao rodar em Docker, a requisição vem da bridge interna (`172.20.0.1`).
- **Solução:** O script `bootstrap_integrations.sh` já configura `ipv4_range_start = NULL` e `ipv4_range_end = NULL` na tabela `glpi_apiclients` para permitir comunicação entre contêineres.

### 7.3 Cenário: Erro `database is locked` em Testes com SQLite
- **Causa:** SQLite em memória ou em arquivo sofre concorrência em múltiplos workers assíncronos do `pytest-asyncio`.
- **Solução:** Os testes de integração utilizam transações isoladas com `rollback` automático no `conftest.py`. Ao executar testes em paralelo com `-n auto`, utilize fixtures com escopo `function` e conexão única por worker.

### 7.4 Cenário: Arquivos de Segredos Inexistentes em `secrets/`
- **Sintoma:** Falha ao conectar no Redis ou PostgreSQL nos scripts de teste.
- **Solução:** Execute `make secrets-init`. Ele gera senhas criptograficamente seguras para todos os serviços se elas ainda não existirem.

---

## 8. Boas Práticas para Novos Testes

1. **Determinismo:** Testes nunca devem depender de conexões externas de internet. Utilize mocks (`AsyncMock`, `httpx_mock`) para serviços de terceiros.
2. **Idempotência:** Todo teste de integração que realiza escrita no banco deve rodar dentro de uma transação aninhada ou limpar seus dados no `tearDown`.
3. **Sem Hardcode de Segredos:** Use sempre as fixtures ou carregue segredos a partir dos arquivos em `secrets/`.
4. **Isolamento de Tenants:** Qualquer novo teste de rota protegida por RBAC deve validar tanto o caminho feliz quanto a tentativa de acesso cruzado entre tenants (`banco-sol` tentando ler dados de `unitel-angola`).
