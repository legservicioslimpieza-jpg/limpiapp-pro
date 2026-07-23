-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · DIAGNÓSTICO READ-ONLY PREVIO A STAGING (v2.5.2: tipos reales + pg_default_acl EXECUTE)
-- SOLO LECTURA. No crea, no altera, no ejecuta mutaciones. NO PEGAR AÚN.
-- Objetivo: confirmar en staging los SUPUESTOS del preflight de la migración v2.4
--   ANTES de habilitar P2-B1. Cada bloque es un SELECT independiente; ejecutar de a uno.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CATÁLOGO REAL de estado_asig (confirma el ARRAY asumido en la migración)
-- ---------------------------------------------------------------------
SELECT estado_asig AS estado_valor, count(*) AS filas
  FROM public.asignaciones
 GROUP BY estado_asig
 ORDER BY filas DESC;

-- ---------------------------------------------------------------------
-- 2. COLUMNAS y TIPOS de public.asignaciones (contrasta con el preflight)
-- ---------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='asignaciones'
 ORDER BY ordinal_position;

-- ---------------------------------------------------------------------
-- 3. COLUMNAS y TIPOS de public.usuarios
-- ---------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='usuarios'
 ORDER BY ordinal_position;

-- 3.b Catálogo real de usuarios.rol (para elegir admin/no-admin en pruebas).
SELECT rol AS rol_valor, count(*) AS filas
  FROM public.usuarios
 GROUP BY rol
 ORDER BY filas DESC;

-- ---------------------------------------------------------------------
-- 4. RLS habilitado + FORCE en tablas legacy relevantes
-- ---------------------------------------------------------------------
SELECT n.nspname AS esquema, c.relname AS tabla,
       c.relrowsecurity  AS rls_habilitado,
       c.relforcerowsecurity AS rls_forzado
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('asignaciones','usuarios');

-- 4.b POLÍTICAS actuales sobre esas tablas (detecta colisiones de nombre y semántica previa).
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('asignaciones','usuarios')
 ORDER BY tablename, policyname;

-- 4.c ¿Ya existe alguno de los nombres de política que crea la migración?
SELECT policyname
  FROM pg_policies
 WHERE schemaname='public'
   AND policyname IN ('pol_asig_select_retiro_roles','pol_asig_update_retiro_executor','pol_usuarios_select_retiro_roles');

-- ---------------------------------------------------------------------
-- 5. auth.uid(): firma, esquema, propietario, tipo de retorno y privilegios
-- ---------------------------------------------------------------------
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid)             AS retorno,
       pg_get_userbyid(p.proowner)               AS propietario,
       p.prosecdef                               AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='auth' AND p.proname='uid';

-- 5.b to_regprocedure exacto (lo que verifica la migración v2.4) + USAGE de esquema.
SELECT to_regprocedure('auth.uid()')                       AS auth_uid_regproc,
       has_schema_privilege('authenticated','auth','USAGE') AS authenticated_usa_auth;

-- ---------------------------------------------------------------------
-- 6. extensions.digest(text,text): firma, esquema, propietario y privilegios
-- ---------------------------------------------------------------------
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid)             AS retorno,
       pg_get_userbyid(p.proowner)               AS propietario
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='extensions' AND p.proname='digest';

-- 6.b to_regprocedure exacto de la firma (text,text) + USAGE de esquema extensions.
SELECT to_regprocedure('extensions.digest(text,text)')          AS digest_tt_regproc,
       to_regprocedure('extensions.digest(bytea,text)')          AS digest_bt_regproc,
       has_schema_privilege('authenticated','extensions','USAGE') AS authenticated_usa_extensions;

-- 6.c ¿pgcrypto instalado y en qué esquema?
SELECT e.extname, n.nspname AS esquema_extension
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 WHERE e.extname='pgcrypto';

-- ---------------------------------------------------------------------
-- 7. USUARIO que ejecutaría staging + CAPACIDADES relevantes (corr.3 migración)
-- ---------------------------------------------------------------------
SELECT current_user AS usuario_actual, session_user AS usuario_sesion;

SELECT r.rolname,
       r.rolsuper      AS es_superusuario,
       r.rolcreaterole AS puede_crear_roles,
       r.rolcreatedb   AS puede_crear_db,
       r.rolbypassrls  AS bypassa_rls,
       has_schema_privilege(r.rolname,'public','CREATE') AS create_en_public
  FROM pg_roles r
 WHERE r.rolname = current_user;

-- 7.b ¿Existen ya los roles/esquemas/tabla que crea la migración? (deben devolver 0 filas)
SELECT 'rol' AS tipo, rolname AS nombre FROM pg_roles
 WHERE rolname IN ('limpiapp_audit_owner','limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader')
UNION ALL
SELECT 'esquema', nspname FROM pg_namespace WHERE nspname IN ('audit','app_private')
UNION ALL
SELECT 'tabla', 'audit.asignacion_eventos' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='audit' AND c.relname='asignacion_eventos';

-- 7.c Firmas exactas de las funciones objetivo (deben devolver NULL si no existen aún).
SELECT to_regprocedure('public.preparar_retiro_asignacion_individual(integer)')                                   AS f_preparar,
       to_regprocedure('public.retirar_asignacion_individual(uuid,integer,text,text,text)')                       AS f_retirar,
       to_regprocedure('public.listar_eventos_asignacion_admin(integer)')                                         AS f_listar,
       to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)') AS f_appender;

-- ---------------------------------------------------------------------
-- 8. CAPACIDAD EFECTIVA DE CONCEDER en auth/extensions + USAGE de authenticated (corr.6 v2.3)
--    Reproduce las verificaciones nuevas del preflight de la migración v2.3.
-- ---------------------------------------------------------------------
SELECT current_user AS runner,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)                       AS es_superusuario,
       has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION')              AS puede_conceder_usage_auth,
       has_schema_privilege(current_user,'extensions','USAGE WITH GRANT OPTION')        AS puede_conceder_usage_extensions,
       has_function_privilege(current_user,'auth.uid()','EXECUTE WITH GRANT OPTION')     AS puede_conceder_exec_authuid,
       has_function_privilege(current_user,'extensions.digest(text,text)','EXECUTE WITH GRANT OPTION') AS puede_conceder_exec_digest,
       has_schema_privilege('authenticated','public','USAGE')                            AS authenticated_usa_public;
-- Interpretación: si es_superusuario=true, las columnas de grant-option son irrelevantes (el
--   superusuario concede todo). Si es_superusuario=false, TODAS las 'puede_conceder_*' deben ser
--   true; en caso contrario, el runner no podrá ejecutar los GRANT de la migración v2.3.
--   authenticated_usa_public debe ser true (las RPC se otorgan a authenticated).

-- ---------------------------------------------------------------------
-- 9. INSUMOS PARA CONCURRENCIA (corr.3 v2.3) — solo verificación, no crea nada
--    Los scripts I6/C1 requieren DOS asignaciones SINTÉTICAS, PREEXISTENTES y EXCLUSIVAS
--    (una para I6, otra para C1), provistas por variable psql \set asig_i6 / \set asig_c1.
--    Este bloque solo ayuda a ELEGIR candidatas elegibles; el operador fija los IDs.
-- ---------------------------------------------------------------------
SELECT a.id AS candidata_sintetica, a.estado_asig, a.activo, a.fecha_inicio_asig
  FROM public.asignaciones a
 WHERE a.activo IS TRUE AND a.estado_asig='activa' AND a.fecha_termino_asig IS NULL
   AND a.fecha_inicio_asig IS NOT NULL AND a.trabajador_id IS NOT NULL AND a.contrato_id IS NOT NULL
 ORDER BY a.id DESC
 LIMIT 10;
-- NOTA: elegir SOLO filas sintéticas de staging (sin valor operacional); tras la prueba de
--   idempotencia quedarán 'terminada' con evento de auditoría y NO deben borrarse (corr.4).

-- ---------------------------------------------------------------------
-- 10. ENTORNO DE ASERCIONES Y PARÁMETROS DE CONCURRENCIA (v2.4) — solo lectura
-- ---------------------------------------------------------------------
-- 10.a Valor actual de plpgsql.check_asserts (las pruebas lo fijan a 'on' y lo verifican).
SELECT current_setting('plpgsql.check_asserts', true) AS check_asserts_actual;
-- 10.b Recordatorio (no ejecuta nada): los scripts de concurrencia v2.4 EXIGEN parámetros
--   EXTERNOS por línea de comando (fail-fast si faltan), con UUID únicos por corrida:
--     I6_A / I6_B : -v admin_uid=... -v asig_i6=...  -v opreq_i6=<UUID único, IDÉNTICO en A y B>
--     C1_A        : -v admin_uid=... -v asig_c1=...  -v opreq_c1_a=<UUID único A>
--     C1_B        : -v admin_uid=... -v asig_c1=...  -v opreq_c1_b=<UUID único B> -v opreq_c1_a=<UUID A>
--   asig_i6 y asig_c1 deben ser DOS asignaciones sintéticas exclusivas y distintas (ver §9).

-- ---------------------------------------------------------------------
-- 11. CONFIRMACIÓN EXPLÍCITA DE TIPOS FÍSICOS (v2.5) — solo lectura
-- ---------------------------------------------------------------------
SELECT
  (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios'    AND column_name='id')                  AS usuarios_id_tipo,          -- esperado: uuid
  (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='asignaciones' AND column_name='fecha_inicio_asig')  AS fecha_inicio_tipo,         -- esperado: date
  (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='asignaciones' AND column_name='fecha_termino_asig') AS fecha_termino_tipo,        -- esperado: date
  (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='asignaciones' AND column_name='id')                 AS asignaciones_id_tipo;      -- esperado: integer

-- ---------------------------------------------------------------------
-- 12. BLOQUEO 1: DEFAULT PRIVILEGES del ejecutor sobre FUNCIONES en public (solo lectura)
--     Revela si las funciones nuevas heredarán EXECUTE para anon/authenticated/service_role.
-- ---------------------------------------------------------------------
SELECT pg_get_userbyid(d.defaclrole) AS rol_definidor, d.defaclobjtype AS tipo_objeto, d.defaclacl AS acl_por_defecto
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE n.nspname='public' AND d.defaclobjtype='f'
 ORDER BY 1;

-- ---------------------------------------------------------------------
-- 13. PROPIETARIOS REALES (read-only): current_user y dueños de esquemas/objetos.
-- ---------------------------------------------------------------------
SELECT current_user AS ejecutor,
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public')     AS public_owner,      -- esperado: pg_database_owner
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='auth')       AS auth_owner,        -- esperado: supabase_admin
       (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='extensions') AS extensions_owner;  -- esperado: postgres

-- =====================================================================
-- FIN DIAGNÓSTICO — SOLO LECTURA. No habilita P2-B1 por sí mismo.
-- Interpretación esperada antes de migrar:
--   §1 el catálogo real debe ser un subconjunto de {activa,terminada,suspendida,anulada}
--      (si aparece otro valor, ajustar c_estados en la migración y en las RPC).
--   §2/§3 tipos REALES esperados (v2.5): asignaciones.id integer; estado_asig text;
--     fecha_inicio_asig/fecha_termino_asig DATE; trabajador_id/contrato_id text;
--     usuarios.id UUID; usuarios.rol text. (Confirmar contra la salida real.)
--   §4 RLS habilitado en ambas; §4.c sin colisión de nombres de política.
--   §5.b/§6.b to_regprocedure NO nulo; §6.b digest(text,text) presente.
--   §7 usuario con puede_crear_roles=true o es_superusuario=true y create_en_public=true.
--   §7.b/§7.c todo NULL/0 filas (instalación limpia).
-- =====================================================================
