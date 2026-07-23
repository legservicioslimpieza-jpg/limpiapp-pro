-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · MIGRACIÓN CONSTRUIDA v2.5.7 CANDIDATA
-- CORR.8: ownership explícito mediante SET LOCAL ROLE; cero DDL de membresía.
-- usuarios.id=uuid; fechas=date; identidad derivada exclusivamente de auth.uid() mediante
-- app_private.current_auth_uid() SECURITY DEFINER propiedad de postgres. Token, fingerprint,
-- idempotencia, concurrencia, UPDATE…RETURNING, zona horaria y contrato RPC preservados.
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.8 Y NUEVO GATE P2-B1.1 (staging).
-- NO PEGAR EN SUPABASE. Ejecutar únicamente por psql Session Pooler 5432/directo autorizado.
--
-- CORR.8:
--   * conserva SET LOCAL createrole_self_grant='set' y elimina todo GRANT/REVOKE de membresía;
--   * no depende de INHERIT: cada operación que exige propiedad se ejecuta bajo el owner real;
--   * crea appender y RPC directamente bajo sus propietarios finales;
--   * usa privilegios CREATE temporales de objeto y los revoca antes del COMMIT;
--   * valida SET ROLE authenticated para las pruebas end-to-end.
--   * valida la ausencia de privilegios temporales por ACL directa (pg_namespace.nspacl), no por
--     has_schema_privilege(), que en PG17/Supabase puede reflejar capacidad SET ROLE sin uso inmediato.
-- Marca de procedencia: 'ASIG.EVENTOS.1-A/P2-A'.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- Gate amistoso antes de referenciar el GUC introducido en PostgreSQL 16.
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
  END IF;
END $$;

-- PostgreSQL 16+: crea para postgres una membresía SET/no-INHERIT junto con cada CREATE ROLE.
-- Evita las sentencias GRANT/REVOKE de membresía que cierran el Session Pooler de staging.
SET LOCAL createrole_self_grant = 'set';

-- ---------------------------------------------------------------------
-- 0. PREFLIGHT
-- ---------------------------------------------------------------------
DO $$
DECLARE v_col record; v_ok boolean;
BEGIN
  -- 0.0 CORR.8: el gate de versión se ejecutó antes de fijar el GUC; aquí se valida el valor LOCAL.
  IF current_setting('createrole_self_grant', true) IS DISTINCT FROM 'set' THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.8: createrole_self_grant no quedó en set';
  END IF;

  -- 0.a Capacidad efectiva del runner:
  --     - crear roles técnicos y transferirles propiedad exige CREATEROLE o superusuario;
  --       los default privileges se fijan luego bajo SET LOCAL ROLE de cada owner.
  IF NOT (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'PREFLIGHT: % no es superusuario ni tiene CREATEROLE; no podrá transferir propiedad ni fijar default privileges', current_user;
  END IF;
  -- 0.a.2 Capacidad de crear en los esquemas donde vivirán/asignarán funciones (public + los nuevos).
  IF NOT has_schema_privilege(current_user, 'public', 'CREATE WITH GRANT OPTION') THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.8: % no puede conceder CREATE temporal en schema public', current_user;
  END IF;

  -- 0.a.3 CORR.5 · Supabase alojado: el puente auth queda propiedad de postgres.
  --       El runner solo necesita USAR auth.uid(); NO necesita ni intenta redistribuir privilegios auth.
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.5: runner=%; se requiere postgres para que el puente auth conserve propietario determinista', current_user;
  END IF;
  IF NOT has_schema_privilege(current_user,'auth','USAGE') THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.5: % no puede USAR schema auth', current_user; END IF;
  IF NOT has_function_privilege(current_user,'auth.uid()','EXECUTE') THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.5: % no puede EJECUTAR auth.uid()', current_user; END IF;
  -- extensions.digest sí se invoca directamente desde owners técnicos; su concesión sigue siendo necesaria.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    IF NOT has_schema_privilege(current_user,'extensions','USAGE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'PREFLIGHT: % no puede CONCEDER USAGE en schema extensions', current_user; END IF;
    IF NOT has_function_privilege(current_user,'extensions.digest(text,text)','EXECUTE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'PREFLIGHT: % no puede CONCEDER EXECUTE en extensions.digest(text,text)', current_user; END IF;
  END IF;
  -- 0.a.4 El rol authenticated debe tener USAGE sobre public y el runner debe poder asumirlo
  --       para ejecutar las pruebas end-to-end bajo la misma identidad PostgREST.
  IF NOT has_schema_privilege('authenticated','public','USAGE') THEN
    RAISE EXCEPTION 'PREFLIGHT: el rol authenticated no tiene USAGE sobre schema public'; END IF;
  IF NOT pg_has_role(current_user,'authenticated','SET') THEN
    RAISE EXCEPTION 'PREFLIGHT CORR.8: % no puede SET ROLE authenticated; las pruebas RPC no son ejecutables', current_user; END IF;

  -- 0.b Colisión de roles/esquemas/tabla.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
      ('limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader')) THEN
    RAISE EXCEPTION 'PREFLIGHT: ya existe alguno de los roles limpiapp_*'; END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('audit','app_private')) THEN
    RAISE EXCEPTION 'PREFLIGHT: ya existe el esquema audit o app_private'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='audit' AND c.relname='asignacion_eventos') THEN
    RAISE EXCEPTION 'PREFLIGHT: ya existe audit.asignacion_eventos'; END IF;

  -- 0.c Colisión de FIRMAS exactas vía to_regprocedure (corr.1).
  IF to_regprocedure('public.preparar_retiro_asignacion_individual(integer)') IS NOT NULL
     OR to_regprocedure('public.retirar_asignacion_individual(uuid,integer,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.listar_eventos_asignacion_admin(integer)') IS NOT NULL
     OR to_regprocedure('app_private.current_auth_uid()') IS NOT NULL
     OR to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)') IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT: colisión de firma exacta en alguna función objetivo';
  END IF;

  -- 0.d Dependencias por firma exacta.
  IF to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'PREFLIGHT: falta auth.uid()'; END IF;
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN RAISE EXCEPTION 'PREFLIGHT: falta extensions.digest(text,text)'; END IF;

  -- 0.e Columnas/tipos de public.asignaciones.
  FOR v_col IN SELECT * FROM (VALUES
      ('id','integer'),('activo','boolean'),('estado_asig','text'),
      ('fecha_termino_asig','date'),('fecha_inicio_asig','date'),
      ('trabajador_id','text'),('contrato_id','text'),('rol_asignacion','text'),('es_asignacion_base','boolean')
    ) AS t(col,typ) LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='asignaciones' AND column_name=v_col.col AND data_type=v_col.typ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'PREFLIGHT: public.asignaciones.% ausente o tipo != %', v_col.col, v_col.typ; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='id'  AND data_type='uuid') THEN
    RAISE EXCEPTION 'PREFLIGHT: public.usuarios.id (uuid) no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='rol' AND data_type='text') THEN
    RAISE EXCEPTION 'PREFLIGHT: public.usuarios.rol (text) no encontrado'; END IF;

  -- 0.f RLS habilitado en legacy.
  IF NOT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='asignaciones') THEN
    RAISE EXCEPTION 'PREFLIGHT: RLS no habilitado en public.asignaciones'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='usuarios') THEN
    RAISE EXCEPTION 'PREFLIGHT: RLS no habilitado en public.usuarios'; END IF;

  -- 0.g Colisión de nombres de política.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN
      ('pol_asig_select_retiro_roles','pol_asig_update_retiro_executor','pol_usuarios_select_retiro_roles')) THEN
    RAISE EXCEPTION 'PREFLIGHT: colisión de nombre de política aditiva en public'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- 0.bis PREFLIGHT INFORMATIVO (BLOQUEO 1): DEFAULT PRIVILEGES sobre FUNCIONES en public.
--       Solo INFORMA (RAISE NOTICE). NO bloquea por la existencia del ACL legacy. La protección
--       efectiva son los REVOKE explícitos de §12 (PUBLIC, anon, service_role) + GRANT authenticated.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record; v_aviso boolean := false;
BEGIN
  FOR r IN SELECT pg_get_userbyid(d.defaclrole) AS definidor, array_to_string(d.defaclacl,', ') AS acl
             FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE n.nspname = 'public' AND d.defaclobjtype = 'f'
            ORDER BY 1
  LOOP
    RAISE NOTICE 'pg_default_acl (public, FUNCTIONS) definidor=% acl=%', r.definidor, r.acl;
    IF r.acl ~ '(anon|service_role)=' THEN
      RAISE NOTICE 'AVISO BLOQUEO1: % otorga EXECUTE por defecto a anon/service_role; se revoca explícitamente en §7.', r.definidor;
      v_aviso := true;
    END IF;
  END LOOP;
  IF NOT v_aviso THEN RAISE NOTICE 'BLOQUEO1: sin DEFAULT PRIVILEGES sobre funciones que otorguen a anon/service_role en public.'; END IF;
END $$;

CREATE ROLE limpiapp_audit_owner          NOLOGIN NOBYPASSRLS;
CREATE ROLE limpiapp_asig_retiro_executor NOLOGIN NOBYPASSRLS;
CREATE ROLE limpiapp_asig_retiro_preparer NOLOGIN NOBYPASSRLS;
CREATE ROLE limpiapp_audit_reader         NOLOGIN NOBYPASSRLS;

-- ---------------------------------------------------------------------
-- 1.b CORR.7 · MEMBRESÍA ADMINISTRATIVA NACIDA CON CREATE ROLE.
--     No se ejecuta GRANT/REVOKE de membresía. PostgreSQL 16+ crea para postgres una membresía
--     SET=TRUE, INHERIT=FALSE por createrole_self_grant='set'. Se conserva como capacidad de despliegue
--     del rol administrador del proyecto; anon/authenticated/service_role no reciben membresía.
-- ---------------------------------------------------------------------
DO $$
DECLARE v_r text; v_u text;
BEGIN
  FOREACH v_r IN ARRAY ARRAY['limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_auth_members m
        JOIN pg_roles r  ON r.oid=m.roleid
        JOIN pg_roles gr ON gr.oid=m.member
        JOIN pg_roles go ON go.oid=m.grantor
       WHERE r.rolname=v_r
         AND gr.rolname=session_user
         AND go.rolname=session_user
         AND m.set_option
         AND NOT m.inherit_option
    ) THEN
      RAISE EXCEPTION 'CORR.8: CREATE ROLE % no generó la membresía SET/no-INHERIT esperada para %', v_r, session_user;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_auth_members m
        JOIN pg_roles r  ON r.oid=m.roleid
        JOIN pg_roles gr ON gr.oid=m.member
       WHERE r.rolname=v_r
         AND gr.rolname IN ('anon','authenticated','service_role')
    ) THEN
      RAISE EXCEPTION 'CORR.8: un rol API recibió membresía inesperada sobre %', v_r;
    END IF;

    EXECUTE format('SET LOCAL ROLE %I', v_r);
    v_u := current_user;
    RESET ROLE;
    IF v_u IS DISTINCT FROM v_r THEN
      RAISE EXCEPTION 'OWNERSHIP: SET ROLE a % no tomó efecto (current_user=%); no se puede transferir propiedad', v_r, v_u;
    END IF;
  END LOOP;
END $$;

COMMENT ON ROLE limpiapp_audit_owner          IS 'ASIG.EVENTOS.1-A/P2-A · dueño de esquemas/tabla de auditoría';
COMMENT ON ROLE limpiapp_asig_retiro_executor IS 'ASIG.EVENTOS.1-A/P2-A · identidad de retiro (muta+append)';
COMMENT ON ROLE limpiapp_asig_retiro_preparer IS 'ASIG.EVENTOS.1-A/P2-A · identidad de preparación (solo lectura)';
COMMENT ON ROLE limpiapp_audit_reader         IS 'ASIG.EVENTOS.1-A/P2-A · lectura administrativa';

-- ---------------------------------------------------------------------
-- 2. ESQUEMAS Y ACL (operaciones de dueño bajo limpiapp_audit_owner)
-- ---------------------------------------------------------------------
CREATE SCHEMA audit       AUTHORIZATION limpiapp_audit_owner;
CREATE SCHEMA app_private AUTHORIZATION limpiapp_audit_owner;

SET LOCAL ROLE limpiapp_audit_owner;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT  USAGE ON SCHEMA app_private
  TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer, limpiapp_audit_reader;
REVOKE USAGE ON SCHEMA app_private FROM anon, authenticated, service_role;

REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT  USAGE ON SCHEMA audit TO limpiapp_asig_retiro_executor, limpiapp_audit_reader;
REVOKE USAGE ON SCHEMA audit FROM anon, authenticated, service_role;

-- Privilegios temporales de objeto para que postgres construya bridge/tabla y las políticas legacy.
GRANT USAGE, CREATE ON SCHEMA app_private TO postgres;
GRANT USAGE, CREATE ON SCHEMA audit       TO postgres;
-- CREATE temporal para el appender; se revoca tras su creación.
GRANT CREATE ON SCHEMA app_private TO limpiapp_asig_retiro_executor;

COMMENT ON SCHEMA audit       IS 'ASIG.EVENTOS.1-A/P2-A · esquema de auditoría';
COMMENT ON SCHEMA app_private IS 'ASIG.EVENTOS.1-A/P2-A · esquema privado de funciones internas';
RESET ROLE;

-- ---------------------------------------------------------------------
-- 2.bis PUENTE MÍNIMO DE IDENTIDAD SUPABASE (owner postgres)
-- ---------------------------------------------------------------------
CREATE FUNCTION app_private.current_auth_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT auth.uid();
$fn$;
REVOKE EXECUTE ON FUNCTION app_private.current_auth_uid()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.current_auth_uid()
  TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer, limpiapp_audit_reader;
COMMENT ON FUNCTION app_private.current_auth_uid()
  IS 'ASIG.EVENTOS.1-A/P2-A · puente mínimo a auth.uid; SECURITY DEFINER owner postgres';

-- Dependencias que los owners técnicos invocan directamente.
GRANT USAGE ON SCHEMA extensions
  TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer;
GRANT EXECUTE ON FUNCTION extensions.digest(text,text)
  TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer;

-- USAGE persistente y CREATE temporal en public para los tres owners de RPC.
GRANT USAGE, CREATE ON SCHEMA public
  TO limpiapp_asig_retiro_preparer, limpiapp_asig_retiro_executor, limpiapp_audit_reader;

-- ---------------------------------------------------------------------
-- 3. DEFAULT PRIVILEGES: cada rol modifica sus propios defaults mediante SET ROLE.
-- ---------------------------------------------------------------------
SET LOCAL ROLE limpiapp_audit_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit       REVOKE ALL ON TABLES    FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit       REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private REVOKE ALL ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE limpiapp_asig_retiro_executor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public      REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private REVOKE ALL ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE limpiapp_asig_retiro_preparer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE limpiapp_audit_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
RESET ROLE;

-- ---------------------------------------------------------------------
-- 4. TABLA DE AUDITORÍA: postgres crea y transfiere; el owner configura todo lo posterior.
-- ---------------------------------------------------------------------
CREATE TABLE audit.asignacion_eventos (
  evento_id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  operation_request_id     uuid        NOT NULL,
  request_fingerprint      text        NOT NULL,
  asignacion_id            integer     NOT NULL,
  trabajador_id_historico  text        NOT NULL,
  contrato_id_historico    text        NOT NULL,
  tipo_evento              text        NOT NULL,
  dimensiones_afectadas    text[]      NOT NULL,
  snapshot_anterior        jsonb       NULL,
  snapshot_posterior       jsonb       NOT NULL,
  motivo_normalizado       text        NULL,
  registrado_por_id        uuid        NOT NULL,
  registrante_snapshot     jsonb       NULL,
  origen                   text        NOT NULL,
  actor_tecnico            text        NOT NULL,
  evento_corregido_id      uuid        NULL,
  registrado_en            timestamptz NOT NULL DEFAULT now(),
  version_esquema          smallint    NOT NULL,
  CONSTRAINT pk_asignacion_eventos            PRIMARY KEY (evento_id),
  CONSTRAINT uq_asignacion_eventos_opreq      UNIQUE (operation_request_id),
  CONSTRAINT fk_asignacion_eventos_asignacion FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones (id) ON DELETE NO ACTION,
  CONSTRAINT fk_asignacion_eventos_correccion FOREIGN KEY (evento_corregido_id) REFERENCES audit.asignacion_eventos (evento_id) ON DELETE NO ACTION,
  CONSTRAINT ck_asignacion_eventos_dim CHECK (cardinality(dimensiones_afectadas) >= 1 AND dimensiones_afectadas <@ ARRAY['remuneracional','operacional','documental']),
  CONSTRAINT ck_asignacion_eventos_tipo   CHECK (tipo_evento IN ('asignacion_retirada_individual')),
  CONSTRAINT ck_asignacion_eventos_origen CHECK (origen IN ('erp_sesion_usuario')),
  CONSTRAINT ck_asignacion_eventos_corr_bicond CHECK ((tipo_evento='correccion') = (evento_corregido_id IS NOT NULL)),
  CONSTRAINT ck_asignacion_eventos_corr_self   CHECK (evento_corregido_id IS NULL OR evento_corregido_id <> evento_id)
);
ALTER TABLE audit.asignacion_eventos OWNER TO limpiapp_audit_owner;

SET LOCAL ROLE limpiapp_audit_owner;
CREATE UNIQUE INDEX ux_asignacion_eventos_correccion
  ON audit.asignacion_eventos (evento_corregido_id) WHERE evento_corregido_id IS NOT NULL;
CREATE INDEX ix_asignacion_eventos_asignacion ON audit.asignacion_eventos (asignacion_id);
CREATE INDEX ix_asignacion_eventos_registrado ON audit.asignacion_eventos (registrado_en);
CREATE INDEX ix_asignacion_eventos_trabajador ON audit.asignacion_eventos (trabajador_id_historico);

ALTER TABLE audit.asignacion_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.asignacion_eventos FORCE  ROW LEVEL SECURITY;
CREATE POLICY pol_evt_insert_executor ON audit.asignacion_eventos
  FOR INSERT TO limpiapp_asig_retiro_executor WITH CHECK (true);
CREATE POLICY pol_evt_select_executor ON audit.asignacion_eventos
  FOR SELECT TO limpiapp_asig_retiro_executor USING (true);
CREATE POLICY pol_evt_select_reader ON audit.asignacion_eventos
  FOR SELECT TO limpiapp_audit_reader USING (true);
REVOKE ALL ON audit.asignacion_eventos FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON audit.asignacion_eventos TO limpiapp_asig_retiro_executor;
GRANT SELECT ON audit.asignacion_eventos TO limpiapp_audit_reader;
COMMENT ON TABLE audit.asignacion_eventos
  IS 'ASIG.EVENTOS.1-A/P2-A · bitácora append-only de eventos de asignación';
RESET ROLE;

-- ---------------------------------------------------------------------
-- 5. ACCESO MÍNIMO A LEGACY Y RLS ADITIVA (tablas public propiedad de postgres)
-- ---------------------------------------------------------------------
GRANT SELECT (id, activo, estado_asig, fecha_termino_asig, fecha_inicio_asig, trabajador_id, contrato_id, rol_asignacion, es_asignacion_base)
  ON public.asignaciones TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer;
GRANT UPDATE (activo, estado_asig, fecha_termino_asig) ON public.asignaciones TO limpiapp_asig_retiro_executor;
GRANT SELECT (id, rol) ON public.usuarios TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer, limpiapp_audit_reader;

CREATE POLICY pol_usuarios_select_retiro_roles ON public.usuarios
  FOR SELECT TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer, limpiapp_audit_reader
  USING (id = app_private.current_auth_uid());
CREATE POLICY pol_asig_select_retiro_roles ON public.asignaciones
  FOR SELECT TO limpiapp_asig_retiro_executor, limpiapp_asig_retiro_preparer
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = app_private.current_auth_uid() AND u.rol = 'administrador'));
CREATE POLICY pol_asig_update_retiro_executor ON public.asignaciones
  FOR UPDATE TO limpiapp_asig_retiro_executor
  USING      (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = app_private.current_auth_uid() AND u.rol = 'administrador'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = app_private.current_auth_uid() AND u.rol = 'administrador'));

-- Ya no se requiere que postgres conserve acceso a los esquemas técnicos.
SET LOCAL ROLE limpiapp_audit_owner;
REVOKE CREATE, USAGE ON SCHEMA audit       FROM postgres;
REVOKE CREATE, USAGE ON SCHEMA app_private FROM postgres;
RESET ROLE;

-- ---------------------------------------------------------------------
-- 6. APPENDER: creado directamente bajo su owner final.
-- ---------------------------------------------------------------------
SET LOCAL ROLE limpiapp_asig_retiro_executor;
CREATE FUNCTION app_private.registrar_evento_asignacion(
  p_operation_request_id uuid, p_request_fingerprint text, p_asignacion_id integer,
  p_trabajador_id_hist text, p_contrato_id_hist text, p_tipo_evento text, p_dimensiones text[],
  p_snapshot_anterior jsonb, p_snapshot_posterior jsonb, p_motivo_normalizado text,
  p_registrado_por_id uuid, p_registrante_snapshot jsonb, p_origen text, p_actor_tecnico text, p_version_esquema smallint
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $fn$
DECLARE v_evento_id uuid;
BEGIN
  INSERT INTO audit.asignacion_eventos (
    operation_request_id, request_fingerprint, asignacion_id, trabajador_id_historico, contrato_id_historico,
    tipo_evento, dimensiones_afectadas, snapshot_anterior, snapshot_posterior, motivo_normalizado,
    registrado_por_id, registrante_snapshot, origen, actor_tecnico, version_esquema
  ) VALUES (
    p_operation_request_id, p_request_fingerprint, p_asignacion_id, p_trabajador_id_hist, p_contrato_id_hist,
    p_tipo_evento, p_dimensiones, p_snapshot_anterior, p_snapshot_posterior, p_motivo_normalizado,
    p_registrado_por_id, p_registrante_snapshot, p_origen, p_actor_tecnico, p_version_esquema
  ) RETURNING evento_id INTO v_evento_id;
  RETURN v_evento_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)
  IS 'ASIG.EVENTOS.1-A/P2-A · appender privado';
RESET ROLE;

SET LOCAL ROLE limpiapp_audit_owner;
REVOKE CREATE ON SCHEMA app_private FROM limpiapp_asig_retiro_executor;
RESET ROLE;

-- ---------------------------------------------------------------------
-- 7. RPC PÚBLICAS: cada función nace bajo su owner final.
-- ---------------------------------------------------------------------

SET LOCAL ROLE limpiapp_asig_retiro_preparer;
CREATE FUNCTION public.preparar_retiro_asignacion_individual(p_asignacion_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_uid uuid := app_private.current_auth_uid(); v_rol text;
  v_activo boolean; v_estado text; v_ftermino date; v_finicio date;
  v_trab text; v_contr text; v_rolasig text; v_esbase boolean;
  v_token text; v_material text; v_cod text; v_elegible boolean;
  c_estados text[] := ARRAY['activa','terminada','suspendida','anulada'];
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','AUTH_REQUERIDA'); END IF;
  SELECT u.rol INTO v_rol FROM public.usuarios u WHERE u.id = v_uid;
  IF v_rol IS DISTINCT FROM 'administrador' THEN RETURN jsonb_build_object('error','ROL_NO_AUTORIZADO'); END IF;
  IF p_asignacion_id IS NULL THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','asignacion_nula'); END IF;

  SELECT a.activo, a.estado_asig, a.fecha_termino_asig, a.fecha_inicio_asig, a.trabajador_id, a.contrato_id, a.rol_asignacion, a.es_asignacion_base
    INTO v_activo, v_estado, v_ftermino, v_finicio, v_trab, v_contr, v_rolasig, v_esbase
    FROM public.asignaciones a WHERE a.id = p_asignacion_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','ASIGNACION_INEXISTENTE'); END IF;

  IF v_estado IS NULL OR NOT (v_estado = ANY (c_estados)) THEN v_cod := 'ASIGNACION_ESTADO_INCOHERENTE';
  ELSIF v_trab IS NULL OR v_contr IS NULL THEN v_cod := 'ASIGNACION_LEGACY_INCOMPLETA';
  ELSIF v_finicio IS NULL THEN v_cod := 'ASIGNACION_DATOS_INCOMPLETOS';
  ELSIF ((v_activo IS TRUE) <> (v_estado='activa')) OR ((v_estado='terminada') <> (v_ftermino IS NOT NULL)) THEN v_cod := 'ASIGNACION_ESTADO_INCOHERENTE';
  ELSIF NOT (v_activo IS TRUE AND v_estado='activa' AND v_ftermino IS NULL) THEN v_cod := 'ASIGNACION_NO_ACTIVA';
  ELSE v_cod := 'ELEGIBLE'; END IF;
  v_elegible := (v_cod = 'ELEGIBLE');

  v_material := (jsonb_build_object(
      'dom','asig_retiro','kind','token','v',1,
      'asignacion_id', p_asignacion_id, 'trabajador_id', v_trab, 'contrato_id', v_contr,
      'activo', v_activo, 'estado_asig', v_estado,
      'fecha_termino_asig', to_char(v_ftermino,'YYYY-MM-DD'),
      'fecha_inicio_asig',  to_char(v_finicio ,'YYYY-MM-DD'),
      'rol_asignacion', v_rolasig, 'es_asignacion_base', v_esbase))::text;
  v_token := encode(extensions.digest(v_material,'sha256'),'hex');

  RETURN jsonb_build_object(
    'token_anti_stale', v_token, 'asignacion_id', p_asignacion_id, 'estado_asig', v_estado, 'activo', v_activo,
    'fecha_termino_asig', to_char(v_ftermino,'YYYY-MM-DD'),
    'fecha_inicio_asig',  to_char(v_finicio ,'YYYY-MM-DD'),
    'elegible_para_retiro', v_elegible, 'codigo_elegibilidad', v_cod);
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.preparar_retiro_asignacion_individual(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.preparar_retiro_asignacion_individual(integer) TO authenticated;
COMMENT ON FUNCTION public.preparar_retiro_asignacion_individual(integer)
  IS 'ASIG.EVENTOS.1-A/P2-A · preparación de retiro';
RESET ROLE;

SET LOCAL ROLE limpiapp_asig_retiro_executor;
CREATE FUNCTION public.retirar_asignacion_individual(
  p_operation_request_id uuid, p_asignacion_id integer, p_fecha_termino text, p_motivo text, p_token_anti_stale text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_uid uuid := app_private.current_auth_uid(); v_rol text; v_motivo text; v_fecha date;
  v_fp text; v_fp_mat text; v_tok_esp text; v_tok_mat text;
  v_activo boolean; v_estado text; v_ftermino date; v_finicio date;
  v_trab text; v_contr text; v_rolasig text; v_esbase boolean;
  v_p_activo boolean; v_p_estado text; v_p_ftermino date; v_p_finicio date; v_p_rolasig text; v_p_esbase boolean;
  v_snap_ant jsonb; v_snap_pos jsonb;
  v_ev_id uuid; v_ev_fp text; v_ev_row audit.asignacion_eventos%ROWTYPE;
  v_version smallint := 1; v_dims text[] := ARRAY['operacional']; v_found boolean; v_rowc integer;
  c_estados text[] := ARRAY['activa','terminada','suspendida','anulada'];
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','AUTH_REQUERIDA'); END IF;
  SELECT u.rol INTO v_rol FROM public.usuarios u WHERE u.id = v_uid;
  IF v_rol IS DISTINCT FROM 'administrador' THEN RETURN jsonb_build_object('error','ROL_NO_AUTORIZADO'); END IF;

  IF p_operation_request_id IS NULL OR p_asignacion_id IS NULL OR p_fecha_termino IS NULL OR p_motivo IS NULL OR p_token_anti_stale IS NULL THEN
    RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','parametro_nulo'); END IF;
  IF btrim(p_token_anti_stale) = '' THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','token_vacio'); END IF;

  v_motivo := normalize(p_motivo, NFC);
  v_motivo := replace(replace(v_motivo, E'\r\n', E'\n'), E'\r', E'\n');           -- CRLF/CR -> LF
  v_motivo := regexp_replace(v_motivo, '[ ]+\n', E'\n', 'g');                        -- corr.7: recorta espacios al final de cada línea (convierte líneas de solo-espacios en vacías)
  v_motivo := btrim(v_motivo, E' \n');                                                 -- corr.1 v2.4.1: trim EXPLÍCITO de espacios y LF (no toca otros caracteres)
  v_motivo := regexp_replace(v_motivo, E'\n{3,}', E'\n\n', 'g');                    -- corr.7: colapsa a lo sumo UNA línea en blanco entre bloques
  -- corr.8 v2.3: rechazar TODOS los caracteres de control Unicode excepto LF (\x0A). CR ya normalizado a LF arriba.
  IF v_motivo ~ '[\x00-\x09\x0B-\x1F\x7F\x80-\x9F]' THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','motivo_control'); END IF;
  IF v_motivo !~ '[[:alnum:]]' THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','motivo_sin_alfanumerico'); END IF;
  IF char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','motivo_largo'); END IF;

  IF p_fecha_termino !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','fecha_formato'); END IF;
  BEGIN v_fecha := p_fecha_termino::date; EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','fecha_invalida'); END;

  v_fp_mat := (jsonb_build_object('dom','asig_retiro','kind','fingerprint','v',1,
      'comando','retirar_asignacion_individual','asignacion_id', p_asignacion_id,
      'fecha_termino', to_char(v_fecha,'YYYY-MM-DD'), 'motivo', v_motivo,
      'token', p_token_anti_stale, 'actor', v_uid::text, 'origen','erp_sesion_usuario'))::text;
  v_fp := encode(extensions.digest(v_fp_mat,'sha256'),'hex');

  PERFORM pg_advisory_xact_lock( hashtextextended('asig_retiro:' || p_operation_request_id::text, 424242) );

  SELECT (e.evento_id IS NOT NULL), e.request_fingerprint INTO v_found, v_ev_fp
    FROM audit.asignacion_eventos e WHERE e.operation_request_id = p_operation_request_id;
  IF v_found THEN
    IF v_ev_fp = v_fp THEN
      SELECT * INTO v_ev_row FROM audit.asignacion_eventos WHERE operation_request_id = p_operation_request_id;
      RETURN jsonb_build_object('resultado','replayed','codigo_resultado','ASIGNACION_RETIRADA_INDIVIDUAL',
        'evento_id', v_ev_row.evento_id, 'operation_request_id', v_ev_row.operation_request_id,
        'asignacion_id', v_ev_row.asignacion_id, 'tipo_evento', v_ev_row.tipo_evento,
        'registrado_en', v_ev_row.registrado_en, 'version_esquema', v_ev_row.version_esquema,
        'resumen_posterior', jsonb_build_object('estado_asig', v_ev_row.snapshot_posterior->>'estado_asig',
            'activo', (v_ev_row.snapshot_posterior->>'activo')::boolean,
            'fecha_termino_asig', v_ev_row.snapshot_posterior->>'fecha_termino_asig'));
    ELSE RETURN jsonb_build_object('error','CONFLICTO_IDEMPOTENCIA'); END IF;
  END IF;

  SELECT a.activo, a.estado_asig, a.fecha_termino_asig, a.fecha_inicio_asig, a.trabajador_id, a.contrato_id, a.rol_asignacion, a.es_asignacion_base
    INTO v_activo, v_estado, v_ftermino, v_finicio, v_trab, v_contr, v_rolasig, v_esbase
    FROM public.asignaciones a WHERE a.id = p_asignacion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','ASIGNACION_INEXISTENTE'); END IF;

  v_tok_mat := (jsonb_build_object('dom','asig_retiro','kind','token','v',1,
      'asignacion_id', p_asignacion_id, 'trabajador_id', v_trab, 'contrato_id', v_contr,
      'activo', v_activo, 'estado_asig', v_estado,
      'fecha_termino_asig', to_char(v_ftermino,'YYYY-MM-DD'),
      'fecha_inicio_asig',  to_char(v_finicio ,'YYYY-MM-DD'),
      'rol_asignacion', v_rolasig, 'es_asignacion_base', v_esbase))::text;
  v_tok_esp := encode(extensions.digest(v_tok_mat,'sha256'),'hex');
  IF p_token_anti_stale IS DISTINCT FROM v_tok_esp THEN RETURN jsonb_build_object('error','ESTADO_OBSOLETO'); END IF;

  IF v_estado IS NULL OR NOT (v_estado = ANY (c_estados)) THEN RETURN jsonb_build_object('error','ASIGNACION_ESTADO_INCOHERENTE'); END IF;
  IF v_trab IS NULL OR v_contr IS NULL THEN RETURN jsonb_build_object('error','ASIGNACION_LEGACY_INCOMPLETA'); END IF;
  IF v_finicio IS NULL THEN RETURN jsonb_build_object('error','ASIGNACION_DATOS_INCOMPLETOS'); END IF;
  IF ((v_activo IS TRUE) <> (v_estado='activa')) OR ((v_estado='terminada') <> (v_ftermino IS NOT NULL)) THEN RETURN jsonb_build_object('error','ASIGNACION_ESTADO_INCOHERENTE'); END IF;
  IF NOT (v_activo IS TRUE AND v_estado='activa' AND v_ftermino IS NULL) THEN RETURN jsonb_build_object('error','ASIGNACION_NO_ACTIVA'); END IF;
  IF v_fecha < v_finicio THEN RETURN jsonb_build_object('error','SOLICITUD_INVALIDA','detalle','fecha_menor_inicio'); END IF;

  v_snap_ant := jsonb_build_object('activo',v_activo,'estado_asig',v_estado,
      'fecha_termino_asig', to_char(v_ftermino,'YYYY-MM-DD'),
      'fecha_inicio_asig',  to_char(v_finicio ,'YYYY-MM-DD'),
      'rol_asignacion',v_rolasig,'es_asignacion_base',v_esbase);

  BEGIN
    UPDATE public.asignaciones
       SET activo=false, estado_asig='terminada',
           fecha_termino_asig = v_fecha
     WHERE id = p_asignacion_id
     RETURNING activo, estado_asig, fecha_termino_asig, fecha_inicio_asig, rol_asignacion, es_asignacion_base
       INTO v_p_activo, v_p_estado, v_p_ftermino, v_p_finicio, v_p_rolasig, v_p_esbase;
    GET DIAGNOSTICS v_rowc = ROW_COUNT;
    IF v_rowc <> 1 THEN RAISE EXCEPTION 'mutacion_no_unica rows=%', v_rowc; END IF;

    v_snap_pos := jsonb_build_object('activo',v_p_activo,'estado_asig',v_p_estado,
        'fecha_termino_asig', to_char(v_p_ftermino,'YYYY-MM-DD'),
        'fecha_inicio_asig',  to_char(v_p_finicio ,'YYYY-MM-DD'),
        'rol_asignacion',v_p_rolasig,'es_asignacion_base',v_p_esbase);

    v_ev_id := app_private.registrar_evento_asignacion(
      p_operation_request_id, v_fp, p_asignacion_id, v_trab, v_contr, 'asignacion_retirada_individual', v_dims,
      v_snap_ant, v_snap_pos, v_motivo, v_uid, jsonb_build_object('rol', v_rol), 'erp_sesion_usuario',
      'public.retirar_asignacion_individual', v_version);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error','FALLO_INTERNO_INTEGRIDAD');
  END;

  RETURN jsonb_build_object('resultado','created','codigo_resultado','ASIGNACION_RETIRADA_INDIVIDUAL',
    'evento_id', v_ev_id, 'operation_request_id', p_operation_request_id, 'asignacion_id', p_asignacion_id,
    'tipo_evento','asignacion_retirada_individual', 'registrado_en', now(), 'version_esquema', v_version,
    'resumen_posterior', v_snap_pos - 'fecha_inicio_asig' - 'rol_asignacion' - 'es_asignacion_base');
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.retirar_asignacion_individual(uuid,integer,text,text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.retirar_asignacion_individual(uuid,integer,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.retirar_asignacion_individual(uuid,integer,text,text,text)
  IS 'ASIG.EVENTOS.1-A/P2-A · retiro individual auditado';
RESET ROLE;

SET LOCAL ROLE limpiapp_audit_reader;
CREATE FUNCTION public.listar_eventos_asignacion_admin(p_asignacion_id integer)
RETURNS TABLE (evento_id uuid, tipo_evento text, registrado_en timestamptz, registrado_por_id uuid, origen text, motivo_normalizado text, version_esquema smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_uid uuid := app_private.current_auth_uid(); v_rol text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUERIDA'; END IF;
  SELECT u.rol INTO v_rol FROM public.usuarios u WHERE u.id = v_uid;
  IF v_rol IS DISTINCT FROM 'administrador' THEN RAISE EXCEPTION 'ROL_NO_AUTORIZADO'; END IF;
  RETURN QUERY SELECT e.evento_id, e.tipo_evento, e.registrado_en, e.registrado_por_id, e.origen, e.motivo_normalizado, e.version_esquema
      FROM audit.asignacion_eventos e WHERE e.asignacion_id = p_asignacion_id ORDER BY e.registrado_en ASC;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.listar_eventos_asignacion_admin(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.listar_eventos_asignacion_admin(integer) TO authenticated;
COMMENT ON FUNCTION public.listar_eventos_asignacion_admin(integer)
  IS 'ASIG.EVENTOS.1-A/P2-A · lectura administrativa proyectada';
RESET ROLE;

REVOKE CREATE ON SCHEMA public
  FROM limpiapp_asig_retiro_preparer, limpiapp_asig_retiro_executor, limpiapp_audit_reader;

-- ---------------------------------------------------------------------
-- 8. VERIFICACIÓN FINAL: membresías, propietarios y ausencia de CREATE temporal.
-- ---------------------------------------------------------------------
DO $$
DECLARE v_r text;
BEGIN
  FOREACH v_r IN ARRAY ARRAY[
    'limpiapp_audit_owner','limpiapp_asig_retiro_executor',
    'limpiapp_asig_retiro_preparer','limpiapp_audit_reader'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r  ON r.oid=m.roleid
      JOIN pg_roles gr ON gr.oid=m.member
      JOIN pg_roles go ON go.oid=m.grantor
      WHERE r.rolname=v_r AND gr.rolname=session_user AND go.rolname=session_user
        AND m.set_option AND NOT m.inherit_option
    ) THEN
      RAISE EXCEPTION 'CORR.8: membresía SET/no-INHERIT final inválida para %', v_r;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r ON r.oid=m.roleid
      JOIN pg_roles gr ON gr.oid=m.member
      WHERE r.rolname=v_r AND gr.rolname IN ('anon','authenticated','service_role')
    ) THEN
      RAISE EXCEPTION 'CORR.8: membresía API inesperada sobre %', v_r;
    END IF;
  END LOOP;

  IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='audit')
       IS DISTINCT FROM 'limpiapp_audit_owner'
     OR (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='app_private')
       IS DISTINCT FROM 'limpiapp_audit_owner' THEN
    RAISE EXCEPTION 'CORR.8: propietarios de schemas técnicos incorrectos';
  END IF;
  IF (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='audit' AND c.relname='asignacion_eventos')
       IS DISTINCT FROM 'limpiapp_audit_owner' THEN
    RAISE EXCEPTION 'CORR.8: owner de audit.asignacion_eventos incorrecto';
  END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('app_private.current_auth_uid()'))
       IS DISTINCT FROM 'postgres'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_executor'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.preparar_retiro_asignacion_individual(integer)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_preparer'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.retirar_asignacion_individual(uuid,integer,text,text,text)'))
       IS DISTINCT FROM 'limpiapp_asig_retiro_executor'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.listar_eventos_asignacion_admin(integer)'))
       IS DISTINCT FROM 'limpiapp_audit_reader' THEN
    RAISE EXCEPTION 'CORR.8: owner de una o más funciones incorrecto';
  END IF;

  -- CORR.8: inspeccionar ACL DIRECTA. has_schema_privilege() no es válido para demostrar
  -- ausencia aquí: en staging PG17 devolvió USAGE=true por capacidad SET ROLE aunque la ACL
  -- directa no existía y CREATE/EXECUTE reales fueron denegados.
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
    RAISE EXCEPTION 'CORR.8: quedó un privilegio temporal DIRECTO en ACL de esquema';
  END IF;

  -- Verificar que los USAGE persistentes mínimos sí quedaron concedidos directamente.
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
    RAISE EXCEPTION 'CORR.8: falta un privilegio USAGE persistente directo esperado';
  END IF;
END $$;

COMMIT;
-- =====================================================================
-- FIN v2.5.7 CANDIDATA CORR.8 — NO EJECUTADA.
-- =====================================================================
