-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · CONCURRENCIA C1 — SESIÓN B (v2.5.4)
-- NO EJECUTAR HASTA P2-B1. Dos fases con BARRERA EFECTIVA (\prompt). Correr con C1_A.
-- v2.5.4 (CORR.4 Fable): 1 check_asserts DENTRO de la transacción (SET LOCAL); 2 RPC bajo
--   SET LOCAL ROLE authenticated + claims (canal real; INDEPENDIENTE del ADP legacy); 3 la fecha
--   objetivo se calcula como postgres (owner de public.asignaciones, tabla public no-audit);
--   4 guardas fail-fast por error SQL real, sin metacomando de salida de psql (exit<>0 con
--   ON_ERROR_STOP); 5 NINGUNA lectura de audit.* (la verificación conjunta usa la RPC admin
--   en el pie de la sesión B).
-- SOLO psql (-X -v ON_ERROR_STOP=1). Session Pooler puerto 5432 o conexión directa.
--   PROHIBIDO Transaction Pooler 6543 (rompería la sesión estable de \prompt/GUC/SET LOCAL).
--
-- opreq_c1_b DISTINTO de opreq_c1_a; token del estado previo (FASE 1 ANTES del COMMIT de A).
-- B ejecuta DESPUÉS del COMMIT de A -> ESTADO_OBSOLETO (NO crea evento). opreq_c1_a se conserva
--   por trazabilidad de la corrida (la verificación v2.5.4 cuenta eventos vía RPC admin):
--   psql -X -v ON_ERROR_STOP=1 -v admin_uid='UUID' -v asig_c1='ID' -v opreq_c1_b='UUID-unico-B' -v opreq_c1_a='UUID-A' -f <este archivo>
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?admin_uid}
\else
  \warn '>>> FALTA parámetro externo: -v admin_uid'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_B: FALTA -v admin_uid (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?asig_c1}
\else
  \warn '>>> FALTA parámetro externo: -v asig_c1'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_B: FALTA -v asig_c1 (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?opreq_c1_b}
\else
  \warn '>>> FALTA parámetro externo: -v opreq_c1_b'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_B: FALTA -v opreq_c1_b (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?opreq_c1_a}
\else
  \warn '>>> FALTA parámetro externo: -v opreq_c1_a (trazabilidad de la corrida)'
  DO $abort$ BEGIN RAISE EXCEPTION 'C1_B: FALTA -v opreq_c1_a (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif

BEGIN;  -- una sola transacción por sesión: claims/rol locales viven hasta el COMMIT.

SET LOCAL plpgsql.check_asserts = on;   -- DENTRO de la transacción (CORR.4: inmune a pooler)
DO $$ BEGIN IF current_setting('plpgsql.check_asserts')<>'on' THEN
  RAISE EXCEPTION 'check_asserts no está on'; END IF; END $$;

CREATE TEMP TABLE p ON COMMIT DROP AS
  SELECT :asig_c1::int AS asig, :'admin_uid'::text AS admin, :'opreq_c1_b'::uuid AS opreq,
         'retiro C1 sesion B'::text AS motivo, NULL::text AS tok, NULL::text AS fecha;
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
  ASSERT current_user = 'authenticated', 'C1_B: la RPC no corre como authenticated';
  ASSERT auth.uid() IS NOT NULL, 'C1_B: el claim local no persistió';
  ASSERT v.fecha IS NOT NULL, 'C1_B: fecha objetivo no calculada (¿asig_c1 válida?)';
  v_tok := (public.preparar_retiro_asignacion_individual(v.asig))->>'token_anti_stale';
  UPDATE p SET tok = v_tok;
  RAISE NOTICE 'C1_B FASE1 lista (token del estado previo).';
END $$;
RESET ROLE;

-- ===== BARRERA EFECTIVA =====
\prompt '>>> BARRERA C1_B: espere el COMMIT de C1_A, luego presione ENTER para ejecutar la FASE 2 ' _barrera

-- ===== FASE 2 · EJECUCIÓN + ASERCIÓN (RPC como authenticated) =====
SET LOCAL ROLE authenticated;
DO $$
DECLARE v record; r jsonb;
BEGIN
  SELECT * INTO v FROM p;
  ASSERT current_user = 'authenticated', 'C1_B: la RPC no corre como authenticated';
  r := public.retirar_asignacion_individual(v.opreq, v.asig, v.fecha, v.motivo, v.tok);
  ASSERT r->>'error'='ESTADO_OBSOLETO', 'C1_B: se esperaba ESTADO_OBSOLETO -> '||r::text;
  RAISE NOTICE 'C1_B OK: ESTADO_OBSOLETO';
END $$;
RESET ROLE;

COMMIT;

-- ===== VERIFICACIÓN CONJUNTA (tras COMMIT de A y B) — v2.5.4: vía RPC admin, SIN leer audit.* =====
-- Cuenta los eventos de la asignación con public.listar_eventos_asignacion_admin bajo
--   SET LOCAL ROLE authenticated + claims admin (independiente del ADP legacy).
-- Esperado: EXACTAMENTE 1 evento — solo A creó: created; B recibió ESTADO_OBSOLETO sin crear evento
-- El detalle por opreq quedó afirmado por las ASSERT de cada sesión (listar no expone
--   operation_request_id por diseño). psql no interpola :var dentro de $$: los parámetros
--   viajan por GUC de sesión. Si falla: RAISE EXCEPTION -> exit<>0 con ON_ERROR_STOP.
SELECT set_config('asig_conc.admin', :'admin_uid', false);
SELECT set_config('asig_conc.asig',  :asig_c1::text, false);
DO $verif$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', current_setting('asig_conc.admin'))::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n
    FROM public.listar_eventos_asignacion_admin(current_setting('asig_conc.asig')::int);
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'C1 VERIFICACIÓN FALLIDA: asignación %: se esperaba exactamente 1 evento y hay % (B no debe haber creado evento).',
                    current_setting('asig_conc.asig'), n;
  END IF;
  RAISE NOTICE '>>> C1 VERIFICACIÓN OK: exactamente 1 evento (solo A creó: created; B recibió ESTADO_OBSOLETO sin crear evento).';
END $verif$;
