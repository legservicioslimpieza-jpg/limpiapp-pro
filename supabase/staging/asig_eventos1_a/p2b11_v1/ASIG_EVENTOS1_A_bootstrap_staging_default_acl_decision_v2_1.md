# ASIG.EVENTOS.1-A · BOOTSTRAP STAGING · DECISIÓN DEFAULT PRIVILEGES v2.1 (CORR.4 · ALTO 1)

## Decisión vinculante (CORR.4): el ADP legacy es OPCIONAL y las pruebas NO dependen de él
- Los `ALTER DEFAULT PRIVILEGES` legacy **siguen siendo OPCIONALES**: sirven solo para reproducir
  la superficie histórica de producción en staging.
- **NO son requisito para que las pruebas funcionen.** La familia v2.5.4 (pruebas y los 4 scripts de
  concurrencia) invoca las tres RPC públicas **bajo `SET LOCAL ROLE authenticated` + claims JWT**, el
  canal real; la migración v2.5.3 concede `EXECUTE` a `authenticated` de forma explícita, así que la
  suite produce el mismo resultado **con o sin** el bloque ADP.
- **No se hacen obligatorios** los grants amplios a `anon` / `service_role` / `postgres`. Aplicarlos
  no es condición de P2-B1.1; omitirlos tampoco invalida la suite (queda retirada la advertencia
  previa de que la "alternativa mínima" rompería las pruebas: eso era cierto para v2.5.3, no para
  v2.5.4).
- Si se aplican, el test BLOQUEO 1 (`has_function_privilege`) valida además que las RPC del
  incremento quedan blindadas **incluso bajo esos defaults amplios** (validación más representativa).
  Si no se aplican, el mismo test sigue siendo válido (verifica la ausencia de `EXECUTE` para
  `anon`/`service_role` y la presencia solo para `authenticated`).

## Qué dice el baseline ACL (producción)
El dump con ACL contiene **24** sentencias `ALTER DEFAULT PRIVILEGES` en el schema `public`,
para los roles definidores `postgres` y `supabase_admin`. Las críticas para el incremento:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
```
(y equivalentes para `supabase_admin`, y para `SEQUENCES`/`TABLES`).

## Implicación (BLOQUEO 1)
Cualquier función creada en `public` **por `postgres`** (o `supabase_admin`) **hereda `GRANT ALL`
(incluye `EXECUTE`) DIRECTO** para `anon`, `authenticated` y `service_role`. Un simple
`REVOKE ... FROM PUBLIC` **NO** elimina esos grants directos. Por eso, las RPC `public.*` del
incremento deben revocar EXPLÍCITAMENTE `anon`, `PUBLIC` y (por mínimo privilegio) `service_role`,
y conceder `EXECUTE` solo a `authenticated`. Esto se implementa en la **migración v2.5.3** (§12).

## Decisión para STAGING
1. **NO** se reproducen automáticamente estos `ALTER DEFAULT PRIVILEGES` amplios en el core del
   bootstrap. Se documentan aquí para decisión explícita.
2. Para **reproducir fielmente la superficie de riesgo** (y así validar que las RPC del incremento
   quedan bien blindadas incluso bajo estos defaults), se RECOMIENDA aplicarlos en staging **antes**
   de ejecutar la migración v2.5.3, y luego verificar con las pruebas de `has_function_privilege`.
3. Alternativa mínima: no aplicarlos. **Compatible con P2-B1.1** (las pruebas v2.5.4 no dependen
   del ADP); la validación del blindaje será simplemente menos representativa de producción.

### Bloque a aplicar SOLO si se decide reproducir la superficie de riesgo (revisar y descomentar):
```sql
-- \set ON_ERROR_STOP on
-- BEGIN;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;
-- COMMIT;
```

## service_role — decisión de mínimo privilegio
Las RPC del incremento son administrativas (retiro de asignación). **No** hay justificación
arquitectónica para que `service_role` las ejecute. Decisión: **revocar `service_role`** en la
migración v2.5.3 (además de `anon` y `PUBLIC`), concediendo `EXECUTE` solo a `authenticated`.
Si en el futuro una identidad técnica lo requiere, se documenta y aprueba aparte.
