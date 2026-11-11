# Lista de validación — flujo de oficios: SID vs PRISMA

**Fecha:** 2026-11-06
**Para:** quien pruebe `apps/email` de SID contra los tableros de Oficialía y Jurídico de PRISMA
**Tiempo estimado:** 20 minutos

---

## Qué cambió respecto a la versión anterior de este plan

La primera propuesta pedía una comparación pantalla a pantalla de 30 minutos **para decidir si PRISMA cubre el ciclo**. Esa pregunta ya se respondió leyendo el código: se rastrearon los servicios de Angular (`resoluciones.service.ts`, 20 endpoints, y `solicitudes.service.ts`, 2) y se mapearon contra las rutas de Express de PRISMA.

**El ciclo está cubierto.** Esta lista ya no sirve para decidir eso. Sirve para dos cosas concretas:

1. Confirmar en uso las **tres brechas** que el código sí reveló.
2. Cerrar los renglones **sin confirmar** del inventario de paridad.

---

## Antes de empezar

- El módulo `email` de SID **no** corresponde a un solo módulo de PRISMA. Se reparte entre
  **Oficialía de Partes** (el oficio: recibir → turnar → revisar → resolver → enviar) y
  **Seguimiento de Resoluciones** (Convenios, Contratos, Consultas Jurídicas, Acuerdos, Resoluciones).
  Buscar un equivalente uno a uno de la bandeja de SID lleva a conclusiones falsas.
- Ignorar en SID: `inbox_copy`, `sent_copy`, `solicitudes_copy` y `/listado-resoluciones2`.
  Son duplicados sin uso aparente. **No replicar sin preguntar.**

---

## Parte 1 — El ciclo de punta a punta (debe pasar completo)

Un solo oficio, de principio a fin, en PRISMA. Pantalla: **Oficialía** → **Jurídico** → **Oficialía**.

| # | Paso | Qué hacer en PRISMA | Esperado | ✓ |
|---|---|---|---|---|
| 1 | **Recibir** | Oficialía: dar de alta un oficio con PDF | Se crea y el análisis de PDF prellena campos | ☐ |
| 2 | **Turnar** | Turnar a un área | Llega como pendiente al destinatario | ☐ |
| 3 | | El destinatario **acepta** | Cambia de estatus | ☐ |
| 4 | | Probar también **devolver** el turno | Regresa a Oficialía con motivo | ☐ |
| 5 | **Revisar** | Jurídico: dar **VoBo** | Avanza | ☐ |
| 6 | | Probar **reconsiderar** | Regresa un paso | ☐ |
| 7 | | **Pase a firma**, y luego devolverlo | Ambas direcciones funcionan | ☐ |
| 8 | **Resolver** | **Subir proyecto** y **finalizar** con archivo | Queda resuelto con su documento | ☐ |
| 9 | **Enviar** | Generar **folio de salida** | Folio asignado y visible en el historial | ☐ |

> PRISMA tiene transiciones explícitas donde SID tiene **un solo** `/resoluciones/cambiar-estado` genérico.
> Si un paso falla, es un defecto de PRISMA, no una brecha de paridad.

---

## Parte 2 — Las tres brechas (confirmar que importan)

Estas se encontraron en el código. La prueba es para decidir **si se replican o no**.

### Brecha A — No se puede adjuntar un documento corregido al reenviar

**La más importante de las tres.**

En SID existe `/resoluciones/{id}/replace-files`. En PRISMA, el flujo *corregir y reenviar*
de Seguimiento de Resoluciones acepta **solo campos de texto**: nombre, correo, teléfono,
checklists y comentarios. No acepta archivos.

| Qué hacer | Esperado hoy | ✓ |
|---|---|---|
| Crear un trámite con un PDF adjunto | Se adjunta (hasta 5 archivos, 10 MB c/u) | ☐ |
| Que Jurídico lo **devuelva** al creador | Queda en `DEVUELTO` | ☐ |
| Como creador, **corregir y reenviar** | No hay dónde subir el documento corregido | ☐ |

**La pregunta para el área:** cuando devuelven un trámite porque *el documento* está mal,
¿cómo lo reemplazan hoy en SID? Si la respuesta es "suben el corregido", **es una brecha real**
y hay que construirla.

*(Nota técnica para quien lo implemente: el controlador de reenviar ya trae código que convierte
textos `"true"` a booleanos, con un comentario que habla de multipart. Es código muerto — el
frontend manda JSON. Al agregar la subida, ese código empieza a hacer falta de verdad.)*

### Brecha B — No hay marcas de leído

SID tiene `/resolucion/leido` y `/comentario/leido`. PRISMA tiene marcas de leído en
**alertas de vigilancia** y en **notificaciones**, pero no en trámites ni en comentarios.

| Qué hacer | Esperado hoy | ✓ |
|---|---|---|
| Dejar un comentario en un trámite | Se guarda y se lista | ☐ |
| Ver si se distingue leído de no leído | No se distingue | ☐ |

**La pregunta:** ¿alguien usa esa marca para decidir algo, o solo pintaba el renglón en negritas?
Si es lo segundo, no se replica.

### Brecha C — Los archivos del trámite no se listan por la API

El módulo recibe archivos al crear y los guarda con su URL, pero **no hay ruta que los liste ni los
descargue** (sí la hay en Oficialía y en Tickets).

| Qué hacer | Esperado | ✓ |
|---|---|---|
| Abrir el detalle de un trámite con adjuntos | ¿Aparecen los archivos? | ☐ |

Si aparecen, se sirven por otra vía y **no hay brecha**. Si no aparecen, los adjuntos entran y no salen.

---

## Parte 3 — Cerrar los renglones sin confirmar

Del inventario de paridad: **17% sin confirmar**. Para cada pantalla de SID que el probador
reconozca, anotar una de tres respuestas:

- **`CUBIERTO`** — existe en PRISMA (anotar en qué pantalla)
- **`FALTA`** — se usa en SID y no existe en PRISMA
- **`MUERTO`** — ya nadie lo usa; no se migra

> Esta columna es la que más mueve la estimación. Cada renglón marcado `MUERTO`
> es trabajo que desaparece del plan.

---

## Al terminar

Anotar en una línea: **ciclo completo pasó sí/no**, y para A, B y C: **se replica / no se replica**.

Con eso, y con los renglones de la Parte 3, el inventario de paridad se puede cerrar con números
firmes en lugar de un rango.
