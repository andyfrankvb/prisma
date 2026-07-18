# Implementation Plan: Revisión de Doble Nivel en Tareas de Eventos

## Overview

Extender el flujo de revisión existente (`flujo-revision-tareas-eventos`) con una segunda capa de aprobación a cargo de la Directora General. Los cambios son aditivos sobre la arquitectura en capas existente: migración de BD, actualización de tipos y lógica de transiciones en el backend, dos endpoints nuevos, un endpoint de consulta para el panel DG, nuevas rutas, nuevos tipos de notificación y plantillas, y actualización del frontend con badges y el nuevo componente `PanelRevisionDG`.

---

## Tasks

- [x] 1. Migración de base de datos
  - [x] 1.1 Crear script SQL de migración idempotente `10_revision_doble_nivel.sql`
    - Crear `infra/postgres/init/10_revision_doble_nivel.sql`
    - Agregar `ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'EN_REVISION_DG'`
    - Agregar `ALTER TABLE historial_revision_tarea ADD COLUMN IF NOT EXISTS nivel_revision SMALLINT NOT NULL DEFAULT 1` (los registros existentes reciben nivel 1 automáticamente)
    - Eliminar el CHECK constraint existente sobre `tipo` e insertar el nuevo `historial_revision_tarea_tipo_check_v2` con los valores `'AVANCE', 'DEVOLUCION', 'APROBACION_N1', 'APROBACION_N2'` usando un bloque `DO $$ ... $$` idempotente
    - Verificar que el script puede ejecutarse dos veces sin errores ni duplicados
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 5.1, 5.10_

- [x] 2. Actualización de tipos y funciones puras en el backend
  - [x] 2.1 Actualizar `EstadoTarea`, `isValidTransition` e interfaces en `eventos.types.ts`
    - Agregar `'EN_REVISION_DG'` al union type `EstadoTarea`
    - Reemplazar `isValidTransition` con la tabla de 7 transiciones del diseño: `PENDIENTE→EN_PROGRESO`, `EN_PROGRESO→EN_REVISION`, `EN_REVISION→EN_REVISION_DG`, `EN_REVISION→DEVUELTO`, `EN_REVISION_DG→COMPLETADA`, `EN_REVISION_DG→DEVUELTO`, `DEVUELTO→EN_REVISION`
    - Agregar campo `nivel_revision: 1 | 2` a la interfaz `RegistroHistorial`
    - Agregar interfaces `AprobarTareaDGBody` y `DevolverTareaDGBody` (con `comentario: string` obligatorio)
    - _Requirements: 1.1, 1.2, 1.4, 5.1, 9.1_

  - [ ]* 2.2 Escribir property test para `isValidTransition` (Property 1)
    - **Property 1: Completitud y exclusividad de transiciones válidas**
    - Crear `src/tests/unit/eventos.doble-nivel.utils.property.test.ts`
    - Usar `fc.constantFrom` con los 6 estados del enum; verificar que `isValidTransition` retorna `true` exactamente para los 7 pares válidos y `false` para todos los demás (mínimo 200 iteraciones)
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 1: completitud y exclusividad de transiciones válidas`
    - **Validates: Requirements 1.1, 1.2**

- [ ] 3. Función `resolverDirectoraGeneral` en el controller
  - [x] 3.1 Implementar `resolverDirectoraGeneral(db)` en `eventos.controller.ts`
    - Agregar la función `async function resolverDirectoraGeneral(db: Knex): Promise<number>` que consulta `usuarios JOIN catalogo_unidades` filtrando `cu.tipo = 'DIRECCION_GENERAL'`, `u.rol = 'DIRECTOR'`, `u.activo = true`, ordenando por `u.id ASC`
    - Si no hay resultados, lanzar `AppError(503, 'El segundo nivel de revisión no está configurado...')`
    - Si hay más de uno, retornar el de menor `id` (resultado determinista)
    - La función consulta la BD en cada llamada (sin caché) para reflejar cambios de asignación sin reiniciar el servidor
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.2 Escribir property test para `resolverDirectoraGeneral` (Property 6)
    - **Property 6: Resolución determinista de la Directora General**
    - Crear `src/tests/unit/eventos.doble-nivel.dg.property.test.ts`
    - Generar conjuntos de N usuarios (N ≥ 1) con rol `DIRECTOR` en unidad `DIRECCION_GENERAL` con IDs aleatorios; verificar que la función siempre retorna el `id` mínimo del conjunto, independientemente del orden de inserción o consulta
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 6: resolución determinista de la DG`
    - **Validates: Requirements 4.1, 4.3**

- [ ] 4. Checkpoint — Verificar base de tipos y función helper
  - Confirmar que TypeScript compila sin errores en `eventos.types.ts` y el bloque de `resolverDirectoraGeneral`
  - Ejecutar los tests unitarios existentes para confirmar que no hay regresiones en el flujo de primer nivel
  - Preguntar al usuario si hay dudas antes de continuar con los endpoints.

- [ ] 5. Modificar `aprobarTarea` para elevar a `EN_REVISION_DG`
  - [ ] 5.1 Actualizar `aprobarTarea` en `eventos.controller.ts`
    - Cambiar el destino de la transición de `COMPLETADA` a `EN_REVISION_DG`
    - Agregar llamada a `resolverDirectoraGeneral(db)` antes de la transacción (puede lanzar 503 si no está configurada)
    - En la transacción: `UPDATE tareas_evento SET estado = 'EN_REVISION_DG'` + `INSERT INTO historial_revision_tarea` con `tipo = 'APROBACION_N1'` y `nivel_revision = 1`
    - Disparar `notifyEventoTarea({ recipient_id: dgId, event: 'TAREA_EN_REVISION_DG', ... })` y `notifyEventoTarea({ recipient_id: tarea.asignado_a_id, event: 'TAREA_APROBADA_N1', ... })` fuera de la transacción con `.catch(() => {})`
    - Mantener el mismo orden de validaciones: existencia (404) → autorización Director (403) → transición válida (422) → resolver DG (503)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 9.2_

  - [ ]* 5.2 Escribir property test de atomicidad para `aprobarTarea` modificado (Property 2)
    - **Property 2: Atomicidad de transiciones — estado e historial son consistentes**
    - Crear `src/tests/unit/eventos.doble-nivel.historial.property.test.ts`
    - Para la transición `EN_REVISION → EN_REVISION_DG`: verificar que si la transacción tiene éxito, tanto el estado en `tareas_evento` como el registro en `historial_revision_tarea` existen; si falla, ninguno de los dos cambia
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 2: atomicidad de transiciones`
    - **Validates: Requirements 1.3, 2.1**

- [ ] 6. Implementar `aprobarTareaDG` en el controller
  - [ ] 6.1 Agregar función `aprobarTareaDG` en `eventos.controller.ts`
    - Orden de validaciones: autorización DG primero (`resolverDirectoraGeneral` → 403 si usuario ≠ dgId) → existencia tarea/evento (404) → transición válida `EN_REVISION_DG → COMPLETADA` (422)
    - En transacción: `UPDATE tareas_evento SET estado = 'COMPLETADA', fecha_actualizacion = NOW()` + `INSERT historial` con `tipo = 'APROBACION_N2'`, `nivel_revision = 2`
    - Disparar notificaciones `TAREA_COMPLETADA_DG` al Operativo y al Director del evento fuera de la transacción con `.catch(() => {})`
    - _Requirements: 3.2, 3.5, 3.6, 3.7, 7.2, 8.3, 8.4, 9.4_

  - [ ]* 6.2 Escribir property test de nivel_revision para `aprobarTareaDG` (Property 5)
    - **Property 5: nivel_revision correcto según el actor que registra**
    - En `src/tests/unit/eventos.doble-nivel.historial.property.test.ts`
    - Verificar que toda entrada insertada por `aprobarTareaDG` tiene `nivel_revision = 2` y `tipo = 'APROBACION_N2'`; toda entrada insertada por `aprobarTarea` (N1) tiene `nivel_revision = 1` y `tipo = 'APROBACION_N1'`
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 5: nivel_revision correcto por actor`
    - **Validates: Requirements 5.3, 5.5**

- [ ] 7. Implementar `devolverTareaDG` en el controller
  - [ ] 7.1 Agregar función `devolverTareaDG` en `eventos.controller.ts`
    - Orden de validaciones: autorización DG primero (403) → existencia (404) → transición válida `EN_REVISION_DG → DEVUELTO` (422) → comentario no vacío ni solo espacios (422)
    - En transacción: `UPDATE tareas_evento SET estado = 'DEVUELTO'` + `INSERT historial` con `tipo = 'DEVOLUCION'`, `nivel_revision = 2`, `contenido = comentario.trim()`
    - Disparar notificación `TAREA_DEVUELTA_DG` al Operativo fuera de la transacción con `.catch(() => {})`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.8, 7.2, 8.5, 9.4_

  - [ ]* 7.2 Escribir property test de comentario vacío para `devolverTareaDG` (Property 4)
    - **Property 4: Comentario vacío rechazado en devoluciones**
    - En `src/tests/unit/eventos.doble-nivel.auth.property.test.ts`
    - Usar `fc.stringMatching(/^\s*$/)` para generar strings de solo whitespace; verificar que `devolverTareaDG` retorna HTTP 422 y el estado de la tarea permanece `EN_REVISION_DG` sin cambios (mínimo 100 iteraciones)
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 4: comentario vacío rechazado`
    - **Validates: Requirements 3.4**

- [ ] 8. Implementar `listarTareasEnRevisionDG` en el controller
  - [ ] 8.1 Agregar función `listarTareasEnRevisionDG` en `eventos.controller.ts`
    - Verificar que el usuario es la DG (`resolverDirectoraGeneral` → 403 si no coincide)
    - Consultar `tareas_evento JOIN eventos JOIN usuarios (asignado) JOIN usuarios (director)` filtrando `t.estado = 'EN_REVISION_DG'`, sin restricción por unidad
    - Seleccionar: `t.id`, `t.evento_id`, `e.titulo as evento_titulo`, `t.titulo`, `t.descripcion`, `t.asignado_a_id`, `u.nombre as asignado_a_nombre`, `e.creado_por_id as director_id`, `ud.nombre as director_nombre`, `t.estado`, `t.fecha_programada`, `t.fecha_actualizacion`
    - Ordenar por `t.fecha_actualizacion ASC`; retornar `{ data: tareas }`
    - _Requirements: 3.1, 7.5, 9.4_

- [ ] 9. Registrar nuevas rutas en `eventos.routes.ts`
  - [ ] 9.1 Agregar las tres rutas nuevas al router
    - Importar `aprobarTareaDG`, `devolverTareaDG`, `listarTareasEnRevisionDG` desde el controller
    - Agregar `router.get('/tareas-en-revision-dg', listarTareasEnRevisionDG)` **antes** de `router.get('/:id', ...)` para evitar conflicto de parámetros
    - Agregar `router.patch('/:id/tareas/:tareaId/aprobar-dg', aprobarTareaDG)`
    - Agregar `router.patch('/:id/tareas/:tareaId/devolver-dg', devolverTareaDG)`
    - Verificar que las rutas existentes (`/aprobar`, `/devolver`, `/enviar-revision`, `/historial`) no cambian su firma
    - _Requirements: 9.1, 9.4, 7.5_

- [ ] 10. Checkpoint — Verificar endpoints del backend
  - Confirmar que TypeScript compila sin errores en `eventos.controller.ts` y `eventos.routes.ts`
  - Ejecutar los tests unitarios y de propiedad del backend
  - Verificar que el endpoint `aprobarTarea` existente ya no transiciona a `COMPLETADA` sino a `EN_REVISION_DG`
  - Preguntar al usuario si hay dudas antes de continuar con notificaciones y frontend.

- [ ] 11. Actualización de tipos de notificaciones y plantillas
  - [x] 11.1 Agregar nuevos tipos de evento al union `NotificationEventType`
    - En `src/notifications/notification.types.ts`, agregar `'TAREA_EN_REVISION_DG'`, `'TAREA_APROBADA_N1'`, `'TAREA_COMPLETADA_DG'`, `'TAREA_DEVUELTA_DG'` al union type
    - _Requirements: 8.7_

  - [ ] 11.2 Agregar plantillas de notificación en `templates.ts`
    - En `src/notifications/templates.ts`, agregar casos para los 4 nuevos tipos en la función `renderTemplate`:
      - `TAREA_EN_REVISION_DG`: título "Tarea pendiente de aprobación final", cuerpo con nombre del Director, tarea y evento
      - `TAREA_APROBADA_N1`: título "Avance aprobado por el Director", cuerpo indicando pendiente de aprobación final de la DG
      - `TAREA_COMPLETADA_DG`: título "Tarea aprobada definitivamente", cuerpo con nombre de la tarea
      - `TAREA_DEVUELTA_DG`: título "Tarea devuelta por la Directora General", cuerpo con nombre de la tarea y comentario de devolución
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.3 Escribir property test de resiliencia ante fallos de notificación (Property 7)
    - **Property 7: Resiliencia ante fallos del servicio de notificaciones**
    - En `src/tests/unit/eventos.doble-nivel.historial.property.test.ts`
    - Mockear `notifyEventoTarea` para que lance un error en cualquiera de los 4 endpoints de revisión (`aprobarTarea`, `aprobarTareaDG`, `devolverTarea`, `devolverTareaDG`); verificar que la respuesta HTTP es 2xx, el estado en BD refleja la transición correcta y el registro en historial existe
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 7: resiliencia ante fallos de notificaciones`
    - **Validates: Requirements 2.4, 2.5, 3.7, 3.8, 8.6**

- [ ] 12. Actualización de tipos en el frontend
  - [ ] 12.1 Actualizar `EstadoTarea` y `RegistroHistorial` en `src/frontend/types.ts`
    - Agregar `'EN_REVISION_DG'` al union type `EstadoTarea`
    - Agregar campo `nivel_revision: 1 | 2` a la interfaz `RegistroHistorial`
    - _Requirements: 7.4, 5.7, 9.3_

- [ ] 13. Actualización de badges en `SeccionEventos.tsx` (vista Director de Área)
  - [ ] 13.1 Agregar entrada `EN_REVISION_DG` en `ESTADO_TAREA_CFG`
    - Agregar `EN_REVISION_DG: { bg: '#EDE9FE', text: '#5B21B6', label: 'En Revisión DG' }` (badge violeta)
    - Cuando una tarea está en `EN_REVISION_DG`, el Director de Área ve el badge violeta y **no tiene acciones disponibles** (la tarea está en manos de la DG)
    - _Requirements: 7.1, 9.1_

- [ ] 14. Actualización de badges en `Dashboard_DirectorArea.tsx` (vista Operativo)
  - [ ] 14.1 Agregar entrada `EN_REVISION_DG` en `ESTADO_CFG`
    - Agregar `EN_REVISION_DG: { bg: '#EDE9FE', text: '#5B21B6', label: 'En Revisión DG' }` (badge violeta)
    - Cuando una tarea está en `EN_REVISION_DG`, el Operativo ve el badge violeta y el mensaje "En revisión por la Directora General" sin botón de acción
    - _Requirements: 7.4, 9.1_

- [ ] 15. Nuevo componente `PanelRevisionDG`
  - [ ] 15.1 Crear componente `PanelRevisionDG` en `src/frontend/components/`
    - Llamar a `GET /eventos/tareas-en-revision-dg` al montar el componente para obtener todas las tareas en `EN_REVISION_DG`
    - Mostrar cada tarea con: título, nombre del evento, nombre del Operativo asignado, nombre del Director que aprobó N1, fecha de actualización
    - Botón "✅ Aprobar" → `PATCH /eventos/:id/tareas/:tareaId/aprobar-dg` (confirmación inline)
    - Botón "↩ Devolver" → abre `DevolverTareaDGModal` con campo de comentario obligatorio → `PATCH /eventos/:id/tareas/:tareaId/devolver-dg`
    - Botón "📋 Ver historial" → abre `HistorialRevisionModal` (componente existente, reutilizable)
    - _Requirements: 3.1, 3.2, 3.3, 7.5_

  - [ ] 15.2 Crear `DevolverTareaDGModal` dentro de `PanelRevisionDG`
    - Modal con campo de comentario obligatorio (validación client-side: no vacío ni solo espacios antes de habilitar el botón de envío)
    - Llamar a `PATCH /eventos/:id/tareas/:tareaId/devolver-dg` con `{ comentario }` en el body
    - Cerrar el modal y refrescar la lista tras respuesta exitosa
    - _Requirements: 3.3, 3.4_

  - [ ] 15.3 Integrar `PanelRevisionDG` como pestaña "Revisión DG" en el dashboard de la Directora General
    - Identificar el componente de dashboard que usa la DG (misma vista que `Dashboard_Director.tsx` o equivalente)
    - Agregar pestaña "Revisión DG" visible únicamente cuando el usuario autenticado es la DG
    - Renderizar `PanelRevisionDG` al seleccionar la pestaña
    - _Requirements: 7.5_

  - [ ]* 15.4 Escribir property test de autorización estricta por nivel (Property 3)
    - **Property 3: Autorización estricta por nivel de revisión**
    - Crear `src/tests/unit/eventos.doble-nivel.auth.property.test.ts`
    - Generar usuarios aleatorios que no sean el creador del evento; verificar que todos reciben HTTP 403 al intentar aprobar/devolver desde `EN_REVISION` (primer nivel)
    - Generar usuarios aleatorios que no sean la DG; verificar que todos reciben HTTP 403 al intentar aprobar/devolver desde `EN_REVISION_DG` (segundo nivel), antes de evaluar el estado de la tarea
    - Incluir etiqueta: `// Feature: revision-doble-nivel-tareas, Property 3: autorización estricta por nivel`
    - **Validates: Requirements 2.2, 3.5, 7.1, 7.2, 7.6, 7.7, 7.8**

- [ ] 16. Checkpoint final — Verificar integración completa
  - Ejecutar todos los tests unitarios y de propiedad
  - Confirmar que TypeScript compila sin errores en frontend y backend
  - Verificar que el script `10_revision_doble_nivel.sql` es idempotente ejecutándolo dos veces en el entorno de desarrollo
  - Confirmar que el flujo completo `PENDIENTE → EN_PROGRESO → EN_REVISION → EN_REVISION_DG → COMPLETADA` funciona a través de los tests de ejemplo
  - Preguntar al usuario si hay dudas antes de dar por completada la implementación.

---

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints garantizan validación incremental antes de avanzar a la siguiente capa
- Las property tests validan invariantes universales; los tests de ejemplo validan flujos concretos
- El script `10_revision_doble_nivel.sql` debe ejecutarse en el entorno de desarrollo antes de arrancar el servidor
- `resolverDirectoraGeneral` consulta la BD en cada llamada (sin caché) para reflejar cambios de asignación sin reiniciar el servidor
- Las notificaciones se disparan **fuera** de la transacción con `.catch(() => {})` para no revertir la operación principal ante fallos del canal
- La tabla `historial_revision_tarea` es append-only por diseño: no exponer endpoints DELETE ni PUT
- La ruta `GET /eventos/tareas-en-revision-dg` debe registrarse **antes** de `GET /eventos/:id` para evitar que Express interprete `tareas-en-revision-dg` como un parámetro `:id`
- Los registros existentes en `historial_revision_tarea` reciben `nivel_revision = 1` automáticamente por el `DEFAULT 1` de la migración (Requirement 5.10)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "11.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1", "11.2"] },
    { "id": 4, "tasks": ["5.2", "6.1", "7.1", "8.1", "12.1"] },
    { "id": 5, "tasks": ["6.2", "7.2", "9.1", "11.3", "13.1", "14.1"] },
    { "id": 6, "tasks": ["15.1", "15.2"] },
    { "id": 7, "tasks": ["15.3", "15.4"] }
  ]
}
```
