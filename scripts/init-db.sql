-- =============================================================================
-- InfraWatch - PostgreSQL / TimescaleDB Initialization Script
-- =============================================================================
-- Habilita as extensoes necessarias para geracao de UUIDs, criptografia e series temporais

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Habilita TimescaleDB se a extensao estiver disponivel na imagem
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
        CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;
    END IF;
END $$;

-- Permissoes no schema public
GRANT ALL ON SCHEMA public TO CURRENT_USER;
