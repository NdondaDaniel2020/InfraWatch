# InfraWatch — Checklist de Hardening e Blindagem de Banco de Dados para Produção

> **Documento:** 09-DATABASE_PRODUCTION_HARDENING_CHECKLIST.md  
> **Status:** Ativo / Guia Mandatório de Pré-Deploy  
> **Escopo:** PostgreSQL 16+ / TimescaleDB / InfraWatch Backend  
> **Referência:** Boas Práticas de Engenharia, Zero-Trust e Mitigação de Falhas de IA  

---

## Sumário Executivo

Modelos de Inteligência Artificial e geradores de código frequentemente geram schemas e migrações funcionais, porém negligenciam proteções fundamentais de segurança em nível de persistência (PostgreSQL). Este documento consolida o **Checklist Oficial dos 10 Mandamentos de Segurança do Banco de Dados** para assegurar que nenhum deploy suba para produção com brechas de isolamento multi-tenant, travamento de conexões ou escalonamento de privilégios.

---

## Matriz Resumo dos 10 Pontos de Hardening

| # | Ponto Crítico | Risco Principal | Ação Corretiva Mandatória | Status no InfraWatch |
|---|---------------|-----------------|---------------------------|----------------------|
| **1** | **FORCE Row Level Security** | Dono da tabela e `SECURITY DEFINER` contornam o RLS padrão. | `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` | Aplicar em tabelas multi-tenant |
| **2** | **statement_timeout por Conexão** | Query analítica pesada esgota conexões e derruba a instância. | `ALTER ROLE ... SET statement_timeout = '5s';` | Configurar no pool asyncpg |
| **3** | **search_path Fixo em Funções** | Sequestro de schema (Schema Poisoning / Trojan) em functions. | `SET search_path = pg_catalog, public;` em DDL | Padronizar em triggers/functions |
| **4** | **Integridade na Persistência** | Bypass de validação da API via script direto ou worker async. | `CHECK`, `NOT NULL`, `UNIQUE` e `FOREIGN KEY` estritos | Implementado via Alembic |
| **5** | **Exposição de Colunas via VIEW** | Vazamento de credenciais (`password_hash`, tokens) em `SELECT *`. | Views sanitizadas com mascaramento e `REVOKE` | Views operacionais e DTOs |
| **6** | **Revogação de Privilégios no Public** | Usuários não-admin criando objetos no schema `public`. | `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` | Script de inicialização DB |
| **7** | **Backup com Restauração Validada** | Backup corrompido ou irrecuperável na hora do desastre. | Rotina automatizada de restore drill em sandbox | Validado (Política 3-2-1) |
| **8** | **Trilha de Auditoria de Leitura** | Incapacidade de determinar o raio de alcance de um vazamento. | Registro de acessos a dados sensíveis (`pgaudit` / log) | Audit trail em mutações / read log |
| **9** | **RLS Verificado Tabela a Tabela** | Migração nova esquecer de habilitar RLS. | Query de validação automatizada no pipeline de CI/CD | Gate de aprovação CI/CD |
| **10** | **Segregação de Roles e Chaves** | Backend rodando como superuser / bypass de RLS em runtime. | Role de migração (DDL) separado de role de runtime (DML) | Princípio do menor privilégio |

---

## Detalhamento Técnico & Snippets de Implementação

### 1️⃣ FORCE ROW LEVEL SECURITY Habilitado

#### O Risco da IA
O comando padrão gerado por IAs (`ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`) protege apenas contra queries executadas por usuários comuns. Se a aplicação web se conecta como o **proprietário da tabela (table owner)** ou executa funções com `SECURITY DEFINER`, o PostgreSQL **ignora silenciosamente as políticas de RLS**. O atacante consegue visualizar dados de todos os tenants.

#### DDL de Correção
```sql
-- Habilita RLS padrão
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE topology_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE topology_edges ENABLE ROW LEVEL SECURITY;

-- OBRIGATÓRIO: Força o RLS mesmo para o proprietário da tabela
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE maintenance_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE topology_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE topology_edges FORCE ROW LEVEL SECURITY;
```

---

### 2️⃣ statement_timeout Definido por Conexão / Role

#### O Risco da IA
A IA não define limites de tempo de execução. Em sistemas de observabilidade com milhões de registros de métricas (TimescaleDB), um `SELECT` sem índice ou com agregações não otimizadas pode travar uma CPU em 100%, reter locks de tabela e esgotar o pool de conexões do backend.

#### DDL de Correção
```sql
-- Limite agressivo para o role da aplicação web (ex: 5 segundos)
ALTER ROLE infrawatch_app SET statement_timeout = '5000ms';

-- Limite específico para workers de relatórios/analytics em background (ex: 30 segundos)
ALTER ROLE infrawatch_worker SET statement_timeout = '30000ms';

-- Verificação da configuração ativa
SHOW statement_timeout;
```

---

### 3️⃣ search_path Fixado nas Funções (Anti-Hijacking)

#### O Risco da IA
IAs costumam escrever funções PL/pgSQL e triggers sem definir explicitamente o `search_path`. Um atacante com permissão de escrita em qualquer schema temporário pode criar tabelas ou operadores maliciosos que substituem os oficiais, executando código malicioso com os privilégios do criador da função (`SECURITY DEFINER`).

#### DDL de Correção
```sql
-- Exemplo de função resiliente com search_path imutável
CREATE OR REPLACE FUNCTION notify_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM pg_notify('outbox_events_channel', NEW.id::text);
    RETURN NEW;
END;
$$;
```

---

### 4️⃣ Integridade Garantida na Camada de Persistência

#### O Risco da IA
Muitos desenvolvedores e IAs confiam cegamente em validadores do FastAPI (Pydantic) ou do frontend (Zod). Porém, rotinas de migração, scripts administrativos ad-hoc ou workers de background podem bypassar a API e inserir dados inconsistentes (e.g. intervalo negativo, SLA de 150%, status inválido).

#### DDL de Correção
```sql
-- Constraints de domínio e integridade semântica
ALTER TABLE devices
    ADD CONSTRAINT chk_devices_interval_range 
        CHECK (interval_seconds BETWEEN 5 AND 86400),
    ADD CONSTRAINT chk_devices_status_valid 
        CHECK (status IN ('UP', 'DEG', 'DOWN', 'MAINT', 'PAUSED')),
    ADD CONSTRAINT chk_devices_protocol_valid 
        CHECK (protocol IN ('ICMP', 'SNMP', 'TCP', 'HTTP', 'HTTPS'));

ALTER TABLE organizations
    ADD CONSTRAINT chk_organizations_sla_target_range 
        CHECK (sla_target_default >= 50.00 AND sla_target_default <= 100.00);

ALTER TABLE incidents
    ADD CONSTRAINT chk_incidents_severity_valid 
        CHECK (severity IN ('critical', 'degraded', 'resolved')),
    ADD CONSTRAINT chk_incidents_dates_coherent 
        CHECK (resolved_at IS NULL OR resolved_at >= started_at);
```

---

### 5️⃣ Exposição de Colunas Sensíveis via VIEW & Mascaramento

#### O Risco da IA
Conceder `SELECT` irrestrito à tabela de credenciais ou tenants expõe hashes (`password_hash`), segredos de MFA (`totp_secret`), chaves de integração do Zabbix/GLPI e PII desnecessário para o consumo operacional diário.

#### DDL de Correção
```sql
-- View higienizada para visualização de usuários por operadores
CREATE OR REPLACE VIEW v_users_safe AS
SELECT 
    id,
    organization_id,
    full_name,
    -- Mascaramento de e-mail (ex: jo***@empresa.ao)
    regexp_replace(email, '(?<=.{2}).(?=.*@)', '*', 'g') AS email_masked,
    role,
    is_active,
    created_at
FROM users;

-- Concede acesso somente à view segura para roles de consulta
REVOKE SELECT ON users FROM infrawatch_readonly;
GRANT SELECT ON v_users_safe TO infrawatch_readonly;
```

---

### 6️⃣ Revogação de Privilégios no Schema public

#### O Risco da IA
Historicamente no PostgreSQL (e em ambientes mal configurados), o papel `PUBLIC` possui privilégio `CREATE` no schema `public`. Isso permite que qualquer usuário autenticado crie tabelas, sobrescreva funções ou esgote o armazenamento do cluster.

#### DDL de Correção
```sql
-- Revoga privilégios globais de criação no schema público
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Concede uso controlado
GRANT USAGE ON SCHEMA public TO infrawatch_app;
GRANT USAGE, CREATE ON SCHEMA public TO infrawatch_migrator;
```

---

### 7️⃣ Backup com Restauração Validada (Drill & RTO/RPO)

#### O Risco da IA
A IA cria um script `pg_dump` no cron e considera o problema resolvido. Backups que nunca foram restaurados frequentemente falham devido a:
- Tabelas com dependências circulares de FK.
- Extensões ausentes no ambiente de recuperação (ex: `timescaledb`, `uuid-ossp`).
- Corrupção silenciosa de arquivos ou chaves de decodificação incorretas.

#### Procedimento Mandatório InfraWatch
1. **Regra 3-2-1 Ativa:**
   - 1 cópia local em storage NVMe.
   - 1 cópia offsite no Google Drive.
   - 1 cópia imutável no Cloudflare R2 (S3-compatible).
2. **Restore Drill Semanal em Sandbox:**
   - Script automatizado restaura o backup em um container efêmero de teste.
   - Executa `SELECT count(*) FROM devices;` e `SELECT count(*) FROM metrics;` para verificar paridade de checksums.
   - Mede o **RTO** (tempo de restauração) e **RPO** (perda potencial de dados).

---

### 8️⃣ Trilha de Auditoria de Leitura (Audit SELECT / Data Access)

#### O Risco da IA
IAs comumente criam tabelas de log para `INSERT`, `UPDATE` e `DELETE`. No entanto, se um atacante ou operador mal-intencionado acessar a base e ler segredos ou relatórios contratuais de outros clientes, o log convencional não registrará nada, impossibilitando a perícia de conformidade (LGPD / RGPD).

#### DDL de Correção
```sql
-- Ativação da extensão pgaudit para tabelas sensíveis
-- (requer shared_preload_libraries = 'pgaudit' no postgresql.conf)
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Audita leitura de tabelas contendo credenciais e configurações confidenciais
ALTER TABLE users SET (pgaudit.log = 'read, write');
ALTER TABLE system_settings SET (pgaudit.log = 'read, write');

-- Registro na aplicação (FastAPI):
-- Todas as rotas de exportação de dados (PDF de SLA, relatórios de auditoria)
-- devem registrar um evento em audit_logs com o operator_id e o tenant consultado.
```

---

### 9️⃣ RLS Verificado em Cada Tabela (Zero Trust RLS Gate)

#### O Risco da IA
Ao longo do ciclo de desenvolvimento, novas migrações são criadas para atender novas funcionalidades (e.g., `topology_nodes`, `outbox_events`). Frequentemente esquece-se de adicionar `ENABLE/FORCE ROW LEVEL SECURITY`, abrindo uma brecha isolada no sistema multi-tenant.

#### Query de Validação Automatizada (CI/CD Pipeline Gate)
```sql
-- Esta query DEVE retornar ZERO linhas antes de qualquer deploy!
-- Caso retorne alguma tabela de dados, o build do CI/CD deve ser abortado imediatamente.
SELECT 
    c.relname AS unprotected_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT IN ('alembic_version', 'spatial_ref_sys')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
```

---

### 🔟 Segregação das Chaves e Roles de Acesso (Least Privilege)

#### O Risco da IA
A IA gera a string de conexão `.env` apontando para o usuário `postgres` (superuser) com senha única. Um ataque de SQL Injection ou falha de RLS em uma query concede controle irrestrito sobre o sistema de arquivos do servidor, execução de comandos (`pg_read_file`, `COPY PROGRAM`) e DDL em tempo de execução.

#### Matriz de Roles Segregados
1. **Role de Migração (`infrawatch_migrator`):**
   - Utilizado **apenas** durante `alembic upgrade head`.
   - Possui permissão de DDL (`CREATE`, `ALTER`, `DROP`).
   - Bloqueado para conexões externas via web.
2. **Role de Runtime da Aplicação (`infrawatch_app`):**
   - Utilizado pelo pool do FastAPI (`asyncpg`).
   - Permissão restrita a DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
   - Submetido estritamente ao `FORCE ROW LEVEL SECURITY`.
   - `statement_timeout = 5s`.
   - Sem permissão de criar tabelas, funções ou alterar schemas.
3. **Role de Relatórios e Auditoria (`infrawatch_readonly`):**
   - Apenas `SELECT`.
   - Acesso exclusivo a views higienizadas.
   - `statement_timeout = 10s`.

---

## Script SQL Automatizado para Auditoria Pré-Deploy

Salve o script abaixo como `backend/scripts/audit_database_hardening.sql` para execução via CI/CD ou pipeline de deploy:

```sql
-- =========================================================================
-- InfraWatch Database Hardening Verification Script
-- Executar antes de qualquer deploy em produção (Exit code != 0 reprova deploy)
-- =========================================================================

DO $$
DECLARE
    v_unprotected_rls integer;
    v_public_create_priv integer;
    v_timeout_val text;
BEGIN
    RAISE NOTICE 'Iniciando Auditoria de Hardening do Banco de Dados...';

    -- 1. Verifica tabelas sem FORCE RLS no schema public
    SELECT count(*) INTO v_unprotected_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('alembic_version')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

    IF v_unprotected_rls > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Existem % tabelas sem FORCE ROW LEVEL SECURITY no schema public!', v_unprotected_rls;
    ELSE
        RAISE NOTICE '✔ FORCE RLS verificado com sucesso em todas as tabelas de dados.';
    END IF;

    -- 2. Verifica se PUBLIC ainda pode criar objetos no schema public
    SELECT count(*) INTO v_public_create_priv
    FROM pg_namespace
    WHERE nspname = 'public'
      AND has_schema_privilege('public', 'public', 'CREATE');

    IF v_public_create_priv > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Privilégio CREATE no schema public ainda está concedido a PUBLIC!';
    ELSE
        RAISE NOTICE '✔ Privilégios no schema public estão devidamente revogados de PUBLIC.';
    END IF;

    -- 3. Verifica se statement_timeout está configurado
    SHOW statement_timeout INTO v_timeout_val;
    IF v_timeout_val = '0' THEN
        RAISE WARNING 'AVISO: statement_timeout global está desativado (0). Certifique-se de configurar por role!';
    ELSE
        RAISE NOTICE '✔ statement_timeout global configurado para: %', v_timeout_val;
    END IF;

    RAISE NOTICE 'Auditoria de Hardening concluída com sucesso!';
END $$;
```

---

## Procedimento de Deploy Recomendado

1. Rodar migrações com o usuário `infrawatch_migrator`:
   ```bash
   alembic upgrade head
   ```
2. Executar o script de auditoria de hardening:
   ```bash
   psql "$DATABASE_URL" -f backend/scripts/audit_database_hardening.sql
   ```
3. Iniciar a aplicação conectando exclusivamente com o role restrito `infrawatch_app`.
