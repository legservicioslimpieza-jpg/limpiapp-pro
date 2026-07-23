# ASIG.EVENTOS.1-A · CORR.8 · DIFF ACOTADO DESDE CORR.7

--- /mnt/data/corr7_inspect/ASIG_EVENTOS1_A_P2A_diagnostico_readonly_v2_5_5.sql	2026-07-22 19:40:14.000000000 +0000
+++ /mnt/data/ASIG_EVENTOS1_A_CORR8_OFFLINE_v1/ASIG_EVENTOS1_A_P2A_diagnostico_readonly_v2_5_6.sql	2026-07-22 23:43:37.486802958 +0000
@@ -1,7 +1,7 @@
 -- =====================================================================
--- ASIG.EVENTOS.1-A · P2-A · DIAGNÓSTICO READ-ONLY PREVIO A STAGING (v2.5.5 CORR.7: ownership explícito por SET ROLE)
+-- ASIG.EVENTOS.1-A · P2-A · DIAGNÓSTICO READ-ONLY PREVIO A STAGING (v2.5.6 CORR.8: ACL directas vs privilegios efectivos)
 -- SOLO LECTURA. No crea, no altera, no ejecuta mutaciones. NO PEGAR AÚN.
--- Objetivo: confirmar en staging los SUPUESTOS del preflight de la migración v2.5.6 CORR.7
+-- Objetivo: confirmar en staging los SUPUESTOS del preflight de la migración v2.5.7 CORR.8
 --   ANTES de habilitar P2-B1. Cada bloque es un SELECT independiente; ejecutar de a uno.
 -- =====================================================================
 
@@ -67,7 +67,7 @@
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='auth' AND p.proname='uid';
 
--- 5.b to_regprocedure exacto (lo que verifica la migración v2.5.5) + USAGE de esquema.
+-- 5.b to_regprocedure exacto (lo que verifica la migración v2.5.7) + USAGE de esquema.
 SELECT to_regprocedure('auth.uid()') AS auth_uid_regproc,
        has_schema_privilege(current_user,'auth','USAGE') AS runner_usa_auth,
        has_function_privilege(current_user,'auth.uid()','EXECUTE') AS runner_ejecuta_auth_uid,
@@ -248,6 +248,8 @@
 --   §6.b digest(text,text) presente y concedible por postgres.
 --   §7 usuario postgres con puede_crear_roles=true y create_en_public=true; §7.a PG16+.
 --   §7.b/§7.c todo NULL/0 filas, incluido f_bridge_auth (instalación limpia).
---   §8 cumple los requisitos CORR.7; no exige grant option en auth ni usa GRANT/REVOKE de membresía.
+--   §8 cumple los requisitos CORR.8; no exige grant option en auth ni usa GRANT/REVOKE de membresía.
 --   §12.b informa default ACL de funciones en todos los alcances, incluido defaclnamespace=0.
+--   CORR.8: el gate posterior usa pg_namespace.nspacl/aclexplode para ausencia de ACL temporal;
+--   no usa has_schema_privilege(), que aquí puede reflejar capacidad SET ROLE sin acceso inmediato.
 -- =====================================================================

--- /mnt/data/corr7_inspect/ASIG_EVENTOS1_A_P2A_migracion_construida_v2_5_6_CANDIDATA.sql	2026-07-22 19:40:14.000000000 +0000
+++ /mnt/data/ASIG_EVENTOS1_A_CORR8_OFFLINE_v1/ASIG_EVENTOS1_A_P2A_migracion_construida_v2_5_7_CANDIDATA.sql	2026-07-22 23:42:24.738805506 +0000
@@ -1,18 +1,20 @@
 -- =====================================================================
--- ASIG.EVENTOS.1-A · P2-A · MIGRACIÓN CONSTRUIDA v2.5.6 CANDIDATA
--- CORR.7: ownership explícito mediante SET LOCAL ROLE; cero DDL de membresía.
+-- ASIG.EVENTOS.1-A · P2-A · MIGRACIÓN CONSTRUIDA v2.5.7 CANDIDATA
+-- CORR.8: ownership explícito mediante SET LOCAL ROLE; cero DDL de membresía.
 -- usuarios.id=uuid; fechas=date; identidad derivada exclusivamente de auth.uid() mediante
 -- app_private.current_auth_uid() SECURITY DEFINER propiedad de postgres. Token, fingerprint,
 -- idempotencia, concurrencia, UPDATE…RETURNING, zona horaria y contrato RPC preservados.
--- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.7 Y NUEVO GATE P2-B1.1 (staging).
+-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.8 Y NUEVO GATE P2-B1.1 (staging).
 -- NO PEGAR EN SUPABASE. Ejecutar únicamente por psql Session Pooler 5432/directo autorizado.
 --
--- CORR.7:
+-- CORR.8:
 --   * conserva SET LOCAL createrole_self_grant='set' y elimina todo GRANT/REVOKE de membresía;
 --   * no depende de INHERIT: cada operación que exige propiedad se ejecuta bajo el owner real;
 --   * crea appender y RPC directamente bajo sus propietarios finales;
 --   * usa privilegios CREATE temporales de objeto y los revoca antes del COMMIT;
 --   * valida SET ROLE authenticated para las pruebas end-to-end.
+--   * valida la ausencia de privilegios temporales por ACL directa (pg_namespace.nspacl), no por
+--     has_schema_privilege(), que en PG17/Supabase puede reflejar capacidad SET ROLE sin uso inmediato.
 -- Marca de procedencia: 'ASIG.EVENTOS.1-A/P2-A'.
 -- =====================================================================
 
@@ -23,7 +25,7 @@
 DO $$
 BEGIN
   IF current_setting('server_version_num')::integer < 160000 THEN
-    RAISE EXCEPTION 'PREFLIGHT CORR.7: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
+    RAISE EXCEPTION 'PREFLIGHT CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
   END IF;
 END $$;
 
@@ -37,9 +39,9 @@
 DO $$
 DECLARE v_col record; v_ok boolean;
 BEGIN
-  -- 0.0 CORR.7: el gate de versión se ejecutó antes de fijar el GUC; aquí se valida el valor LOCAL.
+  -- 0.0 CORR.8: el gate de versión se ejecutó antes de fijar el GUC; aquí se valida el valor LOCAL.
   IF current_setting('createrole_self_grant', true) IS DISTINCT FROM 'set' THEN
-    RAISE EXCEPTION 'PREFLIGHT CORR.7: createrole_self_grant no quedó en set';
+    RAISE EXCEPTION 'PREFLIGHT CORR.8: createrole_self_grant no quedó en set';
   END IF;
 
   -- 0.a Capacidad efectiva del runner:
@@ -50,7 +52,7 @@
   END IF;
   -- 0.a.2 Capacidad de crear en los esquemas donde vivirán/asignarán funciones (public + los nuevos).
   IF NOT has_schema_privilege(current_user, 'public', 'CREATE WITH GRANT OPTION') THEN
-    RAISE EXCEPTION 'PREFLIGHT CORR.7: % no puede conceder CREATE temporal en schema public', current_user;
+    RAISE EXCEPTION 'PREFLIGHT CORR.8: % no puede conceder CREATE temporal en schema public', current_user;
   END IF;
 
   -- 0.a.3 CORR.5 · Supabase alojado: el puente auth queda propiedad de postgres.
@@ -74,7 +76,7 @@
   IF NOT has_schema_privilege('authenticated','public','USAGE') THEN
     RAISE EXCEPTION 'PREFLIGHT: el rol authenticated no tiene USAGE sobre schema public'; END IF;
   IF NOT pg_has_role(current_user,'authenticated','SET') THEN
-    RAISE EXCEPTION 'PREFLIGHT CORR.7: % no puede SET ROLE authenticated; las pruebas RPC no son ejecutables', current_user; END IF;
+    RAISE EXCEPTION 'PREFLIGHT CORR.8: % no puede SET ROLE authenticated; las pruebas RPC no son ejecutables', current_user; END IF;
 
   -- 0.b Colisión de roles/esquemas/tabla.
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
@@ -140,7 +142,7 @@
   LOOP
     RAISE NOTICE 'pg_default_acl (public, FUNCTIONS) definidor=% acl=%', r.definidor, r.acl;
     IF r.acl ~ '(anon|service_role)=' THEN
-      RAISE NOTICE 'AVISO BLOQUEO1: % otorga EXECUTE por defecto a anon/service_role; se revoca explícitamente en §12.', r.definidor;
+      RAISE NOTICE 'AVISO BLOQUEO1: % otorga EXECUTE por defecto a anon/service_role; se revoca explícitamente en §7.', r.definidor;
       v_aviso := true;
     END IF;
   END LOOP;
@@ -174,7 +176,7 @@
          AND m.set_option
          AND NOT m.inherit_option
     ) THEN
-      RAISE EXCEPTION 'CORR.7: CREATE ROLE % no generó la membresía SET/no-INHERIT esperada para %', v_r, session_user;
+      RAISE EXCEPTION 'CORR.8: CREATE ROLE % no generó la membresía SET/no-INHERIT esperada para %', v_r, session_user;
     END IF;
 
     IF EXISTS (
@@ -185,7 +187,7 @@
        WHERE r.rolname=v_r
          AND gr.rolname IN ('anon','authenticated','service_role')
     ) THEN
-      RAISE EXCEPTION 'CORR.7: un rol API recibió membresía inesperada sobre %', v_r;
+      RAISE EXCEPTION 'CORR.8: un rol API recibió membresía inesperada sobre %', v_r;
     END IF;
 
     EXECUTE format('SET LOCAL ROLE %I', v_r);
@@ -611,7 +613,7 @@
       WHERE r.rolname=v_r AND gr.rolname=session_user AND go.rolname=session_user
         AND m.set_option AND NOT m.inherit_option
     ) THEN
-      RAISE EXCEPTION 'CORR.7: membresía SET/no-INHERIT final inválida para %', v_r;
+      RAISE EXCEPTION 'CORR.8: membresía SET/no-INHERIT final inválida para %', v_r;
     END IF;
     IF EXISTS (
       SELECT 1 FROM pg_auth_members m
@@ -619,7 +621,7 @@
       JOIN pg_roles gr ON gr.oid=m.member
       WHERE r.rolname=v_r AND gr.rolname IN ('anon','authenticated','service_role')
     ) THEN
-      RAISE EXCEPTION 'CORR.7: membresía API inesperada sobre %', v_r;
+      RAISE EXCEPTION 'CORR.8: membresía API inesperada sobre %', v_r;
     END IF;
   END LOOP;
 
@@ -627,12 +629,12 @@
        IS DISTINCT FROM 'limpiapp_audit_owner'
      OR (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='app_private')
        IS DISTINCT FROM 'limpiapp_audit_owner' THEN
-    RAISE EXCEPTION 'CORR.7: propietarios de schemas técnicos incorrectos';
+    RAISE EXCEPTION 'CORR.8: propietarios de schemas técnicos incorrectos';
   END IF;
   IF (SELECT pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='audit' AND c.relname='asignacion_eventos')
        IS DISTINCT FROM 'limpiapp_audit_owner' THEN
-    RAISE EXCEPTION 'CORR.7: owner de audit.asignacion_eventos incorrecto';
+    RAISE EXCEPTION 'CORR.8: owner de audit.asignacion_eventos incorrecto';
   END IF;
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('app_private.current_auth_uid()'))
        IS DISTINCT FROM 'postgres'
@@ -644,22 +646,69 @@
        IS DISTINCT FROM 'limpiapp_asig_retiro_executor'
      OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.listar_eventos_asignacion_admin(integer)'))
        IS DISTINCT FROM 'limpiapp_audit_reader' THEN
-    RAISE EXCEPTION 'CORR.7: owner de una o más funciones incorrecto';
+    RAISE EXCEPTION 'CORR.8: owner de una o más funciones incorrecto';
   END IF;
 
-  IF has_schema_privilege('postgres','audit','CREATE')
-     OR has_schema_privilege('postgres','audit','USAGE')
-     OR has_schema_privilege('postgres','app_private','CREATE')
-     OR has_schema_privilege('postgres','app_private','USAGE')
-     OR has_schema_privilege('limpiapp_asig_retiro_executor','app_private','CREATE')
-     OR has_schema_privilege('limpiapp_asig_retiro_executor','public','CREATE')
-     OR has_schema_privilege('limpiapp_asig_retiro_preparer','public','CREATE')
-     OR has_schema_privilege('limpiapp_audit_reader','public','CREATE') THEN
-    RAISE EXCEPTION 'CORR.7: quedó un privilegio CREATE temporal';
+  -- CORR.8: inspeccionar ACL DIRECTA. has_schema_privilege() no es válido para demostrar
+  -- ausencia aquí: en staging PG17 devolvió USAGE=true por capacidad SET ROLE aunque la ACL
+  -- directa no existía y CREATE/EXECUTE reales fueron denegados.
+  IF EXISTS (
+    SELECT 1
+      FROM pg_namespace n
+      CROSS JOIN LATERAL aclexplode(
+        COALESCE(n.nspacl, acldefault('n', n.nspowner))
+      ) a
+      JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
+     WHERE
+       (n.nspname IN ('audit','app_private')
+        AND beneficiario.rolname = 'postgres'
+        AND a.privilege_type IN ('CREATE','USAGE'))
+       OR
+       (n.nspname = 'app_private'
+        AND beneficiario.rolname = 'limpiapp_asig_retiro_executor'
+        AND a.privilege_type = 'CREATE')
+       OR
+       (n.nspname = 'public'
+        AND beneficiario.rolname IN (
+          'limpiapp_asig_retiro_executor',
+          'limpiapp_asig_retiro_preparer',
+          'limpiapp_audit_reader'
+        )
+        AND a.privilege_type = 'CREATE')
+  ) THEN
+    RAISE EXCEPTION 'CORR.8: quedó un privilegio temporal DIRECTO en ACL de esquema';
+  END IF;
+
+  -- Verificar que los USAGE persistentes mínimos sí quedaron concedidos directamente.
+  IF EXISTS (
+    SELECT 1
+      FROM (VALUES
+        ('app_private','limpiapp_asig_retiro_executor','USAGE'),
+        ('app_private','limpiapp_asig_retiro_preparer','USAGE'),
+        ('app_private','limpiapp_audit_reader','USAGE'),
+        ('audit','limpiapp_asig_retiro_executor','USAGE'),
+        ('audit','limpiapp_audit_reader','USAGE'),
+        ('public','limpiapp_asig_retiro_executor','USAGE'),
+        ('public','limpiapp_asig_retiro_preparer','USAGE'),
+        ('public','limpiapp_audit_reader','USAGE')
+      ) esperado(esquema,rol,privilegio)
+     WHERE NOT EXISTS (
+       SELECT 1
+         FROM pg_namespace n
+         CROSS JOIN LATERAL aclexplode(
+           COALESCE(n.nspacl, acldefault('n', n.nspowner))
+         ) a
+         JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
+        WHERE n.nspname = esperado.esquema
+          AND beneficiario.rolname = esperado.rol
+          AND a.privilege_type = esperado.privilegio
+     )
+  ) THEN
+    RAISE EXCEPTION 'CORR.8: falta un privilegio USAGE persistente directo esperado';
   END IF;
 END $$;
 
 COMMIT;
 -- =====================================================================
--- FIN v2.5.6 CANDIDATA CORR.7 — NO EJECUTADA.
+-- FIN v2.5.7 CANDIDATA CORR.8 — NO EJECUTADA.
 -- =====================================================================

--- /mnt/data/corr7_inspect/ASIG_EVENTOS1_A_P2A_pruebas_staging_v2_5_7.sql	2026-07-22 19:41:14.000000000 +0000
+++ /mnt/data/ASIG_EVENTOS1_A_CORR8_OFFLINE_v1/ASIG_EVENTOS1_A_P2A_pruebas_staging_v2_5_8.sql	2026-07-22 23:43:37.486802958 +0000
@@ -1,6 +1,6 @@
 -- =====================================================================
--- ASIG.EVENTOS.1-A · P2-A · PRUEBAS SQL/RPC (STAGING) v2.5.7
--- CORR.7: valida owners reales, SET ROLE por ruta y ausencia de privilegios CREATE temporales.
+-- ASIG.EVENTOS.1-A · P2-A · PRUEBAS SQL/RPC (STAGING) v2.5.8
+-- CORR.8: valida owners reales, SET ROLE por ruta y ausencia de privilegios CREATE temporales.
 -- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA GATE P2-B1.1. NO PEGAR EN SUPABASE; usar psql.
 -- RPC públicas solo bajo authenticated + claims; audit.* solo bajo audit_reader.
 -- Cero GRANT/REVOKE de membresía. Toda la prueba funcional corre en una transacción con ROLLBACK.
@@ -13,7 +13,7 @@
 DO $$
 BEGIN
   IF current_setting('server_version_num')::integer < 160000 THEN
-    RAISE EXCEPTION 'PRUEBAS CORR.7: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
+    RAISE EXCEPTION 'PRUEBAS CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
   END IF;
 END $$;
 
@@ -22,7 +22,7 @@
 DO $$ BEGIN IF current_setting('plpgsql.check_asserts') <> 'on' THEN
   RAISE EXCEPTION 'PRUEBAS ABORTADAS: plpgsql.check_asserts no está on (las aserciones no protegerían)'; END IF; END $$;
 
--- CORR.7: el runner no lee audit como postgres. Debe existir la membresía administrativa
+-- CORR.8: el runner no lee audit como postgres. Debe existir la membresía administrativa
 -- SET=TRUE / INHERIT=FALSE creada por la migración, sin ejecutar DDL de membresía en las pruebas.
 DO $adm$
 DECLARE v_r text;
@@ -58,11 +58,11 @@
   END IF;
 
   IF NOT pg_has_role(current_user,'authenticated','SET') THEN
-    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.7: postgres no puede SET ROLE authenticated';
+    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.8: postgres no puede SET ROLE authenticated';
   END IF;
   SET LOCAL ROLE authenticated;
   IF current_user IS DISTINCT FROM 'authenticated' THEN
-    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.7: SET ROLE authenticated no tomó efecto';
+    RAISE EXCEPTION 'PRUEBAS ABORTADAS CORR.8: SET ROLE authenticated no tomó efecto';
   END IF;
   RESET ROLE;
 
@@ -281,7 +281,7 @@
   RAISE NOTICE 'GRUPO S OK';
 END $$;
 
-ROLLBACK;   -- REVIERTE fixtures/eventos de prueba; las membresías administrativas CORR.7 son preexistentes.
+ROLLBACK;   -- REVIERTE fixtures/eventos de prueba; las membresías administrativas CORR.8 son preexistentes.
 
 -- =====================================================================
 -- PRUEBA BLOQUEO 1 (P2-A.1-CORR.1): privilegios EXECUTE de las RPC public.* (catálogo; sin audit, sin RPC)
@@ -357,46 +357,85 @@
 
 
 -- =====================================================================
--- PRUEBA CORR.7 · PROPIETARIOS Y PRIVILEGIOS TEMPORALES
+-- PRUEBA CORR.8 · PROPIETARIOS Y PRIVILEGIOS TEMPORALES
 -- =====================================================================
-DO $corr7owners$
+DO $corr8owners$
 DECLARE
   v text;
 BEGIN
   SELECT pg_get_userbyid(nspowner) INTO v FROM pg_namespace WHERE nspname='audit';
-  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.7 owner schema audit=%',v; END IF;
+  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner schema audit=%',v; END IF;
   SELECT pg_get_userbyid(nspowner) INTO v FROM pg_namespace WHERE nspname='app_private';
-  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.7 owner schema app_private=%',v; END IF;
+  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner schema app_private=%',v; END IF;
   SELECT pg_get_userbyid(c.relowner) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='audit' AND c.relname='asignacion_eventos';
-  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.7 owner tabla audit=%',v; END IF;
+  IF v IS DISTINCT FROM 'limpiapp_audit_owner' THEN RAISE EXCEPTION 'CORR.8 owner tabla audit=%',v; END IF;
 
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('app_private.registrar_evento_asignacion(uuid,text,integer,text,text,text,text[],jsonb,jsonb,text,uuid,jsonb,text,text,smallint)'))
-       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.7 owner appender'; END IF;
+       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.8 owner appender'; END IF;
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.preparar_retiro_asignacion_individual(integer)'))
-       IS DISTINCT FROM 'limpiapp_asig_retiro_preparer' THEN RAISE EXCEPTION 'CORR.7 owner preparar'; END IF;
+       IS DISTINCT FROM 'limpiapp_asig_retiro_preparer' THEN RAISE EXCEPTION 'CORR.8 owner preparar'; END IF;
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.retirar_asignacion_individual(uuid,integer,text,text,text)'))
-       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.7 owner retirar'; END IF;
+       IS DISTINCT FROM 'limpiapp_asig_retiro_executor' THEN RAISE EXCEPTION 'CORR.8 owner retirar'; END IF;
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('public.listar_eventos_asignacion_admin(integer)'))
-       IS DISTINCT FROM 'limpiapp_audit_reader' THEN RAISE EXCEPTION 'CORR.7 owner listar'; END IF;
+       IS DISTINCT FROM 'limpiapp_audit_reader' THEN RAISE EXCEPTION 'CORR.8 owner listar'; END IF;
 
-  IF has_schema_privilege('postgres','audit','CREATE')
-     OR has_schema_privilege('postgres','audit','USAGE')
-     OR has_schema_privilege('postgres','app_private','CREATE')
-     OR has_schema_privilege('postgres','app_private','USAGE')
-     OR has_schema_privilege('limpiapp_asig_retiro_executor','app_private','CREATE')
-     OR has_schema_privilege('limpiapp_asig_retiro_executor','public','CREATE')
-     OR has_schema_privilege('limpiapp_asig_retiro_preparer','public','CREATE')
-     OR has_schema_privilege('limpiapp_audit_reader','public','CREATE') THEN
-    RAISE EXCEPTION 'CORR.7 quedó CREATE temporal';
+  -- ACL DIRECTA: no confundir capacidad SET ROLE con acceso inmediato del runner.
+  IF EXISTS (
+    SELECT 1
+      FROM pg_namespace n
+      CROSS JOIN LATERAL aclexplode(
+        COALESCE(n.nspacl, acldefault('n', n.nspowner))
+      ) a
+      JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
+     WHERE
+       (n.nspname IN ('audit','app_private')
+        AND beneficiario.rolname = 'postgres'
+        AND a.privilege_type IN ('CREATE','USAGE'))
+       OR
+       (n.nspname = 'app_private'
+        AND beneficiario.rolname = 'limpiapp_asig_retiro_executor'
+        AND a.privilege_type = 'CREATE')
+       OR
+       (n.nspname = 'public'
+        AND beneficiario.rolname IN (
+          'limpiapp_asig_retiro_executor',
+          'limpiapp_asig_retiro_preparer',
+          'limpiapp_audit_reader'
+        )
+        AND a.privilege_type = 'CREATE')
+  ) THEN
+    RAISE EXCEPTION 'CORR.8 quedó privilegio temporal DIRECTO en ACL de esquema';
   END IF;
 
-  FOREACH v IN ARRAY ARRAY['limpiapp_asig_retiro_executor','limpiapp_asig_retiro_preparer','limpiapp_audit_reader'] LOOP
-    IF NOT has_schema_privilege(v,'public','USAGE') THEN
-      RAISE EXCEPTION 'CORR.7 % sin USAGE public',v;
-    END IF;
-  END LOOP;
-  RAISE NOTICE 'CORR.7 OWNERS/CREATE TEMPORAL OK';
-END $corr7owners$;
+  IF EXISTS (
+    SELECT 1
+      FROM (VALUES
+        ('app_private','limpiapp_asig_retiro_executor','USAGE'),
+        ('app_private','limpiapp_asig_retiro_preparer','USAGE'),
+        ('app_private','limpiapp_audit_reader','USAGE'),
+        ('audit','limpiapp_asig_retiro_executor','USAGE'),
+        ('audit','limpiapp_audit_reader','USAGE'),
+        ('public','limpiapp_asig_retiro_executor','USAGE'),
+        ('public','limpiapp_asig_retiro_preparer','USAGE'),
+        ('public','limpiapp_audit_reader','USAGE')
+      ) esperado(esquema,rol,privilegio)
+     WHERE NOT EXISTS (
+       SELECT 1
+         FROM pg_namespace n
+         CROSS JOIN LATERAL aclexplode(
+           COALESCE(n.nspacl, acldefault('n', n.nspowner))
+         ) a
+         JOIN pg_roles beneficiario ON beneficiario.oid = a.grantee
+        WHERE n.nspname = esperado.esquema
+          AND beneficiario.rolname = esperado.rol
+          AND a.privilege_type = esperado.privilegio
+     )
+  ) THEN
+    RAISE EXCEPTION 'CORR.8 falta USAGE persistente directo esperado';
+  END IF;
+
+  RAISE NOTICE 'CORR.8 OWNERS/ACL TEMPORAL DIRECTA OK';
+END $corr8owners$;
 
--- FIN PRUEBAS v2.5.7 CORR.7 — NO EJECUTADAS.
+-- FIN PRUEBAS v2.5.8 CORR.8 — NO EJECUTADAS.

--- /mnt/data/corr7_inspect/ASIG_EVENTOS1_A_P2A_rollback_v2_5_7_CANDIDATO.sql	2026-07-22 19:40:14.000000000 +0000
+++ /mnt/data/ASIG_EVENTOS1_A_CORR8_OFFLINE_v1/ASIG_EVENTOS1_A_P2A_rollback_v2_5_8_CANDIDATO.sql	2026-07-22 23:42:24.738805506 +0000
@@ -1,12 +1,13 @@
 -- =====================================================================
--- ASIG.EVENTOS.1-A · P2-A · ROLLBACK v2.5.7 CANDIDATO
--- CORR.7: todas las operaciones de propietario se ejecutan bajo SET LOCAL ROLE; cero DDL de membresía.
--- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.7 Y NUEVO GATE P2-B1.1.
+-- ASIG.EVENTOS.1-A · P2-A · ROLLBACK v2.5.8 CANDIDATO
+-- CORR.8: todas las operaciones de propietario se ejecutan bajo SET LOCAL ROLE; cero DDL de membresía.
+-- ARTEFACTO CONSTRUIDO — NO EJECUTAR HASTA REAUDITORÍA CORR.8 Y NUEVO GATE P2-B1.1.
 -- NO PEGAR EN SUPABASE. Ejecutar sin tráfico concurrente y solo por psql autorizado.
 --
 -- Con eventos: conserva evidencia, audit owner, audit reader, bridge y RPC proyectada de lectura.
 -- Sin eventos: desmontaje completo. ACCESS EXCLUSIVE se toma antes del conteo.
 -- DROP OWNED se ejecuta como cada rol mediante DROP OWNED BY CURRENT_USER.
+-- CORR.8: lógica de desmontaje preservada desde v2.5.7; no depende de has_schema_privilege().
 -- Marca de procedencia: 'ASIG.EVENTOS.1-A/P2-A'.
 -- =====================================================================
 
@@ -16,7 +17,7 @@
 DO $$
 BEGIN
   IF current_setting('server_version_num')::integer < 160000 THEN
-    RAISE EXCEPTION 'ROLLBACK CORR.7: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
+    RAISE EXCEPTION 'ROLLBACK CORR.8: PostgreSQL %; se requiere server_version_num >= 160000', current_setting('server_version');
   END IF;
 END $$;
 
@@ -381,5 +382,5 @@
 COMMIT;
 -- =====================================================================
 -- ROLLBACK DE APLICACIÓN (React) DOCUMENTADO POR SEPARADO. No elimina eventos.
--- FIN v2.5.7 CANDIDATO CORR.7 — NO EJECUTADO.
+-- FIN v2.5.8 CANDIDATO CORR.8 — NO EJECUTADO.
 -- =====================================================================
