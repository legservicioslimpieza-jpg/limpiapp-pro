-- =====================================================================
-- ASIG.EVENTOS.1-A · BOOTSTRAP STAGING · ACL DE OBJETOS v2.1 (ATÓMICO: BEGIN/COMMIT)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. GRANT/REVOKE de OBJETO reales de producción
--   (schema USAGE, tablas, secuencias, funciones). SEPARADO de ALTER DEFAULT PRIVILEGES
--   (esos van en el .md de decisión). Reproduce el ACL de las 27 tablas / 12 funciones / 7
--   secuencias tal como está en producción. Aplicar en staging SÓLO si se decide reproducir
--   el ACL legacy (ver informe/decisión). NO cambia producción.
-- NOTA BLOQUEO 1: aquí NO están las RPC del incremento; su EXECUTE lo gobierna la migración
--   v2.5.1 (revoca anon/PUBLIC/service_role; concede solo authenticated).
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION get_user_contrato_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_contrato_id() TO anon;
GRANT ALL ON FUNCTION public.get_user_contrato_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_contrato_id() TO service_role;


--
-- Name: FUNCTION get_user_rol(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_rol() TO anon;
GRANT ALL ON FUNCTION public.get_user_rol() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_rol() TO service_role;


--
-- Name: FUNCTION get_user_trabajador_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_trabajador_id() TO anon;
GRANT ALL ON FUNCTION public.get_user_trabajador_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_trabajador_id() TO service_role;


--
-- Name: FUNCTION marcar_clave_cambiada(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_clave_cambiada() TO anon;
GRANT ALL ON FUNCTION public.marcar_clave_cambiada() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_clave_cambiada() TO service_role;


--
-- Name: FUNCTION qr_actividad_pendiente(p_dep text, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_actividad_pendiente(p_dep text, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_actividad_pendiente(p_dep text, p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.qr_actividad_pendiente(p_dep text, p_codigo text) TO authenticated;
GRANT ALL ON FUNCTION public.qr_actividad_pendiente(p_dep text, p_codigo text) TO service_role;


--
-- Name: FUNCTION qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb) TO anon;
GRANT ALL ON FUNCTION public.qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.qr_cerrar_evidencia(p_actividad uuid, p_dep text, p_codigo text, p_tareas jsonb, p_obs text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb) TO service_role;


--
-- Name: FUNCTION qr_cumplimiento_dia(p_contrato text, p_fecha date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_cumplimiento_dia(p_contrato text, p_fecha date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_cumplimiento_dia(p_contrato text, p_fecha date) TO anon;
GRANT ALL ON FUNCTION public.qr_cumplimiento_dia(p_contrato text, p_fecha date) TO authenticated;
GRANT ALL ON FUNCTION public.qr_cumplimiento_dia(p_contrato text, p_fecha date) TO service_role;


--
-- Name: FUNCTION qr_dependencia(p_dep text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_dependencia(p_dep text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_dependencia(p_dep text) TO anon;
GRANT ALL ON FUNCTION public.qr_dependencia(p_dep text) TO authenticated;
GRANT ALL ON FUNCTION public.qr_dependencia(p_dep text) TO service_role;


--
-- Name: FUNCTION qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text, p_canal text, p_solicitante text, p_titulo text, p_descripcion text, p_prioridad text, p_plantilla_id text, p_plantilla_version text, p_dependencia_ejecutada text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text, p_canal text, p_solicitante text, p_titulo text, p_descripcion text, p_prioridad text, p_plantilla_id text, p_plantilla_version text, p_dependencia_ejecutada text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text, p_canal text, p_solicitante text, p_titulo text, p_descripcion text, p_prioridad text, p_plantilla_id text, p_plantilla_version text, p_dependencia_ejecutada text) TO anon;
GRANT ALL ON FUNCTION public.qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text, p_canal text, p_solicitante text, p_titulo text, p_descripcion text, p_prioridad text, p_plantilla_id text, p_plantilla_version text, p_dependencia_ejecutada text) TO authenticated;
GRANT ALL ON FUNCTION public.qr_iniciar_evidencia(p_dep text, p_codigo text, p_lat numeric, p_lng numeric, p_precision numeric, p_gps_ok boolean, p_fotos jsonb, p_tipo text, p_canal text, p_solicitante text, p_titulo text, p_descripcion text, p_prioridad text, p_plantilla_id text, p_plantilla_version text, p_dependencia_ejecutada text) TO service_role;


--
-- Name: FUNCTION qr_validar_trabajador(p_dep text, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qr_validar_trabajador(p_dep text, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.qr_validar_trabajador(p_dep text, p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.qr_validar_trabajador(p_dep text, p_codigo text) TO authenticated;
GRANT ALL ON FUNCTION public.qr_validar_trabajador(p_dep text, p_codigo text) TO service_role;


--
-- Name: FUNCTION registrar_primer_login(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.registrar_primer_login() TO anon;
GRANT ALL ON FUNCTION public.registrar_primer_login() TO authenticated;
GRANT ALL ON FUNCTION public.registrar_primer_login() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE anexos_contrato; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anexos_contrato TO anon;
GRANT ALL ON TABLE public.anexos_contrato TO authenticated;
GRANT ALL ON TABLE public.anexos_contrato TO service_role;


--
-- Name: TABLE asignaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asignaciones TO anon;
GRANT ALL ON TABLE public.asignaciones TO authenticated;
GRANT ALL ON TABLE public.asignaciones TO service_role;


--
-- Name: SEQUENCE asignaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asignaciones_id_seq TO service_role;


--
-- Name: TABLE asistencia; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencia TO anon;
GRANT ALL ON TABLE public.asistencia TO authenticated;
GRANT ALL ON TABLE public.asistencia TO service_role;


--
-- Name: TABLE checklist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.checklist TO anon;
GRANT ALL ON TABLE public.checklist TO authenticated;
GRANT ALL ON TABLE public.checklist TO service_role;


--
-- Name: TABLE contratos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contratos TO anon;
GRANT ALL ON TABLE public.contratos TO authenticated;
GRANT ALL ON TABLE public.contratos TO service_role;


--
-- Name: TABLE cumplimiento_egreso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cumplimiento_egreso TO anon;
GRANT ALL ON TABLE public.cumplimiento_egreso TO authenticated;
GRANT ALL ON TABLE public.cumplimiento_egreso TO service_role;


--
-- Name: TABLE dependencias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dependencias TO anon;
GRANT ALL ON TABLE public.dependencias TO authenticated;
GRANT ALL ON TABLE public.dependencias TO service_role;


--
-- Name: TABLE desvinculaciones_programadas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.desvinculaciones_programadas TO anon;
GRANT ALL ON TABLE public.desvinculaciones_programadas TO authenticated;
GRANT ALL ON TABLE public.desvinculaciones_programadas TO service_role;


--
-- Name: TABLE documentos_trabajador; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documentos_trabajador TO anon;
GRANT ALL ON TABLE public.documentos_trabajador TO authenticated;
GRANT ALL ON TABLE public.documentos_trabajador TO service_role;


--
-- Name: TABLE empresa_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.empresa_config TO anon;
GRANT ALL ON TABLE public.empresa_config TO authenticated;
GRANT ALL ON TABLE public.empresa_config TO service_role;


--
-- Name: TABLE entregas_epp; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entregas_epp TO anon;
GRANT ALL ON TABLE public.entregas_epp TO authenticated;
GRANT ALL ON TABLE public.entregas_epp TO service_role;


--
-- Name: TABLE evaluaciones_vencimiento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluaciones_vencimiento TO anon;
GRANT ALL ON TABLE public.evaluaciones_vencimiento TO authenticated;
GRANT ALL ON TABLE public.evaluaciones_vencimiento TO service_role;


--
-- Name: TABLE evidencias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evidencias TO anon;
GRANT ALL ON TABLE public.evidencias TO authenticated;
GRANT ALL ON TABLE public.evidencias TO service_role;


--
-- Name: TABLE feriados_chile; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feriados_chile TO anon;
GRANT ALL ON TABLE public.feriados_chile TO authenticated;
GRANT ALL ON TABLE public.feriados_chile TO service_role;


--
-- Name: TABLE horarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.horarios TO anon;
GRANT ALL ON TABLE public.horarios TO authenticated;
GRANT ALL ON TABLE public.horarios TO service_role;


--
-- Name: SEQUENCE horarios_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.horarios_id_seq TO anon;
GRANT ALL ON SEQUENCE public.horarios_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.horarios_id_seq TO service_role;


--
-- Name: TABLE incidencias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incidencias TO anon;
GRANT ALL ON TABLE public.incidencias TO authenticated;
GRANT ALL ON TABLE public.incidencias TO service_role;


--
-- Name: TABLE liquidaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.liquidaciones TO anon;
GRANT ALL ON TABLE public.liquidaciones TO authenticated;
GRANT ALL ON TABLE public.liquidaciones TO service_role;


--
-- Name: SEQUENCE liquidaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.liquidaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.liquidaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.liquidaciones_id_seq TO service_role;


--
-- Name: TABLE obligaciones_mensuales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.obligaciones_mensuales TO anon;
GRANT ALL ON TABLE public.obligaciones_mensuales TO authenticated;
GRANT ALL ON TABLE public.obligaciones_mensuales TO service_role;


--
-- Name: TABLE ordenes_servicio; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ordenes_servicio TO anon;
GRANT ALL ON TABLE public.ordenes_servicio TO authenticated;
GRANT ALL ON TABLE public.ordenes_servicio TO service_role;


--
-- Name: TABLE parametros_legales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parametros_legales TO anon;
GRANT ALL ON TABLE public.parametros_legales TO authenticated;
GRANT ALL ON TABLE public.parametros_legales TO service_role;


--
-- Name: SEQUENCE parametros_legales_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.parametros_legales_id_seq TO anon;
GRANT ALL ON SEQUENCE public.parametros_legales_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.parametros_legales_id_seq TO service_role;


--
-- Name: TABLE qr_actividad_fotos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qr_actividad_fotos TO anon;
GRANT ALL ON TABLE public.qr_actividad_fotos TO authenticated;
GRANT ALL ON TABLE public.qr_actividad_fotos TO service_role;


--
-- Name: SEQUENCE qr_actividades_folio_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.qr_actividades_folio_seq TO anon;
GRANT ALL ON SEQUENCE public.qr_actividades_folio_seq TO authenticated;
GRANT ALL ON SEQUENCE public.qr_actividades_folio_seq TO service_role;


--
-- Name: TABLE qr_actividades; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qr_actividades TO anon;
GRANT ALL ON TABLE public.qr_actividades TO authenticated;
GRANT ALL ON TABLE public.qr_actividades TO service_role;


--
-- Name: TABLE supervisiones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supervisiones TO anon;
GRANT ALL ON TABLE public.supervisiones TO authenticated;
GRANT ALL ON TABLE public.supervisiones TO service_role;


--
-- Name: TABLE tabla_iusc; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tabla_iusc TO anon;
GRANT ALL ON TABLE public.tabla_iusc TO authenticated;
GRANT ALL ON TABLE public.tabla_iusc TO service_role;


--
-- Name: SEQUENCE tabla_iusc_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tabla_iusc_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tabla_iusc_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tabla_iusc_id_seq TO service_role;


--
-- Name: TABLE tasas_afp; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasas_afp TO anon;
GRANT ALL ON TABLE public.tasas_afp TO authenticated;
GRANT ALL ON TABLE public.tasas_afp TO service_role;


--
-- Name: SEQUENCE tasas_afp_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tasas_afp_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tasas_afp_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tasas_afp_id_seq TO service_role;


--
-- Name: TABLE trabajadores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trabajadores TO anon;
GRANT ALL ON TABLE public.trabajadores TO authenticated;
GRANT ALL ON TABLE public.trabajadores TO service_role;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios TO anon;
GRANT ALL ON TABLE public.usuarios TO authenticated;
GRANT ALL ON TABLE public.usuarios TO service_role;


--

COMMIT;
