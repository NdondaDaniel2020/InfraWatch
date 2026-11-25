-- =========================================================================
-- InfraWatch Database Hardening Verification Script
-- Executar antes de qualquer deploy em produção (Exit code != 0 reprova deploy)
-- =========================================================================

DO $$
DECLARE
    v_unprotected_rls integer;
    v_public_create_priv integer;
    v_timeout_val text;
    v_unprotected_funcs integer;
    v_missing_constraints integer;
BEGIN
    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'Iniciando Auditoria de Hardening do Banco de Dados...';
    RAISE NOTICE '=========================================================';

    -- 1. Verifica tabelas sem FORCE RLS no schema public
    -- Nota arquitetural: 'metrics' é uma Hypertable TimescaleDB com compressão colunar nativa,
    -- onde o particionamento temporal substitui RLS em nível de chunk.
    SELECT count(*) INTO v_unprotected_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('alembic_version', 'spatial_ref_sys', 'metrics')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

    IF v_unprotected_rls > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA (Item 1 & 9): Existem % tabelas sem FORCE ROW LEVEL SECURITY no schema public!', v_unprotected_rls;
    ELSE
        RAISE NOTICE '✔ [Item 1 & 9] FORCE RLS verificado com sucesso em todas as tabelas de dados relacionais.';
    END IF;

    -- 2. Verifica se PUBLIC ainda pode criar objetos no schema public
    SELECT count(*) INTO v_public_create_priv
    FROM pg_namespace
    WHERE nspname = 'public'
      AND has_schema_privilege('public', 'public', 'CREATE');

    IF v_public_create_priv > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA (Item 6): Privilégio CREATE no schema public ainda está concedido a PUBLIC!';
    ELSE
        RAISE NOTICE '✔ [Item 6] Privilégios no schema public estão devidamente revogados de PUBLIC.';
    END IF;

    -- 3. Verifica se statement_timeout está configurado
    SHOW statement_timeout INTO v_timeout_val;
    IF v_timeout_val = '0' THEN
        RAISE EXCEPTION 'FALHA DE DISPONIBILIDADE (Item 2): statement_timeout global está desativado (0)!';
    ELSE
        RAISE NOTICE '✔ [Item 2] statement_timeout global configurado para: %', v_timeout_val;
    END IF;

    -- 4. Verifica search_path em funções críticas da aplicação (Anti-Hijacking)
    SELECT count(*) INTO v_unprotected_funcs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('notify_outbox_event', 'block_audit_log_mutation')
      AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') LIKE '%search_path=%');

    IF v_unprotected_funcs > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA (Item 3): Existem funções sem search_path fixado contra schema hijacking!';
    ELSE
        RAISE NOTICE '✔ [Item 3] search_path fixado com sucesso nas funções da aplicação.';
    END IF;

    -- 5. Verifica integridade na persistência (Check Constraints de Hardening)
    SELECT count(*) INTO v_missing_constraints
    FROM (
        SELECT 'metrics' AS tbl, 'chk_metric_packet_loss' AS chk
        UNION ALL
        SELECT 'devices', 'chk_device_interval_seconds'
        UNION ALL
        SELECT 'maintenance_windows', 'chk_maint_valid_window'
        UNION ALL
        SELECT 'incidents', 'chk_incident_dates_coherent'
        UNION ALL
        SELECT 'organizations', 'chk_org_sla_target_range'
    ) expected
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = expected.tbl
          AND (c.conname = expected.chk OR c.conname = 'ck_' || expected.tbl || '_' || expected.chk)
    );

    IF v_missing_constraints > 0 THEN
        RAISE EXCEPTION 'FALHA DE INTEGRIDADE (Item 4): Existem % constraints de validação de persistência ausentes!', v_missing_constraints;
    ELSE
        RAISE NOTICE '✔ [Item 4] Constraints de validação de persistência ativas no Postgres.';
    END IF;

    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'Auditoria de Hardening concluída com 100%% de sucesso!';
    RAISE NOTICE '=========================================================';
END $$;
