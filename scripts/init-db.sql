-- =============================================================================
-- InfraWatch - PostgreSQL Initialization Script
-- =============================================================================
-- Habilita as extensoes necessarias para geracao de UUIDs e operacoes criptograficas

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Permissoes no schema public
GRANT ALL ON SCHEMA public TO CURRENT_USER;
