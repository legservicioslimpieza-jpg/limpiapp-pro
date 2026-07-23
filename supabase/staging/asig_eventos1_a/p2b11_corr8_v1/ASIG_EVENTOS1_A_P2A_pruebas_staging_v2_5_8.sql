-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · PRUEBAS SQL/RPC (STAGING) v2.5.8
-- CORR.8: valida owners reales, SET ROLE por ruta y ausencia de privilegios CREATE temporales.
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA GATE P2-B1.1. NO PEGAR EN SUPABASE; usar psql.
-- RPC públicas solo bajo authenticated + claims; audit.* solo bajo audit_reader.
-- Cero GRANT/REVOKE de membresía. Toda la prueba funcional corre en una transacción con ROLLBACK.
-- =====================================================================

\set ON_ERROR_STOP on
-- Ejecutar además con: psql -X -v ON_ERROR_STOP=1  (Session Pooler 5432 o conexión directa; NUNCA 6543)
BEGIN;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'PRUEBAS CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
  END IF;
END $$;

-- check_asserts DENTRO de la transacción + verificación.
SET plpgsql.check_asserts = on;
DO $$ BEGIN IF current_setting('plpgsql.check_asserts') <> 'on' THEN
  RAISE EXCEPTION 'PRUEBAS ABORTADAS: plpgsql.check_asserts no está on (las aserciones no protegerían)'; END IF; END $$;

-- CORR.8: el runner no lee audit como postgres. Debe existir la membresía administrativa
-- SET=TRUE / INHERIT=FALSE creada por la migración, sin ejecutar DDL de membresía en las pruebas.
DO $adm$
DECLARE v_r text;
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS: runner=%; se requiere postgres', current_user;
  END IF;

  FOREACH v_r IN ARRAY ARRAY['limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r  ON r.oid = m.roleid
        JOIN pg_roles gr ON gr.oid = m.member
        JOIN pg_roles go ON go.oid = m.grantor
       WHERE r.rolname=v_r
         AND gr.rolname=current_user
         AND go.rolname=current_user
         AND m.set_option
         AND NOT m.inherit_option
    ) THEN
      RAISE EXCEPTION 'PRUEBAS ABORTADAS: falta membresía SET/no-INHERIT de % sobre %.', current_user, v_r;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r  ON r.oid=m.roleid
      JOIN pg_roles gr ON gr.oid=m.member
     WHERE r.rolname IN ('limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader')
       AND gr.rolname IN ('anon','authenticated','service_role')
  ) THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS: un rol API posee membresía sobre un rol técnico.';
  END IF;

  IF NOT pg_has_role(current_user,'authenticated','SET') THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.8: postgres no puede SET ROLE authenticated';
  END IF;
  SET LOCAL ROLE authenticated;
  IF current_user IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.8: SET ROLE authenticated no tomó efecto';
  END IF;
  RESET ROLE;

  SET LOCAL ROLE limpiapp_audit_reader;
  IF current_user IS DISTINCT FROM 'limpiapp_audit_reader' THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS: SET ROLE reader no tomó efecto';
  END IF;
  RESET ROLE;
END $adm$;

-- FIXTURE SINTÉTICA ZZ-FIXT (creada por staging_fixtures_setup_v1_2.sql). Reversible por el ROLLBACK final.
CREATE TEMP TABLE fx ON COMMIT DROP AS
SELECT
  (SELECT u.id FROM public.usuarios u WHERE u.rol='administrador'          AND u.email LIKE 'zz.fixt.%@example.invalid' LIMIT 1) AS admin_uid,
  (SELECT u.id FROM public.usuarios u WHERE u.rol IS DISTINCT FROM 'administrador' AND u.email LIKE 'zz.fixt.%@example.invalid' LIMIT 1) AS noadmin_uid,
  a.id AS asig_ok,
  to_char(GREATEST(a.fecha_inicio_asig,
                   (now() AT TIME ZONE 'America/Santiago')::date),'YYYY-MM-DD') AS fecha_ok  -- fecha_inicio_asig es date
FROM public.asignaciones a
WHERE a.activo IS TRUE AND a.estado_asig='activa' AND a.fecha_termino_asig IS NULL
  AND a.fecha_inicio_asig IS NOT NULL
  AND a.trabajador_id LIKE 'ZZ-FIXT-%' AND a.contrato_id LIKE 'ZZ-FIXT-%'   -- SOLO fixtures sintéticas
LIMIT 1;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM fx;
  IF r.admin_uid IS NULL OR r.noadmin_uid IS NULL OR r.asig_ok IS NULL OR r.fecha_ok IS NULL THEN
    RAISE EXCEPTION 'FIXTURE SINTÉTICA insuficiente: se requieren usuarios ZZ-FIXT (admin y no-admin) y una asignación ZZ-FIXT-* activa. Ejecute staging_fixtures_setup_v1_2.sql primero.';
  END IF;
  RAISE NOTICE 'FIXTURE SINTÉTICA ZZ-FIXT: asig_ok=% (se revierte al final; no toca producción)', r.asig_ok;
END $$;

-- =========================
-- GRUPO A0 · SESIÓN LIMPIA con claims JSON VACÍOS -> auth.uid() IS NULL
-- =========================
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
BEGIN
  ASSERT auth.uid() IS NULL, 'A0 con claims {} auth.uid() debía ser NULL';
  RAISE NOTICE 'GRUPO A0 OK (auth.uid() IS NULL con claims vacíos)';
END $$;

-- =========================
-- GRUPO AUTH-ROLE · RPC bajo authenticated + claims admin; negación de lectura audit por authenticated
-- =========================
DO $$
DECLARE fxr record; r jsonb; n_list bigint; ok_deneg boolean := false;
BEGIN
  SELECT * INTO fxr FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.admin_uid)::text, true);
  SET LOCAL ROLE authenticated;
  r := public.preparar_retiro_asignacion_individual(fxr.asig_ok);
  ASSERT (r->>'error') IS NULL AND length(r->>'token_anti_stale')=64,
         'AUTH-ROLE: authenticated+admin debía preparar y devolver token';
  SELECT count(*) INTO n_list FROM public.listar_eventos_asignacion_admin(fxr.asig_ok);
  ASSERT n_list=0, 'AUTH-ROLE: listar admin debía funcionar mediante bridge y devolver 0 eventos iniciales';
  -- authenticated NO puede leer la tabla de auditoría directamente (negación esperada).
  BEGIN
    PERFORM 1 FROM audit.asignacion_eventos LIMIT 1;
    ok_deneg := false;
  EXCEPTION WHEN insufficient_privilege THEN ok_deneg := true;
  END;
  RESET ROLE;
  ASSERT ok_deneg, 'AUTH-ROLE: authenticated no debía poder leer audit.asignacion_eventos';
  RAISE NOTICE 'GRUPO AUTH-ROLE OK';
END $$;

-- =========================
-- GRUPO P · PREPARACIÓN  (RPC bajo authenticated; conteos audit bajo audit_reader)
-- =========================
DO $$
DECLARE fxr record; r jsonb; n0 bigint; n1 bigint;
BEGIN
  SELECT * INTO fxr FROM fx;
  SET LOCAL ROLE limpiapp_audit_reader; SELECT count(*) INTO n0 FROM audit.asignacion_eventos; RESET ROLE;

  PERFORM set_config('request.jwt.claims','{}',true);
  SET LOCAL ROLE authenticated;
  r := public.preparar_retiro_asignacion_individual(fxr.asig_ok);
  RESET ROLE;
  ASSERT r->>'error'='AUTH_REQUERIDA', 'P4';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.noadmin_uid)::text, true);
  SET LOCAL ROLE authenticated;
  r := public.preparar_retiro_asignacion_individual(fxr.asig_ok);
  RESET ROLE;
  ASSERT r->>'error'='ROL_NO_AUTORIZADO', 'P2';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.admin_uid)::text, true);
  SET LOCAL ROLE authenticated;
  r := public.preparar_retiro_asignacion_individual(NULL);
  ASSERT r->>'error'='SOLICITUD_INVALIDA' AND r->>'detalle'='asignacion_nula', 'P-nulo';
  r := public.preparar_retiro_asignacion_individual(-999999);
  ASSERT r->>'error'='ASIGNACION_INEXISTENTE', 'P3';
  r := public.preparar_retiro_asignacion_individual(fxr.asig_ok);
  ASSERT (r->>'error') IS NULL AND (r->>'elegible_para_retiro')::boolean AND r->>'codigo_elegibilidad'='ELEGIBLE', 'P1';
  RESET ROLE;

  SET LOCAL ROLE limpiapp_audit_reader; SELECT count(*) INTO n1 FROM audit.asignacion_eventos; RESET ROLE;
  ASSERT n1=n0, 'P1 sin evento';
  RAISE NOTICE 'GRUPO P OK';
END $$;

-- =========================
-- GRUPO D · DOMINIO  (RPC bajo authenticated + claims admin)
-- =========================
DO $$
DECLARE fxr record; tok text; r jsonb; oid uuid := gen_random_uuid();
BEGIN
  SELECT * INTO fxr FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.admin_uid)::text, true);
  SET LOCAL ROLE authenticated;
  tok := (public.preparar_retiro_asignacion_individual(fxr.asig_ok))->>'token_anti_stale';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, '2025/13/40', 'motivo suficiente', tok);  ASSERT r->>'detalle'='fecha_formato','D fecha_formato';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, '2025-02-30', 'motivo suficiente', tok);  ASSERT r->>'detalle'='fecha_invalida','D fecha_invalida';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, 'abc', tok);                 ASSERT r->>'error'='SOLICITUD_INVALIDA','D motivo corto';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, '.....', tok);               ASSERT r->>'error'='SOLICITUD_INVALIDA','D motivo puntuacion';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, NULL, 'motivo suficiente', tok);           ASSERT r->>'detalle'='parametro_nulo','D parametro_nulo';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, 'motivo suficiente', '   '); ASSERT r->>'detalle'='token_vacio','D token_vacio';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, 'motivo suficiente', 'no_coincide'); ASSERT r->>'error'='ESTADO_OBSOLETO','D ESTADO_OBSOLETO';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, E'motivo con\ttab interno', tok); ASSERT r->>'detalle'='motivo_control','D motivo_control (TAB)';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, 'motivo'||chr(133)||'con NEL', tok); ASSERT r->>'detalle'='motivo_control','D motivo_control (U+0085 NEL, C1 no-ASCII)';
  r := public.retirar_asignacion_individual(oid, fxr.asig_ok, '2025/13/40', E'linea1\nlinea2 valida', tok);
  ASSERT r->>'detalle'='fecha_formato','D LF permitido: motivo con LF pasa; falla luego en fecha (fixture intacta)';
  RESET ROLE;
  RAISE NOTICE 'GRUPO D OK';
END $$;

-- =========================
-- GRUPO E/I · RETIRO + IDEMPOTENCIA (revertido por savepoint interno)
--   RPC bajo authenticated; conteos/lecturas audit bajo audit_reader; lectura public como owner.
-- =========================
DO $$
DECLARE fxr record; tok text; oid uuid := gen_random_uuid(); r1 jsonb; r2 jsonb; r3 jsonb;
        v_activo boolean; v_estado text; n0 bigint; n1 bigint; n_list bigint;
        v_mot text := E'\n\nlinea uno   \n   \n  \n\nlinea dos\n\n';
        v_esperado text := E'linea uno\n\nlinea dos';
        v_mot_norm text;
BEGIN
  SELECT * INTO fxr FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.admin_uid)::text, true);

  SET LOCAL ROLE limpiapp_audit_reader; SELECT count(*) INTO n0 FROM audit.asignacion_eventos; RESET ROLE;

  SET LOCAL ROLE authenticated;
  tok := (public.preparar_retiro_asignacion_individual(fxr.asig_ok))->>'token_anti_stale';
  r1 := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, v_mot, tok);
  RESET ROLE;
  ASSERT r1->>'resultado'='created' AND r1->>'codigo_resultado'='ASIGNACION_RETIRADA_INDIVIDUAL', 'E1 created';

  SET LOCAL ROLE limpiapp_audit_reader;
  SELECT motivo_normalizado INTO v_mot_norm FROM audit.asignacion_eventos WHERE evento_id = (r1->>'evento_id')::uuid;
  RESET ROLE;
  ASSERT v_mot_norm = v_esperado, 'M1 motivo_normalizado exacto: ['||coalesce(v_mot_norm,'<null>')||'] esperado ['||v_esperado||']';

  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_list FROM public.listar_eventos_asignacion_admin(fxr.asig_ok);
  RESET ROLE;
  ASSERT n_list=1, 'CORR.5: listar admin debía leer el evento mediante owner reader + bridge auth';

  -- lectura public (postgres owner; force_rls=false): permitido, NO es audit.*
  SELECT activo, estado_asig INTO v_activo, v_estado FROM public.asignaciones WHERE id=fxr.asig_ok;
  ASSERT v_activo IS FALSE AND v_estado='terminada', 'E1 mutacion';

  SET LOCAL ROLE limpiapp_audit_reader; SELECT count(*) INTO n1 FROM audit.asignacion_eventos; RESET ROLE;
  ASSERT n1=n0+1, 'E1 +1 evento';

  SET LOCAL ROLE authenticated;
  r2 := public.retirar_asignacion_individual(oid, fxr.asig_ok, fxr.fecha_ok, v_mot, tok);
  RESET ROLE;
  ASSERT r2->>'resultado'='replayed' AND r2->>'evento_id'=r1->>'evento_id', 'I1 replayed';

  SET LOCAL ROLE limpiapp_audit_reader; SELECT count(*) INTO n1 FROM audit.asignacion_eventos; RESET ROLE;
  ASSERT n1=n0+1, 'I1 sin nuevo evento';

  SET LOCAL ROLE authenticated;
  r3 := public.retirar_asignacion_individual(oid, fxr.asig_ok, to_char((fxr.fecha_ok::date+1),'YYYY-MM-DD'), v_mot, tok);
  RESET ROLE;
  ASSERT r3->>'error'='CONFLICTO_IDEMPOTENCIA', 'I2 conflicto';

  RAISE NOTICE 'GRUPOS E/I OK';
  RAISE EXCEPTION 'ROLLBACK_PRUEBA_E_I';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'ROLLBACK_PRUEBA_E_I' THEN RAISE; END IF;
  BEGIN RESET ROLE; EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE NOTICE 'GRUPOS E/I revertidos (savepoint)';
END $$;

-- =========================
-- GRUPO S · SEGURIDAD (appender y bridge inaccesibles para authenticated)
-- =========================
DO $$
DECLARE fxr record; ok_appender boolean := false; ok_bridge boolean := false;
BEGIN
  SELECT * INTO fxr FROM fx;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM app_private.registrar_evento_asignacion(
      gen_random_uuid(),'x',fxr.asig_ok,'t','c','asignacion_retirada_individual',
      ARRAY['operacional'],NULL,'{}'::jsonb,'motivo suficiente',gen_random_uuid(),NULL,
      'erp_sesion_usuario','x',1::smallint);
    ok_appender := false;
  EXCEPTION WHEN insufficient_privilege THEN ok_appender := true;
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM app_private.current_auth_uid();
    ok_bridge := false;
  EXCEPTION WHEN insufficient_privilege THEN ok_bridge := true;
  END;
  RESET ROLE;
  ASSERT ok_appender, 'S5 appender por authenticated debía dar insufficient_privilege';
  ASSERT ok_bridge, 'CORR.5 bridge por authenticated debía dar insufficient_privilege';
  RAISE NOTICE 'GRUPO S OK';
END $$;

ROLLBACK;   -- REVIERTE fixtures/eventos de prueba; las membresías administrativas CORR.8 son preexistentes.

-- =====================================================================
-- PRUEBA BLOQUEO 1 (P2-A.1-CORR.1): privilegios EXECUTE de las RPC public.* (catálogo; sin audit, sin RPC)
--   Esperado: anon=false, authenticated=true, PUBLIC=false, service_role=false (decisión).
-- =====================================================================
DO $b1$
DECLARE sig text; fname text; anon_x bool; auth_x bool; sr_x bool; pub_x bool;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.preparar_retiro_asignacion_individual(integer)',
    'public.retirar_asignacion_individual(uuid,integer,text,text,text)',
    'public.listar_eventos_asignacion_admin(integer)'] LOOP
    fname := split_part(split_part(sig,'(',1),'.',2);
    anon_x := has_function_privilege('anon',          sig, 'EXECUTE');
    auth_x := has_function_privilege('authenticated', sig, 'EXECUTE');
    sr_x   := has_function_privilege('service_role',  sig, 'EXECUTE');
    SELECT EXISTS (
      SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid=pr.pronamespace,
             LATERAL aclexplode(pr.proacl) a
       WHERE n.nspname='public' AND pr.proname=fname
         AND a.grantee=0 AND a.privilege_type='EXECUTE') INTO pub_x;   -- grantee=0 => PUBLIC
    IF anon_x     THEN RAISE EXCEPTION 'FALLA BLOQUEO1: anon PUEDE ejecutar %', sig; END IF;
    IF NOT auth_x THEN RAISE EXCEPTION 'FALLA BLOQUEO1: authenticated NO puede ejecutar %', sig; END IF;
    IF pub_x      THEN RAISE EXCEPTION 'FALLA BLOQUEO1: PUBLIC tiene EXECUTE en %', sig; END IF;
    IF sr_x       THEN RAISE EXCEPTION 'FALLA BLOQUEO1: service_role PUEDE ejecutar % (decisión: revocado)', sig; END IF;
    RAISE NOTICE 'OK BLOQUEO1 %: anon=false authenticated=true PUBLIC=false service_role=false', sig;
  END LOOP;
END $b1$;


-- =====================================================================
-- PRUEBA CORR.5 · PUENTE AUTH (catálogo; sin invocarlo como roles API)
-- =====================================================================
DO $corr5$
DECLARE
  f oid := to_regprocedure('app_private.current_auth_uid()');
  v_owner name; v_secdef boolean; v_vol char; v_cfg text[];
  v_pub_exec boolean; v_pub_usage boolean;
  r text;
BEGIN
  IF f IS NULL THEN RAISE EXCEPTION 'CORR.5: falta app_private.current_auth_uid()'; END IF;
  SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile, p.proconfig
    INTO v_owner, v_secdef, v_vol, v_cfg FROM pg_proc p WHERE p.oid=f;
  IF v_owner IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'CORR.5: owner bridge=% esperado postgres', v_owner; END IF;
  IF v_secdef IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORR.5: bridge no es SECURITY DEFINER'; END IF;
  IF v_vol IS DISTINCT FROM 's' THEN RAISE EXCEPTION 'CORR.5: bridge no es STABLE (provolatile=%)', v_vol; END IF;
  IF NOT (coalesce(v_cfg,ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog']) THEN
    RAISE EXCEPTION 'CORR.5: search_path bridge no está fijado a pg_catalog (config=%)', v_cfg; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
     WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') INTO v_pub_exec;
  SELECT EXISTS (
    SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a
     WHERE n.nspname='app_private' AND a.grantee=0 AND a.privilege_type='USAGE') INTO v_pub_usage;
  IF v_pub_exec THEN RAISE EXCEPTION 'CORR.5: PUBLIC tiene EXECUTE directo en bridge'; END IF;
  IF v_pub_usage THEN RAISE EXCEPTION 'CORR.5: PUBLIC tiene USAGE directo en app_private'; END IF;

  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(r,'app_private.current_auth_uid()','EXECUTE') THEN
      RAISE EXCEPTION 'CORR.5: % puede ejecutar bridge', r; END IF;
    IF has_schema_privilege(r,'app_private','USAGE') THEN
      RAISE EXCEPTION 'CORR.5: % tiene USAGE en app_private', r; END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'] LOOP
    IF NOT has_function_privilege(r,'app_private.current_auth_uid()','EXECUTE') THEN
      RAISE EXCEPTION 'CORR.5: % no puede ejecutar bridge', r; END IF;
    IF NOT has_schema_privilege(r,'app_private','USAGE') THEN
      RAISE EXCEPTION 'CORR.5: % no tiene USAGE en app_private', r; END IF;
  END LOOP;
  RAISE NOTICE 'CORR.5 PUENTE AUTH OK: owner=postgres; SECURITY DEFINER; STABLE; API denegada; owners técnicos habilitados.';
END $corr5$;


-- =====================================================================
-- PRUEBA CORR.8 · PROPIETARIOS Y PRIVILEGIOS TEMPORALES
-- =====================================================================
DO $corr8owners$
DECLARE
  v text;
BEGIN
  SELECT pg_get_userbyid(nspowner) INTO v FROM pg_namespace WHERE nspname='audit';
  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner schema audit=%',v; END IF;
  SELECT pg_get_userbyid(nspowner) INTO v FROM pg_namespace WHERE nspname='app_private';
  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner schema app_private=%',v; END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='audit' AND c.relname='asignacion_eventos';
  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner tabla audit=%',v; END IF;

  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.8 owner appender'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.preparar_retiro_asignacion_individual(integer)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_preparer' THEN RAISE EXCEPTION 'CORR.8 owner preparar'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.retirar_asignacion_individual(uuid,integer,text,text,text)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.8 owner retirar'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.listar_eventos_asignacion_admin(integer)'))
       IS DISTINCT FROM 'limpiapp_audit_reader' THEN RAISE EXCEPTION 'CORR.8 owner listar'; END IF;

  -- ACL DIRECTA: no confundir capacidad SET ROLE con acceso inmediato del runner.
  IF EXISTS (
    SELECT 1
      FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(
        COALESCE(n.nspacl, acldefault('n', n.nspowner))
      ) a
      JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
     WHERE
       (n.nspname IN ('audit','app_private')
        AND beneficiario.rolname = 'postgres'
        AND a.privilege_type IN ('CREATE','USAGE'))
       OR
       (n.nspname = 'app_private'
        AND beneficiario.rolname = 'limpiapp_asig_retiro_executor'
        AND a.privilege_type = 'CREATE')
       OR
       (n.nspname = 'public'
        AND beneficiario.rolname IN (
          'limpiapp_asig_retiro_executor',
          'limpiapp_asig_retiro_preparer',
          'limpiapp_audit_reader'
        )
        AND a.privilege_type = 'CREATE')
  ) THEN
    RAISE EXCEPTION 'CORR.8 quedó privilegio temporal DIRECTO en ACL de esquema';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('app_private','limpiapp_asig_retiro_executor','USAGE'),
        ('app_private','limpiapp_asig_retiro_preparer','USAGE'),
        ('app_private','limpiapp_audit_reader','USAGE'),
        ('audit','limpiapp_asig_retiro_executor','USAGE'),
        ('audit','limpiapp_audit_reader','USAGE'),
        ('public','limpiapp_asig_retiro_executor','USAGE'),
        ('public','limpiapp_asig_retiro_preparer','USAGE'),
        ('public','limpiapp_audit_reader','USAGE')
      ) esperado(esquema,rol,privilegio)
     WHERE NOT EXISTS (
       SELECT 1
         FROM pg_namespace n
         CROSS JOIN LATERAL aclexplode(
           COALESCE(n.nspacl, acldefault('n', n.nspowner))
         ) a
         JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
        WHERE n.nspname = esperado.esquema
          AND beneficiario.rolname = esperado.rol
          AND a.privilege_type = esperado.privilegio
     )
  ) THEN
    RAISE EXCEPTION 'CORR.8 falta USAGE persistente directo esperado';
  END IF;

  RAISE NOTICE 'CORR.8 OWNERS/ACL TEMPORAL DIRECTA OK';
END $corr8owners$;

-- FIN PRUEBAS v2.5.8 CORR.8 — NO EJECUTADAS.
