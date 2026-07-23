-- =====================================================================
-- ASIG.EVENTOS.1-A · STAGING · FIXTURES SETUP v1.2 (guarda anti-producción; guardas de parámetros por ERROR SQL real)
-- ARTEFACTO CONSTRUIDO — NO EJECUTAR AQUÍ. Crea SOLO filas public sintéticas (sin PII).
-- El operador crea en Supabase Auth de STAGING un admin y un no-admin ficticios (@example.invalid)
--   y pasa sus UUID:  psql -X -v ON_ERROR_STOP=1 -v admin_uid=<uuid> -v noadmin_uid=<uuid> -f este.sql
-- v1.2 (CORR.4 Fable BAJO 1): las guardas de parámetros abortan con DO/RAISE (error SQL real ->
--   exit<>0 con ON_ERROR_STOP); el metacomando de salida de psql no altera el código de salida.
-- NO inserta/actualiza/elimina filas de auth.users.
-- =====================================================================
\set ON_ERROR_STOP on

\if :{?admin_uid}
\else
  \warn '*** FALTA -v admin_uid=<uuid ADMIN creado en Supabase Auth staging> ***'
  DO $abort$ BEGIN RAISE EXCEPTION 'FIXTURES: FALTA -v admin_uid (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif
\if :{?noadmin_uid}
\else
  \warn '*** FALTA -v noadmin_uid=<uuid NO-ADMIN creado en Supabase Auth staging> ***'
  DO $abort$ BEGIN RAISE EXCEPTION 'FIXTURES: FALTA -v noadmin_uid (error SQL real; exit<>0 con ON_ERROR_STOP)'; END $abort$;
\endif

-- Pasar los UUID a GUCs de sesión (psql NO interpola dentro de bloques $$...$$).
SELECT set_config('asig_fixt.admin_uid',   :'admin_uid',   false);
SELECT set_config('asig_fixt.noadmin_uid', :'noadmin_uid', false);

BEGIN;

-- ---- GUARDA ANTI-PRODUCCIÓN (dentro de la transacción; aborta si algo no cumple) ----
DO $guard$
DECLARE v_pub text; v_auth text; v_ext text; n bigint; v_a uuid; v_na uuid;
BEGIN
  v_a  := current_setting('asig_fixt.admin_uid')::uuid;
  v_na := current_setting('asig_fixt.noadmin_uid')::uuid;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'FIXTURES: current_user=% (se requiere postgres)', current_user; END IF;
  SELECT pg_get_userbyid(nspowner) INTO v_pub  FROM pg_namespace WHERE nspname='public';
  SELECT pg_get_userbyid(nspowner) INTO v_auth FROM pg_namespace WHERE nspname='auth';
  SELECT pg_get_userbyid(nspowner) INTO v_ext  FROM pg_namespace WHERE nspname='extensions';
  IF v_pub  IS DISTINCT FROM 'pg_database_owner' THEN RAISE EXCEPTION 'FIXTURES: public owner=% (esperado pg_database_owner)', v_pub;  END IF;
  IF v_auth IS DISTINCT FROM 'supabase_admin'    THEN RAISE EXCEPTION 'FIXTURES: auth owner=% (esperado supabase_admin)', v_auth;    END IF;
  IF v_ext  IS DISTINCT FROM 'postgres'          THEN RAISE EXCEPTION 'FIXTURES: extensions owner=% (esperado postgres)', v_ext;     END IF;
  SELECT count(*) INTO n FROM public.usuarios;     IF n<>0 THEN RAISE EXCEPTION 'FIXTURES: public.usuarios no está vacía (%); no parece staging limpio.', n; END IF;
  SELECT count(*) INTO n FROM public.trabajadores; IF n<>0 THEN RAISE EXCEPTION 'FIXTURES: public.trabajadores no está vacía (%).', n; END IF;
  SELECT count(*) INTO n FROM public.contratos;    IF n<>0 THEN RAISE EXCEPTION 'FIXTURES: public.contratos no está vacía (%).', n; END IF;
  SELECT count(*) INTO n FROM public.asignaciones; IF n<>0 THEN RAISE EXCEPTION 'FIXTURES: public.asignaciones no está vacía (%).', n; END IF;
  IF v_a = v_na THEN RAISE EXCEPTION 'FIXTURES: admin_uid = noadmin_uid (deben ser distintos)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_a)  THEN RAISE EXCEPTION 'FIXTURES: admin_uid no existe en auth.users';  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_na) THEN RAISE EXCEPTION 'FIXTURES: noadmin_uid no existe en auth.users'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_a  AND email LIKE '%@example.invalid') THEN RAISE EXCEPTION 'FIXTURES: correo Auth del admin no termina en @example.invalid';  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_na AND email LIKE '%@example.invalid') THEN RAISE EXCEPTION 'FIXTURES: correo Auth del no-admin no termina en @example.invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.trabajadores WHERE id LIKE 'ZZ-FIXT-%')
     OR EXISTS (SELECT 1 FROM public.contratos WHERE id LIKE 'ZZ-FIXT-%')
     OR EXISTS (SELECT 1 FROM public.usuarios WHERE email LIKE 'zz.fixt.%@example.invalid') THEN
     RAISE EXCEPTION 'FIXTURES: ya existen marcas ZZ-FIXT-*/zz.fixt (ejecute el cleanup antes)';
  END IF;
  RAISE NOTICE 'GUARDA anti-producción OK: staging vacío, propietarios correctos, UUID válidos y sintéticos.';
END $guard$;

-- ---- INSERCIONES SINTÉTICAS (misma transacción) ----
INSERT INTO public.trabajadores (id, nombre, es_dato_prueba)
  VALUES ('ZZ-FIXT-TRAB-I6','FIXTURE Trabajador I6', true),
         ('ZZ-FIXT-TRAB-C1','FIXTURE Trabajador C1', true);
INSERT INTO public.contratos (id, cliente, estado, activo)
  VALUES ('ZZ-FIXT-CONT-I6','FIXTURE Cliente I6','Vigente', true),
         ('ZZ-FIXT-CONT-C1','FIXTURE Cliente C1','Vigente', true);
INSERT INTO public.usuarios (id, email, nombre, rol)
  VALUES (:'admin_uid'::uuid,   'zz.fixt.admin@example.invalid',   'FIXTURE Admin',   'administrador'),
         (:'noadmin_uid'::uuid, 'zz.fixt.noadmin@example.invalid', 'FIXTURE NoAdmin', 'supervisor');
INSERT INTO public.asignaciones (trabajador_id, contrato_id, activo, estado_asig, fecha_inicio_asig)
  VALUES ('ZZ-FIXT-TRAB-I6','ZZ-FIXT-CONT-I6', true, 'activa', (now() AT TIME ZONE 'America/Santiago')::date - 1)
  RETURNING id AS asig_i6
\gset
INSERT INTO public.asignaciones (trabajador_id, contrato_id, activo, estado_asig, fecha_inicio_asig)
  VALUES ('ZZ-FIXT-TRAB-C1','ZZ-FIXT-CONT-C1', true, 'activa', (now() AT TIME ZONE 'America/Santiago')::date - 1)
  RETURNING id AS asig_c1
\gset

COMMIT;

SELECT :'admin_uid'      AS admin_uid,
       :'noadmin_uid'    AS noadmin_uid,
       :asig_i6          AS asig_i6,
       :asig_c1          AS asig_c1,
       'ZZ-FIXT-TRAB-I6' AS trabajador_i6,
       'ZZ-FIXT-TRAB-C1' AS trabajador_c1,
       'ZZ-FIXT-CONT-I6' AS contrato_i6,
       'ZZ-FIXT-CONT-C1' AS contrato_c1;
-- =====================================================================
-- FIN FIXTURES SETUP v1.2 — NO EJECUTADO. Guarda anti-producción + inserciones en una transacción.
-- =====================================================================
