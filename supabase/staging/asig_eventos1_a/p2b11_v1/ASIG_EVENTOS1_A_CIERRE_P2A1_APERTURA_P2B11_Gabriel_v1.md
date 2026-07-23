# ASIG.EVENTOS.1-A · Cierre P2-A.1 y apertura controlada P2-B1.1

## Veredicto consolidado

La re-auditoría dirigida Fable 5 concluye:

**APTO PARA INICIAR P2-B1.1 EN STAGING**

Se aceptan como cerrados los hallazgos B1, B2, A1, concurrencia y fail-fast. La arquitectura,
contrato RPC, event store, taxonomía, atomicidad, idempotencia, advisory lock, normalización,
bootstrap físico, propietarios y RLS permanecen aprobados.

## Estado

- P2-A.1: **CERRADO**.
- P2-B1.0: **CERRADO**.
- P2-B1.1: **AUTORIZADO PARA INICIAR EN STAGING**, siguiendo el runbook y un artefacto por vez.
- Producción: **PROHIBIDA**.
- Push/deploy/canónico: **NO AUTORIZADOS**.
- SQL Editor Supabase: **PROHIBIDO**.
- Canal de ejecución: `psql`, Session Pooler 5432 o conexión directa.

## Condiciones del gate

1. Verificar hashes antes de ejecutar.
2. Usar `psql -X -v ON_ERROR_STOP=1`.
3. Detenerse después de cada artefacto.
4. Copiar y revisar la salida completa antes de continuar.
5. No usar credenciales de producción.
6. No ejecutar todos los pasos en una sola sesión improvisada.
