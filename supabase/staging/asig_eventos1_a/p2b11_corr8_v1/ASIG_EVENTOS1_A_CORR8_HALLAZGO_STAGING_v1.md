# ASIG.EVENTOS.1-A · CORR.8 · HALLAZGO EMPÍRICO STAGING

## Estado previo
CORR.7 superó reauditoría offline y diagnóstico read-only. Su migración v2.5.6 se ejecutó una vez en staging y abortó dentro de la misma transacción, antes del COMMIT, con:

`CORR.7: quedó un privilegio CREATE temporal`

La verificación read-only posterior confirmó reversión completa: cero roles, esquemas, tabla, funciones o políticas técnicas; fixtures 1 y 2 activas; producción intacta.

## Causa reproducida
Una sonda transaccional PG17/Supabase creó roles/esquemas temporales, otorgó y revocó ACL, y luego mostró simultáneamente:

- `pg_namespace.nspacl` sin entradas directas para `postgres`;
- `pg_has_role('postgres', owner, 'SET') = true`;
- `pg_has_role('postgres', owner, 'USAGE') = false`;
- `has_schema_privilege('postgres', esquema, 'CREATE') = false`;
- `has_schema_privilege('postgres', esquema, 'USAGE') = true`;
- CREATE real como postgres: denegado `42501`;
- ejecución real de función en el esquema: denegada `42501`;
- CREATE real como executor después de revocar CREATE: denegado `42501`.

La sonda terminó con ROLLBACK y una conexión independiente confirmó cero roles y esquemas persistidos.

## Conclusión
`has_schema_privilege(...,'USAGE')` no sirve en este entorno para demostrar ausencia de ACL temporal cuando el runner conserva capacidad `SET ROLE` sobre el owner. La migración CORR.7 no dejó un privilegio directo: su gate produjo un falso positivo.

## Corrección CORR.8
- reemplazar el gate final de migración y pruebas por inspección directa de `pg_namespace.nspacl` mediante `aclexplode(COALESCE(..., acldefault(...)))`;
- prohibir explícitamente ACL directas temporales: postgres USAGE/CREATE en audit/app_private, executor CREATE en app_private, y CREATE de owners RPC en public;
- exigir explícitamente los USAGE directos persistentes mínimos;
- no cambiar cuerpos funcionales, modelo de ownership, membresías, RLS, rollback ni contratos RPC;
- continuar prohibiendo DDL de membresía que cerró el Session Pooler.

No se autoriza ejecución. Requiere reauditoría independiente y nuevo gate staging.
