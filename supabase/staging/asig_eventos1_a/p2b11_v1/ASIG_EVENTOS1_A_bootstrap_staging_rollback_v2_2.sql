-- =====================================================================
-- ASIG.EVENTOS.1-A · BOOTSTRAP STAGING · ROLLBACK v2.2 (ref de incremento corregida a v2.5.3)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. Revierte el FULL v2 en STAGING.
-- Reglas:
--   * NO ejecuta DROP SCHEMA public.
--   * GUARDA ANTI-PRODUCCIÓN: aborta si public.usuarios o public.asignaciones tienen filas
--     (un bootstrap recién instalado está VACÍO). Si hay fixtures sintéticos, truncarlos antes.
--   * Orden: tablas CASCADE (arrastra políticas, trigger, FKs y secuencias OWNED), luego funciones
--     (nombres únicos), luego secuencias remanentes. Idempotente (IF EXISTS).
--   * Revertir PRIMERO el incremento si está instalado: ASIG_EVENTOS1_A_P2A_rollback_v2_5_3_CANDIDATO.sql
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- ---- GUARDA ANTI-PRODUCCIÓN (aborta la transacción si hay datos) ----
DO $$
DECLARE v_u bigint := 0; v_a bigint := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='public') THEN
    RAISE EXCEPTION 'ROLLBACK BOOTSTRAP: no existe schema public'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='usuarios') THEN
    EXECUTE 'SELECT count(*) FROM public.usuarios' INTO v_u; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='asignaciones') THEN
    EXECUTE 'SELECT count(*) FROM public.asignaciones' INTO v_a; END IF;
  IF v_u > 0 OR v_a > 0 THEN
    RAISE EXCEPTION 'ROLLBACK BOOTSTRAP ABORTADO: hay datos (usuarios=%, asignaciones=%). No parece staging vacío; se protege producción.', v_u, v_a;
  END IF;
END $$;

-- ---- Tablas (CASCADE: políticas, trigger, FKs y secuencias OWNED) ----
DROP TABLE IF EXISTS public.anexos_contrato CASCADE;
DROP TABLE IF EXISTS public.asignaciones CASCADE;
DROP TABLE IF EXISTS public.asistencia CASCADE;
DROP TABLE IF EXISTS public.checklist CASCADE;
DROP TABLE IF EXISTS public.contratos CASCADE;
DROP TABLE IF EXISTS public.cumplimiento_egreso CASCADE;
DROP TABLE IF EXISTS public.dependencias CASCADE;
DROP TABLE IF EXISTS public.desvinculaciones_programadas CASCADE;
DROP TABLE IF EXISTS public.documentos_trabajador CASCADE;
DROP TABLE IF EXISTS public.empresa_config CASCADE;
DROP TABLE IF EXISTS public.entregas_epp CASCADE;
DROP TABLE IF EXISTS public.evaluaciones_vencimiento CASCADE;
DROP TABLE IF EXISTS public.evidencias CASCADE;
DROP TABLE IF EXISTS public.feriados_chile CASCADE;
DROP TABLE IF EXISTS public.horarios CASCADE;
DROP TABLE IF EXISTS public.incidencias CASCADE;
DROP TABLE IF EXISTS public.liquidaciones CASCADE;
DROP TABLE IF EXISTS public.obligaciones_mensuales CASCADE;
DROP TABLE IF EXISTS public.ordenes_servicio CASCADE;
DROP TABLE IF EXISTS public.parametros_legales CASCADE;
DROP TABLE IF EXISTS public.qr_actividad_fotos CASCADE;
DROP TABLE IF EXISTS public.qr_actividades CASCADE;
DROP TABLE IF EXISTS public.supervisiones CASCADE;
DROP TABLE IF EXISTS public.tabla_iusc CASCADE;
DROP TABLE IF EXISTS public.tasas_afp CASCADE;
DROP TABLE IF EXISTS public.trabajadores CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;

-- ---- Funciones (nombres únicos; ya sin políticas/defaults que las referencien) ----
DROP FUNCTION IF EXISTS public.get_user_contrato_id CASCADE;
DROP FUNCTION IF EXISTS public.get_user_rol CASCADE;
DROP FUNCTION IF EXISTS public.get_user_trabajador_id CASCADE;
DROP FUNCTION IF EXISTS public.marcar_clave_cambiada CASCADE;
DROP FUNCTION IF EXISTS public.qr_actividad_pendiente CASCADE;
DROP FUNCTION IF EXISTS public.qr_cerrar_evidencia CASCADE;
DROP FUNCTION IF EXISTS public.qr_cumplimiento_dia CASCADE;
DROP FUNCTION IF EXISTS public.qr_dependencia CASCADE;
DROP FUNCTION IF EXISTS public.qr_iniciar_evidencia CASCADE;
DROP FUNCTION IF EXISTS public.qr_validar_trabajador CASCADE;
DROP FUNCTION IF EXISTS public.registrar_primer_login CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at CASCADE;

-- ---- Secuencias remanentes (las OWNED ya cayeron con sus tablas) ----
DROP SEQUENCE IF EXISTS public.asignaciones_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.horarios_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.liquidaciones_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.parametros_legales_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.qr_actividades_folio_seq CASCADE;
DROP SEQUENCE IF EXISTS public.tabla_iusc_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.tasas_afp_id_seq CASCADE;

COMMIT;
-- =====================================================================
-- FIN ROLLBACK BOOTSTRAP v2 — NO EJECUTADO. NO ejecuta DROP SCHEMA public.
-- =====================================================================
