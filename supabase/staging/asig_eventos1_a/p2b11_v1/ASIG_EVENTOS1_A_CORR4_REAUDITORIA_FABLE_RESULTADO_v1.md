Procedo con la re-auditoría dirigida. Tres artefactos críticos (la migración v2.5.3, el rollback v2.5.4 y el diff) no están en el contexto visible, así que primero los leo en crudo desde disco y recalculo los hashes de toda la familia, como exige la metodología.

Verificó exhaustivamente integridad, permisos y configuración para staging
Verificó exhaustivamente integridad, permisos y configuración para staging
RE-AUDITORÍA DIRIGIDA FABLE 5 — ASIG.EVENTOS.1-A · CORR.4

Alcance cumplido conforme al prompt: verificación exclusiva del cierre de los hallazgos Fable originales, sin reabrir arquitectura, contrato, event store ni bootstrap. Los 16 archivos se leyeron en crudo desde disco; hashes MD5/SHA-256 recalculados; ningún SQL ejecutado contra base alguna; ningún archivo creado ni modificado; producción y staging intactas.

0 · Integridad

Los 10 artefactos CORR.4 coinciden byte a byte (bytes, MD5, SHA-256) con el inventario del informe técnico y de Gabriel v5. La migración en disco da MD5 5102660870e72c917e52f5ef280f20d0 — idéntica a la referencia vigente: la migración no fue alterada, condición del cierre dirigido. El diff v2.5.3→v2.5.4 declara cambios solo en pruebas, rollback, fixtures y los 4 de concurrencia, consistente con lo observado.

1 · B1 — CERRADO

ADMIN OPTION real (PG 17). La migración crea los cuatro roles como CURRENT_USER (líneas 137–140), lo que en PG 16/17 produce el grant implícito al creador con ADMIN TRUE, INHERIT FALSE, SET FALSE y grantor = superusuario bootstrap. §14 (521–524) ejecuta REVOKE … FROM CURRENT_USER simple como postgres, que elimina únicamente los grants con grantor=postgres — exactamente los de §1.b (146–149). El ADMIN implícito, con grantor distinto, sobrevive a §14: la premisa de CORR.4 es un hecho verificable en el SQL crudo, no una suposición. Las pruebas además no lo asumen a ciegas: el precheck (pruebas L26–34) consulta pg_auth_members … admin_option y aborta limpio si falta.

Grant temporal y su reversión. Pruebas L35: GRANT limpiapp_audit_reader TO CURRENT_USER WITH INHERIT FALSE, SET TRUE — literal exigido, dentro de la transacción (BEGIN L15) y revertido por el ROLLBACK final (L231); el GRANT es transaccional, la reversión es un hecho.

Cero lectura positiva de audit como postgres. Las 6 lecturas de audit.asignacion_eventos (L101, 125, 169, 177–179, 186, 194) corren bajo SET LOCAL ROLE limpiapp_audit_reader … RESET ROLE; L85 es la única lectura como authenticated y es la denegación esperada (sub-bloque con handler insufficient_privilege, ASSERT ok_deneg L90, que es literal de mensaje, no lectura). La denegación sigue siendo válida en ambos mundos ADP: los revokes de schema/tabla sobre authenticated (migración 174/176/246) son independientes del ADP, que opera solo IN SCHEMA public.

RPC bajo authenticated. 21 invocaciones funcionales (8 preparar + 13 retirar), todas bajo SET LOCAL ROLE authenticated + claims; cero como postgres (las 2 menciones adicionales son firmas literales del test BLOQUEO1, tras el ROLLBACK y solo de catálogo).

2 · B2 — CERRADO

Orden real verificado en el rollback crudo: detección y procedencia de la tabla por catálogo (pg_class/obj_description, sin filas) → aborto explícito si audit existe sin limpiapp_audit_reader → §0.b: por cada rol existente, role_prov_ok (marca + NOLOGIN/NOBYPASSRLS), GRANT %I TO CURRENT_USER WITH INHERIT TRUE, SET TRUE y prueba real de asunción SET LOCAL ROLE/RESET → recién entonces el único acceso a filas: SET LOCAL ROLE limpiapp_audit_reader; EXECUTE 'SELECT count(*)…' INTO v_n; RESET ROLE (L162–166).

Un punto que esta re-auditoría persiguió expresamente como posible defecto nuevo y que queda descartado contra la migración cruda: la política del reader es pol_evt_select_reader … TO limpiapp_audit_reader USING (true) (migración L245), con GRANT USAGE ON SCHEMA audit (L175) y GRANT SELECT (L248). El conteo bajo reader es por tanto exacto bajo FORCE RLS y sin dependencia de claims — si la política hubiera exigido sesión admin, el rollback (que no fija claims) habría contado 0 con eventos presentes y elegido la rama destructiva. No es el caso: la selección de rama es correcta.

Ambas ramas son alcanzables. La 2a conserva tabla/owner/reader/listar, recrea la política de usuarios acotada al reader (el chequeo admin de listar sigue operativo: definer=reader con USAGE auth + EXECUTE auth.uid(), migración 183/185, y SELECT(id,rol), 257), revoca las membresías §0.b y verifica antes del COMMIT que CURRENT_USER no retiene inherit_option ni set_option sobre owner/reader — tolerando expresamente el ADMIN estructural, cuyo grantor bootstrap los REVOKE simples no tocan; cualquier residuo va a v_incompleto → RAISE → toda la transacción revierte (no puede commitear en estado violado). La 2b desmonta todo con procedencia por objeto; el DROP ROLE retira membresías, incluido el ADMIN implícito. La desviación INHERIT TRUE respecto del literal sugerido por Fable está documentada en cabecera y en el diff, y es técnicamente necesaria (DROP OWNED/DROP TABLE/DROP SCHEMA como no-dueño operan vía has_privs_of_role); el literal INHERIT FALSE del prompt aplica al grant de las pruebas, que lo cumple exacto.

3 · A1 — CERRADO

La decisión v2.1 declara el ADP opcional y es verdadera en el SQL: el EXECUTE de las tres RPC para authenticated proviene de los grants explícitos de §12 (migración 496–501), no de defaults; los revokes explícitos de anon/PUBLIC/service_role hacen que las expectativas de BLOQUEO1 se cumplan idénticas con o sin ADP; la lectura de fecha usa public.asignaciones como postgres owner (force_rls=false, fuera del ADP). Adicionalmente, el preflight 0.a.4 de la migración verifica que authenticated tenga USAGE sobre public, cerrando en modo fail-safe el único supuesto ambiental de esta vía.

4 · Concurrencia — CERRADO

SET LOCAL plpgsql.check_asserts = on dentro de BEGIN y verificado en la misma transacción en los 4 scripts. Claims por set_config(…, true) fijados como postgres antes de SET LOCAL ROLE authenticated, todo en una sola transacción por sesión (canal estable garantizado por el runbook: 5432/directa). La TEMP p recibe GRANT SELECT, UPDATE explícito y solo se usa con esas dos operaciones; el USAGE del namespace temporal es implícito para el backend propietario con independencia del rol activo (confirmación final en staging; un fallo sería error visible, jamás falso PASS). Cero lecturas de audit.* (las menciones detectadas son comentarios); la verificación conjunta usa listar_eventos_asignacion_admin bajo authenticated+claims.

I6 (punto 6 de Gabriel, resuelto expresamente): n=1 en el pie más el ASSERT de cada sesión (resultado ∈ {created,replayed} con código exacto) demuestra la propiedad de concurrencia (ni duplicación ni pérdida). El único falso PASS teórico — dos created con un solo evento — exigiría una RPC que devuelva created sin insertar, comportamiento excluido por el GRUPO E/I de la suite (paso 8, mismo staging, inmediatamente antes), que asserta determinísticamente created→replayed→CONFLICTO_IDEMPOTENCIA sobre la misma RPC. La distribución created/replayed es visible en los NOTICE y el runbook obliga a registrarlos con visto bueno por paso. Dictamen: la comprobación humana es suficiente para el gate; automatizarla (wrapper que compare las salidas de ambas terminales) queda como endurecimiento opcional futuro, no requisito.

C1: ASSERT estrictos por sesión (A created, B error='ESTADO_OBSOLETO') + pie n=1 (B no crea evento). Una mala secuencia de barreras produce fallo visible o el ESTADO_OBSOLETO correcto vía la re-lectura FOR UPDATE — nunca falso PASS. Residuo: exactamente los previstos (1 evento I6, 1 evento C1, 2 asignaciones ZZ-FIXT terminadas), cubiertos por la ruta CON EVENTOS del runbook; TEMP y grants mueren con la transacción, GUCs con la sesión.

5 · psql y fixtures — CERRADO

Cero \quit en toda la familia (grep sobre los 7 SQL, incluida la migración: 0 apariciones). Los fallos de parámetros abortan con DO/RAISE — error SQL real, exit ≠ 0 bajo ON_ERROR_STOP. Runbook: solo psql, Session Pooler 5432 o directa, 6543 prohibido, invocación estándar con -X -v ON_ERROR_STOP=1. Fixtures v1.2: sobre auth.users hay únicamente 4 EXISTS de lectura (L47–50), cero mutaciones; guarda anti-producción íntegra (propietarios, tablas vacías, @example.invalid, marcas ZZ-FIXT).

6 · Puntos restantes de Gabriel v5

Los puntos 1, 2 y 5 quedan resueltos como hechos (semántica documentada PG 16/17 + SQL crudo): el ADMIN implícito sobrevive a §14; la membresía temporal de pruebas revierte con el ROLLBACK; SET LOCAL ROLE dentro de DO es válido, y en los pies post-COMMIT el DO corre en su propia transacción implícita, por lo que rige hasta su fin. Los puntos 3 y 4 son ambientales de Supabase (membresía authenticated de postgres; temp-namespace bajo rol cambiado): ambos fallan ruidosamente si no se cumplen. El punto 6 se dictaminó arriba (suficiente). Punto 7: el chequeo de opciones directas en pg_auth_members es adecuado en este grafo cerrado — ningún artefacto concede owner/reader a terceros por los que postgres pudiera heredar indirectamente, y el grant ADMIN-only no confiere ni USAGE ni SET, de modo que un pg_has_role(current_user, rol, 'USAGE') adicional también pasaría; añadirlo es endurecimiento opcional, no condición del gate.

7 · Hallazgos nuevos

Ningún defecto bloqueante. Dos observaciones no bloqueantes: (O1, bajo/ambiental) la única vía por la que el creador retendría INHERIT/SET sobrevivientes a §14 sería que el GUC createrole_self_grant estuviera configurado en el clúster (su default es vacío y Supabase no lo altera); recomiendo añadir SHOW createrole_self_grant (esperado: vacío) al diagnóstico read-only o al registro del paso 6 — de existir desviación, la rama 2a del rollback la detectaría de todos modos y abortaría. (O2, editorial) las pruebas usan SET plpgsql.check_asserts en lugar de SET LOCAL: equivalente en la práctica porque el ROLLBACK final (o el aborto) lo revierte y BLOQUEO1 no usa ASSERT; mera asimetría estilística con los scripts de concurrencia.

8 · Solo confirmable en staging (todos fail-loud, sin falso PASS posible)

Presencia efectiva del ADMIN implícito post-§14 (el precheck de pruebas aborta limpio si falta); capacidad de postgres de SET ROLE authenticated; USAGE implícito del temp-namespace bajo rol cambiado; createrole_self_grant vacío (O1); comportamiento del deparse de pg_policies frente a norm_expr (ya señalado por Fable v1, sigue vigente y aborta sin eliminar ante diferencia).

Constancia

CORR.4 cerró los cinco frentes (B1, B2, A1, M1, BAJO 1/2) exactamente donde el informe original los situó, sin tocar la migración, y esta re-auditoría no encontró contradicción técnica nueva causada por las correcciones. Nada fue ejecutado ni modificado; la ejecución y la autorización siguen siendo tuyas, Ernesto, con los puntos de detención del runbook como red. El Maestro v44 permanece intacto.

APTO PARA INICIAR P2-B1.1 EN STAGING