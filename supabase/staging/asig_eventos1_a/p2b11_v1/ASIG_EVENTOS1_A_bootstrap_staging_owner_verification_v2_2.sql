-- =====================================================================
-- ASIG.EVENTOS.1-A · BOOTSTRAP STAGING · VERIFICACIÓN DE PROPIETARIOS v2.2
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. READ-ONLY. Reporte + GATE.
--   v2.2: además exige current_user=postgres y conteos EXACTOS 27 tablas / 7 secuencias / 12 funciones.
-- =====================================================================
\set ON_ERROR_STOP on

SELECT current_user AS ejecutor,
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public')     AS public_owner,
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='auth')       AS auth_owner,
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='extensions') AS extensions_owner;

SELECT 'TABLE' AS tipo, c.relname AS objeto, pg_get_userbyid(c.relowner) AS propietario
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('anexos_contrato','asignaciones','asistencia','checklist','contratos','cumplimiento_egreso','dependencias','desvinculaciones_programadas','documentos_trabajador','empresa_config','entregas_epp','evaluaciones_vencimiento','evidencias','feriados_chile','horarios','incidencias','liquidaciones','obligaciones_mensuales','ordenes_servicio','parametros_legales','qr_actividad_fotos','qr_actividades','supervisiones','tabla_iusc','tasas_afp','trabajadores','usuarios')
UNION ALL
SELECT 'SEQUENCE', c.relname, pg_get_userbyid(c.relowner)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN ('asignaciones_id_seq','horarios_id_seq','liquidaciones_id_seq','parametros_legales_id_seq','qr_actividades_folio_seq','tabla_iusc_id_seq','tasas_afp_id_seq')
UNION ALL
SELECT 'FUNCTION', p.proname, pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('get_user_contrato_id','get_user_rol','get_user_trabajador_id','marcar_clave_cambiada','qr_actividad_pendiente','qr_cerrar_evidencia','qr_cumplimiento_dia','qr_dependencia','qr_iniciar_evidencia','qr_validar_trabajador','registrar_primer_login','set_updated_at')
 ORDER BY 1,2;

DO $g$
DECLARE v_pub text; v_auth text; v_ext text; v_bad text; nt int; ns int; nf int;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'current_user=% (esperado postgres)', current_user; END IF;
  SELECT pg_get_userbyid(nspowner) INTO v_pub  FROM pg_namespace WHERE nspname='public';
  SELECT pg_get_userbyid(nspowner) INTO v_auth FROM pg_namespace WHERE nspname='auth';
  SELECT pg_get_userbyid(nspowner) INTO v_ext  FROM pg_namespace WHERE nspname='extensions';
  IF v_pub  IS DISTINCT FROM 'pg_database_owner' THEN RAISE EXCEPTION 'public owner=% (esperado pg_database_owner)', v_pub;  END IF;
  IF v_auth IS DISTINCT FROM 'supabase_admin'    THEN RAISE EXCEPTION 'auth owner=% (esperado supabase_admin)', v_auth;    END IF;
  IF v_ext  IS DISTINCT FROM 'postgres'          THEN RAISE EXCEPTION 'extensions owner=% (esperado postgres)', v_ext;     END IF;
  SELECT count(*) INTO nt FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('anexos_contrato','asignaciones','asistencia','checklist','contratos','cumplimiento_egreso','dependencias','desvinculaciones_programadas','documentos_trabajador','empresa_config','entregas_epp','evaluaciones_vencimiento','evidencias','feriados_chile','horarios','incidencias','liquidaciones','obligaciones_mensuales','ordenes_servicio','parametros_legales','qr_actividad_fotos','qr_actividades','supervisiones','tabla_iusc','tasas_afp','trabajadores','usuarios');
  SELECT count(*) INTO ns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN ('asignaciones_id_seq','horarios_id_seq','liquidaciones_id_seq','parametros_legales_id_seq','qr_actividades_folio_seq','tabla_iusc_id_seq','tasas_afp_id_seq');
  SELECT count(*) INTO nf FROM pg_proc  p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_user_contrato_id','get_user_rol','get_user_trabajador_id','marcar_clave_cambiada','qr_actividad_pendiente','qr_cerrar_evidencia','qr_cumplimiento_dia','qr_dependencia','qr_iniciar_evidencia','qr_validar_trabajador','registrar_primer_login','set_updated_at');
  IF nt<>27 THEN RAISE EXCEPTION 'tablas encontradas=% (esperado 27)', nt; END IF;
  IF ns<>7  THEN RAISE EXCEPTION 'secuencias encontradas=% (esperado 7)', ns; END IF;
  IF nf<>12 THEN RAISE EXCEPTION 'funciones encontradas=% (esperado 12)', nf; END IF;
  SELECT string_agg(x,' | ') INTO v_bad FROM (
    SELECT 'TABLE '||c.relname AS x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('anexos_contrato','asignaciones','asistencia','checklist','contratos','cumplimiento_egreso','dependencias','desvinculaciones_programadas','documentos_trabajador','empresa_config','entregas_epp','evaluaciones_vencimiento','evidencias','feriados_chile','horarios','incidencias','liquidaciones','obligaciones_mensuales','ordenes_servicio','parametros_legales','qr_actividad_fotos','qr_actividades','supervisiones','tabla_iusc','tasas_afp','trabajadores','usuarios') AND pg_get_userbyid(c.relowner)<>'postgres'
    UNION ALL SELECT 'SEQUENCE '||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN ('asignaciones_id_seq','horarios_id_seq','liquidaciones_id_seq','parametros_legales_id_seq','qr_actividades_folio_seq','tabla_iusc_id_seq','tasas_afp_id_seq') AND pg_get_userbyid(c.relowner)<>'postgres'
    UNION ALL SELECT 'FUNCTION '||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('get_user_contrato_id','get_user_rol','get_user_trabajador_id','marcar_clave_cambiada','qr_actividad_pendiente','qr_cerrar_evidencia','qr_cumplimiento_dia','qr_dependencia','qr_iniciar_evidencia','qr_validar_trabajador','registrar_primer_login','set_updated_at') AND pg_get_userbyid(p.proowner)<>'postgres'
  ) q;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Objetos NO propiedad de postgres: %', v_bad; END IF;
  RAISE NOTICE 'VERIFICACIÓN DE PROPIETARIOS OK: ejecutor=postgres; 27 tablas / 7 secuencias / 12 funciones a nombre de postgres.';
END $g$;
-- =====================================================================
-- FIN VERIFICACIÓN DE PROPIETARIOS v2.2 — READ-ONLY. No modifica nada.
-- =====================================================================
