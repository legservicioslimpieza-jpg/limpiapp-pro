# ASIG.EVENTOS.1-A · P2-A.1-CORR.4 · INFORME TÉCNICO (cierre dirigido hallazgos Fable 5)

Veredicto independiente **NO APTO PARA STAGING** aceptado. Correcciones concentradas en pruebas,
rollback, concurrencia, fixtures y runbook. **La migración v2.5.3 NO se altera** (aceptada en su
lógica); no se reconstruye arquitectura, contrato RPC, event store, taxonomía, atomicidad,
idempotencia, advisory lock, normalización, bootstrap físico, propietarios, RLS, React, movilidad
ni desvinculación. Ningún SQL ejecutado; sin Supabase; sin usuarios Auth; sin push/deploy; canónico
intacto.

## 🔴 B1 — resuelto · `pruebas_staging_v2_5_4.sql`
Mantiene `\set ON_ERROR_STOP on` + `BEGIN` + ROLLBACK final. Al inicio de la transacción verifica en
`pg_auth_members` que CURRENT_USER conserva **ADMIN OPTION** sobre `limpiapp_audit_reader` y se
auto-concede membresía temporal explícita `GRANT limpiapp_audit_reader TO CURRENT_USER WITH INHERIT
FALSE, SET TRUE` (vive dentro de la transacción; la revierte el ROLLBACK final). **Toda** lectura de
`audit.asignacion_eventos` corre bajo `SET LOCAL ROLE limpiapp_audit_reader … RESET ROLE`; ninguna
como `postgres`. **Todas** las llamadas funcionales a `preparar_retiro_asignacion_individual`,
`retirar_asignacion_individual` y `listar_eventos_asignacion_admin` corren bajo `SET LOCAL ROLE
authenticated` + claims (`request.jwt.claims` seteado como postgres antes del cambio de rol; la
lectura de `public.asignaciones` para la fecha permanece como postgres owner — tabla public,
`force_rls=false`). Sin dependencia del ADP legacy (A1). Las **27 aserciones ejecutables** se conservan idénticas
(módulo separar el `SELECT` precedente en tres one-liners; conteo verificado: v2.5.3 = 27 ejecutables
+ 1 mención en comentario = las «28» de la directiva; v2.5.4 = 27 ejecutables + 0 en comentarios),
junto con normalización, idempotencia, seguridad y la prueba **BLOQUEO 1** (3×
`has_function_privilege`, ejecutada tras el ROLLBACK por diseño heredado: read-only de catálogo,
sin tocar `audit` ni invocar RPC).

## 🔴 B2 — resuelto · `rollback_v2_5_4_CANDIDATO.sql`
El bloque de **validación de procedencia + concesión temporal de roles (§0.b)** se movió **antes**
del primer acceso a `audit.asignacion_eventos`. Sin herencia implícita: `GRANT … TO CURRENT_USER
WITH INHERIT TRUE, SET TRUE` explícito (INHERIT TRUE es necesario para que `DROP OWNED`/`DROP
FUNCTION` operen vía `has_privs_of_role`; desviación documentada en el propio artefacto respecto del
literal "INHERIT FALSE"). La procedencia de `audit.asignacion_eventos` se verifica por **catálogo
como postgres** (sin leer filas). El **único** `count(*)` de eventos corre bajo `SET LOCAL ROLE
limpiapp_audit_reader … RESET ROLE`, **después** de la concesión. Si `audit` existe y
`limpiapp_audit_reader` no ⇒ **aborta como estado inconsistente** (no continúa silenciosamente).
Ramas sin cambios lógicos y ambas alcanzables: **sin eventos** = desmontaje total; **con eventos** =
preservación de evidencia + lectura administrativa. Antes del COMMIT de la rama con eventos se
comprueba que CURRENT_USER **no retiene capacidad operativa** (ni `inherit_option` ni `set_option`
sobre owner/reader; la capacidad ADMIN estructural del creador puede permanecer). Fail-safe: cualquier
diferencia revierte toda la transacción.

## 🟠 A1 — resuelto · `default_acl_decision_v2_1.md`
ADP legacy **opcional** (reproduce superficie histórica); **NO** requisito de las pruebas; la familia
v2.5.4 llama las RPC como `authenticated`; no se hacen obligatorios grants amplios a
`anon`/`service_role`/`postgres`; la "alternativa mínima" queda declarada **compatible** con P2-B1.1.

## 🟡 M1 + endurecimientos — resueltos · 4× `concurrencia_*_v2_5_4.sql`
`SET LOCAL plpgsql.check_asserts = on` **dentro** de `BEGIN` y verificado en esa misma transacción.
RPC (FASE 1 y 2) bajo `SET LOCAL ROLE authenticated` + claims; `GRANT SELECT, UPDATE` solo sobre la
TEMP `p` `ON COMMIT DROP` (muere con la transacción: sin grants ni membresías permanentes). Ninguna
lectura de `audit.*`: la verificación conjunta (pies de I6_B/C1_B) usa
`public.listar_eventos_asignacion_admin` bajo authenticated+claims admin y espera **exactamente 1
evento** (I6: 1 created + 1 replayed; C1: A created + B ESTADO_OBSOLETO sin evento; el detalle por
opreq queda afirmado por las ASSERT de cada sesión). Barreras `\prompt` y semántica intactas.

## 🔵 BAJO 1/2 — resueltos · `fixtures_setup_v1_2.sql` + `runbook_staging_v1.md`
Fixtures v1.2: único cambio = guardas de parámetros por **DO/RAISE (error SQL real, exit≠0 con
ON_ERROR_STOP)**; guarda anti-producción e inserciones idénticas a v1.1. Runbook: **solo psql**
(nunca SQL Editor para ningún artefacto; explícito para migración/rollback), Session Pooler 5432 o
directa, **PROHIBIDO** Transaction Pooler 6543, invocación `psql -X -v ON_ERROR_STOP=1`, ADP
opcional + pruebas independientes, puntos de detención tras cada artefacto, producción excluida, y
teardown en dos rutas (sin/con eventos).

## Validación estática offline (consolidada)
Parseo pglast OK en los 7 SQL de la familia CORR.4. Clasificador de roles con criterios declarados:
análisis textual línea a línea (incluye el interior de bloques `$$`), tracking intra-línea de
`SET LOCAL ROLE`/`RESET ROLE` por posición, y toda mención dentro de un string de comilla simple se
clasifica como **literal** salvo SQL dinámico con `EXECUTE` (que se evalúa bajo el rol activo).
Resultado consolidado: **0** lecturas de `audit.asignacion_eventos` como postgres — pruebas: 6 bajo
`audit_reader` + 1 bajo `authenticated` como denegación esperada AUTH-ROLE (L85, con `ASSERT
ok_deneg`); rollback: 1 única lectura — el `count` dinámico L164 — bajo `audit_reader`; las otras 9
menciones del rollback son 2 strings de `RAISE EXCEPTION` (L137/L141, mensajes de abort, no
lecturas) y 7 DDL de desmontaje/preservación (DROP/REVOKE, que corren como postgres por diseño vía
la membresía INHERIT de §0.b y no constituyen lectura); concurrencia: 0 menciones de `audit` en SQL.
**0** invocaciones de RPC públicas como postgres — pruebas: **21** bajo authenticated; concurrencia:
10 bajo authenticated (2+3+2+3); las 3 menciones L241-243 de pruebas y las 3 del rollback son firmas
dentro de literales (`has_function_privilege` del test BLOQUEO1 y `pg_temp.drop_func_prov`), texto,
no invocaciones; `listar_eventos_asignacion_admin` no tenía invocación funcional en las pruebas
v2.5.3 (solo la firma de catálogo, igual que en v2.5.4) y su cobertura funcional vive en los pies de
I6_B/C1_B. Rollback: membresía/rol obtenidos **antes** del único `count` (orden real del archivo:
procedencia de tabla L130-138 → chequeo de inconsistencia audit-sin-reader L139-142 → §0.b GRANT
L152 + prueba de asunción L153-156 → count bajo reader L163-164). `check_asserts` dentro de `BEGIN`
en los 4 scripts de concurrencia y en las pruebas; **0** `\quit` (ni en rutas de fallo ni en texto)
en toda la familia v2.5.4/v1.2; **0** mutaciones sobre `auth.*` (las guardas de fixtures solo LEEN
`auth.users`). Límites declarados: pglast no deep-parsea cuerpos plpgsql (los valida el servidor al
`CREATE FUNCTION`/`DO`); el análisis de roles es textual, no una ejecución; el comportamiento de
`SET ROLE` (membresía `postgres→authenticated` de Supabase) y `pg_has_role` se confirma en staging
real.

## Inventario y hashes (entregables CORR.4)
| Artefacto | MD5 | SHA-256 | Bytes |
|---|---|---|---|
| `ASIG_EVENTOS1_A_P2A_pruebas_staging_v2_5_4.sql` | `e3cdc045428852840a3e4ff52877f49a` | `5b71a0dd2124b3ccc70127f92d14356e7f9cd54e9500a042cefeb17a6d2ca10d` | 14001 |
| `ASIG_EVENTOS1_A_P2A_rollback_v2_5_4_CANDIDATO.sql` | `8dfdcfd752ef40c66e3d5ba971460959` | `a173964617b7c812bdcde1a058462565e1388ad92e811383f8dcc7c97cd88b60` | 22034 |
| `ASIG_EVENTOS1_A_P2A_concurrencia_I6_A_v2_5_4.sql` | `6d62520ad23a4c10fc9fd76a48472316` | `df756aad1bb38ff7c5112b53b19edef5ed0b7b0107bc90ff5706b5548d5f0ece` | 4394 |
| `ASIG_EVENTOS1_A_P2A_concurrencia_I6_B_v2_5_4.sql` | `7732f6ec7cf3dcd58304cda20014b9c4` | `63f73c6ee6a144249c84459f3b4839bdc9c4879835ef272b7942217543b20a3b` | 5606 |
| `ASIG_EVENTOS1_A_P2A_concurrencia_C1_A_v2_5_4.sql` | `e0bb60dc0c6c0c699dda3447d1be227b` | `61c225a9a53b84d7046c7558d666eef59da318b71301cd7f2d8281c2141c5676` | 4322 |
| `ASIG_EVENTOS1_A_P2A_concurrencia_C1_B_v2_5_4.sql` | `694aaa234aab4803053a1c62f5508ea4` | `220ddd001a388b6347398de5078393745256cc7838d3873a0f465514493ae639` | 6054 |
| `ASIG_EVENTOS1_A_staging_fixtures_setup_v1_2.sql` | `3dce9ad2bf6d3b293f089a73d38b71c8` | `6325c669aee308e264a07c25eff9291226327975408d676fcf00b10c293281e5` | 6271 |
| `ASIG_EVENTOS1_A_bootstrap_staging_default_acl_decision_v2_1.md` | `9f6b2043511d29d0d17a5c104ddd1787` | `afef8e4686e6f500ac911da2d35c025b97853370071766f92d1aa86c0a3cff90` | 6038 |
| `ASIG_EVENTOS1_A_P2B11_runbook_staging_v1.md` | `5356e4fd4bc738855c0c75616526e44c` | `075cda74344b9cdb5ad5dacad424c9955e4bb11837467eef532d3ec907c63f48` | 4855 |
| `ASIG_EVENTOS1_A_P2A_diff_v2_5_3_a_v2_5_4.md` | `b7e68dc34a0c6174e2ebef2e4d0fe0f8` | `041a7f551b8821ba50765137a5a13cee62f8c9ce653e82adc6e1a49fb0f547c0` | 29136 |

Referencias vigentes sin cambio: migración `v2_5_3_CANDIDATA` (MD5 `5102660870e72c917e52f5ef280f20d0`),
`fixtures_cleanup_v1_1`, `owner_verification_v2_2`, bootstrap `full_v2_2`/`acl_objetos_v2_1`/
`rollback_v2_2`, React candidato v2.3.

## Confirmación
NINGÚN SQL EJECUTADO · sin conexión a Supabase · staging y producción SIN CAMBIOS · sin usuarios
Auth · sin push/deploy · canónico no reemplazado · Maestro v44 intacto.
