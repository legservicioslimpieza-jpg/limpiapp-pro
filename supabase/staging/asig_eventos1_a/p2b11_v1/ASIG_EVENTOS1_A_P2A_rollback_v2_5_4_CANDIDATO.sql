-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · ROLLBACK v2.5.4 CANDIDATO (Fable B2: membresía ANTES del conteo; conteo bajo audit_reader).
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA GATE P2-B1. NO PEGAR EN SUPABASE.
-- v2.5.4 (Fable B2): §0.b (membresía temporal EXPLÍCITA WITH INHERIT TRUE, SET TRUE) se ejecuta ANTES
--   del primer acceso a audit; el conteo corre BAJO SET LOCAL ROLE limpiapp_audit_reader (nunca como
--   postgres, que tras §14 no tiene USAGE en audit); si audit existe pero reader no => estado
--   inconsistente (aborta); en rama con eventos se verifica que el runner no retiene USAGE/SET operativo.
-- v2.5.3: 1/2 membresía temporal del runner (CURRENT_USER) sobre cada rol existente + prueba real
--   SET LOCAL ROLE/RESET ROLE ANTES de eliminar funciones o DROP OWNED BY; 3 rama con eventos revoca
--   membresías de owner/reader antes del COMMIT; 4 rama sin eventos deja que DROP ROLE retire membresías;
--   5/6/7 policy_prov_ok compara qual y with_check COMPLETOS y NORMALIZADOS (rechaza OR true / predicados
--   extra / subqueries distintos), manteniendo permissive/cmd/roles exactos.
-- v2.4.1 corr.3: policy_prov_ok ENDURECIDO -> permissive + cmd + roles EXACTOS + qual y with_check
--   POR SEPARADO (tokens requeridos y prohibidos, sin LIKE laxo); ante cualquier diferencia NO elimina
--   la política y aborta el rollback completo.
-- v2.4 corr.10: verifica DEFINICIÓN + PROCEDENCIA (roles y qual) de cada POLÍTICA LEGACY antes de
--   eliminarla; si no coincide, NO la elimina y aborta. corr.11: saneo editorial de versión.
-- v2.3 corr.9: verifica MARCA + PROPIETARIO + ATRIBUTOS (NOLOGIN/NOBYPASSRLS) de roles y esquemas
--   ANTES de DROP OWNED / DROP ROLE / DROP SCHEMA; si algo no coincide, NO lo elimina y aborta.
-- v2.2: 1 verifica procedencia (marca COMMENT 'ASIG.EVENTOS.1-A/P2-A') y propietarios antes
--   de retirar; 2 revierte default privileges (vía DROP OWNED BY) ANTES de eliminar esquemas/roles;
--   3 NUNCA ejecuta GRANT ALL ON TABLES TO PUBLIC; 4 conserva defaults restrictivos de owner/reader
--   si hay eventos; 5 revoca por rol individualmente; 6 NO silencia con WHEN others THEN NULL;
--   7 aborta y reporta claramente un rollback incompleto (revirtiendo toda la transacción).
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- Helper de procedencia (temporal de sesión): retira una función SOLO si su comentario lleva
-- la marca y su dueño es el esperado; devuelve NULL si OK/ausente, o un mensaje si es ajena.
CREATE FUNCTION pg_temp.drop_func_prov(p_sig text, p_owner text, p_marca text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE f_oid oid; f_owner name; f_comment text;
BEGIN
  f_oid := to_regprocedure(p_sig);
  IF f_oid IS NULL THEN RETURN NULL; END IF;                 -- instalación parcial: no existe
  SELECT r.rolname, obj_description(f_oid,'pg_proc') INTO f_owner, f_comment
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=f_oid;
  IF coalesce(f_comment,'') NOT LIKE '%'||p_marca||'%' OR f_owner IS DISTINCT FROM p_owner THEN
    RETURN format('funcion %s no coincide con la procedencia (dueño=%s, marca=%s)', p_sig, f_owner, coalesce(f_comment,'<sin comentario>'));
  END IF;
  EXECUTE format('DROP FUNCTION %s', p_sig);
  RETURN NULL;
END; $$;

CREATE FUNCTION pg_temp.role_prov_ok(p_role text, p_marca text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r_oid oid; r_comment text; r_canlogin boolean; r_bypassrls boolean;
BEGIN
  SELECT oid, rolcanlogin, rolbypassrls INTO r_oid, r_canlogin, r_bypassrls FROM pg_roles WHERE rolname=p_role;
  IF r_oid IS NULL THEN RETURN NULL; END IF;                       -- ausente: nada que retirar
  r_comment := shobj_description(r_oid,'pg_authid');
  IF coalesce(r_comment,'') NOT LIKE '%'||p_marca||'%' THEN
    RETURN format('rol %s sin marca de procedencia (comentario=%s): NO se elimina', p_role, coalesce(r_comment,'<sin comentario>'));
  END IF;
  IF r_canlogin OR r_bypassrls THEN
    RETURN format('rol %s con atributos inesperados (LOGIN=%s, BYPASSRLS=%s): NO se elimina', p_role, r_canlogin, r_bypassrls);
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION pg_temp.schema_prov_ok(p_schema text, p_owner text, p_marca text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE s_oid oid; s_owner name; s_comment text;
BEGIN
  SELECT n.oid, r.rolname INTO s_oid, s_owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=p_schema;
  IF s_oid IS NULL THEN RETURN NULL; END IF;                       -- ausente
  s_comment := obj_description(s_oid,'pg_namespace');
  IF coalesce(s_comment,'') NOT LIKE '%'||p_marca||'%' OR s_owner IS DISTINCT FROM p_owner THEN
    RETURN format('schema %s no coincide con procedencia (dueño=%s, marca=%s): NO se elimina', p_schema, s_owner, coalesce(s_comment,'<sin comentario>'));
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION pg_temp.norm_expr(e text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  -- Normaliza una expresión de política para comparación COMPLETA (corr.5/6 v2.5.3):
  -- minúsculas + sin espacios + sin paréntesis + sin casts triviales ni prefijo public.
  -- Así detecta 'OR true', predicados extra o subqueries distintos, y es robusta al formato del deparse.
  SELECT regexp_replace(
           translate(lower(regexp_replace(coalesce(e,''), '\s+', '', 'g')), '()', ''),
           '(::text|::name|::bpchar|::"any"|public\.)', '', 'g');
$$;

CREATE FUNCTION pg_temp.policy_prov_ok(
  p_schema text, p_table text, p_policy text,
  p_permissive text, p_cmd text, p_roles text[],
  p_qual_expected text, p_with_check_expected text  -- p_with_check_expected NULL => with_check DEBE ser NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE perm text; cmd text; r name[]; q text; wc text;
BEGIN
  SELECT permissive, cmd, roles, qual, with_check INTO perm, cmd, r, q, wc FROM pg_policies
   WHERE schemaname=p_schema AND tablename=p_table AND policyname=p_policy;
  IF NOT FOUND THEN RETURN NULL; END IF;                          -- ausente: nada que eliminar
  IF perm IS DISTINCT FROM p_permissive THEN                      -- corr.7: permissive EXACTO
    RETURN format('politica %s: permissive=%s != %s: NO se elimina', p_policy, perm, p_permissive); END IF;
  IF cmd IS DISTINCT FROM p_cmd THEN                              -- corr.7: cmd EXACTO
    RETURN format('politica %s: cmd=%s != %s: NO se elimina', p_policy, cmd, p_cmd); END IF;
  IF NOT (r @> p_roles::name[] AND p_roles::name[] @> r) THEN     -- corr.7: roles EXACTOS (igualdad de conjuntos)
    RETURN format('politica %s: roles=%s != %s: NO se elimina', p_policy, r::text, p_roles::text); END IF;
  IF q IS NULL THEN RETURN format('politica %s: qual NULL inesperado: NO se elimina', p_policy); END IF;
  -- corr.5/6: qual COMPLETO y NORMALIZADO (no solo tokens); rechaza OR true / predicados extra / subqueries distintos.
  IF pg_temp.norm_expr(q) IS DISTINCT FROM pg_temp.norm_expr(p_qual_expected) THEN
    RETURN format('politica %s: qual no coincide (normalizado) obtenido=[%s] esperado=[%s]: NO se elimina',
                  p_policy, pg_temp.norm_expr(q), pg_temp.norm_expr(p_qual_expected)); END IF;
  -- with_check evaluado POR SEPARADO (completo y normalizado, o exigido NULL).
  IF p_with_check_expected IS NULL THEN
    IF wc IS NOT NULL THEN RETURN format('politica %s: with_check debia ser NULL (wc=%s): NO se elimina', p_policy, wc); END IF;
  ELSE
    IF wc IS NULL THEN RETURN format('politica %s: with_check NULL inesperado: NO se elimina', p_policy); END IF;
    IF pg_temp.norm_expr(wc) IS DISTINCT FROM pg_temp.norm_expr(p_with_check_expected) THEN
      RETURN format('politica %s: with_check no coincide (normalizado): NO se elimina', p_policy); END IF;
  END IF;
  RETURN NULL;
END; $$;

DO $$
DECLARE
  c_marca text := 'ASIG.EVENTOS.1-A/P2-A';
  v_tabla boolean; v_n bigint := 0; v_incompleto text[] := ARRAY[]::text[]; v_msg text;
  v_owner name; v_comment text;
  v_has_owner  boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_audit_owner');
  v_has_exec   boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_asig_retiro_executor');
  v_has_prep   boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_asig_retiro_preparer');
  v_has_reader boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_audit_reader');
  v_r text; v_u text;
  c_qual_usuarios text := '(id = auth.uid())';
  c_qual_admin text := $q$(EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'administrador'))$q$;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='audit' AND c.relname='asignacion_eventos') INTO v_tabla;
  IF v_tabla THEN
    SELECT r.rolname, obj_description(c.oid,'pg_class') INTO v_owner, v_comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='audit' AND c.relname='asignacion_eventos';
    IF coalesce(v_comment,'') NOT LIKE '%'||c_marca||'%' OR v_owner <> 'limpiapp_audit_owner' THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: audit.asignacion_eventos no coincide con la procedencia (dueño=%, marca=%)', v_owner, coalesce(v_comment,'<sin comentario>');
    END IF;
    -- corr Fable B2 #6: audit existe pero el reader NO => estado INCONSISTENTE; abortar (no continuar).
    IF NOT v_has_reader THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: audit.asignacion_eventos existe pero limpiapp_audit_reader NO existe (estado inconsistente).';
    END IF;
  END IF;

  -- ===== 0.b MEMBRESÍA TEMPORAL DEL RUNNER (corr.1/2 v2.5.3) =====
  -- Tras validar procedencia (marca+atributos) de cada rol EXISTENTE, conceder a CURRENT_USER su
  -- membresía y PROBAR SET LOCAL ROLE/RESET ROLE ANTES de eliminar funciones o ejecutar DROP OWNED BY.
  FOREACH v_r IN ARRAY ARRAY['limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_r) THEN
      v_msg := pg_temp.role_prov_ok(v_r, c_marca);                -- valida marca + NOLOGIN/NOBYPASSRLS
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'ROLLBACK ABORTADO (procedencia de rol): %', v_msg; END IF;
      EXECUTE format('GRANT %I TO CURRENT_USER WITH INHERIT TRUE, SET TRUE', v_r);   -- membresía temporal EXPLÍCITA
      EXECUTE format('SET LOCAL ROLE %I', v_r);                   -- prueba real de asunción
      v_u := current_user; RESET ROLE;
      IF v_u IS DISTINCT FROM v_r THEN
        RAISE EXCEPTION 'ROLLBACK ABORTADO: el runner no pudo asumir el rol % (current_user=%)', v_r, v_u; END IF;
    END IF;
  END LOOP;

  -- corr Fable B2 #5: el CONTEO de eventos se ejecuta BAJO EL REVISOR (SET LOCAL ROLE), nunca como
  -- postgres (que tras §14 no tiene USAGE en audit). La membresía temporal ya se obtuvo arriba.
  IF v_tabla THEN
    SET LOCAL ROLE limpiapp_audit_reader;
    EXECUTE 'SELECT count(*) FROM audit.asignacion_eventos' INTO v_n;
    RESET ROLE;
  END IF;

  -- ===== 1. RUTA DE MUTACIÓN (siempre), con verificación de procedencia =====
  v_msg := pg_temp.drop_func_prov('public.retirar_asignacion_individual(uuid,integer,text,text,text)','limpiapp_asig_retiro_executor',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;
  v_msg := pg_temp.drop_func_prov('public.preparar_retiro_asignacion_individual(integer)','limpiapp_asig_retiro_preparer',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;
  v_msg := pg_temp.drop_func_prov('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)','limpiapp_asig_retiro_executor',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;

  v_msg := pg_temp.policy_prov_ok('public','asignaciones','pol_asig_update_retiro_executor','PERMISSIVE','UPDATE', ARRAY['limpiapp_asig_retiro_executor'], c_qual_admin, c_qual_admin);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
  ELSE DROP POLICY IF EXISTS pol_asig_update_retiro_executor ON public.asignaciones; END IF;
  v_msg := pg_temp.policy_prov_ok('public','asignaciones','pol_asig_select_retiro_roles','PERMISSIVE','SELECT', ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer'], c_qual_admin, NULL::text);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
  ELSE DROP POLICY IF EXISTS pol_asig_select_retiro_roles ON public.asignaciones; END IF;
  -- REVOCACIONES POR ROL INDIVIDUAL (corr.5). REVOKE de privilegio ausente = no-op (sin error).
  IF v_has_exec THEN
    REVOKE UPDATE (activo, estado_asig, fecha_termino_asig) ON public.asignaciones FROM limpiapp_asig_retiro_executor;
    REVOKE SELECT (id, activo, estado_asig, fecha_termino_asig, fecha_inicio_asig, trabajador_id, contrato_id, rol_asignacion, es_asignacion_base) ON public.asignaciones FROM limpiapp_asig_retiro_executor;
    REVOKE USAGE ON SCHEMA app_private FROM limpiapp_asig_retiro_executor;
  END IF;
  IF v_has_prep THEN
    REVOKE SELECT (id, activo, estado_asig, fecha_termino_asig, fecha_inicio_asig, trabajador_id, contrato_id, rol_asignacion, es_asignacion_base) ON public.asignaciones FROM limpiapp_asig_retiro_preparer;
  END IF;
  v_msg := pg_temp.schema_prov_ok('app_private','limpiapp_audit_owner',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
  ELSE DROP SCHEMA IF EXISTS app_private RESTRICT; END IF;

  IF v_tabla THEN
    DROP POLICY IF EXISTS pol_evt_insert_executor ON audit.asignacion_eventos;
    DROP POLICY IF EXISTS pol_evt_select_executor ON audit.asignacion_eventos;
    IF v_has_exec THEN
      REVOKE INSERT ON audit.asignacion_eventos FROM limpiapp_asig_retiro_executor;
      REVOKE SELECT ON audit.asignacion_eventos FROM limpiapp_asig_retiro_executor;
    END IF;
  END IF;
  IF v_has_exec THEN REVOKE USAGE ON SCHEMA audit FROM limpiapp_asig_retiro_executor; END IF;

  IF v_n > 0 THEN
    -- ===== 2a. HAY EVENTOS: conservar lectura administrativa y defaults de owner/reader (corr.4) =====
    RAISE NOTICE 'ROLLBACK PARCIAL: % evento(s). Se conserva la lectura administrativa; evidencia NO eliminada; defaults de owner/reader intactos.', v_n;
    IF v_has_exec THEN REVOKE SELECT (id, rol) ON public.usuarios FROM limpiapp_asig_retiro_executor; END IF;
    IF v_has_prep THEN REVOKE SELECT (id, rol) ON public.usuarios FROM limpiapp_asig_retiro_preparer; END IF;
    IF v_has_exec THEN REVOKE USAGE ON SCHEMA auth FROM limpiapp_asig_retiro_executor; REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_executor; END IF;
    IF v_has_prep THEN REVOKE USAGE ON SCHEMA auth FROM limpiapp_asig_retiro_preparer; REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_preparer; END IF;
    v_msg := pg_temp.policy_prov_ok('public','usuarios','pol_usuarios_select_retiro_roles','PERMISSIVE','SELECT', ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'], c_qual_usuarios, NULL::text);
    IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
    ELSE
      DROP POLICY IF EXISTS pol_usuarios_select_retiro_roles ON public.usuarios;
      IF v_has_reader THEN
        CREATE POLICY pol_usuarios_select_retiro_roles ON public.usuarios FOR SELECT TO limpiapp_audit_reader USING (id = auth.uid());
      END IF;
    END IF;
    -- Revertir default privileges de executor/preparer vía DROP OWNED BY (sin GRANT ALL TO PUBLIC) y eliminarlos.
    IF v_has_prep THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_asig_retiro_preparer', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_asig_retiro_preparer;
        BEGIN DROP ROLE limpiapp_asig_retiro_preparer; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'preparer conserva dependencias'; END;
      END IF;
    END IF;
    IF v_has_exec THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_asig_retiro_executor', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_asig_retiro_executor;
        BEGIN DROP ROLE limpiapp_asig_retiro_executor; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'executor conserva dependencias'; END;
      END IF;
    END IF;
    -- corr.3 v2.5.3: esta rama CONSERVA owner/reader; revocar sus membresías temporales antes del COMMIT.
    -- (exec/preparer se eliminaron con DROP ROLE, lo que ya retira sus membresías).
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_audit_owner')  THEN REVOKE limpiapp_audit_owner  FROM CURRENT_USER; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='limpiapp_audit_reader') THEN REVOKE limpiapp_audit_reader FROM CURRENT_USER; END IF;
    -- corr Fable B2 #8: el runner NO debe conservar USAGE/SET operativo sobre owner/reader (ADMIN estructural puede permanecer).
    IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles gr ON gr.oid=m.member
                WHERE gr.rolname=current_user AND r.rolname IN ('limpiapp_audit_owner','limpiapp_audit_reader')
                  AND (m.inherit_option OR m.set_option)) THEN
      v_incompleto := v_incompleto || 'runner retiene USAGE/SET operativo sobre owner/reader tras revocar (inesperado)';
    END IF;
  ELSE
    -- ===== 2b. SIN EVENTOS: desmontaje completo =====
    v_msg := pg_temp.drop_func_prov('public.listar_eventos_asignacion_admin(integer)','limpiapp_audit_reader',c_marca);
    IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;
    IF v_tabla THEN
      DROP POLICY IF EXISTS pol_evt_select_reader ON audit.asignacion_eventos;
      IF v_has_reader THEN REVOKE SELECT ON audit.asignacion_eventos FROM limpiapp_audit_reader; END IF;
    END IF;
    IF v_has_reader THEN REVOKE USAGE ON SCHEMA audit FROM limpiapp_audit_reader; END IF;
    v_msg := pg_temp.policy_prov_ok('public','usuarios','pol_usuarios_select_retiro_roles','PERMISSIVE','SELECT', ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'], c_qual_usuarios, NULL::text);
    IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
    ELSE DROP POLICY IF EXISTS pol_usuarios_select_retiro_roles ON public.usuarios; END IF;
    IF v_has_exec   THEN REVOKE SELECT (id, rol) ON public.usuarios FROM limpiapp_asig_retiro_executor; END IF;
    IF v_has_prep   THEN REVOKE SELECT (id, rol) ON public.usuarios FROM limpiapp_asig_retiro_preparer; END IF;
    IF v_has_reader THEN REVOKE SELECT (id, rol) ON public.usuarios FROM limpiapp_audit_reader; END IF;
    IF v_has_reader THEN REVOKE USAGE ON SCHEMA auth FROM limpiapp_audit_reader; END IF;
    IF v_has_exec   THEN REVOKE USAGE ON SCHEMA auth FROM limpiapp_asig_retiro_executor; REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_executor; END IF;
    IF v_has_prep   THEN REVOKE USAGE ON SCHEMA auth FROM limpiapp_asig_retiro_preparer; REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_preparer; END IF;

    IF v_tabla THEN DROP TABLE audit.asignacion_eventos; END IF;   -- vacía en esta rama
    v_msg := pg_temp.schema_prov_ok('audit','limpiapp_audit_owner',c_marca);
    IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
    ELSE DROP SCHEMA IF EXISTS audit RESTRICT; END IF;

    -- corr.4 v2.5.3: en esta rama se eliminan los CUATRO roles; DROP ROLE retira sus membresías
    -- (incluida la temporal de CURRENT_USER). No se revocan explícitamente.
    IF v_has_prep THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_asig_retiro_preparer', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_asig_retiro_preparer;
        BEGIN DROP ROLE limpiapp_asig_retiro_preparer; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'preparer conserva dependencias'; END;
      END IF;
    END IF;
    IF v_has_exec THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_asig_retiro_executor', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_asig_retiro_executor;
        BEGIN DROP ROLE limpiapp_asig_retiro_executor; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'executor conserva dependencias'; END;
      END IF;
    END IF;
    IF v_has_reader THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_audit_reader', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_audit_reader;
        BEGIN DROP ROLE limpiapp_audit_reader; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'reader conserva dependencias'; END;
      END IF;
    END IF;
    IF v_has_owner THEN
      v_msg := pg_temp.role_prov_ok('limpiapp_audit_owner', c_marca);
      IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
      ELSE
        DROP OWNED BY limpiapp_audit_owner;
        BEGIN DROP ROLE limpiapp_audit_owner; EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto := v_incompleto || 'owner conserva dependencias'; END;
      END IF;
    END IF;
  END IF;

  -- ===== 3. Aborto/reporte si quedó incompleto (corr.7) =====
  IF array_length(v_incompleto,1) IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETO (se revierte toda la transacción): %', array_to_string(v_incompleto, ' | ');
  END IF;
END $$;

COMMIT;
-- =====================================================================
-- ROLLBACK DE APLICACIÓN (React) — DOCUMENTADO POR SEPARADO, NO ES SQL:
--   * Reemplazar App_8D5 candidato v2.3 (React vigente) por el canónico. Movilidad/desvinculación no tocadas.
--   * NO elimina eventos ya creados.
-- =====================================================================
