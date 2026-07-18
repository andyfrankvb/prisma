# Implementation Plan: Flujo de Revisión de Tareas de Eventos

## Overview

Extender el módulo `src/modules/eventos/` con un ciclo formal de revisión entre Director y Operativo. El cambio abarca cuatro capas: base de datos (nuevo enum + tabla `historial_revision_tarea`), backend (cuatro endpoints nuevos + actualización de tipos y autorización), frontend (modales y badges en `Dashboard_DirectorArea.tsx` y `SeccionEventos.tsx`) y notificaciones (tres nuevos tipos de evento).

---

## Tasks

- [x] 1. Migración de base de datos
  - [x] 1.1 Crear script SQL de migración idempotente
    - Crear `infra/postgres/init/09_flujo_revision_tareas.sql`
    - Extender el enum `estado_tarea` con `IF NOT EXISTS` para `EN_REVISION` y `DEVUELTO`
    - Crear tabla `historial_revision_tarea` con `CREATE TABLE IF NOT EXISTS`, incluyendo FK a `tareas_evento` y `usuarios`, constraint `CHECK (tipo IN ('AVANCE', 'DEVOLUCION'))` y `DEFAULT NOW()` en `creado_en`
    - Crear índices `idx_historial_rev_tarea`, `idx_historial_rev_autor`, `idx_historial_rev_fecha`
    - _Requirements: 5.1, 4.1_

- [x] 2. Actualización de tipos y funciones puras en el backend
  - [x] 2.1 Actualizar `EstadoTarea` e `isValidTransition` en `eventos.types.ts`
    - Agregar `'EN_REVISION'` y `'DEVUELTO'` al union type `EstadoTarea`
    - Reemplazar la implementación de `isValidTransition` con la tabla `TRANSICIONES` del diseño (5 transiciones válidas)
    - Agregar interfaces `EnviarRevisionBody`, `DevolverTareaBody` y `RegistroHistorial`
    - _Requirements: 1.1, 1.4, 5.6_

  - [ ]* 2.2 Escribir property test para `isValidTransition` (Property 1)
    - **Property 1: Completitud y exclusividad de transiciones válidas**
    - Crear `src/tests/unit/eventos.revision.utils.property.test.ts`
    - Usar `fc.constantFrom` con los 5 estados del enum; verificar que `isValidTransition` retorna `true` exactamente para las 5 transiciones del flujo y `false` para todos los demás pares
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 1: completitud y exclusividad de transiciones`
    - **Validates: Requirements 1.1, 1.4, 5.6**

  - [ ]* 2.3 Actualizar tests de ejemplo de `isValidTransition` en `eventos.utils.test.ts`
    - Agregar casos para las 5 nuevas transiciones válidas: `EN_PROGRESO→EN_REVISION`, `EN_REVISION→COMPLETADA`, `EN_REVISION→DEVUELTO`, `DEVUELTO→EN_REVISION`
    - Agregar casos inválidos: `EN_PROGRESO→COMPLETADA` (ya no válida), `PENDIENTE→EN_REVISION`, `DEVUELTO→COMPLETADA`
    - _Requirements: 1.1, 1.2_

- [x] 3. Actualización de tipos de notificaciones
  - [x] 3.1 Agregar nuevos tipos de evento al union `NotificationEventType`
    - En `src/notifications/notification.types.ts`, agregar `'TAREA_EN_REVISION'`, `'TAREA_DEVUELTA'`, `'TAREA_COMPLETADA'` al union type
    - _Requirements: 7.5, 7.6_

  - [x] 3.2 Agregar plantillas de notificación en `templates.ts`
    - En `src/notifications/templates.ts`, agregar casos para `TAREA_EN_REVISION`, `TAREA_DEVUELTA` y `TAREA_COMPLETADA` en la función `renderTemplate`
    - Cada plantilla debe incluir `titulo` (nombre de la tarea) y `body` descriptivo según el tipo de evento
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 4. Checkpoint — Verificar base de tipos
  - Asegurarse de que TypeScript compila sin errores en `eventos.types.ts` y `notification.types.ts`
  - Ejecutar los tests unitarios existentes para confirmar que no hay regresiones
  - Preguntar al usuario si hay dudas antes de continuar con los endpoints.

- [x] 5. Implementar endpoints de revisión en el controller
  - [x] 5.1 Implementar `enviarRevision` en `eventos.controller.ts`
    - Agregar función `enviarRevision` siguiendo el orden de validaciones del diseño: autenticación (middleware), existencia (404), autorización `req.user.id === tarea.asignado_a_id` (403), estado válido con `isValidTransition` (422), presencia de comentario o archivo (422)
    - Ejecutar en transacción: `UPDATE tareas_evento SET estado = 'EN_REVISION'` + `INSERT INTO historial_revision_tarea (tipo='AVANCE')`
    - Si hay `req.file`, almacenar bajo `eventos/avances/` usando el servicio existente y registrar `documento_url`; si el almacenamiento falla, hacer rollback
    - Disparar `notifyEventoTarea(Director, TAREA_EN_REVISION)` fuera de la transacción con `.catch(() => {})`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1_

  - [x] 5.2 Implementar `aprobarTarea` en `eventos.controller.ts`
    - Agregar función `aprobarTarea` con validaciones: existencia (404), autorización `req.user.id === evento.creado_por_id` (403), estado válido `isValidTransition(estado, 'COMPLETADA')` (422)
    - Ejecutar en transacción: `UPDATE tareas_evento SET estado = 'COMPLETADA', fecha_actualizacion = NOW()`
    - Disparar `notifyEventoTarea(Operativo, TAREA_COMPLETADA)` fuera de la transacción con `.catch(() => {})`
    - _Requirements: 3.2, 3.5, 3.6, 7.3_

  - [x] 5.3 Implementar `devolverTarea` en `eventos.controller.ts`
    - Agregar función `devolverTarea` con validaciones: existencia (404), autorización `req.user.id === evento.creado_por_id` (403), estado válido `isValidTransition(estado, 'DEVUELTO')` (422), comentario no vacío ni solo espacios (422)
    - Ejecutar en transacción: `UPDATE tareas_evento SET estado = 'DEVUELTO'` + `INSERT INTO historial_revision_tarea (tipo='DEVOLUCION', contenido=comentario)`
    - Disparar `notifyEventoTarea(Operativo, TAREA_DEVUELTA)` fuera de la transacción con `.catch(() => {})`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 7.2_

  - [x] 5.4 Implementar `listarHistorial` en `eventos.controller.ts`
    - Agregar función `listarHistorial` con validaciones: existencia (404), autorización solo para `evento.creado_por_id` o `tarea.asignado_a_id` (403)
    - Ejecutar `SELECT h.*, u.nombre as autor_nombre FROM historial_revision_tarea h JOIN usuarios u ON u.id = h.autor_id WHERE h.tarea_id = :tareaId ORDER BY h.creado_en ASC`
    - Retornar array de `RegistroHistorial`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Registrar nuevas rutas en `eventos.routes.ts`
  - [x] 6.1 Agregar las cuatro rutas nuevas al router
    - Importar `enviarRevision`, `aprobarTarea`, `devolverTarea`, `listarHistorial` desde el controller
    - Agregar `router.post('/:id/tareas/:tareaId/enviar-revision', upload.single('documento'), enviarRevision)`
    - Agregar `router.patch('/:id/tareas/:tareaId/aprobar', aprobarTarea)`
    - Agregar `router.patch('/:id/tareas/:tareaId/devolver', devolverTarea)`
    - Agregar `router.get('/:id/tareas/:tareaId/historial', listarHistorial)`
    - Verificar que `multer` ya está configurado en el proyecto; reutilizar la instancia existente
    - _Requirements: 1.3, 2.1, 3.2, 3.3, 4.2_

- [x] 7. Checkpoint — Verificar endpoints del backend
  - Ejecutar los tests unitarios y de propiedad del backend
  - Confirmar que TypeScript compila sin errores en el controller y las rutas
  - Preguntar al usuario si hay dudas antes de continuar con el frontend.

- [ ] 8. Property tests de autorización del backend
  - [ ]* 8.1 Escribir property test de autorización de envío a revisión (Property 2)
    - **Property 2: Autorización de envío a revisión**
    - Crear `src/tests/unit/eventos.revision.auth.property.test.ts`
    - Generar tareas aleatorias en estado `EN_PROGRESO` o `DEVUELTO` con `asignado_a_id` aleatorio; verificar que solo ese usuario puede enviar a revisión y cualquier otro recibe HTTP 403
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 2: autorización de envío a revisión`
    - **Validates: Requirements 2.3, 6.2, 6.7**

  - [ ]* 8.2 Escribir property test de autorización de aprobación y devolución (Property 3)
    - **Property 3: Autorización de aprobación y devolución**
    - En el mismo archivo `eventos.revision.auth.property.test.ts`
    - Generar tareas en estado `EN_REVISION` con `creado_por_id` aleatorio; verificar que solo ese usuario puede aprobar o devolver y cualquier otro recibe HTTP 403 antes de evaluar el estado
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 3: autorización de aprobación y devolución`
    - **Validates: Requirements 3.5, 6.3, 6.6**

  - [ ]* 8.3 Escribir property test de comentario vacío al devolver (Property 4)
    - **Property 4: Validación de comentario obligatorio al devolver**
    - En el mismo archivo `eventos.revision.auth.property.test.ts`
    - Usar `fc.stringMatching(/^\s*$/)` para generar strings de solo espacios en blanco; verificar que `devolverTarea` retorna HTTP 422 y el estado de la tarea no cambia
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 4: comentario vacío rechazado`
    - **Validates: Requirements 3.4**

  - [ ]* 8.4 Escribir property test de resiliencia ante fallos de notificación (Property 5)
    - **Property 5: Resiliencia ante fallos de notificación**
    - En el mismo archivo `eventos.revision.auth.property.test.ts`
    - Mockear `notifyEventoTarea` para que lance un error; verificar que la respuesta HTTP es 2xx y el estado en BD refleja la transición correctamente para los tres endpoints (`enviarRevision`, `aprobarTarea`, `devolverTarea`)
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 5: resiliencia ante fallos de notificación`
    - **Validates: Requirements 7.4**

  - [ ]* 8.5 Escribir property test de ordenamiento del historial (Property 6)
    - **Property 6: Ordenamiento e integridad del historial**
    - Crear `src/tests/unit/eventos.historial.property.test.ts`
    - Generar N registros con timestamps aleatorios; verificar que `listarHistorial` los retorna ordenados por `creado_en` ASC y cada registro contiene `autor_nombre`, `tipo`, `creado_en`
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 6: ordenamiento e integridad del historial`
    - **Validates: Requirements 4.2**

  - [ ]* 8.6 Escribir property test de autorización del historial (Property 7)
    - **Property 7: Autorización de acceso al historial**
    - En el mismo archivo `eventos.historial.property.test.ts`
    - Generar usuarios aleatorios que no sean el Director ni el Operativo; verificar que todos reciben HTTP 403
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 7: autorización de acceso al historial`
    - **Validates: Requirements 4.3**

  - [ ]* 8.7 Escribir property test de preservación de estados en migración (Property 8)
    - **Property 8: Preservación de estados en migración**
    - Crear `src/tests/unit/eventos.migracion.property.test.ts`
    - Generar conjuntos de tareas con estados `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`; verificar que después de aplicar la lógica de migración cada tarea conserva exactamente el mismo estado
    - Incluir etiqueta: `// Feature: flujo-revision-tareas-eventos, Property 8: preservación de estados en migración`
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 9. Actualización de tipos en el frontend
  - [x] 9.1 Actualizar `EstadoTarea` y agregar `RegistroHistorial` en `src/frontend/types.ts`
    - Agregar `'EN_REVISION'` y `'DEVUELTO'` al union type `EstadoTarea`
    - Agregar la interfaz `RegistroHistorial` con campos: `id`, `tarea_id`, `autor_id`, `autor_nombre`, `tipo`, `contenido`, `documento_url`, `creado_en`
    - _Requirements: 6.4, 6.5, 4.1_

- [x] 10. Actualización de la vista Operativo (`Dashboard_DirectorArea.tsx`)
  - [x] 10.1 Actualizar `ESTADO_CFG` y `SIGUIENTE_ESTADO` para los nuevos estados
    - Agregar entradas en `ESTADO_CFG` para `EN_REVISION` (badge naranja, label "En revisión") y `DEVUELTO` (badge rojo claro, label "Devuelto")
    - Modificar `SIGUIENTE_ESTADO`: `EN_PROGRESO` ya no avanza a `COMPLETADA`; en su lugar muestra botón "Enviar para revisión" que abre el modal
    - Agregar entrada para `DEVUELTO` → botón "Reenviar para revisión" que abre el mismo modal
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 10.2 Crear componente `EnviarRevisionModal`
    - Crear modal con campo de texto para comentario (opcional si hay archivo) e input de archivo para documento de avance (opcional si hay comentario)
    - Validación client-side: al menos uno de los dos debe estar presente antes de habilitar el botón de envío
    - Enviar `multipart/form-data` a `POST /eventos/:id/tareas/:tareaId/enviar-revision`
    - _Requirements: 2.1, 2.2_

  - [x] 10.3 Actualizar `TareaRow` en la vista Operativo
    - Cuando estado es `EN_REVISION`: mostrar mensaje "En revisión por el Director" sin botón de acción
    - Cuando estado es `DEVUELTO`: mostrar el comentario de devolución del último registro del historial y el botón "Reenviar para revisión"
    - Agregar botón "Ver historial" disponible para todos los estados con al menos un registro en el historial
    - _Requirements: 6.4, 4.2_

- [x] 11. Actualización de la vista Director (`SeccionEventos.tsx`)
  - [x] 11.1 Actualizar `ESTADO_TAREA_CFG` para los nuevos estados
    - Agregar entradas para `EN_REVISION` y `DEVUELTO` en la configuración de badges del Director
    - _Requirements: 6.3, 6.5_

  - [x] 11.2 Actualizar `TareaRow` en la vista Director
    - Cuando estado es `EN_REVISION`: mostrar botones "Aprobar" y "Devolver"
      - "Aprobar": llama a `PATCH /eventos/:id/tareas/:tareaId/aprobar`
      - "Devolver": abre modal con campo de comentario obligatorio, llama a `PATCH /eventos/:id/tareas/:tareaId/devolver`
    - Mostrar el avance enviado por el Operativo (comentario y/o enlace al documento) cuando el estado es `EN_REVISION`
    - Agregar botón "Ver historial" disponible para todos los estados con al menos un registro
    - _Requirements: 3.1, 3.2, 3.3, 6.3, 6.5_

  - [x] 11.3 Crear componente `DevolverTareaModal`
    - Modal con campo de comentario obligatorio (validación client-side: no vacío ni solo espacios)
    - Llamar a `PATCH /eventos/:id/tareas/:tareaId/devolver` con el comentario en el body
    - _Requirements: 3.3, 3.4_

  - [x] 11.4 Crear componente `HistorialRevisionModal`
    - Modal que llama a `GET /eventos/:id/tareas/:tareaId/historial` y muestra los registros ordenados cronológicamente
    - Cada registro muestra: `autor_nombre`, `tipo` (badge AVANCE / DEVOLUCIÓN), `contenido` y enlace al documento si existe, `creado_en` formateado
    - Reutilizable desde ambas vistas (Operativo y Director)
    - _Requirements: 4.1, 4.2_

- [x] 12. Checkpoint final — Verificar integración completa
  - Ejecutar todos los tests unitarios y de propiedad
  - Confirmar que TypeScript compila sin errores en frontend y backend
  - Verificar que el script SQL de migración es idempotente ejecutándolo dos veces en el entorno de desarrollo
  - Preguntar al usuario si hay dudas antes de dar por completada la implementación.

---

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints garantizan validación incremental antes de avanzar a la siguiente capa
- Las property tests validan invariantes universales; los tests de ejemplo validan flujos concretos
- El script SQL `09_flujo_revision_tareas.sql` debe ejecutarse en el entorno de desarrollo antes de arrancar el servidor
- La tabla `historial_revision_tarea` es append-only por diseño: no exponer endpoints DELETE ni PUT
- Las notificaciones se disparan **fuera** de la transacción de BD con `.catch(() => {})` para no revertir la operación principal ante fallos del canal

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["2.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "6.1"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "9.1"] },
    { "id": 4, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "10.1"] },
    { "id": 5, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 6, "tasks": ["11.2", "11.3", "11.4"] }
  ]
}
```
