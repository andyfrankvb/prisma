# Documento de Requisitos — Flujo de Revisión de Tareas de Eventos

## Introduction

El módulo **Flujo de Revisión de Tareas de Eventos** (`flujo-revision-tareas-eventos`) extiende el módulo de supervisión de eventos para incorporar un ciclo formal de revisión entre el Director que asigna tareas y el Operativo que las ejecuta. Actualmente las tareas avanzan de forma lineal (`PENDIENTE → EN_PROGRESO → COMPLETADA`) sin intervención del Director. Con este cambio, el Operativo envía su avance para revisión, el Director aprueba o devuelve con comentario, y el ciclo puede repetirse sin límite hasta que el Director apruebe. Las tareas existentes se migran al nuevo flujo de estados.

---

## Glosario

- **Sistema**: El módulo de supervisión de eventos en su conjunto, incluyendo el nuevo flujo de revisión.
- **Director**: Usuario con rol `DIRECTOR` que crea eventos y asigna tareas a Operativos de su unidad. Es el revisor de las tareas que asignó.
- **Operativo**: Usuario con rol `OPERATIVO` al que se le asigna una tarea dentro de un evento. Es quien ejecuta el trabajo y envía avances para revisión.
- **Tarea**: Registro en la tabla `tareas_evento` asociado a un evento, asignado a un Operativo por un Director.
- **Avance**: Evidencia de progreso que el Operativo adjunta al enviar una tarea a revisión. Puede ser un comentario de texto, un documento adjunto, o ambos; al menos uno es obligatorio.
- **Documento_Avance**: Archivo (PDF, imagen u otro formato soportado) que el Operativo puede adjuntar como evidencia al enviar la tarea a revisión.
- **Comentario_Revision**: Texto libre que el Director incluye obligatoriamente al devolver una tarea, explicando qué falta o qué debe corregirse.
- **Ciclo_Revision**: Iteración completa del flujo `EN_REVISION → DEVUELTO → EN_REVISION`. No existe límite de ciclos por tarea.
- **Estado_Tarea**: Valor del enum `estado_tarea` en la base de datos. Los valores válidos tras la migración son: `PENDIENTE`, `EN_PROGRESO`, `EN_REVISION`, `DEVUELTO`, `COMPLETADA`.
- **Historial_Revision**: Registro cronológico de todos los comentarios y cambios de estado de una tarea, visible para el Director y el Operativo.

---

## Requirements

### Requirement 1: Nuevo Flujo de Estados de Tareas

**User Story:** Como sistema, quiero garantizar que las tareas solo puedan transicionar entre estados permitidos del nuevo flujo de revisión, para mantener la integridad del proceso.

#### Acceptance Criteria

1. THE Sistema SHALL implementar el siguiente flujo de estados con las transiciones válidas:
   - `PENDIENTE → EN_PROGRESO` (el Operativo inicia el trabajo)
   - `EN_PROGRESO → EN_REVISION` (el Operativo envía avance para revisión)
   - `EN_REVISION → COMPLETADA` (el Director aprueba el avance)
   - `EN_REVISION → DEVUELTO` (el Director devuelve con comentario obligatorio)
   - `DEVUELTO → EN_REVISION` (el Operativo corrige y reenvía con nuevo avance)
2. IF cualquier actor intenta realizar una transición de estado no incluida en las transiciones válidas del criterio 1, THEN THE Sistema SHALL rechazar la acción con código HTTP 422, indicar la transición inválida y bloquear completamente el cambio de estado.
3. THE Sistema SHALL garantizar que las transiciones de estado se ejecuten dentro de una transacción de base de datos, de modo que el cambio de estado y el registro del avance o comentario sean atómicos.
4. FOR ALL tareas en el sistema, el campo `estado` SHALL corresponder a uno de los valores del enum `estado_tarea`: `PENDIENTE`, `EN_PROGRESO`, `EN_REVISION`, `DEVUELTO`, `COMPLETADA`.
5. THE Sistema SHALL permitir que una tarea sea devuelta y reenviada sin límite de ciclos, siempre que cada transición siga el flujo definido en el criterio 1.

---

### Requirement 2: Envío de Avance por el Operativo

**User Story:** Como Operativo, quiero presionar un botón "Enviar para revisión" adjuntando un comentario o un documento de avance, para que el Director pueda revisar mi progreso formalmente.

#### Acceptance Criteria

1. WHEN el Operativo asignado a una tarea con estado `EN_PROGRESO` o `DEVUELTO` envía una solicitud de revisión incluyendo al menos un comentario de texto no vacío o un documento adjunto, THE Sistema SHALL actualizar el estado de la tarea a `EN_REVISION` y registrar el avance.
2. IF el Operativo envía una solicitud de revisión sin comentario de texto y sin documento adjunto, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que se requiere al menos un comentario o un documento de avance.
3. IF un usuario distinto al Operativo asignado intenta enviar la tarea a revisión, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
4. IF el Operativo intenta enviar a revisión una tarea con estado distinto a `EN_PROGRESO` o `DEVUELTO`, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar el estado actual de la tarea.
5. WHEN el Operativo adjunta un documento de avance y la solicitud de revisión es aceptada, THE Sistema SHALL almacenar el archivo en el servicio de almacenamiento existente bajo la ruta `eventos/avances/` y registrar la referencia junto al avance; IF la solicitud es rechazada por cualquier motivo, THEN THE Sistema SHALL descartar el documento sin almacenarlo.

---

### Requirement 3: Revisión del Avance por el Director

**User Story:** Como Director, quiero revisar el avance enviado por el Operativo y aprobar o devolver la tarea con un comentario, para controlar formalmente la calidad del trabajo antes de marcarlo como completado.

#### Acceptance Criteria

1. WHEN el Director que creó el evento solicita el detalle de una tarea con estado `EN_REVISION`, THE Sistema SHALL devolver la tarea completa incluyendo el avance enviado (comentario y/o documento), el historial de revisiones previas y el estado actual.
2. WHEN el Director envía una acción de aprobación sobre una tarea con estado `EN_REVISION`, THE Sistema SHALL actualizar el estado de la tarea a `COMPLETADA` y registrar la marca de tiempo de completado.
3. WHEN el Director envía una acción de devolución sobre una tarea con estado `EN_REVISION`, incluyendo un comentario no vacío que explique qué falta o qué debe corregirse, THE Sistema SHALL actualizar el estado de la tarea a `DEVUELTO` y notificar al Operativo.
4. IF el Director envía una acción de devolución sin comentario o con comentario vacío, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que el comentario es obligatorio al devolver.
5. IF un usuario distinto al Director que creó el evento intenta aprobar o devolver una tarea, THE Sistema SHALL rechazar la acción con código HTTP 403 antes de evaluar cualquier otra validación como el estado de la tarea o la presencia de comentario.
6. IF el Director intenta aprobar o devolver una tarea con estado distinto a `EN_REVISION`, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar el estado actual de la tarea.
7. WHEN la tarea pasa a estado `DEVUELTO`, THE Sistema SHALL enviar una notificación in-app al Operativo asignado con el nombre de la tarea y el comentario del Director.
8. WHEN la tarea pasa a estado `COMPLETADA` por aprobación del Director, THE Sistema SHALL enviar una notificación in-app al Operativo asignado indicando que su avance fue aprobado.

---

### Requirement 4: Historial de Revisiones

**User Story:** Como Director u Operativo, quiero consultar el historial completo de avances y comentarios de una tarea, para tener trazabilidad de todos los ciclos de revisión.

#### Acceptance Criteria

1. THE Sistema SHALL mantener un registro cronológico de cada avance enviado y cada comentario de devolución asociado a una tarea, incluyendo: `tarea_id`, `autor_id`, `tipo` (AVANCE o DEVOLUCION), `contenido` (texto, nullable), `documento_url` (nullable), `creado_en`.
2. WHEN el Director o el Operativo asignado solicita el historial de revisiones de una tarea, THE Sistema SHALL devolver todos los registros ordenados por `creado_en` ascendente, incluyendo el `autor_nombre` y el `tipo` de cada entrada.
3. IF un usuario sin relación con la tarea (ni Director del evento ni Operativo asignado) solicita el historial, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
4. THE Sistema SHALL garantizar que ningún registro del historial de revisiones pueda ser modificado o eliminado mediante las operaciones normales de la API.
5. FOR ALL tareas con al menos un ciclo de revisión completado, el historial SHALL contener al menos un registro de tipo `AVANCE` seguido de un registro de tipo `DEVOLUCION` o de la transición a `COMPLETADA`.

---

### Requirement 5: Migración de Tareas Existentes

**User Story:** Como administrador del sistema, quiero que las tareas existentes sean migradas al nuevo flujo de estados sin pérdida de datos, para que el nuevo flujo aplique a todo el historial de tareas.

#### Acceptance Criteria

1. THE Sistema SHALL extender el enum `estado_tarea` en la base de datos agregando los valores `EN_REVISION` y `DEVUELTO` mediante un script SQL idempotente que solo aplica los cambios cuando se ejecuta a través del script de migración.
2. THE Sistema SHALL migrar las tareas existentes con estado `EN_PROGRESO` conservando ese estado, ya que `EN_PROGRESO` sigue siendo un estado válido en el nuevo flujo.
3. THE Sistema SHALL migrar las tareas existentes con estado `COMPLETADA` conservando ese estado sin modificación.
4. THE Sistema SHALL migrar las tareas existentes con estado `PENDIENTE` conservando ese estado sin modificación.
5. IF el script de migración se ejecuta más de una vez, THEN THE Sistema SHALL aplicar los cambios de forma idempotente sin duplicar datos ni generar errores.
6. THE Sistema SHALL actualizar la función `isValidTransition` en `eventos.types.ts` para reflejar las nuevas transiciones válidas del flujo de revisión.

---

### Requirement 6: Visibilidad y Permisos por Rol

**User Story:** Como usuario del sistema, quiero que cada rol solo pueda ejecutar las acciones que le corresponden dentro del flujo de revisión, para mantener la integridad del proceso.

#### Acceptance Criteria

1. WHILE una tarea tiene estado `PENDIENTE`, THE Sistema SHALL permitir únicamente al Operativo asignado iniciar el trabajo (transición a `EN_PROGRESO`).
2. WHILE una tarea tiene estado `EN_PROGRESO` o `DEVUELTO`, THE Sistema SHALL permitir únicamente al Operativo asignado enviar el avance para revisión (transición a `EN_REVISION`).
3. WHILE una tarea tiene estado `EN_REVISION`, THE Sistema SHALL permitir únicamente al Director que creó el evento aprobar (transición a `COMPLETADA`) o devolver (transición a `DEVUELTO`) la tarea.
4. THE Sistema SHALL devolver en el listado de tareas (`GET /eventos/mis-tareas`) las tareas donde el usuario autenticado es el `asignado_a_id`, incluyendo los nuevos estados `EN_REVISION` y `DEVUELTO`.
5. WHEN el Director consulta el detalle de un evento (`GET /eventos/:id`), THE Sistema SHALL incluir en cada tarea el estado actualizado, reflejando los nuevos valores `EN_REVISION` y `DEVUELTO`.
6. IF un Operativo intenta ejecutar una acción de aprobación o devolución reservada al Director, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
7. IF un Director intenta enviar un avance como si fuera el Operativo asignado, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.

---

### Requirement 7: Notificaciones del Flujo de Revisión

**User Story:** Como participante del proceso, quiero recibir notificaciones in-app cuando ocurran eventos relevantes en las tareas que me conciernen, para estar informado sin necesidad de revisar manualmente el sistema.

#### Acceptance Criteria

1. WHEN una tarea transiciona a `EN_REVISION`, THE Sistema SHALL enviar una notificación in-app al Director que creó el evento con el nombre de la tarea y el nombre del Operativo que envió el avance.
2. WHEN una tarea transiciona a `DEVUELTO`, THE Sistema SHALL enviar una notificación in-app al Operativo asignado con el nombre de la tarea y el comentario de devolución del Director.
3. WHEN una tarea transiciona a `COMPLETADA` por aprobación del Director, THE Sistema SHALL enviar una notificación in-app al Operativo asignado indicando que su avance fue aprobado.
4. IF el servicio de notificaciones falla al enviar una notificación, THEN THE Sistema SHALL registrar el error en el log del servidor y continuar la operación principal sin interrumpirla.
5. THE Sistema SHALL utilizar el canal de notificaciones in-app existente y el dispatcher `notifyEventoTarea` para enviar todas las notificaciones del módulo.
6. THE Sistema SHALL soportar los tipos de evento de notificación: `TAREA_EN_REVISION`, `TAREA_DEVUELTA`, `TAREA_COMPLETADA`.
