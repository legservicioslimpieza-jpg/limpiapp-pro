-- =====================================================================
-- ASIG.EVENTOS.1-A · P2-A · DIAGNÓSTICO READ-ONLY PREVIO A STAGING (v2.5.6 CORR.8: ACL directas vs privilegios efectivos)
-- SOLO LECTURA. No crea, no altera, no ejecuta mutaciones. NO PEGAR AÚN.
-- Objetivo: confirmar en staging los SUPUESTOS del preflight de la migración v2.5.7 CORR.8
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

-- 5.b to_regprocedure exacto (lo que verifica la migración v2.5.7) + USAGE de esquema.
SELECT to_regprocedure('auth.uid()') AS auth_uid_regproc,
       has_schema_privilege(current_user,'auth','USAGE') AS runner_usa_auth,
       has_function_privilege(current_user,'auth.uid()','EXECUTE') AS runner_ejecuta_auth_uid,
       has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') AS runner_concede_auth,
       has_function_privilege(current_user,'auth.uid()','EXECUTE WITH GRANT OPTION') AS runner_concede_auth_uid;
-- CORR.5 esperado en Supabase alojado: runner_usa_auth=true; runner_ejecuta_auth_uid=true;
-- runner_concede_auth/runner_concede_auth_uid pueden ser false y YA NO bloquean la migración.

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

-- 7.a CORR.7 · versión y parámetro requerido para crear membresías SET sin GRANT separado.
SELECT current_setting('server_version_num')::integer AS server_version_num,
       current_setting('server_version') AS server_version,
       current_setting('createrole_self_grant', true) AS createrole_self_grant_actual;
-- Requisito: server_version_num >= 160000. El valor actual puede venir vacío antes de la migración;
-- la migración lo fija LOCALmente a 'set' y lo verifica antes de CREATE ROLE.


-- 7.d Membresías del runner sobre roles API; las pruebas requieren SET sobre authenticated.
SELECT rol.rolname AS rol_concedido,
       miembro.rolname AS miembro,
       m.admin_option, m.inherit_option, m.set_option,
       otorgante.rolname AS otorgante
  FROM pg_auth_members m
  JOIN pg_roles rol       ON rol.oid=m.roleid
  JOIN pg_roles miembro   ON miembro.oid=m.member
  JOIN pg_roles otorgante ON otorgante.oid=m.grantor
 WHERE miembro.rolname=current_user
   AND rol.rolname IN ('anon','authenticated','service_role')
 ORDER BY rol.rolname, otorgante.rolname;

SELECT pg_has_role(current_user,'authenticated','SET') AS runner_puede_set_authenticated;
-- Requisito de gate CORR.7: runner_puede_set_authenticated=true.

SELECT r.rolname,
       r.rolsuper      AS es_superusuario,
       r.rolcreaterole AS puede_crear_roles,
       r.rolcreatedb   AS puede_crear_db,
       r.rolbypassrls  AS bypassa_rls,
       has_schema_privilege(r.rolname,'public','CREATE') AS create_en_public,
       has_schema_privilege(r.rolname,'public','CREATE WITH GRANT OPTION') AS concede_create_en_public
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
       to_regprocedure('app_private.current_auth_uid()')                                                              AS f_bridge_auth,
       to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)') AS f_appender;

-- ---------------------------------------------------------------------
-- 8. CAPACIDAD EFECTIVA CORR.7: runner postgres, PG16+, uso auth y concesión solo en extensions.
-- ---------------------------------------------------------------------
SELECT current_user AS runner,
       current_user='postgres' AS runner_es_postgres,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS es_superusuario,
       has_schema_privilege(current_user,'auth','USAGE') AS puede_usar_auth,
       has_function_privilege(current_user,'auth.uid()','EXECUTE') AS puede_ejecutar_authuid,
       has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') AS puede_conceder_usage_auth_informativo,
       has_function_privilege(current_user,'auth.uid()','EXECUTE WITH GRANT OPTION') AS puede_conceder_exec_authuid_informativo,
       has_schema_privilege(current_user,'extensions','USAGE WITH GRANT OPTION') AS puede_conceder_usage_extensions,
       has_function_privilege(current_user,'extensions.digest(text,text)','EXECUTE WITH GRANT OPTION') AS puede_conceder_exec_digest,
       has_schema_privilege('authenticated','public','USAGE') AS authenticated_usa_public,
       has_schema_privilege(current_user,'public','CREATE WITH GRANT OPTION') AS runner_concede_create_public;
-- CORR.7 requiere además server_version_num>=160000 (§7.a). runner_es_postgres=true;
-- puede_usar_auth=true; puede_ejecutar_authuid=true;
-- puede_conceder_usage_extensions=true; puede_conceder_exec_digest=true; authenticated_usa_public=true;
-- runner_concede_create_public=true. §7.d debe mostrar SET=true para authenticated.
-- Las dos columnas auth *_informativo pueden ser false: no se redistribuyen privilegios auth.

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
-- 12. BLOQUEO 1: DEFAULT PRIVILEGES sobre FUNCIONES (solo lectura).
--     12.a Vista focalizada en public, usada por las RPC expuestas.
-- ---------------------------------------------------------------------
SELECT pg_get_userbyid(d.defaclrole) AS rol_definidor, d.defaclobjtype AS tipo_objeto, d.defaclacl AS acl_por_defecto
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE n.nspname='public' AND d.defaclobjtype='f'
 ORDER BY 1;

-- 12.b Cobertura ampliada CORR.7: incluye alcance base de datos (defaclnamespace=0)
--      y cualquier esquema, incluidos app_private/audit si existieran.
SELECT pg_get_userbyid(d.defaclrole) AS rol_definidor,
       CASE WHEN d.defaclnamespace=0 THEN '<database>' ELSE n.nspname END AS alcance,
       d.defaclobjtype AS tipo_objeto,
       d.defaclacl AS acl_por_defecto
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclobjtype='f'
 ORDER BY 1,2;

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
--   §5.b auth.uid() existe y postgres puede USAR/EJECUTAR; sus grant options pueden ser false.
--   §6.b digest(text,text) presente y concedible por postgres.
--   §7 usuario postgres con puede_crear_roles=true y create_en_public=true; §7.a PG16+.
--   §7.b/§7.c todo NULL/0 filas, incluido f_bridge_auth (instalación limpia).
--   §8 cumple los requisitos CORR.8; no exige grant option en auth ni usa GRANT/REVOKE de membresía.
--   §12.b informa default ACL de funciones en todos los alcances, incluido defaclnamespace=0.
--   CORR.8: el gate posterior usa pg_namespace.nspacl/aclexplode para ausencia de ACL temporal;
--   no usa has_schema_privilege(), que aquí puede reflejar capacidad SET ROLE sin acceso inmediato.
-- =====================================================================
