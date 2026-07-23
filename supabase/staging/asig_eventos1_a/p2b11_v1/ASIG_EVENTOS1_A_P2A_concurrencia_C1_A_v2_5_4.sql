-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · CONCURRENCIA C1 — SESIÓN A (v2.5.4)
-- NO EJECUTAR HASTA P2-B1. Dos fases con BARRERA EFECTIVA (\prompt). Correr con C1_B.
-- v2.5.4 (CORR.4 Fable): 1 check_asserts DENTRO de la transacción (SET LOCAL); 2 RPC bajo
--   SET LOCAL ROLE authenticated + claims (canal real; INDEPENDIENTE del ADP legacy); 3 la fecha
--   objetivo se calcula como postgres (owner de public.asignaciones, tabla public no-audit);
--   4 guardas fail-fast por error SQL real, sin metacomando de salida de psql (exit<>0 con
--   ON_ERROR_STOP); 5 NINGUNA lectura de audit.* (la verificación conjunta usa la RPC admin
--   en el pie de la sesión B).
-- SOLO psql (-X -v ON_ERROR_STOP=1). Session Pooler puerto 5432 o conexión directa.
--   PROHIBIDO Transaction Pooler 6543 (rompería la sesión estable de \prompt/GUC/SET LOCAL).
--
-- A ejecuta y COMMITEA primero -> created. opreq ÚNICO por sesión/corrida (A y B distintos):
--   psql -X -v ON_ERROR_STOP=1 -v admin_uid='UUID' -v asig_c1='ID' -v opreq_c1_a='UUID-unico-A' -f <este archivo>
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?admin_uid}
\else
  \warn '>>> FALTA parámetro externo: -v admin_uid'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_A: FALTA -v admin_uid (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?asig_c1}
\else
  \warn '>>> FALTA parámetro externo: -v asig_c1'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_A: FALTA -v asig_c1 (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?opreq_c1_a}
\else
  \warn '>>> FALTA parámetro externo: -v opreq_c1_a'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_A: FALTA -v opreq_c1_a (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif

BEGIN;  -- una sola transacción por sesión: claims/rol locales viven hasta el COMMIT.

SET LOCAL plpgsql.check_asserts = on;   -- DENTRO de la transacción (CORR.4: inmune a pooler)
DO $$ BEGIN IF current_setting('plpgsql.check_asserts')<>'on' THEN
  RAISE EXCEPTION 'check_asserts no está on'; END IF; END $$;

CREATE TEMP TABLE p ON COMMIT DROP AS
  SELECT :asig_c1::int AS asig, :'admin_uid'::text AS admin, :'opreq_c1_a'::uuid AS opreq,
         'retiro C1 sesion A'::text AS motivo, NULL::text AS tok, NULL::text AS fecha;
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
  ASSERT current_user = 'authenticated', 'C1_A: la RPC no corre como authenticated';
  ASSERT auth.uid() IS NOT NULL, 'C1_A: el claim local no persistió';
  ASSERT v.fecha IS NOT NULL, 'C1_A: fecha objetivo no calculada (¿asig_c1 válida?)';
  v_tok := (public.preparar_retiro_asignacion_individual(v.asig))->>'token_anti_stale';
  UPDATE p SET tok = v_tok;
  RAISE NOTICE 'C1_A FASE1 lista.';
END $$;
RESET ROLE;

-- ===== BARRERA EFECTIVA =====
\prompt '>>> BARRERA C1_A: cuando C1_B TERMINÓ su FASE 1, presione ENTER para ejecutar la FASE 2 (A commitea primero) ' _barrera

-- ===== FASE 2 · EJECUCIÓN + ASERCIÓN (RPC como authenticated) =====
SET LOCAL ROLE authenticated;
DO $$
DECLARE v record; r jsonb;
BEGIN
  SELECT * INTO v FROM p;
  ASSERT current_user = 'authenticated', 'C1_A: la RPC no corre como authenticated';
  r := public.retirar_asignacion_individual(v.opreq, v.asig, v.fecha, v.motivo, v.tok);
  ASSERT r->>'resultado'='created' AND r->>'codigo_resultado'='ASIGNACION_RETIRADA_INDIVIDUAL',
         'C1_A: se esperaba created -> '||r::text;
  RAISE NOTICE 'C1_A OK: created';
END $$;
RESET ROLE;

COMMIT;  -- <<< A commitea. Recién ahora C1_B debe ejecutar su FASE 2.
-- Verificación conjunta -> ver el pie de C1_B (RPC admin como authenticated).
