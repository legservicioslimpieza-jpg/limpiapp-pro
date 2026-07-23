-- =====================================================================
-- ASIG.EVENTOS.1-A · BOOTSTRAP STAGING · FULL v2.2 (dump real + verificación de PROPIETARIOS; refs corregidas)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. Destinado a un proyecto Supabase de STAGING NUEVO.
-- Fuente: produccion_public_schema_2026-07-20.sql (pg_dump, schema-only, SIN datos).
-- Fidelidad TOTAL del esquema public: 27 tablas, 7 secuencias (asignaciones_id_seq + nextval),
--   12 funciones, 1 trigger, RLS + 46 políticas, constraints/uniques/FKs, comentarios,
--   usuarios.id FK -> auth.users(id) ON DELETE CASCADE.
-- EDICIONES MÍNIMAS respecto del dump (documentadas): se OMITEN \restrict/\unrestrict,
--   'CREATE SCHEMA public;' y 'COMMENT ON SCHEMA public' (no se toca el schema public);
--   se envuelve en BEGIN/COMMIT con ON_ERROR_STOP. NINGÚN cambio en DDL de objetos.
-- ACL de OBJETOS -> ASIG_EVENTOS1_A_bootstrap_staging_acl_objetos_v2_1.sql (aparte).
-- ALTER DEFAULT PRIVILEGES -> ASIG_EVENTOS1_A_bootstrap_staging_default_acl_decision_v2.md (decisión).
-- CERO COPY, CERO datos. No CREATE/DROP SCHEMA public.
-- =====================================================================
\set ON_ERROR_STOP on

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

BEGIN;

-- ---------------------------------------------------------------------
-- 0.OWN PREFLIGHT DE PROPIETARIOS (P2-A.1-CORR.2). Aborta si staging no cumple.
--   No modifica propietarios de public/auth/extensions. No hace ALTER OWNER objeto-a-objeto.
-- ---------------------------------------------------------------------
DO $own$
DECLARE v_pub text; v_auth text; v_ext text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'BOOTSTRAP: current_user=% (se requiere postgres para que los objetos nuevos queden a nombre de postgres)', current_user;
  END IF;
  SELECT pg_get_userbyid(nspowner) INTO v_pub  FROM pg_namespace WHERE nspname='public';
  SELECT pg_get_userbyid(nspowner) INTO v_auth FROM pg_namespace WHERE nspname='auth';
  SELECT pg_get_userbyid(nspowner) INTO v_ext  FROM pg_namespace WHERE nspname='extensions';
  IF v_pub  IS DISTINCT FROM 'pg_database_owner' THEN RAISE EXCEPTION 'BOOTSTRAP: public owner=% (esperado pg_database_owner)', v_pub;  END IF;
  IF v_auth IS DISTINCT FROM 'supabase_admin'    THEN RAISE EXCEPTION 'BOOTSTRAP: auth owner=% (esperado supabase_admin)', v_auth;    END IF;
  IF v_ext  IS DISTINCT FROM 'postgres'          THEN RAISE EXCEPTION 'BOOTSTRAP: extensions owner=% (esperado postgres)', v_ext;     END IF;
  RAISE NOTICE 'PREFLIGHT propietarios OK: ejecutor=postgres, public=pg_database_owner, auth=supabase_admin, extensions=postgres';
END $own$;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: get_user_contrato_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_contrato_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT contrato_id FROM public.usuarios WHERE id = auth.uid()
$$;


--
-- Name: get_user_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_rol() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$;


--
-- Name: get_user_trabajador_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_trabajador_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT trabajador_id FROM public.usuarios WHERE id = auth.uid()
$$;


--
-- Name: marcar_clave_cambiada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_clave_cambiada() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE usuarios
     SET cambio_clave_obligatorio = false,
         fecha_cambio_clave       = now(),
         fecha_primer_login       = COALESCE(fecha_primer_login, now()),
         ultimo_cambio_clave_por  = auth.uid()
   WHERE id = auth.uid();
END; $$;


--
-- Name: qr_actividad_pendiente(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_actividad_pendiente(p_dep text, p_codigo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v jsonb; v_trab text; v_act qr_actividades%rowtype;
begin
  v := qr_validar_trabajador(p_dep, p_codigo);
  if not (v->>'valido')::boolean then return jsonb_build_object('valido',false); end if;
  v_trab := v->>'trabajador_id';
  select * into v_act from qr_actividades
    where dependencia_acceso_id=p_dep and trabajador_id=v_trab and estado='en_proceso'
    order by fecha_hora_inicio desc limit 1;
  if not found then
    return jsonb_build_object('valido',true,'pendiente',false,'trabajador_id',v_trab,'nombre',v->>'nombre');
  end if;
  return jsonb_build_object('valido',true,'pendiente',true,'trabajador_id',v_trab,'nombre',v->>'nombre',
    'actividad_id',v_act.id,'fecha_hora_inicio',v_act.fecha_hora_inicio,
    'tipo_actividad',coalesce(v_act.tipo_actividad,'programada'),
    'titulo',v_act.titulo,'descripcion',v_act.descripcion,
    'prioridad',coalesce(v_act.prioridad,'normal'),
    'dependencia_ejecutada',v_act.dependencia_id,
    'dependencia_acceso',v_act.dependencia_acceso_id);
end; $$;


--
-- Name: qr_cerrar_evidencia(uuid, text, text, jsonb, text, numeric, numeric, numeric, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v jsonb; v_trab text; v_con text; v_canal text; f jsonb; v_rows int; chk text; v_foto text;
begin
  v := qr_validar_trabajador(p_dep, p_codigo);
  if not (v->>'valido')::boolean then return jsonb_build_object('ok',false,'error','trabajador_invalido'); end if;
  v_trab := v->>'trabajador_id';

  update qr_actividades
     set estado='completado', estado_operacional='completada', fecha_hora_cierre=now(),
         lat_cierre=p_lat, lng_cierre=p_lng, precision_cierre=p_precision,
         gps_cierre_obtenido=coalesce(p_gps_ok,false),
         tareas_cumplidas=coalesce(p_tareas,'[]'::jsonb), observacion=p_obs,
         cantidad_fotos_despues=coalesce(jsonb_array_length(p_fotos),0)
   where id=p_actividad and dependencia_acceso_id=p_dep and trabajador_id=v_trab and estado='en_proceso'
   returning contrato_id, coalesce(canal_origen,'qr') into v_con, v_canal;
  get diagnostics v_rows = row_count;
  if v_rows=0 then return jsonb_build_object('ok',false,'error','actividad_no_encontrada_o_ya_cerrada'); end if;

  for f in select * from jsonb_array_elements(coalesce(p_fotos,'[]'::jsonb)) loop
    insert into qr_actividad_fotos(actividad_id,tipo,orden,storage_path,public_url)
      values (p_actividad,'despues',coalesce((f->>'orden')::int,0),f->>'storage_path',f->>'public_url');
  end loop;
  v_foto := coalesce(p_fotos->0->>'public_url', null);

  for chk in select jsonb_array_elements_text(coalesce(p_tareas,'[]'::jsonb)) loop
    insert into evidencias(id, checklist_id, trabajador_id, contrato_id, fecha_hora,
        observacion, cumplido, via_qr, latitud, longitud, foto, actividad_id)
      values ('EVQR-'||substr(md5(random()::text||clock_timestamp()::text),1,14),
        chk, v_trab, v_con, now(), coalesce(p_obs,'Registrado via QR'), true, (v_canal='qr'),
        case when p_gps_ok then p_lat else null end,
        case when p_gps_ok then p_lng else null end,
        v_foto, p_actividad);
  end loop;

  return jsonb_build_object('ok',true,'actividad_id',p_actividad);
end; $$;


--
-- Name: qr_cumplimiento_dia(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_cumplimiento_dia(p_contrato text, p_fecha date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_fecha date; v_res jsonb;
begin
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Santiago')::date);

  select coalesce(jsonb_agg(jsonb_build_object(
            'dependencia_id', d.id,
            'nombre', d.nombre,
            'frecuencia_objetivo', coalesce(d.frecuencia_diaria,1),
            'completadas', coalesce(x.completadas,0),
            'en_proceso', coalesce(x.en_proceso,0),
            'estado', case when coalesce(x.completadas,0) >= coalesce(d.frecuencia_diaria,1)
                           then 'completo' else 'pendiente' end
         ) order by d.nombre), '[]'::jsonb)
    into v_res
  from dependencias d
  left join (
    select dependencia_id,
           count(*) filter (where estado_operacional = 'completada' or estado = 'completado') as completadas,
           count(*) filter (where estado_operacional = 'en_proceso') as en_proceso
      from qr_actividades
     where tipo_actividad = 'programada'
       and coalesce(estado_operacional,'') <> 'cancelada'
       and (fecha_hora_inicio at time zone 'America/Santiago')::date = v_fecha
     group by dependencia_id
  ) x on x.dependencia_id = d.id
  where d.contrato_id = p_contrato;

  return jsonb_build_object('valido', true, 'fecha', v_fecha, 'dependencias', v_res);
end; $$;


--
-- Name: qr_dependencia(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_dependencia(p_dep text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_dep dependencias%rowtype; v_con contratos%rowtype; v_chk jsonb; v_deps jsonb;
begin
  select * into v_dep from dependencias where id = p_dep;
  if not found then return jsonb_build_object('valido',false,'error','dependencia_no_encontrada'); end if;
  select * into v_con from contratos where id = v_dep.contrato_id;
  if not found then return jsonb_build_object('valido',false,'error','contrato_no_encontrado'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'tarea',c.tarea,'periodicidad',c.periodicidad) order by c.id),'[]'::jsonb)
    into v_chk from checklist c where c.dep_id = v_dep.id and c.activa = true;

  -- dependencias del mismo contrato (incluida la del QR), para el selector
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'nombre',d.nombre) order by d.nombre),'[]'::jsonb)
    into v_deps from dependencias d where d.contrato_id = v_dep.contrato_id;

  return jsonb_build_object(
    'valido', true,
    'dependencia', jsonb_build_object('id',v_dep.id,'nombre',v_dep.nombre,'contrato_id',v_dep.contrato_id),
    'contrato', jsonb_build_object('id',v_con.id,'cliente',v_con.cliente),
    'checklist', v_chk,
    'dependencias_contrato', v_deps);
end; $$;


--
-- Name: qr_iniciar_evidencia(text, text, numeric, numeric, numeric, boolean, jsonb, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text DEFAULT 'programada'::text, p_canal text DEFAULT 'qr'::text, p_solicitante text DEFAULT 'trabajador'::text, p_titulo text DEFAULT NULL::text, p_descripcion text DEFAULT NULL::text, p_prioridad text DEFAULT 'normal'::text, p_plantilla_id text DEFAULT NULL::text, p_plantilla_version text DEFAULT NULL::text, p_dependencia_ejecutada text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v jsonb; v_trab text; v_con text; v_act uuid; f jsonb; v_dep_ejec text;
        v_tipo text; v_num int := null; v_obj int := null; v_inferido boolean := false;
begin
  v := qr_validar_trabajador(p_dep, p_codigo);  -- se valida en el punto de ACCESO
  if not (v->>'valido')::boolean then return jsonb_build_object('ok',false,'error','trabajador_invalido'); end if;
  v_trab := v->>'trabajador_id';

  select contrato_id into v_con from dependencias where id = p_dep;
  if v_con is null then return jsonb_build_object('ok',false,'error','dependencia_acceso_no_encontrada'); end if;

  v_dep_ejec := coalesce(nullif(p_dependencia_ejecutada,''), p_dep);
  if v_dep_ejec <> p_dep then
    perform 1 from dependencias where id = v_dep_ejec and contrato_id = v_con;
    if not found then return jsonb_build_object('ok',false,'error','dependencia_ejecutada_invalida'); end if;
  end if;

  v_tipo := coalesce(p_tipo,'programada');

  -- Solo la Programada cuenta hacia la frecuencia. "Hoy" en hora de Chile.
  if v_tipo = 'programada' then
    select coalesce(frecuencia_diaria,1) into v_obj from dependencias where id = v_dep_ejec;
    v_obj := coalesce(v_obj,1);
    select count(*) into v_num
      from qr_actividades
     where dependencia_id = v_dep_ejec
       and tipo_actividad = 'programada'
       and coalesce(estado_operacional,'') <> 'cancelada'
       and (fecha_hora_inicio at time zone 'America/Santiago')::date
           = (now() at time zone 'America/Santiago')::date;
    v_num := coalesce(v_num,0);

    if v_num >= v_obj then
      -- LO-002: la obligacion del dia YA esta cumplida.
      -- El exceso NO es un control programado: nace EXTRAORDINARIO (inferido en el servidor).
      -- Imposible producir "Control 3 de 2".
      v_tipo := 'extraordinaria';
      v_num := null; v_obj := null; v_inferido := true;
    else
      v_num := v_num + 1;   -- numero de control dentro de la obligacion del dia
    end if;
  end if;

  insert into qr_actividades(dependencia_id, dependencia_acceso_id, contrato_id, trabajador_id,
      estado, estado_operacional,
      lat_inicio,lng_inicio,precision_inicio,gps_inicio_obtenido,cantidad_fotos_antes,
      tipo_actividad, canal_origen, solicitante, titulo, descripcion, prioridad, via_qr,
      plantilla_id, plantilla_version,
      numero_pasada, pasadas_objetivo)
    values (v_dep_ejec, p_dep, v_con, v_trab,
      'en_proceso','en_proceso',
      p_lat,p_lng,p_precision,coalesce(p_gps_ok,false),coalesce(jsonb_array_length(p_fotos),0),
      v_tipo, coalesce(p_canal,'qr'), coalesce(p_solicitante,'trabajador'),
      p_titulo, p_descripcion, coalesce(p_prioridad,'normal'),
      (coalesce(p_canal,'qr') = 'qr'),
      coalesce(p_plantilla_id, v_tipo, 'programada'), p_plantilla_version,
      v_num, v_obj)
    returning id into v_act;

  for f in select * from jsonb_array_elements(coalesce(p_fotos,'[]'::jsonb)) loop
    insert into qr_actividad_fotos(actividad_id,tipo,orden,storage_path,public_url)
      values (v_act,'antes',coalesce((f->>'orden')::int,0),f->>'storage_path',f->>'public_url');
  end loop;

  -- 'tipo' y 'extraordinario_por_cumplimiento' permiten a la UI reflejar el contexto
  -- (la pantalla cambia a "Control Extraordinario" sin preguntar ni decidir por su cuenta).
  return jsonb_build_object('ok',true,'actividad_id',v_act,'trabajador_id',v_trab,'nombre',v->>'nombre',
    'tipo', v_tipo, 'extraordinario_por_cumplimiento', v_inferido,
    'numero_pasada', v_num, 'pasadas_objetivo', v_obj);
end; $$;


--
-- Name: qr_validar_trabajador(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_validar_trabajador(p_dep text, p_codigo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_con text; v_t trabajadores%rowtype; v_produce boolean;
begin
  -- (idéntico a v1) dependencia existente
  select contrato_id into v_con from dependencias where id = p_dep;
  if v_con is null then return jsonb_build_object('valido',false,'error','dependencia_no_encontrada'); end if;

  -- (idéntico a v1) RUT tolerante a formato o codigo interno (TR...)
  select * into v_t from trabajadores
   where regexp_replace(lower(coalesce(rut,'')),'[^0-9k]','','g') = regexp_replace(lower(p_codigo),'[^0-9k]','','g')
      or id = p_codigo
   limit 1;
  if not found then return jsonb_build_object('valido',false); end if;

  -- (idéntico a v1) asignacion activa a la dependencia/contrato
  if not exists (select 1 from asignaciones a
        where a.trabajador_id = v_t.id and a.contrato_id = v_con
          and a.estado_asig = 'activa' and a.activo is distinct from false) then
    return jsonb_build_object('valido',false);
  end if;

  -- ── NUEVO v2 (RRHH.2-B): el trabajador debe PRODUCIR EFECTOS ──
  -- produce_efectos, replicando el orden EXACTO del helper puedeOperarEnMotor:
  if v_t.estado_ingreso = 'ACTIVO_COMPLETO' then
    v_produce := true;
  elsif v_t.estado_ingreso = 'ACTIVACION_EXCEPCIONAL' then
    -- excepcion vigente: todos los campos completos + pendiente + no vencida. (No cae a es_heredado.)
    v_produce := ( v_t.excepcion_motivo is not null and v_t.excepcion_autorizado_por is not null
                   and v_t.excepcion_fecha is not null and v_t.excepcion_fecha_limite_regularizacion is not null
                   and v_t.excepcion_estado_regularizacion = 'pendiente'
                   and v_t.excepcion_fecha_limite_regularizacion >= current_date );
  elsif v_t.es_heredado = true then
    v_produce := true;
  else
    v_produce := false;  -- PENDIENTE_*, BORRADOR, null
  end if;

  -- Gate completo (equivalente a puedeOperarEnMotor): activo + estado operativo + produce_efectos.
  -- Cierra el hueco del DESVINCULADO (estado) y contiene PREINGRESO/PENDIENTE_* (produce_efectos).
  if not ( (v_t.activo is distinct from false)
           and (v_t.estado in ('ACTIVO','PREAVISO'))
           and v_produce ) then
    return jsonb_build_object('valido',false,'motivo','no_produce_efectos');
  end if;

  -- (idéntico a v1) valido
  return jsonb_build_object('valido',true,'trabajador_id',v_t.id,'nombre',v_t.nombre);
end; $$;


--
-- Name: registrar_primer_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_primer_login() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE usuarios
     SET fecha_primer_login = COALESCE(fecha_primer_login, now())
   WHERE id = auth.uid();
END; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anexos_contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anexos_contrato (
    id text NOT NULL,
    trabajador_id text,
    tipo_anexo text NOT NULL,
    fecha_firma date,
    fecha_vigencia date NOT NULL,
    motivo text,
    sueldo_anterior numeric DEFAULT 0,
    sueldo_nuevo numeric DEFAULT 0,
    jornada_anterior text,
    jornada_nueva text,
    horario_anterior text,
    horario_nuevo text,
    centro_anterior text,
    centro_nuevo text,
    porcentaje_anterior numeric DEFAULT 0,
    porcentaje_nuevo numeric DEFAULT 0,
    documento_url text,
    estado text DEFAULT 'borrador'::text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now(),
    clausulas jsonb,
    asignacion_origen_id integer,
    contrato_origen_id text,
    tipo_origen_anexo text,
    impacto_laboral text
);


--
-- Name: TABLE anexos_contrato; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.anexos_contrato IS 'Modificaciones laborales formales. El ERP NO modifica datos hasta estado=aplicado.';


--
-- Name: COLUMN anexos_contrato.tipo_anexo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anexos_contrato.tipo_anexo IS 'reduccion_jornada | aumento_jornada | reduccion_remuneracion | aumento_remuneracion | cambio_horario | cambio_centro | cambio_multiple';


--
-- Name: COLUMN anexos_contrato.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anexos_contrato.estado IS 'borrador | pendiente_firma | firmado | aplicado | anulado';


--
-- Name: COLUMN anexos_contrato.clausulas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.anexos_contrato.clausulas IS 'J1.1: array de cláusulas estructuradas que el anexo (acto) modifica, con su efecto (establece_total | reemplaza_total | agrega_componente | modifica_componente | reduce_componente | cierra_componente | consolida_total) y vigencia. Fuente para jornadaVigente.';


--
-- Name: asignaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones (
    id integer NOT NULL,
    trabajador_id text,
    contrato_id text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    sueldo_asignado numeric DEFAULT 0,
    bono_asistencia numeric DEFAULT 0,
    bono_movilizacion numeric DEFAULT 0,
    bono_colacion numeric DEFAULT 0,
    gratificacion_monto numeric DEFAULT 0,
    monto_asignado numeric DEFAULT 0,
    porcentaje_costo numeric DEFAULT 100,
    afecta_remuneracion boolean DEFAULT true,
    afecta_facturacion boolean DEFAULT false,
    horas_semanales numeric,
    dias_semana text,
    horario text,
    jornada text,
    fecha_inicio_asig date,
    fecha_termino_asig date,
    estado_asig text DEFAULT 'activa'::text,
    descripcion text,
    modalidad_cobertura text,
    origen_trabajador text,
    gratificacion_metodo_asig text,
    gratificacion_porcentaje_asig numeric,
    gratificacion_observacion_asig text,
    es_asignacion_base boolean DEFAULT false NOT NULL,
    base_origen text,
    base_inferencia_confianza text,
    base_inferencia_motivo text,
    base_inferencia_advertencias jsonb DEFAULT '[]'::jsonb NOT NULL,
    base_inferencia_fecha date,
    rol_asignacion text,
    estado_evaluacion_documental text,
    tipo_impacto_laboral text,
    motivo_evaluacion_documental text,
    colacion_minutos numeric,
    colacion_imputable boolean
);


--
-- Name: COLUMN asignaciones.sueldo_asignado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.sueldo_asignado IS 'Costo imputable a este centro. NO es el sueldo legal del trabajador.';


--
-- Name: COLUMN asignaciones.porcentaje_costo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.porcentaje_costo IS '% del costo total del trabajador financiado por este centro';


--
-- Name: COLUMN asignaciones.afecta_remuneracion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.afecta_remuneracion IS 'TRUE = suma a liquidación mensual | FALSE = solo control operacional';


--
-- Name: COLUMN asignaciones.afecta_facturacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.afecta_facturacion IS 'TRUE = genera línea en facturación al cliente';


--
-- Name: COLUMN asignaciones.modalidad_cobertura; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.modalidad_cobertura IS 'J2-lite: cómo se cubre esta asignación con el trabajador. Opcional. No calcula nada aún.';


--
-- Name: COLUMN asignaciones.gratificacion_metodo_asig; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.gratificacion_metodo_asig IS 'A.3: método de gratificación asociado a la asignación. Solo captura; el cálculo legal se hace en Remuneraciones. gratificacion_monto se mantiene por compatibilidad.';


--
-- Name: COLUMN asignaciones.es_asignacion_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.es_asignacion_base IS 'RRHH.1-A: decisión persistida. Esta asignación es la base del trabajador.';


--
-- Name: COLUMN asignaciones.base_origen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.base_origen IS 'RRHH.1-A: origen de la decisión: automatica|manual|migracion|corregida.';


--
-- Name: COLUMN asignaciones.base_inferencia_confianza; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.base_inferencia_confianza IS 'RRHH.1-A: SELLO HISTÓRICO de inferencia (no estado vigente). alta|media|baja|revision.';


--
-- Name: COLUMN asignaciones.base_inferencia_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.base_inferencia_motivo IS 'RRHH.1-A: SELLO HISTÓRICO de inferencia (no estado vigente). Motivo del diagnóstico.';


--
-- Name: COLUMN asignaciones.base_inferencia_advertencias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.base_inferencia_advertencias IS 'RRHH.1-A: SELLO HISTÓRICO. Lista JSONB de advertencias de calidad al inferir la base.';


--
-- Name: COLUMN asignaciones.base_inferencia_fecha; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.asignaciones.base_inferencia_fecha IS 'RRHH.1-A: SELLO HISTÓRICO. Fecha en que se infirió la base (carga/diagnóstico).';


--
-- Name: asignaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaciones_id_seq OWNED BY public.asignaciones.id;


--
-- Name: asistencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencia (
    id text NOT NULL,
    trabajador_id text,
    contrato_id text,
    fecha date NOT NULL,
    hora_entrada time without time zone,
    hora_colacion_salida time without time zone,
    hora_colacion_regreso time without time zone,
    hora_salida time without time zone,
    atraso_minutos integer DEFAULT 0,
    horas_trabajadas numeric(4,2) DEFAULT 0,
    horas_extra numeric(4,2) DEFAULT 0,
    es_feriado boolean DEFAULT false,
    estado text DEFAULT 'PRESENTE'::text,
    observacion text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: checklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist (
    id text NOT NULL,
    dep_id text,
    contrato_id text,
    tarea text,
    periodicidad text,
    obligatoria boolean DEFAULT true,
    activa boolean DEFAULT true,
    CONSTRAINT checklist_periodicidad_check CHECK ((periodicidad = ANY (ARRAY['DIARIA'::text, 'SEMANAL'::text, 'QUINCENAL'::text, 'MENSUAL'::text, 'TRIMESTRAL'::text, 'SEMESTRAL'::text, 'ANUAL'::text])))
);


--
-- Name: contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos (
    id text NOT NULL,
    cliente text,
    instalacion text,
    direccion text,
    supervisor_id text,
    estado text DEFAULT 'Vigente'::text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tipo_centro_costo text DEFAULT 'LICITACION'::text,
    estado_financiero text DEFAULT 'financiado'::text,
    centro_padre text,
    cliente_eventual text,
    orden_servicio text,
    fecha_inicio_contrato date,
    fecha_termino_contrato date,
    probabilidad_renovacion text DEFAULT 'media'::text,
    estado_renovacion text DEFAULT 'pendiente'::text,
    dias_alerta integer DEFAULT 60,
    licitacion_id text,
    valor_referencial_contrato numeric,
    periodicidad_valor text,
    tipo_documento_fuente text,
    rut_cliente text
);


--
-- Name: COLUMN contratos.tipo_centro_costo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.tipo_centro_costo IS 'LICITACION | CORPORATIVO | EVENTUAL';


--
-- Name: COLUMN contratos.estado_financiero; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.estado_financiero IS 'financiado | parcial | sin_financiamiento | en_riesgo | cerrado';


--
-- Name: COLUMN contratos.centro_padre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.centro_padre IS 'ID del centro padre para jerarquía corporativa (ej: CORP002 -> CORP001)';


--
-- Name: COLUMN contratos.valor_referencial_contrato; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.valor_referencial_contrato IS 'J2-lite: ingreso/valor referencial de la unidad operacional (contrato/centro de costo). NO es factura emitida, caja recibida ni margen. No pertenece a un trabajador.';


--
-- Name: COLUMN contratos.rut_cliente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contratos.rut_cliente IS 'CC.1: RUT del cliente/institución/mandante receptor del servicio. Requerido para centros externos (licitaciones, privados, eventuales); opcional para CORPORATIVO. Base para documentación/facturación futura. No es facturación aún.';


--
-- Name: cumplimiento_egreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cumplimiento_egreso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trabajador_id text NOT NULL,
    tarea text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    fecha_limite date,
    fecha_informado timestamp with time zone,
    responsable text,
    medio text,
    notif_fecha timestamp with time zone,
    notif_correo text,
    notif_asunto text,
    notif_texto text,
    pago_fecha date,
    pago_medio text,
    pago_monto numeric,
    nota text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dependencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dependencias (
    id text NOT NULL,
    contrato_id text,
    nombre text,
    qr text,
    activo boolean DEFAULT true,
    frecuencia_diaria integer DEFAULT 1
);


--
-- Name: desvinculaciones_programadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desvinculaciones_programadas (
    id text NOT NULL,
    trabajador_id text NOT NULL,
    causal text DEFAULT 'art161'::text NOT NULL,
    fecha_carta date NOT NULL,
    fecha_separacion date NOT NULL,
    dias_aviso integer,
    sustitutiva boolean DEFAULT false,
    estado text DEFAULT 'programada'::text NOT NULL,
    observaciones text,
    motivo_cancelacion text,
    responsable_cancelacion text,
    fecha_cancelacion date,
    finalizada_por text,
    fecha_finalizacion date,
    finalizacion_anticipada boolean DEFAULT false,
    motivo_finalizacion text,
    sustitutiva_acuerdo text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text
);


--
-- Name: documentos_trabajador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_trabajador (
    id text NOT NULL,
    trabajador_id text NOT NULL,
    tipo_documento text NOT NULL,
    origen text DEFAULT 'generado_erp'::text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    fecha_documento timestamp with time zone,
    fecha_carga timestamp with time zone DEFAULT now() NOT NULL,
    archivo_url text,
    nombre_archivo text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    metodo_firma text,
    firmado_por text,
    fecha_firma timestamp with time zone,
    hash_documento text,
    ip_firma text,
    datos_documento jsonb
);


--
-- Name: empresa_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actual boolean DEFAULT true NOT NULL,
    razon_social text NOT NULL,
    nombre_fantasia text,
    rut text NOT NULL,
    giro text,
    domicilio text,
    ciudad text,
    region text,
    pais text,
    rep_nombre text,
    rep_rut text,
    rep_cargo text,
    correo_admin text,
    correo_general text,
    telefono text,
    sitio_web text,
    logo_url text,
    mutualidad text,
    caja_compensacion text,
    ciudad_emision text,
    firmante_nombre text,
    firmante_cargo text,
    firmante_correo text,
    firmante_telefono text,
    banco text,
    tipo_cuenta text,
    numero_cuenta text,
    titular_cuenta text,
    rut_titular text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entregas_epp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entregas_epp (
    id text NOT NULL,
    trabajador_id text NOT NULL,
    articulo text NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    talla text,
    estado text DEFAULT 'entregado'::text NOT NULL,
    fecha_entrega date,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evaluaciones_vencimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluaciones_vencimiento (
    id text NOT NULL,
    contrato_id text NOT NULL,
    fecha_alerta date,
    trabajadores_afectados jsonb,
    accion text NOT NULL,
    responsable text,
    observaciones text,
    fecha_resolucion date,
    nueva_fecha_termino date,
    detalle jsonb,
    estado text DEFAULT 'resuelta'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text
);


--
-- Name: evidencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidencias (
    id text NOT NULL,
    checklist_id text,
    trabajador_id text,
    contrato_id text,
    fecha_hora timestamp with time zone DEFAULT now(),
    observacion text,
    cumplido boolean DEFAULT true,
    via_qr boolean DEFAULT false,
    latitud numeric,
    longitud numeric,
    foto text,
    actividad_id uuid
);


--
-- Name: feriados_chile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feriados_chile (
    fecha date NOT NULL,
    nombre text,
    tipo text DEFAULT 'nacional'::text
);


--
-- Name: horarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horarios (
    id integer NOT NULL,
    trabajador_id text,
    contrato_id text,
    nombre_turno text,
    dias_semana text NOT NULL,
    hora_entrada time without time zone NOT NULL,
    hora_salida time without time zone NOT NULL,
    colacion_minutos integer DEFAULT 0,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: horarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.horarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: horarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.horarios_id_seq OWNED BY public.horarios.id;


--
-- Name: incidencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidencias (
    id text NOT NULL,
    contrato_id text,
    dep_id text,
    fecha_hora timestamp with time zone DEFAULT now(),
    tipo text,
    descripcion text,
    estado text DEFAULT 'Abierta'::text,
    trabajador_id text
);


--
-- Name: liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidaciones (
    id integer NOT NULL,
    periodo text NOT NULL,
    trabajador_id text,
    contrato_id text,
    dias_trabajados integer DEFAULT 30 NOT NULL,
    horas_extra numeric DEFAULT 0 NOT NULL,
    otros_haberes integer DEFAULT 0 NOT NULL,
    otros_descuentos integer DEFAULT 0 NOT NULL,
    sueldo_base integer DEFAULT 0 NOT NULL,
    sueldo_proporcional integer DEFAULT 0 NOT NULL,
    gratificacion integer DEFAULT 0 NOT NULL,
    horas_extra_valor integer DEFAULT 0 NOT NULL,
    bono_asistencia integer DEFAULT 0 NOT NULL,
    bono_movilizacion integer DEFAULT 0 NOT NULL,
    bono_colacion integer DEFAULT 0 NOT NULL,
    total_haberes integer DEFAULT 0 NOT NULL,
    rem_imponible integer DEFAULT 0 NOT NULL,
    afp text,
    tasa_afp numeric DEFAULT 0 NOT NULL,
    cotiz_afp integer DEFAULT 0 NOT NULL,
    cotiz_salud integer DEFAULT 0 NOT NULL,
    ces_trabajador integer DEFAULT 0 NOT NULL,
    total_descuentos integer DEFAULT 0 NOT NULL,
    liquido integer DEFAULT 0 NOT NULL,
    sis integer DEFAULT 0 NOT NULL,
    ces_empleador integer DEFAULT 0 NOT NULL,
    costo_empresa integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    descripcion text DEFAULT ''::text,
    dias_licencia_medica integer DEFAULT 0,
    dias_permiso_sin_goce integer DEFAULT 0,
    dias_vacaciones integer DEFAULT 0,
    dias_inasistencia integer DEFAULT 0,
    iusc integer DEFAULT 0,
    mutualidad_valor integer DEFAULT 0,
    aporte_patronal_valor integer DEFAULT 0,
    ces_trab_tasa numeric DEFAULT 0,
    ces_emp_tasa numeric DEFAULT 0,
    firmado_at timestamp with time zone,
    firmado_por text
);


--
-- Name: COLUMN liquidaciones.firmado_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones.firmado_at IS 'Timestamp de acuse de recibo del trabajador';


--
-- Name: COLUMN liquidaciones.firmado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.liquidaciones.firmado_por IS 'Nombre del trabajador que firmó el acuse';


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidaciones_id_seq OWNED BY public.liquidaciones.id;


--
-- Name: obligaciones_mensuales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.obligaciones_mensuales (
    id text NOT NULL,
    tipo text NOT NULL,
    nombre text NOT NULL,
    periodo text NOT NULL,
    fecha_vence date NOT NULL,
    estado text DEFAULT 'pendiente'::text,
    responsable text,
    monto numeric DEFAULT 0,
    comprobante text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now(),
    fecha_pago date,
    fecha_preparacion date,
    categoria text DEFAULT 'previsional'::text,
    subtipo text
);


--
-- Name: TABLE obligaciones_mensuales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.obligaciones_mensuales IS 'Obligaciones tributarias y previsionales LEG';


--
-- Name: COLUMN obligaciones_mensuales.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.obligaciones_mensuales.tipo IS 'previred | f29 | lre | patente | seguro | dj1887 | otro';


--
-- Name: COLUMN obligaciones_mensuales.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.obligaciones_mensuales.estado IS 'pendiente | preparado | pagado | vencido';


--
-- Name: COLUMN obligaciones_mensuales.categoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.obligaciones_mensuales.categoria IS 'previsional | tributaria | laboral | municipal | otra';


--
-- Name: ordenes_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_servicio (
    id text NOT NULL,
    centro_id text,
    cliente text,
    descripcion text,
    fecha_inicio date,
    fecha_termino date,
    monto_facturado numeric DEFAULT 0,
    monto_costo numeric DEFAULT 0,
    estado text DEFAULT 'pendiente'::text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE ordenes_servicio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ordenes_servicio IS 'Servicios eventuales y trabajos puntuales. Alimenta remuneración y/o facturación según afecta_facturacion.';


--
-- Name: parametros_legales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_legales (
    id integer NOT NULL,
    periodo text NOT NULL,
    uf numeric NOT NULL,
    utm integer NOT NULL,
    imm integer NOT NULL,
    imm_joven integer NOT NULL,
    tope_imponible_uf numeric DEFAULT 84.3 NOT NULL,
    horas_mensuales integer DEFAULT 180 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tope_cesantia_uf numeric DEFAULT 135.2,
    ces_trab_indefinido numeric DEFAULT 0.006,
    ces_trab_plazo_fijo numeric DEFAULT 0.000,
    ces_emp_indefinido numeric DEFAULT 0.024,
    ces_emp_plazo_fijo numeric DEFAULT 0.030,
    mutualidad numeric DEFAULT 0.0093,
    aporte_patronal numeric DEFAULT 0.010,
    salud_trabajador numeric DEFAULT 0.070,
    fecha_actualizacion date,
    fuente text,
    actualizado_por text
);


--
-- Name: parametros_legales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parametros_legales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parametros_legales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parametros_legales_id_seq OWNED BY public.parametros_legales.id;


--
-- Name: qr_actividad_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_actividad_fotos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actividad_id uuid NOT NULL,
    tipo text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    storage_path text NOT NULL,
    public_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qr_actividad_fotos_tipo_check CHECK ((tipo = ANY (ARRAY['antes'::text, 'despues'::text])))
);


--
-- Name: qr_actividades_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qr_actividades_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qr_actividades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_actividades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dependencia_id text NOT NULL,
    contrato_id text,
    trabajador_id text NOT NULL,
    estado text DEFAULT 'en_proceso'::text NOT NULL,
    fecha_hora_inicio timestamp with time zone DEFAULT now() NOT NULL,
    lat_inicio numeric,
    lng_inicio numeric,
    precision_inicio numeric,
    gps_inicio_obtenido boolean DEFAULT false NOT NULL,
    fecha_hora_cierre timestamp with time zone,
    lat_cierre numeric,
    lng_cierre numeric,
    precision_cierre numeric,
    gps_cierre_obtenido boolean DEFAULT false NOT NULL,
    tareas_cumplidas jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacion text,
    cantidad_fotos_antes integer DEFAULT 0 NOT NULL,
    cantidad_fotos_despues integer DEFAULT 0 NOT NULL,
    estado_sincronizacion text DEFAULT 'sincronizado'::text NOT NULL,
    fecha_sincronizacion timestamp with time zone,
    via_qr boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_actividad text DEFAULT 'programada'::text,
    folio bigint DEFAULT nextval('public.qr_actividades_folio_seq'::regclass),
    canal_origen text DEFAULT 'qr'::text,
    solicitante text DEFAULT 'trabajador'::text,
    titulo text,
    descripcion text,
    prioridad text DEFAULT 'normal'::text,
    estado_operacional text DEFAULT 'en_proceso'::text,
    datos_operacionales jsonb,
    datos_expediente jsonb,
    plantilla_id text,
    plantilla_version text,
    incidencia_id text,
    dependencia_acceso_id text,
    numero_pasada integer,
    pasadas_objetivo integer,
    CONSTRAINT qr_act_estadoop_chk CHECK ((estado_operacional = ANY (ARRAY['pendiente'::text, 'en_proceso'::text, 'pausada'::text, 'completada'::text, 'cancelada'::text]))),
    CONSTRAINT qr_act_prio_chk CHECK ((prioridad = ANY (ARRAY['normal'::text, 'alta'::text, 'critica'::text]))),
    CONSTRAINT qr_act_solic_chk CHECK ((solicitante = ANY (ARRAY['trabajador'::text, 'supervisor'::text, 'cliente'::text, 'empresa'::text, 'ia'::text]))),
    CONSTRAINT qr_act_tipo_chk CHECK ((tipo_actividad = ANY (ARRAY['programada'::text, 'extraordinaria'::text, 'repaso'::text, 'emergencia'::text, 'supervision'::text, 'auditoria'::text]))),
    CONSTRAINT qr_actividades_estado_check CHECK ((estado = ANY (ARRAY['en_proceso'::text, 'completado'::text]))),
    CONSTRAINT qr_actividades_estado_sincronizacion_check CHECK ((estado_sincronizacion = ANY (ARRAY['pendiente'::text, 'sincronizado'::text, 'error'::text])))
);


--
-- Name: supervisiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervisiones (
    id text NOT NULL,
    contrato_id text,
    supervisor_id text,
    fecha date DEFAULT CURRENT_DATE,
    cumplimiento integer,
    observacion text,
    CONSTRAINT supervisiones_cumplimiento_check CHECK (((cumplimiento >= 0) AND (cumplimiento <= 100)))
);


--
-- Name: tabla_iusc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tabla_iusc (
    id integer NOT NULL,
    tramo integer NOT NULL,
    desde_utm numeric NOT NULL,
    hasta_utm numeric,
    tasa numeric DEFAULT 0 NOT NULL,
    factor_deduccion_utm numeric DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true
);


--
-- Name: tabla_iusc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tabla_iusc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tabla_iusc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tabla_iusc_id_seq OWNED BY public.tabla_iusc.id;


--
-- Name: tasas_afp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasas_afp (
    id integer NOT NULL,
    nombre text NOT NULL,
    tasa_trabajador numeric DEFAULT 0 NOT NULL,
    sis numeric DEFAULT 0 NOT NULL
);


--
-- Name: tasas_afp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasas_afp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasas_afp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasas_afp_id_seq OWNED BY public.tasas_afp.id;


--
-- Name: trabajadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trabajadores (
    id text NOT NULL,
    nombre text NOT NULL,
    cargo text,
    telefono text,
    email text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    rut text,
    sueldo_base integer DEFAULT 0,
    tipo_contrato text DEFAULT 'PLAZO FIJO'::text,
    afp text DEFAULT 'MODELO'::text,
    salud text DEFAULT 'FONASA'::text,
    bono_asistencia integer DEFAULT 0,
    bono_movilizacion integer DEFAULT 0,
    bono_colacion integer DEFAULT 0,
    metodo_gratificacion text DEFAULT '25% MENSUAL'::text,
    valor_gratificacion numeric DEFAULT 0,
    estado text DEFAULT 'ACTIVO'::text,
    gratificacion_porcentaje numeric DEFAULT 25,
    gratificacion_monto integer DEFAULT 0,
    fecha_inicio date,
    pensionado boolean DEFAULT false,
    fecha_separacion date,
    motivo_termino text,
    finiquito_estado text DEFAULT 'na'::text,
    correo_notificaciones text,
    autoriza_com_electronica boolean DEFAULT false,
    fecha_actualizacion_datos date,
    domicilio text,
    nacionalidad text,
    fecha_nacimiento date,
    estado_civil text,
    fecha_termino_plazo date,
    ciudad text,
    region text,
    jornada_pactada jsonb,
    clausulas_contrato_original jsonb,
    estado_ingreso text,
    activacion_aprobada_por text,
    activacion_fecha timestamp with time zone,
    excepcion_motivo text,
    excepcion_alcance text,
    excepcion_autorizado_por text,
    excepcion_fecha timestamp with time zone,
    excepcion_fecha_limite_regularizacion date,
    excepcion_estado_regularizacion text,
    es_heredado boolean,
    es_dato_prueba boolean DEFAULT false
);


--
-- Name: COLUMN trabajadores.jornada_pactada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.jornada_pactada IS 'J1: jornada pactada estructurada (fuente única). Esquema: {tipo, dias[], hora_inicio, hora_termino, colacion_minutos, colacion_imputable, horas_semanales, vigencia_desde, fuente, anexo_id, observaciones}. Los campos legacy trabajadores.jornada/horario pasan a ser proyección generada desde aquí. El tope legal NO vive aquí: es parámetro normativo (ver helper topeLegalJornada).';


--
-- Name: COLUMN trabajadores.clausulas_contrato_original; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.clausulas_contrato_original IS 'J1.1: array de cláusulas estructuradas del contrato laboral ORIGINAL (acto jurídico). Cada cláusula: {clausula, acto_tipo:"contrato_original", acto_id, vigencia_desde (fecha REAL del contrato), vigencia_hasta, efecto, componente_id, regla_legal, contenido, captura_tecnica}. La jornada vigente se DERIVA de estos actos (funcion jornadaVigente). captura_tecnica es metadata sin efecto juridico.';


--
-- Name: COLUMN trabajadores.estado_ingreso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.estado_ingreso IS 'RRHH.2-B: etapa del flujo de ingreso (BORRADOR..ACTIVO_COMPLETO/ACTIVACION_EXCEPCIONAL). Checklist se calcula en vivo; aqui solo la etapa alcanzada.';


--
-- Name: COLUMN trabajadores.activacion_aprobada_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.activacion_aprobada_por IS 'RRHH.2-B: usuario que aprobo la activacion normal (traza de decision).';


--
-- Name: COLUMN trabajadores.activacion_fecha; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.activacion_fecha IS 'RRHH.2-B: fecha de la activacion normal.';


--
-- Name: COLUMN trabajadores.excepcion_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_motivo IS 'RRHH.2-B: motivo de ACTIVACION_EXCEPCIONAL. No equivale a ACTIVO_COMPLETO.';


--
-- Name: COLUMN trabajadores.excepcion_alcance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_alcance IS 'RRHH.2-B: alcance limitado de la activacion excepcional.';


--
-- Name: COLUMN trabajadores.excepcion_autorizado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_autorizado_por IS 'RRHH.2-B: usuario que autorizo la excepcion.';


--
-- Name: COLUMN trabajadores.excepcion_fecha; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_fecha IS 'RRHH.2-B: fecha de la activacion excepcional.';


--
-- Name: COLUMN trabajadores.excepcion_fecha_limite_regularizacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_fecha_limite_regularizacion IS 'RRHH.2-B: plazo limite para regularizar la excepcion.';


--
-- Name: COLUMN trabajadores.excepcion_estado_regularizacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.excepcion_estado_regularizacion IS 'RRHH.2-B: pendiente|regularizada|vencida.';


--
-- Name: COLUMN trabajadores.es_heredado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trabajadores.es_heredado IS 'RRHH.2-B FASE 3-C: true = trabajador anterior a RRHH.2-B (grandfathering transitorio + alerta de saneamiento). false/null = mundo nuevo estricto. Tiene prioridad sobre estado_ingreso PENDIENTE_* en el helper.';


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    email text NOT NULL,
    nombre text NOT NULL,
    rol text NOT NULL,
    trabajador_id text,
    contrato_id text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cambio_clave_obligatorio boolean DEFAULT true,
    fecha_primer_login timestamp with time zone,
    fecha_cambio_clave timestamp with time zone,
    ultimo_cambio_clave_por uuid,
    CONSTRAINT usuarios_rol_check CHECK ((rol = ANY (ARRAY['administrador'::text, 'supervisor'::text, 'trabajador'::text, 'cliente'::text])))
);


--
-- Name: TABLE usuarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usuarios IS 'Usuarios del sistema con roles de acceso';


--
-- Name: COLUMN usuarios.trabajador_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usuarios.trabajador_id IS 'Vincula con tabla trabajadores (solo rol=trabajador)';


--
-- Name: COLUMN usuarios.contrato_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usuarios.contrato_id IS 'Restringe acceso a un contrato (solo rol=cliente)';


--
-- Name: asignaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_id_seq'::regclass);


--
-- Name: horarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios ALTER COLUMN id SET DEFAULT nextval('public.horarios_id_seq'::regclass);


--
-- Name: liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.liquidaciones_id_seq'::regclass);


--
-- Name: parametros_legales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_legales ALTER COLUMN id SET DEFAULT nextval('public.parametros_legales_id_seq'::regclass);


--
-- Name: tabla_iusc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_iusc ALTER COLUMN id SET DEFAULT nextval('public.tabla_iusc_id_seq'::regclass);


--
-- Name: tasas_afp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_afp ALTER COLUMN id SET DEFAULT nextval('public.tasas_afp_id_seq'::regclass);


--
-- Name: anexos_contrato anexos_contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos_contrato
    ADD CONSTRAINT anexos_contrato_pkey PRIMARY KEY (id);


--
-- Name: asignaciones asignaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_pkey PRIMARY KEY (id);


--
-- Name: asignaciones asignaciones_trabajador_id_contrato_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_trabajador_id_contrato_id_key UNIQUE (trabajador_id, contrato_id);


--
-- Name: asistencia asistencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia
    ADD CONSTRAINT asistencia_pkey PRIMARY KEY (id);


--
-- Name: asistencia asistencia_trabajador_id_contrato_id_fecha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia
    ADD CONSTRAINT asistencia_trabajador_id_contrato_id_fecha_key UNIQUE (trabajador_id, contrato_id, fecha);


--
-- Name: checklist checklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist
    ADD CONSTRAINT checklist_pkey PRIMARY KEY (id);


--
-- Name: contratos contratos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_pkey PRIMARY KEY (id);


--
-- Name: cumplimiento_egreso cumplimiento_egreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cumplimiento_egreso
    ADD CONSTRAINT cumplimiento_egreso_pkey PRIMARY KEY (id);


--
-- Name: cumplimiento_egreso cumplimiento_egreso_trabajador_id_tarea_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cumplimiento_egreso
    ADD CONSTRAINT cumplimiento_egreso_trabajador_id_tarea_key UNIQUE (trabajador_id, tarea);


--
-- Name: dependencias dependencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependencias
    ADD CONSTRAINT dependencias_pkey PRIMARY KEY (id);


--
-- Name: desvinculaciones_programadas desvinculaciones_programadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desvinculaciones_programadas
    ADD CONSTRAINT desvinculaciones_programadas_pkey PRIMARY KEY (id);


--
-- Name: documentos_trabajador documentos_trabajador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_trabajador
    ADD CONSTRAINT documentos_trabajador_pkey PRIMARY KEY (id);


--
-- Name: empresa_config empresa_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_config
    ADD CONSTRAINT empresa_config_pkey PRIMARY KEY (id);


--
-- Name: entregas_epp entregas_epp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_epp
    ADD CONSTRAINT entregas_epp_pkey PRIMARY KEY (id);


--
-- Name: evaluaciones_vencimiento evaluaciones_vencimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_vencimiento
    ADD CONSTRAINT evaluaciones_vencimiento_pkey PRIMARY KEY (id);


--
-- Name: evidencias evidencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias
    ADD CONSTRAINT evidencias_pkey PRIMARY KEY (id);


--
-- Name: feriados_chile feriados_chile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feriados_chile
    ADD CONSTRAINT feriados_chile_pkey PRIMARY KEY (fecha);


--
-- Name: horarios horarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios
    ADD CONSTRAINT horarios_pkey PRIMARY KEY (id);


--
-- Name: incidencias incidencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_pkey PRIMARY KEY (id);


--
-- Name: liquidaciones liquidaciones_periodo_trabajador_id_contrato_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_periodo_trabajador_id_contrato_id_key UNIQUE (periodo, trabajador_id, contrato_id);


--
-- Name: liquidaciones liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: obligaciones_mensuales obligaciones_mensuales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligaciones_mensuales
    ADD CONSTRAINT obligaciones_mensuales_pkey PRIMARY KEY (id);


--
-- Name: ordenes_servicio ordenes_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio
    ADD CONSTRAINT ordenes_servicio_pkey PRIMARY KEY (id);


--
-- Name: parametros_legales parametros_legales_periodo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_legales
    ADD CONSTRAINT parametros_legales_periodo_key UNIQUE (periodo);


--
-- Name: parametros_legales parametros_legales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_legales
    ADD CONSTRAINT parametros_legales_pkey PRIMARY KEY (id);


--
-- Name: qr_actividad_fotos qr_actividad_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_actividad_fotos
    ADD CONSTRAINT qr_actividad_fotos_pkey PRIMARY KEY (id);


--
-- Name: qr_actividades qr_actividades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_actividades
    ADD CONSTRAINT qr_actividades_pkey PRIMARY KEY (id);


--
-- Name: supervisiones supervisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisiones
    ADD CONSTRAINT supervisiones_pkey PRIMARY KEY (id);


--
-- Name: tabla_iusc tabla_iusc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_iusc
    ADD CONSTRAINT tabla_iusc_pkey PRIMARY KEY (id);


--
-- Name: tasas_afp tasas_afp_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_afp
    ADD CONSTRAINT tasas_afp_nombre_key UNIQUE (nombre);


--
-- Name: tasas_afp tasas_afp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasas_afp
    ADD CONSTRAINT tasas_afp_pkey PRIMARY KEY (id);


--
-- Name: trabajadores trabajadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trabajadores
    ADD CONSTRAINT trabajadores_pkey PRIMARY KEY (id);


--
-- Name: liquidaciones unique_liquidacion_trabajador_periodo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT unique_liquidacion_trabajador_periodo UNIQUE (trabajador_id, periodo);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: anexos_contrato_asignacion_origen_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX anexos_contrato_asignacion_origen_unq ON public.anexos_contrato USING btree (asignacion_origen_id) WHERE (asignacion_origen_id IS NOT NULL);


--
-- Name: idx_cumpegr_trabajador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cumpegr_trabajador ON public.cumplimiento_egreso USING btree (trabajador_id);


--
-- Name: idx_desvprog_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desvprog_estado ON public.desvinculaciones_programadas USING btree (estado);


--
-- Name: idx_desvprog_trabajador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desvprog_trabajador ON public.desvinculaciones_programadas USING btree (trabajador_id);


--
-- Name: idx_docs_trab_trabajador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_trab_trabajador ON public.documentos_trabajador USING btree (trabajador_id);


--
-- Name: idx_entregas_epp_trabajador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entregas_epp_trabajador ON public.entregas_epp USING btree (trabajador_id);


--
-- Name: idx_evalvenc_contrato; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evalvenc_contrato ON public.evaluaciones_vencimiento USING btree (contrato_id);


--
-- Name: idx_evalvenc_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evalvenc_estado ON public.evaluaciones_vencimiento USING btree (estado);


--
-- Name: idx_evidencias_actividad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencias_actividad ON public.evidencias USING btree (actividad_id);


--
-- Name: idx_liquidaciones_trabajador_firma; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidaciones_trabajador_firma ON public.liquidaciones USING btree (trabajador_id, firmado_at);


--
-- Name: idx_qr_act_dep_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_act_dep_estado ON public.qr_actividades USING btree (dependencia_id, estado);


--
-- Name: idx_qr_act_trab_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_act_trab_estado ON public.qr_actividades USING btree (trabajador_id, estado);


--
-- Name: idx_qr_fotos_actividad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_fotos_actividad ON public.qr_actividad_fotos USING btree (actividad_id);


--
-- Name: qr_act_dep_acceso_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_act_dep_acceso_idx ON public.qr_actividades USING btree (dependencia_acceso_id);


--
-- Name: qr_act_dep_tipo_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_act_dep_tipo_fecha_idx ON public.qr_actividades USING btree (dependencia_id, tipo_actividad, fecha_hora_inicio);


--
-- Name: ux_una_base_activa_por_trabajador; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_una_base_activa_por_trabajador ON public.asignaciones USING btree (trabajador_id) WHERE ((es_asignacion_base = true) AND (estado_asig = 'activa'::text) AND (activo IS DISTINCT FROM false));


--
-- Name: usuarios usuarios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: anexos_contrato anexos_contrato_centro_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos_contrato
    ADD CONSTRAINT anexos_contrato_centro_anterior_fkey FOREIGN KEY (centro_anterior) REFERENCES public.contratos(id);


--
-- Name: anexos_contrato anexos_contrato_centro_nuevo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos_contrato
    ADD CONSTRAINT anexos_contrato_centro_nuevo_fkey FOREIGN KEY (centro_nuevo) REFERENCES public.contratos(id);


--
-- Name: anexos_contrato anexos_contrato_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anexos_contrato
    ADD CONSTRAINT anexos_contrato_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: asignaciones asignaciones_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: asignaciones asignaciones_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones
    ADD CONSTRAINT asignaciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id) ON DELETE CASCADE;


--
-- Name: asistencia asistencia_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia
    ADD CONSTRAINT asistencia_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: asistencia asistencia_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencia
    ADD CONSTRAINT asistencia_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: checklist checklist_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist
    ADD CONSTRAINT checklist_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: checklist checklist_dep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist
    ADD CONSTRAINT checklist_dep_id_fkey FOREIGN KEY (dep_id) REFERENCES public.dependencias(id);


--
-- Name: contratos contratos_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.trabajadores(id);


--
-- Name: cumplimiento_egreso cumplimiento_egreso_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cumplimiento_egreso
    ADD CONSTRAINT cumplimiento_egreso_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: dependencias dependencias_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependencias
    ADD CONSTRAINT dependencias_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: desvinculaciones_programadas desvinculaciones_programadas_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desvinculaciones_programadas
    ADD CONSTRAINT desvinculaciones_programadas_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: documentos_trabajador documentos_trabajador_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_trabajador
    ADD CONSTRAINT documentos_trabajador_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: entregas_epp entregas_epp_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_epp
    ADD CONSTRAINT entregas_epp_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: evaluaciones_vencimiento evaluaciones_vencimiento_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_vencimiento
    ADD CONSTRAINT evaluaciones_vencimiento_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: evidencias evidencias_actividad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias
    ADD CONSTRAINT evidencias_actividad_fk FOREIGN KEY (actividad_id) REFERENCES public.qr_actividades(id) ON DELETE SET NULL;


--
-- Name: evidencias evidencias_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias
    ADD CONSTRAINT evidencias_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklist(id);


--
-- Name: evidencias evidencias_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias
    ADD CONSTRAINT evidencias_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: evidencias evidencias_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias
    ADD CONSTRAINT evidencias_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: horarios horarios_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios
    ADD CONSTRAINT horarios_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;


--
-- Name: horarios horarios_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horarios
    ADD CONSTRAINT horarios_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id) ON DELETE CASCADE;


--
-- Name: incidencias incidencias_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: incidencias incidencias_dep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_dep_id_fkey FOREIGN KEY (dep_id) REFERENCES public.dependencias(id);


--
-- Name: incidencias incidencias_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias
    ADD CONSTRAINT incidencias_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: liquidaciones liquidaciones_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE SET NULL;


--
-- Name: liquidaciones liquidaciones_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id) ON DELETE CASCADE;


--
-- Name: ordenes_servicio ordenes_servicio_centro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_servicio
    ADD CONSTRAINT ordenes_servicio_centro_id_fkey FOREIGN KEY (centro_id) REFERENCES public.contratos(id);


--
-- Name: qr_actividad_fotos qr_actividad_fotos_actividad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_actividad_fotos
    ADD CONSTRAINT qr_actividad_fotos_actividad_id_fkey FOREIGN KEY (actividad_id) REFERENCES public.qr_actividades(id) ON DELETE CASCADE;


--
-- Name: supervisiones supervisiones_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisiones
    ADD CONSTRAINT supervisiones_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: supervisiones supervisiones_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisiones
    ADD CONSTRAINT supervisiones_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.trabajadores(id);


--
-- Name: usuarios usuarios_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id);


--
-- Name: usuarios usuarios_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.trabajadores(id);


--
-- Name: tasas_afp afp_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY afp_admin_sup ON public.tasas_afp USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: anexos_contrato; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anexos_contrato ENABLE ROW LEVEL SECURITY;

--
-- Name: asignaciones asig_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asig_admin_sup ON public.asignaciones USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: asignaciones asig_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asig_trabajador_select ON public.asignaciones FOR SELECT USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: asignaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asignaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: asistencia asist_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asist_admin_sup ON public.asistencia USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: asistencia asist_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asist_cliente_select ON public.asistencia FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: asistencia asist_trabajador_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asist_trabajador_own ON public.asistencia USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: asistencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asistencia ENABLE ROW LEVEL SECURITY;

--
-- Name: anexos_contrato authenticated_all_anexos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_anexos ON public.anexos_contrato TO authenticated USING (true) WITH CHECK (true);


--
-- Name: feriados_chile authenticated_all_feriados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_feriados ON public.feriados_chile TO authenticated USING (true) WITH CHECK (true);


--
-- Name: obligaciones_mensuales authenticated_all_obligaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_all_obligaciones ON public.obligaciones_mensuales TO authenticated USING (true) WITH CHECK (true);


--
-- Name: contratos c_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c_admin_sup ON public.contratos USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: contratos c_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY c_cliente_select ON public.contratos FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (id = public.get_user_contrato_id())));


--
-- Name: checklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist chk_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chk_admin_sup ON public.checklist USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: checklist chk_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chk_cliente_select ON public.checklist FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: checklist chk_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chk_trabajador_select ON public.checklist FOR SELECT USING ((public.get_user_rol() = 'trabajador'::text));


--
-- Name: contratos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

--
-- Name: contratos contratos_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contratos_trabajador_select ON public.contratos FOR SELECT USING (((public.get_user_rol() = 'trabajador'::text) AND (id IN ( SELECT asignaciones.contrato_id
   FROM public.asignaciones
  WHERE ((asignaciones.trabajador_id = public.get_user_trabajador_id()) AND (asignaciones.activo = true))))));


--
-- Name: cumplimiento_egreso cumpegr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cumpegr_admin ON public.cumplimiento_egreso TO authenticated USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text]))) WITH CHECK ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: cumplimiento_egreso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cumplimiento_egreso ENABLE ROW LEVEL SECURITY;

--
-- Name: dependencias dep_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dep_admin_sup ON public.dependencias USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: dependencias dep_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dep_cliente_select ON public.dependencias FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: dependencias dep_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dep_trabajador_select ON public.dependencias FOR SELECT USING ((public.get_user_rol() = 'trabajador'::text));


--
-- Name: dependencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dependencias ENABLE ROW LEVEL SECURITY;

--
-- Name: desvinculaciones_programadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desvinculaciones_programadas ENABLE ROW LEVEL SECURITY;

--
-- Name: desvinculaciones_programadas desvprog_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desvprog_admin ON public.desvinculaciones_programadas TO authenticated USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text]))) WITH CHECK ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: documentos_trabajador docstrab_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docstrab_admin_all ON public.documentos_trabajador TO authenticated USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text]))) WITH CHECK ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: documentos_trabajador docstrab_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY docstrab_trabajador_select ON public.documentos_trabajador FOR SELECT TO authenticated USING (((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])) OR (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: documentos_trabajador; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_trabajador ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresa_config ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_config empresa_config_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY empresa_config_rw ON public.empresa_config TO authenticated USING (true) WITH CHECK (true);


--
-- Name: entregas_epp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entregas_epp ENABLE ROW LEVEL SECURITY;

--
-- Name: entregas_epp epp_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY epp_admin_all ON public.entregas_epp TO authenticated USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text]))) WITH CHECK ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: entregas_epp epp_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY epp_trabajador_select ON public.entregas_epp FOR SELECT TO authenticated USING (((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])) OR (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: evidencias ev_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ev_admin_sup ON public.evidencias USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: evidencias ev_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ev_cliente_select ON public.evidencias FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: evidencias ev_trabajador_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ev_trabajador_own ON public.evidencias USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: evaluaciones_vencimiento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evaluaciones_vencimiento ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluaciones_vencimiento evalvenc_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evalvenc_admin ON public.evaluaciones_vencimiento TO authenticated USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text]))) WITH CHECK ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: evidencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

--
-- Name: feriados_chile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feriados_chile ENABLE ROW LEVEL SECURITY;

--
-- Name: horarios hor_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hor_admin_sup ON public.horarios USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: horarios hor_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hor_trabajador_select ON public.horarios FOR SELECT USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: horarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

--
-- Name: incidencias inc_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inc_admin_sup ON public.incidencias USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: incidencias inc_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inc_cliente_select ON public.incidencias FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: incidencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

--
-- Name: tabla_iusc iusc_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iusc_admin_sup ON public.tabla_iusc USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: liquidaciones liq_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY liq_admin_sup ON public.liquidaciones USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: liquidaciones liq_trabajador_firmar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY liq_trabajador_firmar ON public.liquidaciones FOR UPDATE USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id()))) WITH CHECK (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: liquidaciones liq_trabajador_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY liq_trabajador_select ON public.liquidaciones FOR SELECT USING (((public.get_user_rol() = 'trabajador'::text) AND (trabajador_id = public.get_user_trabajador_id())));


--
-- Name: liquidaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liquidaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: obligaciones_mensuales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.obligaciones_mensuales ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_servicio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ordenes_servicio ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_legales param_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY param_admin_sup ON public.parametros_legales USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: parametros_legales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_legales ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_actividades qr admin lee actividades; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qr admin lee actividades" ON public.qr_actividades FOR SELECT TO authenticated USING (true);


--
-- Name: qr_actividad_fotos qr admin lee fotos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qr admin lee fotos" ON public.qr_actividad_fotos FOR SELECT TO authenticated USING (true);


--
-- Name: qr_actividad_fotos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_actividad_fotos ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_actividades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_actividades ENABLE ROW LEVEL SECURITY;

--
-- Name: supervisiones sup_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sup_admin_sup ON public.supervisiones USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: supervisiones sup_cliente_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sup_cliente_select ON public.supervisiones FOR SELECT USING (((public.get_user_rol() = 'cliente'::text) AND (contrato_id = public.get_user_contrato_id())));


--
-- Name: supervisiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supervisiones ENABLE ROW LEVEL SECURITY;

--
-- Name: trabajadores t_admin_sup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY t_admin_sup ON public.trabajadores USING ((public.get_user_rol() = ANY (ARRAY['administrador'::text, 'supervisor'::text])));


--
-- Name: trabajadores t_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY t_self ON public.trabajadores FOR SELECT USING (((public.get_user_rol() = 'trabajador'::text) AND (id = public.get_user_trabajador_id())));


--
-- Name: tabla_iusc; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tabla_iusc ENABLE ROW LEVEL SECURITY;

--
-- Name: tasas_afp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasas_afp ENABLE ROW LEVEL SECURITY;

--
-- Name: trabajadores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_admin_all ON public.usuarios USING ((public.get_user_rol() = 'administrador'::text));


--
-- Name: usuarios usuarios_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_self_select ON public.usuarios FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- PostgreSQL database dump complete
--



-- ---------------------------------------------------------------------
-- N.OWN POST-VERIFICACIÓN: los objetos creados pertenecen a postgres (sin ALTER OWNER).
-- ---------------------------------------------------------------------
DO $ownv$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(x,' | ') INTO v_bad FROM (
    SELECT 'TABLE '||c.relname AS x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('anexos_contrato','asignaciones','asistencia','checklist','contratos','cumplimiento_egreso','dependencias','desvinculaciones_programadas','documentos_trabajador','empresa_config','entregas_epp','evaluaciones_vencimiento','evidencias','feriados_chile','horarios','incidencias','liquidaciones','obligaciones_mensuales','ordenes_servicio','parametros_legales','qr_actividad_fotos','qr_actividades','supervisiones','tabla_iusc','tasas_afp','trabajadores','usuarios') AND pg_get_userbyid(c.relowner)<>'postgres'
    UNION ALL
    SELECT 'SEQUENCE '||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN ('asignaciones_id_seq','horarios_id_seq','liquidaciones_id_seq','parametros_legales_id_seq','qr_actividades_folio_seq','tabla_iusc_id_seq','tasas_afp_id_seq') AND pg_get_userbyid(c.relowner)<>'postgres'
    UNION ALL
    SELECT 'FUNCTION '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('get_user_contrato_id','get_user_rol','get_user_trabajador_id','marcar_clave_cambiada','qr_actividad_pendiente','qr_cerrar_evidencia','qr_cumplimiento_dia','qr_dependencia','qr_iniciar_evidencia','qr_validar_trabajador','registrar_primer_login','set_updated_at') AND pg_get_userbyid(p.proowner)<>'postgres'
  ) q;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'BOOTSTRAP: objetos NO propiedad de postgres: %', v_bad; END IF;
  RAISE NOTICE 'POST-VERIFICACIÓN OK: 27 tablas / 7 secuencias / 12 funciones a nombre de postgres.';
END $ownv$;

COMMIT;