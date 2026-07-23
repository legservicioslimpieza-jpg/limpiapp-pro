-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · CONCURRENCIA I6 — SESIÓN A (v2.5.4)
-- NO EJECUTAR HASTA P2-B1. Dos fases con BARRERA EFECTIVA (\prompt). Correr con I6_B.
-- v2.5.4 (CORR.4 Fable): 1 check_asserts DENTRO de la transacción (SET LOCAL); 2 RPC bajo
--   SET LOCAL ROLE authenticated + claims (canal real; INDEPENDIENTE del ADP legacy); 3 la fecha
--   objetivo se calcula como postgres (owner de public.asignaciones, tabla public no-audit);
--   4 guardas fail-fast por error SQL real, sin metacomando de salida de psql (exit<>0 con
--   ON_ERROR_STOP); 5 NINGUNA lectura de audit.* (la verificación conjunta usa la RPC admin
--   en el pie de la sesión B).
-- SOLO psql (-X -v ON_ERROR_STOP=1). Session Pooler puerto 5432 o conexión directa.
--   PROHIBIDO Transaction Pooler 6543 (rompería la sesión estable de \prompt/GUC/SET LOCAL).
--
-- Pasar por línea de comando (asignación SINTÉTICA ZZ-FIXT exclusiva de staging para I6):
--   psql -X -v ON_ERROR_STOP=1 -v admin_uid='UUID' -v asig_i6='ID' -v opreq_i6='UUID-unico-de-esta-corrida' -f <este archivo>
-- opreq_i6 debe ser IDÉNTICO en I6_A e I6_B (solicitud idéntica), y ÚNICO por corrida.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?admin_uid}
\else
  \warn '>>> FALTA parámetro externo: -v admin_uid'
  DO $abort$ BEGIN RAISE EXCEPTION 'I6_A: FALTA -v admin_uid (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?asig_i6}
\else
  \warn '>>> FALTA parámetro externo: -v asig_i6'
  DO $abort$ BEGIN RAISE EXCEPTION 'I6_A: FALTA -v asig_i6 (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?opreq_i6}
\else
  \warn '>>> FALTA parámetro externo: -v opreq_i6'
  DO $abort$ BEGIN RAISE EXCEPTION 'I6_A: FALTA -v opreq_i6 (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif

BEGIN;  -- una sola transacción por sesión: claims/rol locales viven hasta el COMMIT.

SET LOCAL plpgsql.check_asserts = on;   -- DENTRO de la transacción (CORR.4: inmune a pooler)
DO $$ BEGIN IF current_setting('plpgsql.check_asserts')<>'on' THEN
  RAISE EXCEPTION 'check_asserts no está on'; END IF; END $$;

CREATE TEMP TABLE p ON COMMIT DROP AS
  SELECT :asig_i6::int AS asig, :'admin_uid'::text AS admin, :'opreq_i6'::uuid AS opreq,
         'retiro concurrente idempotente I6'::text AS motivo, NULL::text AS tok, NULL::text AS fecha;
GRANT SELECT, UPDATE ON p TO authenticated;  -- temp + ON COMMIT DROP: el grant muere con la transacción

SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT admin FROM p))::text, true);

-- Fecha objetivo: lectura de public.asignaciones como postgres (owner; NO es audit.*).
UPDATE p SET fecha = (
  SELECT to_char(GREATEST(a.fecha_inicio_asig,
                          (now() AT TIME ZONE 'America/Santiago')::date),'YYYY-MM-DD')
    FROM public.asignaciones a WHERE a.id = p.asig);

-- ===== FASE 1 · PREPARACIÓN (RPC como authenticated: canal real) =====
SET LOCAL ROLE authenticated;
DO $$
DECLARE v record; v_tok text;
BEGIN
  SELECT * INTO v FROM p;
  ASSERT current_user = 'authenticated', 'I6_A: la RPC no corre como authenticated';
  ASSERT auth.uid() IS NOT NULL, 'I6_A: el claim local no persistió';
  ASSERT v.fecha IS NOT NULL, 'I6_A: fecha objetivo no calculada (¿asig_i6 válida?)';
  v_tok := (public.preparar_retiro_asignacion_individual(v.asig))->>'token_anti_stale';
  UPDATE p SET tok = v_tok;
  RAISE NOTICE 'I6_A FASE1 lista.';
END $$;
RESET ROLE;

-- ===== BARRERA EFECTIVA =====
\prompt '>>> BARRERA I6_A: cuando I6_B TERMINÓ su FASE 1, presione ENTER para ejecutar la FASE 2 ' _barrera

-- ===== FASE 2 · EJECUCIÓN + ASERCIÓN (RPC como authenticated) =====
SET LOCAL ROLE authenticated;
DO $$
DECLARE v record; r jsonb;
BEGIN
  SELECT * INTO v FROM p;
  ASSERT current_user = 'authenticated', 'I6_A: la RPC no corre como authenticated';
  r := public.retirar_asignacion_individual(v.opreq, v.asig, v.fecha, v.motivo, v.tok);
  ASSERT (r->>'resultado') IN ('created','replayed')
         AND r->>'codigo_resultado'='ASIGNACION_RETIRADA_INDIVIDUAL',
         'I6_A: resultado inesperado -> '||r::text;
  RAISE NOTICE 'I6_A OK: resultado=%', r->>'resultado';
END $$;
RESET ROLE;

COMMIT;
-- Verificación conjunta -> ver el pie de I6_B (RPC admin como authenticated).
