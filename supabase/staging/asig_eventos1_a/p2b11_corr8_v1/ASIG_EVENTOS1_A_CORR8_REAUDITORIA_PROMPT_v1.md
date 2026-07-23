# PROMPT DE REAUDITORÍA INDEPENDIENTE · ASIG.EVENTOS.1-A · CORR.8

Lee íntegramente los 10 archivos del paquete y recalcula los SHA-256 del manifiesto. No ejecutes SQL, no modifiques archivos y no asumas superusuario.

## Pregunta central
¿CORR.8 elimina correctamente el falso positivo de CORR.7 sin debilitar la detección de ACL temporales ni alterar los invariantes previamente aprobados?

## Controles obligatorios
1. Confirmar cero DDL de membresía directo o dinámico en migración, pruebas y rollback.
2. Confirmar gate PostgreSQL 16+ antes del GUC y CREATE ROLE.
3. Verificar SET=true, INHERIT=false y SET ROLE explícito de los cuatro roles técnicos.
4. Revisar que toda operación owner-sensitive siga bajo el owner correcto.
5. Revisar la nueva inspección de ACL directa:
   - uso de `pg_namespace.nspacl`;
   - `aclexplode(COALESCE(nspacl, acldefault('n',nspowner)))`;
   - identificación del beneficiario por OID/pg_roles;
   - ausencia directa de USAGE/CREATE de postgres en audit/app_private;
   - ausencia directa de CREATE del executor en app_private;
   - ausencia directa de CREATE de preparer/executor/reader en public;
   - presencia de los USAGE directos persistentes mínimos.
6. Confirmar que el gate ya no usa `has_schema_privilege()` para demostrar ausencia de ACL temporales.
7. Confirmar que los usos restantes de `has_schema_privilege()` son apropiados para capacidad efectiva/preflight o acceso API y no recrean el falso positivo.
8. Verificar que cuerpos de bridge, appender y tres RPC no cambiaron funcionalmente frente a CORR.7.
9. Verificar owners, ACL, RLS, FORCE RLS, append-only y BLOQUEO1.
10. Verificar token, fingerprint, idempotencia, advisory lock, FOR UPDATE, UPDATE RETURNING, normalización, fecha y contrato JSON.
11. Verificar rollback completo/parcial, ACCESS EXCLUSIVE, DROP OWNED bajo owner y cero silenciamiento relevante.
12. Confirmar que diagnóstico es 100% read-only y rollback v2.5.8 es funcionalmente igual a v2.5.7 salvo versionado/documentación.
13. Revisar sintaxis SQL, resolución de columnas/alias en VALUES y subconsultas ACL, tipos de `aclexplode` y dollar quoting.
14. Confirmar coherencia de versiones: diagnóstico v2.5.6, migración v2.5.7, pruebas v2.5.8, rollback v2.5.8.

## Entrega
- Veredicto único: `APTO PARA NUEVO GATE STAGING` o `NO APTO`.
- Hallazgos BLOQUEANTE/ALTO/MEDIO/BAJO.
- Respuesta fundada a los 14 controles con archivo y línea.
- Tabla completa de SHA-256 recalculados.
- Confirmación de que nada fue ejecutado ni modificado.
