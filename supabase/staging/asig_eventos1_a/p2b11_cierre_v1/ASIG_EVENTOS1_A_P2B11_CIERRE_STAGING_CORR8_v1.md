# ASIG.EVENTOS.1-A · P2-B1.1
## Informe de cierre de ejecución en STAGING · CORR.8 v1

### 1. Identificación

- Fecha de cierre: 2026-07-23.
- Entorno ejecutado: STAGING exclusivamente.
- Proyecto Supabase staging: `iuxewesxlnbvobgzwhrx`.
- Canal de conexión: Session Pooler, puerto `5432`.
- PostgreSQL staging: `17.6` (`server_version_num=170006`).
- Rama local: `p2b10-supabase-staging`.
- Commit base: `3ab6cffa76f2edfddf2889a61e5de4ebda91d46b`.
- Producción: no utilizada y no modificada.
- Git commit/push: no realizados.
- React/canónico/deploy: no modificados ni desplegados.

### 2. Gobernanza aplicada

- CORR.8 recibió reauditoría independiente formal.
- Veredicto: `APTO PARA NUEVO GATE STAGING`.
- Hallazgos bloqueantes: 0.
- Hallazgos altos: 0.
- Hallazgos medios: 0.
- Hallazgos bajos: 4, no impeditivos.
- Los 9 archivos incluidos en el manifiesto CORR.8 coincidieron con sus SHA-256.
- El paquete CORR.8 fue instalado sin modificar sus archivos auditados.
- Toda ejecución se realizó por `psql`.
- No se utilizó SQL Editor.
- No se utilizó Transaction Pooler 6543.
- Se aplicó punto de detención y revisión después de cada artefacto.

### 3. Paquetes utilizados

- Paquete CORR.8:
  `supabase/staging/asig_eventos1_a/p2b11_corr8_v1/`

- Artefactos de concurrencia CORR.4:
  `supabase/staging/asig_eventos1_a/p2b11_v1/`

Ambas carpetas permanecen sin seguimiento Git al momento de este cierre.

### 4. Resultado del diagnóstico CORR.8

Artefacto:

`ASIG_EVENTOS1_A_P2A_diagnostico_readonly_v2_5_6.sql`

Resultado:

- Destino staging confirmado.
- Session Pooler 5432 confirmado.
- SHA-256 correcto.
- PostgreSQL 17.6 aprobado.
- Capacidades del runner confirmadas.
- Sin colisiones previas de objetos CORR.8.
- Fixtures I6 y C1 activas antes de las pruebas.
- Propietarios del entorno compatibles.
- Transacción finalizada mediante `ROLLBACK`.
- Código de salida: `0`.

Decisión: `PASS`.

### 5. Resultado de la migración CORR.8

Artefacto:

`ASIG_EVENTOS1_A_P2A_migracion_construida_v2_5_7_CANDIDATA.sql`

Resultado:

- Destino staging confirmado.
- SHA-256 correcto.
- Creación de roles, esquemas, tabla, índices, políticas y funciones completada.
- Propietarios técnicos establecidos.
- Privilegios temporales revocados antes del cierre.
- Gate final de propietarios y ACL directa superado.
- Transacción finalizada mediante `COMMIT`.
- Código de salida: `0`.

Decisión: `PASS`.

### 6. Resultado de las pruebas principales

Artefacto:

`ASIG_EVENTOS1_A_P2A_pruebas_staging_v2_5_8.sql`

Resultados aprobados:

- Grupo A0.
- Grupo AUTH-ROLE.
- Grupo P.
- Grupo D.
- Grupos E/I.
- Grupo S.
- BLOQUEO1 de las tres RPC.
- Puente Auth CORR.5.
- Propietarios y ACL directa CORR.8.

Los datos temporales de la suite fueron revertidos mediante `ROLLBACK`.

Código de salida: `0`.

Decisión: `PASS`.

### 7. Prueba de concurrencia I6

Fixture utilizada:

- Asignación sintética: `1`.
- Trabajador: `ZZ-FIXT-TRAB-I6`.
- Contrato: `ZZ-FIXT-CONT-I6`.

Operation request compartido:

`dbe9fc18-5197-4cf4-826f-2e218c39a335`

Resultados:

- Sesión I6_A: `created`.
- Sesión I6_B: `replayed`.
- Eventos commiteados para la operación: exactamente `1`.
- Duplicación de evento: no.
- Pérdida de evento: no.
- Código de salida de ambas sesiones: `0`.

Decisión: `PASS`.

### 8. Prueba de concurrencia C1

Fixture utilizada:

- Asignación sintética: `2`.
- Trabajador: `ZZ-FIXT-TRAB-C1`.
- Contrato: `ZZ-FIXT-CONT-C1`.

Operation request A:

`9faf538c-40ba-44e0-938e-aedd1d6f7653`

Operation request B:

`dc501cc5-632c-4082-af75-2b2f5bd79d94`

Resultados:

- Sesión C1_A: `created`.
- Sesión C1_B: `ESTADO_OBSOLETO`.
- Eventos commiteados para la asignación: exactamente `1`.
- La sesión B no creó un segundo evento.
- Código de salida de ambas sesiones: `0`.

Decisión: `PASS`.

### 9. Evidencias operacionales

| Evidencia | Bytes | SHA-256 |
|---|---:|---|
| `10_diagnostico_readonly_corr8_v2_5_6_20260723_010446.log` | 12187 | `cf47b1a729fe925953411b4787b47a8ba31c69ba7527778fbc7a6a81e1826b6c` |
| `11_migracion_corr8_v2_5_7_20260723_012934.log` | 1967 | `17e4bbd74fff3d58b83d7e80572b5584112c16a4dde563d57e63995906d57f61` |
| `12_pruebas_staging_corr8_v2_5_8_20260723_013437.log` | 3440 | `7e5641caafecee5c8132394e79c412b4855fe1d964f0be95208a820f2597b466` |
| `13_preflight_i6_corr8_20260723_014512.log` | 526 | `c1a1e9c236858d5837ec52ec1ce38b12c12a420aaa45d9202e24e059a9b2c441` |
| `14_concurrencia_I6_A_20260723_014907.log` | 749 | `6fe725afab349d7074f92945dd9ec2aa44d6d42ff6e4cc7b273fd64fb2e7d04b` |
| `15_concurrencia_I6_B_20260723_015516.log` | 1198 | `ce5169d7da3701d5b50fbe73a93a2b4029a44cd6116eaa6ca3634dc27638814b` |
| `16_preflight_c1_corr8_20260723_020306.log` | 526 | `a7ea91a1655eed5f68877a35d7d78ea8f2ec6ed16b1070f73968047133906323` |
| `17_concurrencia_C1_A_20260723_020630.log` | 760 | `bf89c511c40e735c2ac182f29ae47313b68c4e17a648eb039f4cf4521026dc67` |
| `18_concurrencia_C1_B_20260723_020829.log` | 1248 | `2396c99cd1d332b10949d88b2c15810da3f8e70ed312a11733ae3350c33234e7` |

### 10. Estado residual deliberado de STAGING

Después de las pruebas de concurrencia:

- Existe un evento commiteado correspondiente a I6.
- Existe un evento commiteado correspondiente a C1.
- Las fixtures I6 y C1 fueron modificadas por operaciones de prueba válidas.
- La evidencia de auditoría referencia dichas fixtures.
- STAGING se conserva como evidencia operacional.
- No debe ejecutarse el cleanup de fixtures.
- No debe ejecutarse el rollback candidato sin una autorización posterior específica.
- No deben repetirse I6 ni C1 sobre las mismas fixtures.

### 11. Decisión de cierre

`ASIG.EVENTOS.1-A · P2-B1.1` queda:

## CERRADO Y APROBADO EN STAGING

Se considera validado:

- despliegue transaccional;
- ownership técnico;
- ACL directa;
- puente Auth;
- RLS;
- mínimo privilegio;
- token anti-stale;
- fingerprint;
- idempotencia;
- advisory lock;
- `FOR UPDATE`;
- atomicidad;
- normalización;
- contrato JSON;
- concurrencia I6;
- rechazo de estado obsoleto C1.

Este cierre no autoriza:

- producción;
- commit o push;
- reemplazo del React canónico;
- deploy;
- rollback;
- cleanup de fixtures;
- inicio automático de una fase posterior.

Cualquier paso posterior requiere una nueva autorización explícita.

---

**Responsable de ejecución:** Luis Ernesto Guzmán Loyola.  
**Arquitectura y decisión de gate:** Gabriel Phoenix Tomsom.  
**Reauditoría independiente:** Claude/Fable.
