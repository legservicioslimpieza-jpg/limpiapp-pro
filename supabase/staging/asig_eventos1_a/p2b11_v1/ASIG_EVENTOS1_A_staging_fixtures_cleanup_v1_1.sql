-- =====================================================================
-- ASIG.EVENTOS.1-A · STAGING · FIXTURES CLEANUP v1.1 (EVENTO-AWARE)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. Borra SOLO fixtures por marca de procedencia.
-- ANTES de borrar: si existe audit.asignacion_eventos y hay eventos que referencian asignaciones
--   ZZ-FIXT-*, ABORTA sin borrar nada (el rollback CON eventos conserva la evidencia; un teardown
--   destructivo requiere autorización y artefacto aparte).
-- Orden FK-seguro: asignaciones -> usuarios -> trabajadores -> contratos.
-- No toca auth.users (eso lo hace el operador en Supabase Auth).
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $evt$
DECLARE n bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='asignacion_eventos') THEN
    EXECUTE $q$
      SELECT count(*) FROM audit.asignacion_eventos e
        JOIN public.asignaciones a ON a.id = e.asignacion_id
       WHERE a.trabajador_id LIKE 'ZZ-FIXT-%' OR a.contrato_id LIKE 'ZZ-FIXT-%'
    $q$ INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'CLEANUP ABORTADO: % evento(s) de auditoría referencian asignaciones ZZ-FIXT-*. El rollback CON eventos CONSERVA la evidencia; NO se borran fixtures. Teardown destructivo => autorización y artefacto aparte.', n;
    END IF;
  END IF;
  RAISE NOTICE 'CLEANUP: sin eventos de auditoría sobre fixtures ZZ-FIXT-*; se procede a borrar.';
END $evt$;

DELETE FROM public.asignaciones WHERE trabajador_id LIKE 'ZZ-FIXT-%' OR contrato_id LIKE 'ZZ-FIXT-%';
DELETE FROM public.usuarios     WHERE email LIKE 'zz.fixt.%@example.invalid';
DELETE FROM public.trabajadores WHERE id LIKE 'ZZ-FIXT-%' AND es_dato_prueba IS TRUE;
DELETE FROM public.contratos    WHERE id LIKE 'ZZ-FIXT-%';

COMMIT;
-- =====================================================================
-- FIN FIXTURES CLEANUP v1.1 — NO EJECUTADO. Aborta si hay eventos sobre fixtures; si no, borra por marca.
-- =====================================================================
