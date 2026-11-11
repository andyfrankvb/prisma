# Inventario de paridad SID → PRISMA

**Levantado el 2026-11-06** contra `/Users/andyfrank/projects/sid/SID-main`
(frontend Angular 18) y el commit `17d131e` de PRISMA.

**Para qué sirve:** cuando se apague el frontend de SID, toda función que no
exista en PRISMA deja de existir para el usuario. Esta es la lista de lo que
falta, y es lo que decide si una fecha de apagado es realista.

---

## 1. El hallazgo principal: SID es mucho más chico de lo que aparenta

De los **88 componentes** de Angular, solo **26 son pantallas de negocio**:

| Categoría | Componentes | Renglones |
|---|---|---|
| **Negocio** | **26** | **~17,400** |
| Demostración de la plantilla NobleUI | 53 | ~22,000 |
| Armazón (layout, navbar, sidebar, error) | 6 | — |
| Copias muertas (`inbox_copy`, `sent_copy`, `solicitudes_copy`) | 3 | — |

Las 53 de plantilla son `ui-components`, `advanced-ui`, `forms`, `charts`,
`tables`, `icons`, `general`, más `calendar` y `chat`: acordeones, insignias,
migas de pan, selectores de color. Son el catálogo de ejemplos de NobleUI y el
`CLAUDE.md` §4 manda desecharlos.

> **Replicar SID no es rehacer 39,485 renglones. Son ~17,400, y buena parte ya
> está cubierta.**

Coincide con lo visto en el backend: de sus 444 rutas, 213 eran del tema.

## 2. Cruce de APIs: lo que resolvió la mayor duda

El inventario inicial dejaba 7,940 renglones sin clasificar. Cruzando las rutas
de `SID-back--main/routes/api.php` contra las de PRISMA se resolvió la mayor
parte **sin abrir las dos aplicaciones**.

**El hallazgo:** SID llama **"resoluciones"** a lo que su módulo `email`
gestiona, y el dashboard de trámites de PRISMA se titula literalmente
*"Seguimiento de Resoluciones"*. No era un flujo sin equivalente: tiene el
mismo nombre de dominio.

| SID (`api.php`) | PRISMA (`modules/tramites`) |
|---|---|
| `/listado-resoluciones` | `GET /` |
| `/listado-resoluciones/dg` (Dirección General) | el mismo listado, filtrado por rol `supervisora` |
| `/listado-resoluciones/dj` (Dirección Jurídica) | filtrado por rol `revisor` |
| `/ver-resolucion/{id}` | `GET /:id` |
| `/resolucion/file/{id}`, `/resoluciones/firmada/{id}` | documentos del trámite |
| — | `PATCH /:id/aprobar`, `/rechazar`, `/devolver-juridico`, `/devolver-delegado`, `/reenviar`, `/finalizar`, `/cerrar` |

PRISMA no solo lo cubre: **su máquina de estados es más rica**. SID expone
listados planos por dirección; PRISMA tiene transiciones explícitas con
devoluciones y reenvíos diferenciados.

## 3. Matriz de paridad, ya con el cruce de APIs

### ✅ Cubierto — 11,519 renglones (66 %)

| Pantalla de SID | Renglones | Equivalente en PRISMA |
|---|---|---|
| **`apps/email/*`** (9 componentes) | **4,337** | **`Dashboard_Tramites` + módulo `tramites`** — confirmado por el cruce de arriba |
| `visor` (`libros-lista` + `visor`) | 2,323 | `VisorDocumentos.tsx` + módulo `visor_documentos` |
| `Tickets` | 1,861 | `Tickets.tsx` + módulo `tickets` |
| `usuarios` | 1,091 | `AdminUsuarios.tsx` |
| `Maquina` | 745 | `Maquinas.tsx` + módulo `maquinas` |
| `dashboard` | 564 | 7 dashboards distintos — PRISMA va muy por delante |
| `Consultas` | 407 | `Consultas` + `VigilanciaConsultas`; `/consultas` tiene equivalente directo |
| `auth/login` | 191 | `Login.tsx` |

### ❌ Sin equivalente — 3,028 renglones (17 %)

| Pantalla de SID | Renglones | Evidencia |
|---|---|---|
| **`Incidentes`** | **1,580** | Dominio propio (`incidencias.service.ts`, campo `fecha_hora_incidencia`). **No es Tickets**: SID tiene los dos por separado. En PRISMA "incidencias" solo aparece en el acervo registral, que es otro significado |
| **`Turnos`** | **718** | Turnos al público: formulario con nombres, apellidos, correo y **foto del INE**. SID expone `asignados`, `turnos/verificar-codigo`, `turnos/expirar-asignados`, `turnos/busquedas-add`. **Ninguno existe en PRISMA** |
| **`webservices/catastro`** | **422** | SID consulta Catastro con `/catastro/rppc/{cve}`, `/catastros/{municipio}/{cve}`, `/consulta-catastro/{municipio}/{cve}`. En PRISMA solo hay una mención suelta en `SeccionCorreos.tsx` |
| **`webservices/consulsatq`** | **308** | **Reclasificado.** No lo cubre `Reportes_SATQ`: SID consulta **en vivo** el webservice de SATQ (`/satq/token`, `/satq/concepto/{token}/{referencia}`, `http://10.1.100.128`), mientras que el módulo `satq` de PRISMA hace **reportes y conciliación sobre datos ya importados**. Son funciones distintas |

### ❓ Pendiente de confirmar — 2,888 renglones (17 %)

| Pantalla de SID | Renglones | La duda |
|---|---|---|
| `apps/solicitudes` | 1,344 | `SolicitudRecord` con promovente, oficina y estatus. SID expone `/solicitud/{id}` y `/solicitud-file/{id}`. Probablemente sea la entrada del mismo flujo de trámites, pero no lo pude confirmar desde el código |
| `Oficios` (`documentos`) | 1,003 | Convive con el módulo `email`. ¿Son dos vistas del mismo flujo, o `documentos` es la recepción y `email` la resolución? |
| `Folios` | 541 | **Modelos distintos.** SID tiene folios autónomos (`/folios`, `/folios/form`, `/folios/mios`, `/folios-antecedentes`); PRISMA los emite **desde un oficio** (`/oficios/:id/folio-salida`) y solo tiene un modal de historial. Falta decidir si el modelo de SID debe replicarse |
| `auth/register` | — | ¿PRISMA permite auto-registro, o las cuentas siempre las crea un administrador? |

## 4. Lo que esto significa para la fecha

| | Renglones | |
|---|---|---|
| Cubierto | 11,519 | **66 %** |
| Falta construir | 3,028 | 17 % |
| Por confirmar | 2,888 | 17 % |

**El escenario cambió.** Antes del cruce de APIs el rango iba de tres semanas a
tres meses; ahora el grueso del flujo de oficios está confirmado como cubierto
y lo que falta son **cuatro pantallas bien delimitadas**:

1. **Incidentes** — el más grande, y un dominio que PRISMA no tiene
2. **Turnos** — incluye captura de foto de identificación
3. **Catastro** — integración con un servicio externo
4. **Consulta SATQ en vivo** — distinta de los reportes que ya existen

Las cuatro son independientes entre sí y no dependen de ninguna confirmación:
**se pueden planear y repartir desde hoy.**

## 5. Siguiente paso concreto

1. **Las cuatro pantallas faltantes se pueden empezar ya.** Son frente
   suficiente para el compañero de fin de semana, que se quedó sin trabajo al
   cancelarse la migración de datos
2. Para cerrar el 17 % restante: alguien que use los dos sistemas abre
   `apps/solicitudes` y `Oficios` de SID junto a Oficialía de Partes de PRISMA.
   Es una tarde
3. **Los folios necesitan una decisión de producto, no una verificación:**
   ¿se replica el modelo de SID, con folios que viven por su cuenta, o se
   conserva el de PRISMA, donde el folio nace de un oficio?

## 5. Advertencias sobre este inventario

- **Lo hice leyendo código, no usando los sistemas.** Donde digo "cubierto"
  comparé nombres, rutas y dominio; no verifiqué que la pantalla de PRISMA haga
  lo mismo que la de SID. Dos pantallas que se llaman igual pueden diferir en
  reglas de negocio
- **No cubre el backend.** SID tiene 145 rutas reales de API contra 250 de
  PRISMA; hace falta un cruce equivalente del lado del servidor
- **El conteo de renglones incluye `.ts` y `.html` de Angular.** Reconstruido en
  React el resultado suele ser más compacto, así que el esfuerzo no se traduce
  renglón por renglón
