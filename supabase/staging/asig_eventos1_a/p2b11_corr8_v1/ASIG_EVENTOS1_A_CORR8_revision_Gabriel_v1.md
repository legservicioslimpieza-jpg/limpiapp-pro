# ASIG.EVENTOS.1-A · CORR.8 · REVISIÓN GABRIEL v1

## Decisión
**CANDIDATA PARA REAUDITORÍA OFFLINE. NO AUTORIZADA PARA STAGING.**

## Alcance
CORR.8 es una corrección acotada al falso positivo del gate de ACL de CORR.7.

### Cambios funcionales de artefactos
1. Migración v2.5.7: reemplaza `has_schema_privilege()` en la comprobación de ausencia de privilegios temporales por lectura de ACL directa de `pg_namespace.nspacl` con `aclexplode`.
2. Pruebas v2.5.8: aplica la misma matriz de ACL directa y exige los USAGE persistentes esperados.
3. Diagnóstico v2.5.6: solo actualiza versión/objetivo y documenta el hallazgo empírico; continúa 100% read-only.
4. Rollback v2.5.8: lógica SQL de desmontaje preservada desde v2.5.7; solo versionado/documentación.

## Invariantes preservados
- cero GRANT/REVOKE de membresías;
- `SET LOCAL createrole_self_grant='set'` y PostgreSQL 16+;
- SET=true / INHERIT=false para postgres sobre roles técnicos;
- owners explícitos por `SET LOCAL ROLE`;
- privilegios CREATE temporales de objeto revocados antes del COMMIT;
- puente mínimo `app_private.current_auth_uid()`;
- identidad desde `auth.uid()`;
- token anti-stale, fingerprint, idempotencia y concurrencia;
- atomicidad, append-only, RLS y mínimo privilegio;
- contrato JSON de las tres RPC;
- rollback con/sin eventos y ACCESS EXCLUSIVE antes del conteo.

## Criterio de aprobación
La reauditoría debe verificar que el nuevo gate inspecciona ACL directas sin confundir capacidad SET ROLE con acceso inmediato y que no introduce rutas de privilegio, errores de catálogo o discrepancias entre migración, pruebas y rollback.

No se ejecutó SQL ni se modificó staging/producción al construir este paquete.
