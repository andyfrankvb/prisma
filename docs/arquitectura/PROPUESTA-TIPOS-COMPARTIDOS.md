# Tipos compartidos entre backend y frontend — receta verificada

**Estado:** diseñado y probado el 2026-11-05 sobre el commit `17d131e`. **No aplicado.**
Se revirtió a propósito para no mezclarlo con la separación frontend/backend.

**Cuándo hacerlo:** después de ajustar el pool de conexiones y de tener el
inventario de paridad de SID. Antes no: los contratos duplicados causan errores
ocasionales, el pool causa caídas y el apagado de SID tiene fecha externa.

**Cuánto cuesta rehacerlo:** unos veinte minutos la plomería más el primer
módulo, porque las trampas ya están documentadas abajo.

---

## El problema que resuelve

`frontend/src/types.ts` (1,518 renglones, 121 interfaces) replica a mano los
DTOs que el backend declara en 21 archivos `.types.ts` / `.dto.ts` (1,900
renglones). **69 de los 123 archivos del frontend** dependen de esa copia.

Si el backend cambia un contrato y el frontend no se entera, nada avisa: el
error aparece en el navegador del usuario. Y desde que las dos mitades se
despliegan por separado, pueden quedar en versiones distintas en producción.

## La trampa, y por qué el archivo es `.d.ts`

El primer intento con un `.ts` normal falla:

```
error TS6059: File 'shared/types/oficios.ts' is not under 'rootDir' '/app/src'
```

`tsconfig.json` fija `"rootDir": "./src"`. Cambiarlo a `"."` haría que
`dist/server.js` pasara a ser `dist/src/server.js`, rompiendo `npm start` y el
`CMD` del Dockerfile.

**Un archivo `.d.ts` no se emite**, así que el `rootDir` no le aplica y Vite
tampoco tiene que empaquetarlo.

> **Regla:** `shared/` admite **solo tipos**. Ninguna constante en tiempo de
> ejecución. Los catálogos y mapas de etiquetas viven del lado que los usa.

## Dónde va

`shared/` en la raíz del repositorio. **No `src/shared`**: `src/` es backend puro
y `Dockerfile.web` no lo copia. **No `packages/shared`**: implica workspaces de
npm y un paso de compilación, maquinaria de más para tres personas.

Funciona porque las tres imágenes usan la raíz como contexto de build
(`docker-compose.prod.yml:69, 93, 113`).

## Los seis cambios

| Archivo | Cambio |
|---|---|
| `tsconfig.json` | `"baseUrl": "."` y `"paths": { "@shared/*": ["shared/*"] }` |
| `frontend/tsconfig.json` | `"baseUrl": "."` y `"paths": { "@shared/*": ["../shared/*"] }` |
| `frontend/vite.config.ts` | alias `@shared` → `../shared`, más `server.fs: { allow: ['..'] }` |
| `infra/docker/Dockerfile.api` | `COPY shared ./shared` antes del build |
| `infra/docker/Dockerfile.web` | `COPY shared/ /shared/` — **fuera de `/app`**, porque el alias resuelve a `../shared` |
| `docker-compose.yml` | montar `./shared:/shared` en `app_vite` para desarrollo |

## El primer módulo

Los tres tipos que estaban duplicados literalmente, uno con los valores en
distinto orden en cada lado:

```ts
// shared/types/oficios.d.ts
export type RolUsuario    = 'OFICIAL' | 'ENCARGADO' | … | 'PARTICULAR';
export type TipoUnidad    = 'DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION';
export type EstatusOficio = 'RECIBIDO' | 'ASIGNADO' | … | 'FINALIZADO';
```

Los dos lados pasan de declararlos a consumirlos, conservando el reexport para
que los 69 archivos que importan de `types.ts` no cambien:

```ts
import type { RolUsuario, TipoUnidad, EstatusOficio } from '@shared/types/oficios';
export type { RolUsuario, TipoUnidad, EstatusOficio };
```

## La prueba de que sirve

Quitando `'FINALIZADO'` del contrato compartido:

| | Sin `shared/` | Con `shared/` |
|---|---|---|
| Backend | 2 errores | 2 errores |
| Frontend | **0 errores** | **12 errores** |

Esos 12 son los lugares donde el frontend seguiría comparando contra un valor
que el backend ya no emite. Con la puerta del type-check cerrada en
`Dockerfile.web`, eso detiene el despliegue.

**Verificado:** ambos `tsc` en 0 errores y **las dos imágenes de Docker
construidas**, no solo compiladas en local.

## Orden de migración

Mover un módulo a `shared/` **cuando haya que tocarlo por otra razón**, no en
una campaña aparte: así no genera conflictos para los demás y cada paso es
verificable por sí solo.

Candidatos por urgencia:

1. `frontend/src/utils/diasHabiles.ts` — es lógica de negocio duplicada, no solo
   tipos: calcula vencimientos legales y su gemelo es `src/utils/dias-habiles.ts`.
   **No cabe en `shared/`** por la regla de solo tipos; necesita otra solución.
2. Los tipos de **gestion**, que ya nacieron desalineados: el backend declara
   uniones cerradas (`'chetumal' | 'cancun' | …`) y el frontend las tiene como
   `string`.
3. Tickets, por el caso de `UrgenciaTicketHistorica`.

## Si algún día son dos repositorios

`shared/` se publica como paquete y el salto es natural. Sin él, dos
repositorios multiplican este problema en vez de contenerlo.
