# Resultados sobre DEUDA-TECNICA.md

**Agente:** Claude Code (Opus 5), dentro del repositorio · **Commit:** `4d9805b` · **Fecha:** 2026-11-03

> **Advertencia de independencia.** Yo escribí `DEUDA-TECNICA.md`. Soy el peor agente
> posible para auditarlo: mis puntos ciegos ya están adentro. Esta sección vale menos
> viniendo de mí que de los otros dos agentes. Contrástenla sin piedad.

---

## 1. Correcciones al inventario

**Una corrección de fondo, a algo que yo mismo afirmé.**

La sección 5 dice: *"Cinco fuentes de datos desde un solo proceso […] es el argumento más
fuerte a favor de separar servicios"*. **Es falso.** El proceso de la API abre **dos**
bases, no cinco:

| Variable | Quién la abre realmente |
|---|---|
| `DATABASE_URL` | la API — `src/db.ts:7-11` |
| `ACERVO_DATABASE_URL` | la API — `src/modules/acervo/acervo.connection.ts:95-99` |
| `SID_DATABASE_URL` | solo scripts de `db/`: `migrate-tickets-sid.mjs`, `migrate-visor-sid.mjs`, `migrate-folios-sid.mjs`, `migrate-consultas-sid.mjs`, `verificar-migracion-sid.mjs` |
| `SID_CATALOGO_DATABASE_URL` | solo `db/verificar-migracion-sid.mjs` |
| `VISAR_DATABASE_URL` | solo `db/import-visor-visar-testdata.mjs` |

Las tres últimas son herramientas de línea de comandos que se corren a mano y terminan.
No viven en el proceso que atiende usuarios.

**Consecuencia:** se cae el argumento de "muchas fuentes acopladas", y con él buena parte
de la opción C del prompt. El acoplamiento real del monolito es otro: procesamiento
pesado y memoria, no multiplicidad de bases.

**Lo demás del inventario lo verifiqué y se sostiene**, incluidas las ocho secciones y el
barrido por módulos.

---

## 2. Deuda técnica adicional

Lo que el inventario no tenía.

| # | Deuda | Evidencia | Eje | Severidad | Explotabilidad | Esfuerzo | Qué la paga |
|---|---|---|---|---|---|---|---|
| 1 | **El pool de la base principal es de 10 conexiones para toda la aplicación**, y no se fija `acquireConnectionTimeout`, así que rige el de knex: 60 000 ms | `src/db.ts:10` | rendimiento | 🔴 crítica | con credenciales | horas | Subir el pool, poner un `acquireConnectionTimeout` corto y `statement_timeout` en la base |
| 2 | **Sin `statement_timeout` en el acervo** (`statement_timeout: 0`), con pool de 3 y `acquireConnectionTimeout: 5000` | `acervo.connection.ts:86,88,98-99` | rendimiento | 🟠 alta | con credenciales | horas | Un límite de sentencia acorde al corte de nginx |
| 3 | **Un solo proceso de Node, sin `cluster` ni gestor de procesos.** Todo el JavaScript corre en un núcleo | ausencia de `cluster`/`pm2` en `src/server.ts` e `infra/docker/Dockerfile.api` | escala | 🟠 alta | no aplica | días | Varias instancias detrás de nginx, tras verificar que la API es sin estado |
| 4 | **nginx no fija `proxy_read_timeout`**: rige el valor por omisión, 60 s, que nadie eligió | `infra/nginx/nginx.conf` | operación | 🟡 media | no aplica | horas | Fijarlo y alinearlo con los timeouts de base |

---

## 3. Por qué el punto 1 es lo más importante que encontré

Los 504 de reportes se vienen explicando como "consultas lentas". Hay una segunda causa,
más grave, que el código muestra directamente:

**La aplicación entera comparte 10 conexiones.** Cuando diez consultas pesadas las toman,
la petición número once **no es lenta: se queda esperando una conexión libre**, hasta 60
segundos por omisión de knex. nginx corta más o menos a esa misma altura. El usuario ve
un 504 en una pantalla que no tiene nada que ver con reportes.

Es decir: **unos pocos reportes pesados dejan sin servicio al resto del sistema**, y desde
fuera se ve como una caída. Vale la pena contrastarlo con las tres caídas de la VM en un
día antes de culpar al sistema operativo.

Esto no depende de ningún `[POR LLENAR]` para ser cierto: **10 es un número escrito en
`src/db.ts:10`**.

**Al comparar con los otros dos agentes, esta es la pregunta clave:** ¿alguno más lo
encontró? Si los tres lo encontramos, es real y define la fase 1. Si solo yo, que alguien
abra `src/db.ts` y lo verifique antes de creerme.
