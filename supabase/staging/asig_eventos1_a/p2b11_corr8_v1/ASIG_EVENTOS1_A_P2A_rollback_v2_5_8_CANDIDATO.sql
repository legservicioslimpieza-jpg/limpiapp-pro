-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · ROLLBACK v2.5.8 CANDIDATO
-- CORR.8: todas las operaciones de propietario se ejecutan bajo SET LOCAL ROLE; cero DDL de membresía.
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.8 Y NUEVO GATE P2-B1.1.
-- NO PEGAR EN SUPABASE. Ejecutar sin tráfico concurrente y solo por psql autorizado.
--
-- Con eventos: conserva evidencia, audit owner, audit reader, bridge y RPC proyectada de lectura.
-- Sin eventos: desmontaje completo. ACCESS EXCLUSIVE se toma antes del conteo.
-- DROP OWNED se ejecuta como cada rol mediante DROP OWNED BY CURRENT_USER.
-- CORR.8: lógica de desmontaje preservada desde v2.5.7; no depende de has_schema_privilege().
-- Marca de procedencia: 'ASIG.EVENTOS.1-A/P2-A'.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'ROLLBACK CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
  END IF;
END $$;

-- Helper de procedencia: verifica marca/owner y elimina bajo el propietario real mediante SET ROLE.
CREATE FUNCTION pg_temp.drop_func_prov(p_sig text, p_owner text, p_marca text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE f_oid oid; f_owner name; f_comment text;
BEGIN
  f_oid := to_regprocedure(p_sig);
  IF f_oid IS NULL THEN RETURN NULL; END IF;
  SELECT r.rolname, obj_description(f_oid,'pg_proc') INTO f_owner, f_comment
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=f_oid;
  IF coalesce(f_comment,'') NOT LIKE '%'||p_marca||'%' OR f_owner IS DISTINCT FROM p_owner THEN
    RETURN format('funcion %s no coincide con procedencia (dueño=%s, marca=%s)', p_sig, f_owner, coalesce(f_comment,'<sin comentario>'));
  END IF;
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_owner);
    EXECUTE format('DROP FUNCTION %s', p_sig);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    BEGIN RESET ROLE; EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE;
  END;
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
  v_has_audit boolean := EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='audit');
  v_has_private boolean := EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='app_private');
  v_r text; v_u text;
  v_bridge oid; v_bridge_owner name; v_bridge_comment text; v_bridge_secdef boolean; v_bridge_vol char; v_bridge_cfg text[];
  c_qual_usuarios text := '(id = app_private.current_auth_uid())';
  c_qual_admin text := $q$(EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = app_private.current_auth_uid() AND u.rol = 'administrador'))$q$;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='audit' AND c.relname='asignacion_eventos') INTO v_tabla;

  IF v_has_audit THEN
    v_msg := pg_temp.schema_prov_ok('audit','limpiapp_audit_owner',c_marca);
    IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'ROLLBACK ABORTADO: %', v_msg; END IF;
  END IF;
  IF v_has_private THEN
    v_msg := pg_temp.schema_prov_ok('app_private','limpiapp_audit_owner',c_marca);
    IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'ROLLBACK ABORTADO: %', v_msg; END IF;
  END IF;

  -- postgres no conserva USAGE sobre app_private después de la migración.
  -- El owner concede USAGE temporal dentro de esta transacción para resolver y administrar
  -- las funciones privadas; se revoca en la rama que conserva el esquema.
  IF v_has_private AND v_has_owner THEN
    SET LOCAL ROLE limpiapp_audit_owner;
    GRANT USAGE ON SCHEMA app_private TO postgres;
    RESET ROLE;
  END IF;

  v_bridge := to_regprocedure('app_private.current_auth_uid()');
  IF v_bridge IS NOT NULL THEN
    SELECT r.rolname, obj_description(p.oid,'pg_proc'), p.prosecdef, p.provolatile, p.proconfig
      INTO v_bridge_owner, v_bridge_comment, v_bridge_secdef, v_bridge_vol, v_bridge_cfg
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=v_bridge;
    IF v_bridge_owner IS DISTINCT FROM 'postgres'
       OR coalesce(v_bridge_comment,'') NOT LIKE '%'||c_marca||'%'
       OR v_bridge_secdef IS DISTINCT FROM true
       OR v_bridge_vol IS DISTINCT FROM 's'
       OR NOT (coalesce(v_bridge_cfg, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog']) THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: bridge auth no coincide con procedencia/seguridad';
    END IF;
  END IF;

  IF v_tabla THEN
    IF v_bridge IS NULL THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: audit.asignacion_eventos existe pero bridge auth no existe';
    END IF;
    SELECT r.rolname, obj_description(c.oid,'pg_class') INTO v_owner, v_comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='audit' AND c.relname='asignacion_eventos';
    IF coalesce(v_comment,'') NOT LIKE '%'||c_marca||'%' OR v_owner <> 'limpiapp_audit_owner' THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: tabla audit no coincide con procedencia';
    END IF;
    IF NOT v_has_reader OR NOT v_has_owner THEN
      RAISE EXCEPTION 'ROLLBACK ABORTADO: tabla audit sin owner/reader esperado';
    END IF;
  END IF;

  -- Membresías administrativas preexistentes: SET=true, INHERIT=false; cero membresía API.
  FOREACH v_r IN ARRAY ARRAY[
    'limpiapp_audit_owner','limpiapp_asig_retiro_executor',
    'limpiapp_asig_retiro_preparer','limpiapp_audit_reader'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_r) THEN
      v_msg := pg_temp.role_prov_ok(v_r,c_marca);
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION 'ROLLBACK ABORTADO: %',v_msg; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.roleid
        JOIN pg_roles gr ON gr.oid=m.member
        JOIN pg_roles go ON go.oid=m.grantor
        WHERE r.rolname=v_r AND gr.rolname=session_user AND go.rolname=session_user
          AND m.set_option AND NOT m.inherit_option
      ) THEN
        RAISE EXCEPTION 'ROLLBACK ABORTADO: falta membresía SET/no-INHERIT sobre %',v_r;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.roleid
        JOIN pg_roles gr ON gr.oid=m.member
        WHERE r.rolname=v_r AND gr.rolname IN ('anon','authenticated','service_role')
      ) THEN
        RAISE EXCEPTION 'ROLLBACK ABORTADO: membresía API inesperada sobre %',v_r;
      END IF;
      EXECUTE format('SET LOCAL ROLE %I',v_r);
      v_u := current_user;
      RESET ROLE;
      IF v_u IS DISTINCT FROM v_r THEN RAISE EXCEPTION 'ROLLBACK ABORTADO: SET ROLE % falló',v_r; END IF;
    END IF;
  END LOOP;

  -- Bloqueo antes del conteo; se conserva hasta COMMIT/ROLLBACK.
  IF v_tabla THEN
    SET LOCAL ROLE limpiapp_audit_owner;
    LOCK TABLE audit.asignacion_eventos IN ACCESS EXCLUSIVE MODE;
    RESET ROLE;
    SET LOCAL ROLE limpiapp_audit_reader;
    SELECT count(*) INTO v_n FROM audit.asignacion_eventos;
    RESET ROLE;
  END IF;

  -- Ruta de mutación: funciones bajo sus owners reales.
  v_msg := pg_temp.drop_func_prov('public.retirar_asignacion_individual(uuid,integer,text,text,text)','limpiapp_asig_retiro_executor',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;
  v_msg := pg_temp.drop_func_prov('public.preparar_retiro_asignacion_individual(integer)','limpiapp_asig_retiro_preparer',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;
  v_msg := pg_temp.drop_func_prov('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)','limpiapp_asig_retiro_executor',c_marca);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg; END IF;

  -- Políticas y privilegios legacy: owner postgres.
  v_msg := pg_temp.policy_prov_ok('public','asignaciones','pol_asig_update_retiro_executor','PERMISSIVE','UPDATE',ARRAY['limpiapp_asig_retiro_executor'],c_qual_admin,c_qual_admin);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
  ELSE DROP POLICY IF EXISTS pol_asig_update_retiro_executor ON public.asignaciones; END IF;
  v_msg := pg_temp.policy_prov_ok('public','asignaciones','pol_asig_select_retiro_roles','PERMISSIVE','SELECT',ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer'],c_qual_admin,NULL::text);
  IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
  ELSE DROP POLICY IF EXISTS pol_asig_select_retiro_roles ON public.asignaciones; END IF;

  IF v_has_exec THEN
    REVOKE UPDATE (activo,estado_asig,fecha_termino_asig) ON public.asignaciones FROM limpiapp_asig_retiro_executor;
    REVOKE SELECT (id,activo,estado_asig,fecha_termino_asig,fecha_inicio_asig,trabajador_id,contrato_id,rol_asignacion,es_asignacion_base)
      ON public.asignaciones FROM limpiapp_asig_retiro_executor;
    REVOKE SELECT (id,rol) ON public.usuarios FROM limpiapp_asig_retiro_executor;
    REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_executor;
    REVOKE EXECUTE ON FUNCTION extensions.digest(text,text) FROM limpiapp_asig_retiro_executor;
    IF v_bridge IS NOT NULL THEN REVOKE EXECUTE ON FUNCTION app_private.current_auth_uid() FROM limpiapp_asig_retiro_executor; END IF;
  END IF;
  IF v_has_prep THEN
    REVOKE SELECT (id,activo,estado_asig,fecha_termino_asig,fecha_inicio_asig,trabajador_id,contrato_id,rol_asignacion,es_asignacion_base)
      ON public.asignaciones FROM limpiapp_asig_retiro_preparer;
    REVOKE SELECT (id,rol) ON public.usuarios FROM limpiapp_asig_retiro_preparer;
    REVOKE USAGE ON SCHEMA extensions FROM limpiapp_asig_retiro_preparer;
    REVOKE EXECUTE ON FUNCTION extensions.digest(text,text) FROM limpiapp_asig_retiro_preparer;
    IF v_bridge IS NOT NULL THEN REVOKE EXECUTE ON FUNCTION app_private.current_auth_uid() FROM limpiapp_asig_retiro_preparer; END IF;
  END IF;

  -- Objetos audit/app_private: siempre bajo audit_owner.
  IF v_has_owner THEN
    SET LOCAL ROLE limpiapp_audit_owner;
    IF v_tabla THEN
      DROP POLICY IF EXISTS pol_evt_insert_executor ON audit.asignacion_eventos;
      DROP POLICY IF EXISTS pol_evt_select_executor ON audit.asignacion_eventos;
      IF v_has_exec THEN
        REVOKE INSERT,SELECT ON audit.asignacion_eventos FROM limpiapp_asig_retiro_executor;
      END IF;
    END IF;
    IF v_has_audit AND v_has_exec THEN REVOKE USAGE ON SCHEMA audit FROM limpiapp_asig_retiro_executor; END IF;
    IF v_has_private THEN
      IF v_has_exec THEN REVOKE USAGE,CREATE ON SCHEMA app_private FROM limpiapp_asig_retiro_executor; END IF;
      IF v_has_prep THEN REVOKE USAGE ON SCHEMA app_private FROM limpiapp_asig_retiro_preparer; END IF;
    END IF;
    RESET ROLE;
  END IF;

  IF v_n > 0 THEN
    RAISE NOTICE 'ROLLBACK PARCIAL: % evento(s); evidencia y lectura administrativa se conservan.',v_n;

    -- Política usuarios queda solo para reader.
    v_msg := pg_temp.policy_prov_ok('public','usuarios','pol_usuarios_select_retiro_roles','PERMISSIVE','SELECT',
      ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'],c_qual_usuarios,NULL::text);
    IF v_msg IS NOT NULL THEN v_incompleto := v_incompleto || v_msg;
    ELSE
      DROP POLICY IF EXISTS pol_usuarios_select_retiro_roles ON public.usuarios;
      IF v_has_reader THEN
        CREATE POLICY pol_usuarios_select_retiro_roles ON public.usuarios
          FOR SELECT TO limpiapp_audit_reader USING (id=app_private.current_auth_uid());
      END IF;
    END IF;

    -- Eliminar preparer/executor: DROP OWNED como el propio rol, luego DROP ROLE como postgres.
    IF v_has_prep THEN
      SET LOCAL ROLE limpiapp_asig_retiro_preparer;
      DROP OWNED BY CURRENT_USER;
      RESET ROLE;
      BEGIN DROP ROLE limpiapp_asig_retiro_preparer;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'preparer conserva dependencias'; END;
    END IF;
    IF v_has_exec THEN
      SET LOCAL ROLE limpiapp_asig_retiro_executor;
      DROP OWNED BY CURRENT_USER;
      RESET ROLE;
      BEGIN DROP ROLE limpiapp_asig_retiro_executor;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'executor conserva dependencias'; END;
    END IF;

    IF v_bridge IS NOT NULL AND v_has_owner AND v_has_private THEN
      SET LOCAL ROLE limpiapp_audit_owner;
      REVOKE USAGE ON SCHEMA app_private FROM postgres;
      RESET ROLE;
    END IF;

    -- Reader/owner y sus membresías administrativas se conservan.
    IF EXISTS (
      SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles gr ON gr.oid=m.member
      WHERE gr.rolname=session_user AND r.rolname IN ('limpiapp_audit_owner','limpiapp_audit_reader')
        AND m.inherit_option
    ) THEN v_incompleto:=v_incompleto||'runner heredaría privilegios owner/reader'; END IF;
  ELSE
    -- Desmontaje completo sin eventos.
    v_msg := pg_temp.drop_func_prov('public.listar_eventos_asignacion_admin(integer)','limpiapp_audit_reader',c_marca);
    IF v_msg IS NOT NULL THEN v_incompleto:=v_incompleto||v_msg; END IF;

    v_msg := pg_temp.policy_prov_ok('public','usuarios','pol_usuarios_select_retiro_roles','PERMISSIVE','SELECT',
      ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'],c_qual_usuarios,NULL::text);
    IF v_msg IS NOT NULL THEN v_incompleto:=v_incompleto||v_msg;
    ELSE DROP POLICY IF EXISTS pol_usuarios_select_retiro_roles ON public.usuarios; END IF;

    IF v_has_reader THEN
      REVOKE SELECT (id,rol) ON public.usuarios FROM limpiapp_audit_reader;
      IF v_bridge IS NOT NULL THEN REVOKE EXECUTE ON FUNCTION app_private.current_auth_uid() FROM limpiapp_audit_reader; END IF;
    END IF;

    v_msg := pg_temp.drop_func_prov('app_private.current_auth_uid()','postgres',c_marca);
    IF v_msg IS NOT NULL THEN v_incompleto:=v_incompleto||v_msg; END IF;

    IF v_has_owner THEN
      SET LOCAL ROLE limpiapp_audit_owner;
      IF v_tabla THEN
        DROP POLICY IF EXISTS pol_evt_select_reader ON audit.asignacion_eventos;
        IF v_has_reader THEN REVOKE SELECT ON audit.asignacion_eventos FROM limpiapp_audit_reader; END IF;
        DROP TABLE audit.asignacion_eventos;
      END IF;
      IF v_has_audit AND v_has_reader THEN REVOKE USAGE ON SCHEMA audit FROM limpiapp_audit_reader; END IF;
      IF v_has_private AND v_has_reader THEN REVOKE USAGE ON SCHEMA app_private FROM limpiapp_audit_reader; END IF;
      IF v_has_private THEN DROP SCHEMA app_private RESTRICT; END IF;
      IF v_has_audit THEN DROP SCHEMA audit RESTRICT; END IF;
      RESET ROLE;
    END IF;

    -- Limpiar defaults/privilegios como cada rol y eliminar los cuatro roles.
    IF v_has_prep THEN
      SET LOCAL ROLE limpiapp_asig_retiro_preparer; DROP OWNED BY CURRENT_USER; RESET ROLE;
      BEGIN DROP ROLE limpiapp_asig_retiro_preparer;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'preparer conserva dependencias'; END;
    END IF;
    IF v_has_exec THEN
      SET LOCAL ROLE limpiapp_asig_retiro_executor; DROP OWNED BY CURRENT_USER; RESET ROLE;
      BEGIN DROP ROLE limpiapp_asig_retiro_executor;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'executor conserva dependencias'; END;
    END IF;
    IF v_has_reader THEN
      SET LOCAL ROLE limpiapp_audit_reader; DROP OWNED BY CURRENT_USER; RESET ROLE;
      BEGIN DROP ROLE limpiapp_audit_reader;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'reader conserva dependencias'; END;
    END IF;
    IF v_has_owner THEN
      SET LOCAL ROLE limpiapp_audit_owner; DROP OWNED BY CURRENT_USER; RESET ROLE;
      BEGIN DROP ROLE limpiapp_audit_owner;
      EXCEPTION WHEN dependent_objects_still_exist THEN v_incompleto:=v_incompleto||'owner conserva dependencias'; END;
    END IF;
  END IF;

  IF array_length(v_incompleto,1) IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETO (se revierte toda la transacción): %',array_to_string(v_incompleto,' | ');
  END IF;
END $$;

COMMIT;
-- =====================================================================
-- ROLLBACK DE APLICACIÓN (React) DOCUMENTADO POR SEPARADO. No elimina eventos.
-- FIN v2.5.8 CANDIDATO CORR.8 — NO EJECUTADO.
-- =====================================================================
