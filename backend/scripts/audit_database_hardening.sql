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
    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'Iniciando Auditoria de Hardening do Banco de Dados...';
    RAISE NOTICE '=========================================================';

    -- 1. Verifica tabelas sem FORCE RLS no schema public
    SELECT count(*) INTO v_unprotected_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN ('alembic_version', 'spatial_ref_sys')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

    IF v_unprotected_rls > 0 THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA (Item 1 & 9): Existem % tabelas sem FORCE ROW LEVEL SECURITY no schema public!', v_unprotected_rls;
    ELSE
        RAISE NOTICE '✔ [Item 1 & 9] FORCE RLS verificado com sucesso em todas as tabelas de dados.';
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
        RAISE WARNING '⚠ [Item 2] statement_timeout global está desativado (0). Certifique-se de configurar por role (ex: infrawatch_app)!';
    ELSE
        RAISE NOTICE '✔ [Item 2] statement_timeout global configurado para: %', v_timeout_val;
    END IF;

    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'Auditoria de Hardening concluída com sucesso!';
    RAISE NOTICE '=========================================================';
END $$;
