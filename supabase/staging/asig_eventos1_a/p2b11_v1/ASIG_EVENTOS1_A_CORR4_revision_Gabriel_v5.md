# ASIG.EVENTOS.1-A · Revisión Gabriel P2-A.1-CORR.4 v5

## Veredicto

**CORR.4 queda aprobada estáticamente para una re-auditoría dirigida.**

No se detectó un nuevo defecto que obligue a reconstruir la arquitectura o la migración v2.5.3.
Esta aprobación no autoriza SQL ni escritura en staging.

## Hallazgos Fable corregidos en el SQL real

### B1 — pruebas y visibilidad de audit

- El runner verifica `ADMIN OPTION` sobre `limpiapp_audit_reader`.
- Se auto-concede una membresía transaccional con `INHERIT FALSE, SET TRUE`.
- Las lecturas positivas de `audit.asignacion_eventos` se realizan bajo `audit_reader`.
- La lectura bajo `authenticated` es exclusivamente la denegación esperada.
- Las llamadas funcionales a las RPC se realizan bajo `authenticated` y claims.
- El `ROLLBACK` final revierte la membresía temporal.

### B2 — rollback

- La procedencia de tabla se revisa por catálogo.
- Si existe la tabla sin `audit_reader`, el rollback aborta.
- La concesión y prueba de roles ocurre antes del conteo.
- El conteo se ejecuta bajo `audit_reader`.
- Las ramas con y sin eventos vuelven a ser alcanzables.
- La rama con eventos verifica que no queden opciones directas `INHERIT/SET` sobre owner/reader.

### A1, concurrencia, fixtures y canal

- El ADP legacy es opcional y las pruebas no dependen de él.
- Los cuatro scripts de concurrencia ponen `check_asserts` dentro de `BEGIN`.
- Las RPC concurrentes corren como `authenticated`.
- No existen lecturas directas de `audit.*` en concurrencia.
- Los fallos de parámetros usan errores SQL reales; no queda `\quit`.
- Fixtures v1.2 mantienen las guardas anti-producción.
- El runbook exige psql, Session Pooler 5432/directa y prohíbe 6543.

## Puntos que la re-auditoría debe resolver expresamente

1. Confirmar la semántica PostgreSQL 17 de la concesión automática `ADMIN OPTION` al creador
   `CREATEROLE`, tras los `REVOKE` de la migración.
2. Confirmar que la membresía temporal se revierte completamente con el `ROLLBACK`.
3. Confirmar que `postgres` puede hacer `SET ROLE authenticated` en Supabase staging.
4. Confirmar que `authenticated` puede usar la tabla temporal `p` después del GRANT de objeto.
5. Confirmar que `SET LOCAL ROLE` dentro de bloques `DO` es válido en este contexto invoker.
6. Evaluar la cobertura I6: cada sesión acepta `created|replayed` y el pie verifica un único evento;
   el operador debe observar además exactamente un `created` y un `replayed`. Determinar si esa
   comprobación humana es suficiente para el gate o si debe automatizarse.
7. Evaluar si la comprobación post-revoke del rollback debe verificar también privilegio efectivo
   (`pg_has_role` / `has_schema_privilege`) además de las opciones directas de `pg_auth_members`.

## Estado del gate

- P2-A.1-CORR.4: **APROBADA PARA RE-AUDITORÍA DIRIGIDA**.
- P2-B1.1: **BLOQUEADO**.
- SQL en staging: **NO AUTORIZADO**.
- Producción y staging: **SIN CAMBIOS**.

## Inventario verificado

| Archivo | Bytes | MD5 | SHA-256 |
|---|---:|---|---|
| `ASIG_EVENTOS1_A_bootstrap_staging_default_acl_decision_v2_1.md` | 6038 | `9f6b2043511d29d0d17a5c104ddd1787` | `afef8e4686e6f500ac911da2d35c025b97853370071766f92d1aa86c0a3cff90` |
| `ASIG_EVENTOS1_A_P2A_concurrencia_C1_A_v2_5_4.sql` | 4322 | `e0bb60dc0c6c0c699dda3447d1be227b` | `61c225a9a53b84d7046c7558d666eef59da318b71301cd7f2d8281c2141c5676` |
| `ASIG_EVENTOS1_A_P2A_concurrencia_C1_B_v2_5_4.sql` | 6054 | `694aaa234aab4803053a1c62f5508ea4` | `220ddd001a388b6347398de5078393745256cc7838d3873a0f465514493ae639` |
| `ASIG_EVENTOS1_A_P2A_concurrencia_I6_A_v2_5_4.sql` | 4394 | `6d62520ad23a4c10fc9fd76a48472316` | `df756aad1bb38ff7c5112b53b19edef5ed0b7b0107bc90ff5706b5548d5f0ece` |
| `ASIG_EVENTOS1_A_P2A_concurrencia_I6_B_v2_5_4.sql` | 5606 | `7732f6ec7cf3dcd58304cda20014b9c4` | `63f73c6ee6a144249c84459f3b4839bdc9c4879835ef272b7942217543b20a3b` |
| `ASIG_EVENTOS1_A_P2A_diff_v2_5_3_a_v2_5_4.md` | 29136 | `b7e68dc34a0c6174e2ebef2e4d0fe0f8` | `041a7f551b8821ba50765137a5a13cee62f8c9ce653e82adc6e1a49fb0f547c0` |
| `ASIG_EVENTOS1_A_P2A_informe_tecnico_CORR4.md` | 9662 | `069caab398751bcdfa6fca1e3eee0e5b` | `530d73ae1d22306ae00985e3ab38a42c5a1ced811bea68da30dcd2db1975ee3a` |
| `ASIG_EVENTOS1_A_P2A_pruebas_staging_v2_5_4.sql` | 14001 | `e3cdc045428852840a3e4ff52877f49a` | `5b71a0dd2124b3ccc70127f92d14356e7f9cd54e9500a042cefeb17a6d2ca10d` |
| `ASIG_EVENTOS1_A_P2A_rollback_v2_5_4_CANDIDATO.sql` | 22034 | `8dfdcfd752ef40c66e3d5ba971460959` | `a173964617b7c812bdcde1a058462565e1388ad92e811383f8dcc7c97cd88b60` |
| `ASIG_EVENTOS1_A_P2B11_runbook_staging_v1.md` | 4855 | `5356e4fd4bc738855c0c75616526e44c` | `075cda74344b9cdb5ad5dacad424c9955e4bb11837467eef532d3ec907c63f48` |
| `ASIG_EVENTOS1_A_staging_fixtures_setup_v1_2.sql` | 6271 | `3dce9ad2bf6d3b293f089a73d38b71c8` | `6325c669aee308e264a07c25eff9291226327975408d676fcf00b10c293281e5` |
