-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · PRUEBAS SQL/RPC (STAGING) v2.5.4 (roles: audit_reader / authenticated)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA GATE P2-B1. NO PEGAR EN SUPABASE (usar psql).
-- v2.5.4 (Fable B1/A1): el runner (postgres) NO lee audit.* ni invoca las RPC públicas como postgres.
--   * Lecturas audit.* SOLO bajo SET LOCAL ROLE limpiapp_audit_reader ... RESET ROLE.
--   * RPC públicas SOLO bajo SET LOCAL ROLE authenticated + claims JWT.
--   * El runner se AUTO-CONCEDE membresía TEMPORAL del reader (WITH INHERIT FALSE, SET TRUE),
--     revertida por el ROLLBACK final; no retiene acceso operativo fuera de esta transacción.
--   * No depende de que se hayan aplicado los ALTER DEFAULT PRIVILEGES legacy.
-- Fixture SINTÉTICA ZZ-FIXT. Todo corre en UNA transacción que se REVIERTE al final (ROLLBACK).
-- =====================================================================

\set ON_ERROR_STOP on
-- Ejecutar además con: psql -X -v ON_ERROR_STOP=1  (Session Pooler 5432 o conexión directa; NUNCA 6543)
BEGIN;

-- check_asserts DENTRO de la transacción + verificación.
SET plpgsql.check_asserts = on;
DO $$ BEGIN IF current_setting('plpgsql.check_asserts') <> 'on' THEN
  RAISE EXCEPTION 'PRUEBAS ABORTADAS: plpgsql.check_asserts no está on (las aserciones no protegerían)'; END IF; END $$;

-- BLOQUEANTE 1 (Fable): el runner no puede leer audit como postgres tras §14. Verifica ADMIN OPTION
-- sobre limpiapp_audit_reader y se auto-concede membresía TEMPORAL con SET (revertida por el ROLLBACK).
DO $adm$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r  ON r.oid = m.roleid
      JOIN pg_roles gr ON gr.oid = m.member
     WHERE r.rolname='limpiapp_audit_reader' AND gr.rolname=current_user AND m.admin_option
  ) THEN
    RAISE EXCEPTION 'PRUEBAS ABORTADAS: el runner (%) no conserva ADMIN OPTION sobre limpiapp_audit_reader; no puede auto-concederse SET ROLE.', current_user;
  END IF;
END $adm$;
GRANT limpiapp_audit_reader TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

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
DECLARE fxr record; r jsonb; ok_deneg boolean := false;
BEGIN
  SELECT * INTO fxr FROM fx;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',fxr.admin_uid)::text, true);
  SET LOCAL ROLE authenticated;
  r := public.preparar_retiro_asignacion_individual(fxr.asig_ok);
  ASSERT (r->>'error') IS NULL AND length(r->>'token_anti_stale')=64,
         'AUTH-ROLE: authenticated+admin debía preparar y devolver token';
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
        v_activo boolean; v_estado text; n0 bigint; n1 bigint;
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
-- GRUPO S · SEGURIDAD (appender inaccesible para authenticated)
-- =========================
DO $$
DECLARE fxr record; ok boolean := false;
BEGIN
  SELECT * INTO fxr FROM fx;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM app_private.registrar_evento_asignacion(
      gen_random_uuid(),'x',fxr.asig_ok,'t','c','asignacion_retirada_individual',
      ARRAY['operacional'],NULL,'{}'::jsonb,'motivo suficiente',gen_random_uuid(),NULL,
      'erp_sesion_usuario','x',1::smallint);
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  RESET ROLE;
  ASSERT ok, 'S5 appender por authenticated debía dar insufficient_privilege';
  RAISE NOTICE 'GRUPO S OK';
END $$;

ROLLBACK;   -- REVIERTE TODO (incluida la membresía temporal del reader y la fixture).

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
-- FIN PRUEBAS v2.5.4 — NO EJECUTADAS.
