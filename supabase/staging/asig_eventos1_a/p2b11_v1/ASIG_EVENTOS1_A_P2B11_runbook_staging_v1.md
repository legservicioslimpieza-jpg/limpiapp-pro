# ASIG.EVENTOS.1-A · P2-B1.1 · RUNBOOK STAGING v1 (CORR.4)

**Estado: P2-B1.1 BLOQUEADO. Este runbook NO autoriza ejecutar nada.** Describe cómo se ejecutará
la fase en STAGING cuando Luis Ernesto Guzmán la autorice tras la re-auditoría Fable 5. Quien
ejecuta es siempre Luis Ernesto; Claudia no ejecuta SQL ni se conecta a Supabase.

## Reglas de canal (obligatorias)
1. **Solo `psql`.** Ningún artefacto de esta fase se pega en el SQL Editor de Supabase — en
   particular NUNCA la migración ni el rollback (contienen metacomandos `\set` y fallarían por
   sintaxis; además el Editor no garantiza sesión/transacción estables ni `ON_ERROR_STOP`).
2. **Conexión:** Session Pooler **puerto 5432** o conexión directa. **PROHIBIDO** el Transaction
   Pooler **puerto 6543** (rompe la sesión estable que requieren `\prompt`, `\gset`, GUC de sesión,
   `SET LOCAL` y los pasos multi-transacción).
3. **Invocación estándar de todos los scripts:**
   `psql -X -v ON_ERROR_STOP=1 -f <artefacto.sql>` (más los `-v` propios de cada artefacto).
   `-X` ignora `.psqlrc`; `ON_ERROR_STOP=1` garantiza abortar con código de salida ≠ 0 al primer
   error. El resultado se juzga por el código de salida y los NOTICE/ERROR en pantalla.
4. **ADP legacy opcional.** El bloque `ALTER DEFAULT PRIVILEGES` de
   `default_acl_decision_v2_1.md` es opcional (reproduce la superficie histórica). **Las pruebas y
   la concurrencia v2.5.4 son independientes de ese ACL**: llaman las RPC como `authenticated`.
5. **Producción NO participa.** Este runbook aplica exclusivamente a un proyecto STAGING nuevo y
   vacío. Ninguna cadena de conexión de producción se usa en ningún paso.
6. **Punto de detención tras CADA artefacto:** revisar código de salida y salida completa,
   registrar el resultado y NO continuar al paso siguiente sin ese visto bueno.

## Prerrequisitos
- Proyecto Supabase STAGING nuevo (vacío), PG 17.x, con cadena Session Pooler 5432 o directa.
- `psql` local operativo; `uuidgen` (o equivalente) para generar `operation_request_id`.
- Los artefactos CORR.4 con hashes verificados contra el informe técnico.

## Secuencia (cada paso termina en PUNTO DE DETENCIÓN)
| # | Artefacto | Invocación / nota |
|---|---|---|
| 1 | `bootstrap_staging_full_v2_2.sql` | `psql -X -v ON_ERROR_STOP=1 -f …` · crea los 27/7/12 + RLS/políticas. Revisar preflight/post-verificación. |
| 2 | `bootstrap_staging_owner_verification_v2_2.sql` | Gate read-only: `current_user=postgres`, dueños, conteos 27/7/12. |
| 3 | (opcional) `bootstrap_staging_acl_objetos_v2_1.sql` y/o bloque ADP de `default_acl_decision_v2_1.md` | Decisión registrada; las pruebas no dependen de esto. |
| 4 | Crear en **Supabase Auth de staging** 2 usuarios sintéticos `…@example.invalid` (admin y no-admin) | Única acción fuera de psql; no ejecuta SQL. Anotar ambos UUID. |
| 5 | `staging_fixtures_setup_v1_2.sql` | `… -v admin_uid=<uuid> -v noadmin_uid=<uuid>` · guarda anti-producción integrada. Anotar `asig_i6` y `asig_c1`. |
| 6 | `diagnostico_readonly_v2_5_2.sql` | Read-only previo a migrar. |
| 7 | `migracion_construida_v2_5_3_CANDIDATA.sql` | Una transacción; aborta completa ante cualquier error. |
| 8 | `pruebas_staging_v2_5_4.sql` | Suite completa; termina en ROLLBACK (sin residuo). PASS = exit 0. |
| 9 | Concurrencia I6: `concurrencia_I6_A_v2_5_4.sql` y `concurrencia_I6_B_v2_5_4.sql` | Dos terminales. MISMO `opreq_i6` (uuidgen, único por corrida), `-v asig_i6`. Barreras `\prompt`: FASE 1 ambas → ENTER casi simultáneo → FASE 2. Pie de B verifica 1 evento vía RPC admin. |
| 10 | Concurrencia C1: `concurrencia_C1_A_v2_5_4.sql` y `concurrencia_C1_B_v2_5_4.sql` | `opreq_c1_a` ≠ `opreq_c1_b`, `-v asig_c1`. B hace FASE 1 ANTES del COMMIT de A; A commitea; recién entonces B ejecuta FASE 2 (espera `ESTADO_OBSOLETO`). Pie de B verifica 1 evento. |

## Teardown (dos rutas — elegir según haya eventos commiteados)
**RUTA SIN EVENTOS** (p. ej. solo se corrió la suite 8, que revierte todo):
1. `rollback_v2_5_4_CANDIDATO.sql` → desmontaje total (rama sin eventos);
2. `staging_fixtures_cleanup_v1_1.sql`;
3. `bootstrap_staging_rollback_v2_2.sql`.

**RUTA CON EVENTOS** (tras los pasos 9–10 hay eventos commiteados):
1. `rollback_v2_5_4_CANDIDATO.sql` → rama parcial: **conserva `audit.asignacion_eventos`**, el
   owner/reader y la lectura administrativa (evidencia);
2. **NO** ejecutar el cleanup de fixtures (abortaría por diseño: los eventos referencian `ZZ-FIXT-*`);
3. conservar el proyecto staging como **evidencia** de la corrida;
4. cualquier teardown destructivo posterior exige **autorización y artefacto aparte**.

## Registro
Por cada paso: fecha/hora, artefacto+hash, código de salida, NOTICE relevantes, decisión
(continuar/detener). Ese registro alimenta el gate P2-B1.1 y la re-auditoría Fable 5.
