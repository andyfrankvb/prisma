# Requirements Document

## Introduction

El módulo **Revisión de Doble Nivel en Tareas de Eventos** (`revision-doble-nivel-tareas`) extiende el flujo de revisión existente (`flujo-revision-tareas-eventos`) para incorporar una segunda capa de aprobación a cargo de la Directora General antes de que una tarea quede definitivamente como `COMPLETADA`.

En el flujo actual, el Operativo envía avances al Director de Área (ej. Carlos Tah), quien puede aprobar o devolver la tarea. Con este cambio, la aprobación del Director de Área ya no marca la tarea como `COMPLETADA` de forma inmediata: en su lugar, la tarea pasa a un nuevo estado `EN_REVISION_DG` y queda en espera de la aprobación final de la Directora General (Mariann). Solo cuando la Directora General aprueba, la tarea transiciona a `COMPLETADA`. La Directora General también puede devolver la tarea al Operativo con un comentario obligatorio, reiniciando el ciclo desde el primer nivel.

El flujo completo propuesto es:

```
Operativo → EN_REVISION (Director de Área revisa)
  ├─ Director devuelve → DEVUELTO (Operativo corrige y reenvía)
  └─ Director aprueba → EN_REVISION_DG (Directora General revisa)
       ├─ DG devuelve → DEVUELTO (Operativo corrige y reenvía desde el inicio)
       └─ DG aprueba → COMPLETADA
```

---

## Glossary

- **Sistema**: El módulo de supervisión de eventos en su conjunto, incluyendo el flujo de revisión de doble nivel.
- **Operativo**: Usuario con rol `OPERATIVO` al que se le asigna una tarea dentro de un evento. Ejecuta el trabajo y envía avances para revisión.
- **Director_Area**: Usuario con rol `DIRECTOR` que crea el evento y asigna tareas a Operativos de su unidad. Realiza la primera revisión de los avances.
- **Directora_General**: Usuario con rol `DIRECTOR` asignado a la unidad de tipo `DIRECCION_GENERAL` (unidad_id = 1). Realiza la aprobación final de las tareas antes de que queden como `COMPLETADA`. En el seed de desarrollo corresponde al usuario con email `director@demo.mx`.
- **Tarea**: Registro en la tabla `tareas_evento` asociado a un evento, asignado a un Operativo por un Director_Area.
- **Avance**: Evidencia de progreso que el Operativo adjunta al enviar una tarea a revisión. Puede ser un comentario de texto, un documento adjunto, o ambos; al menos uno es obligatorio.
- **Comentario_Devolucion**: Texto libre que el Director_Area o la Directora_General incluyen obligatoriamente al devolver una tarea, explicando qué falta o qué debe corregirse.
- **Estado_Tarea**: Valor del enum `estado_tarea` en la base de datos. Los valores válidos tras esta migración son: `PENDIENTE`, `EN_PROGRESO`, `EN_REVISION`, `EN_REVISION_DG`, `DEVUELTO`, `COMPLETADA`.
- **Historial_Revision**: Registro cronológico de todos los avances, aprobaciones intermedias y devoluciones de una tarea, visible para el Director_Area, la Directora_General y el Operativo.
- **Nivel_Revision**: Número de nivel de revisión en el que se registra una entrada del historial. Nivel 1 = revisión del Director_Area; Nivel 2 = revisión de la Directora_General.
- **Ciclo_Revision**: Iteración completa del flujo que comienza cuando el Operativo envía un avance y termina cuando la tarea es aprobada o devuelta por cualquiera de los dos revisores. No existe límite de ciclos por tarea.

---

## Requirements

### Requirement 1: Extensión del Flujo de Estados con Segundo Nivel de Revisión

**User Story:** Como sistema, quiero garantizar que las tareas solo puedan transicionar entre los estados del flujo de doble revisión, para mantener la integridad del proceso y asegurar que toda tarea completada haya pasado por ambos niveles de aprobación.

#### Acceptance Criteria

1. THE Sistema SHALL implementar el siguiente flujo de estados con las transiciones válidas:
   - `PENDIENTE → EN_PROGRESO` (el Operativo inicia el trabajo)
   - `EN_PROGRESO → EN_REVISION` (el Operativo envía avance para revisión de primer nivel)
   - `EN_REVISION → EN_REVISION_DG` (el Director_Area aprueba y eleva al segundo nivel)
   - `EN_REVISION → DEVUELTO` (el Director_Area devuelve con comentario obligatorio)
   - `EN_REVISION_DG → COMPLETADA` (la Directora_General aprueba definitivamente)
   - `EN_REVISION_DG → DEVUELTO` (la Directora_General devuelve con comentario obligatorio)
   - `DEVUELTO → EN_REVISION` (el Operativo corrige y reenvía al primer nivel)
2. IF cualquier actor intenta realizar una transición de estado no incluida en las transiciones válidas del criterio 1, THEN THE Sistema SHALL rechazar la acción con código HTTP 422, indicar la transición inválida y bloquear completamente el cambio de estado; el rechazo HTTP 422 y el bloqueo del cambio de estado SHALL ocurrir siempre de forma conjunta e inseparable.
3. THE Sistema SHALL garantizar que las transiciones de estado se ejecuten dentro de una transacción de base de datos, de modo que el cambio de estado y el registro en el historial sean atómicos.
4. FOR ALL tareas en el sistema, el campo `estado` SHALL corresponder a uno de los valores del enum `estado_tarea`: `PENDIENTE`, `EN_PROGRESO`, `EN_REVISION`, `EN_REVISION_DG`, `DEVUELTO`, `COMPLETADA`.
5. THE Sistema SHALL permitir que una tarea sea devuelta desde cualquier nivel y reenviada sin límite de ciclos, siempre que cada transición siga el flujo definido en el criterio 1.

---

### Requirement 2: Aprobación de Primer Nivel por el Director de Área

**User Story:** Como Director de Área, quiero que al aprobar el avance de un Operativo la tarea pase a revisión de la Directora General en lugar de quedar completada de inmediato, para que exista una segunda validación antes del cierre definitivo.

#### Acceptance Criteria

1. WHEN el Director_Area que creó el evento envía una acción de aprobación sobre una tarea con estado `EN_REVISION`, THE Sistema SHALL actualizar el estado de la tarea a `EN_REVISION_DG` y registrar en el historial una entrada de tipo `APROBACION_N1` con el `autor_id` del Director_Area y el `nivel_revision = 1`.
2. IF un usuario distinto al Director_Area que creó el evento intenta ejecutar la aprobación de primer nivel, THEN THE Sistema SHALL rechazar la acción con código HTTP 403 antes de evaluar cualquier otra validación.
3. IF el Director_Area intenta aprobar una tarea con estado distinto a `EN_REVISION`, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar el estado actual de la tarea.
4. WHEN la tarea transiciona a `EN_REVISION_DG`, THE Sistema SHALL enviar una notificación in-app a la Directora_General con el nombre de la tarea, el nombre del evento, el nombre del Operativo y el nombre del Director_Area que aprobó el primer nivel; IF el servicio de notificaciones falla, THEN THE Sistema SHALL registrar el error en el log y continuar sin revertir la aprobación.
5. WHEN la tarea transiciona a `EN_REVISION_DG`, THE Sistema SHALL enviar una notificación in-app al Operativo asignado indicando que su avance fue aprobado por el Director_Area y está pendiente de aprobación final; IF el servicio de notificaciones falla, THEN THE Sistema SHALL registrar el error en el log y continuar sin revertir la aprobación.

---

### Requirement 3: Revisión y Aprobación Final por la Directora General

**User Story:** Como Directora General, quiero revisar los avances que ya fueron aprobados por el Director de Área y decidir si los apruebo definitivamente o los devuelvo al Operativo, para ejercer el control final sobre la calidad del trabajo.

#### Acceptance Criteria

1. WHEN la Directora_General solicita el detalle de una tarea con estado `EN_REVISION_DG`, THE Sistema SHALL devolver la tarea completa incluyendo el avance enviado por el Operativo (comentario y/o documento), el historial completo de revisiones y el estado actual.
2. WHEN la Directora_General envía una acción de aprobación final sobre una tarea con estado `EN_REVISION_DG`, THE Sistema SHALL actualizar el estado de la tarea a `COMPLETADA`, registrar en el historial una entrada de tipo `APROBACION_N2` con `nivel_revision = 2` y registrar la marca de tiempo de completado.
3. WHEN la Directora_General envía una acción de devolución sobre una tarea con estado `EN_REVISION_DG`, incluyendo un comentario no vacío que explique qué falta o qué debe corregirse, THE Sistema SHALL actualizar el estado de la tarea a `DEVUELTO` y registrar en el historial una entrada de tipo `DEVOLUCION` con `nivel_revision = 2`.
4. IF la Directora_General envía una acción de devolución sin comentario o con comentario compuesto únicamente de espacios en blanco, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que el comentario es obligatorio al devolver.
5. IF un usuario distinto a la Directora_General intenta ejecutar la aprobación final o la devolución de segundo nivel, THEN THE Sistema SHALL rechazar la acción con código HTTP 403 antes de evaluar cualquier otra validación, incluyendo el estado de la tarea.
6. IF la Directora_General intenta aprobar o devolver una tarea con estado distinto a `EN_REVISION_DG`, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar el estado actual de la tarea; esta validación de estado solo se evalúa después de confirmar que el usuario es la Directora_General.
7. WHEN la tarea transiciona a `COMPLETADA` por aprobación de la Directora_General, THE Sistema SHALL enviar una notificación in-app al Operativo asignado y al Director_Area que creó el evento indicando que la tarea fue aprobada definitivamente.
8. WHEN la tarea transiciona a `DEVUELTO` por devolución de la Directora_General, THE Sistema SHALL enviar una notificación in-app al Operativo asignado con el nombre de la tarea y el comentario de devolución, e indicar que la devolución proviene del segundo nivel de revisión.

---

### Requirement 4: Identificación de la Directora General

**User Story:** Como sistema, quiero identificar de forma inequívoca a la Directora General para autorizar las acciones del segundo nivel de revisión, sin depender de un ID hardcodeado.

#### Acceptance Criteria

1. THE Sistema SHALL identificar a la Directora_General como el usuario con rol `DIRECTOR` asignado a la unidad de tipo `DIRECCION_GENERAL` (campo `tipo = 'DIRECCION_GENERAL'` en `catalogo_unidades`), consultando la tabla `usuarios` en tiempo de ejecución.
2. IF no existe ningún usuario activo con rol `DIRECTOR` en una unidad de tipo `DIRECCION_GENERAL`, THEN THE Sistema SHALL rechazar cualquier intento de transición a `EN_REVISION_DG` con código HTTP 503 e indicar que el segundo nivel de revisión no está configurado.
3. IF existe más de un usuario activo con rol `DIRECTOR` en unidades de tipo `DIRECCION_GENERAL`, THEN THE Sistema SHALL utilizar el usuario con el `id` más bajo como Directora_General, garantizando un resultado determinista.
4. THE Sistema SHALL resolver la identidad de la Directora_General en cada operación que la requiera, de modo que un cambio en la asignación de usuarios a unidades se refleje sin necesidad de reiniciar el servidor.

---

### Requirement 5: Extensión del Historial de Revisiones

**User Story:** Como Director de Área, Directora General u Operativo, quiero que el historial de revisiones refleje ambos niveles de aprobación y devolución, para tener trazabilidad completa del proceso de doble revisión.

#### Acceptance Criteria

1. THE Sistema SHALL extender la tabla `historial_revision_tarea` agregando la columna `nivel_revision` (entero, no nulo, valores permitidos: 1 o 2) y la columna `tipo` con los valores adicionales `APROBACION_N1` y `APROBACION_N2`, manteniendo compatibilidad con los registros existentes de tipo `AVANCE` y `DEVOLUCION`.
2. WHEN se registra una entrada de tipo `AVANCE` en el historial, THE Sistema SHALL asignar `nivel_revision = 1` a dicha entrada.
3. WHEN se registra una entrada de tipo `APROBACION_N1` en el historial, THE Sistema SHALL asignar `nivel_revision = 1` a dicha entrada.
4. WHEN se registra una entrada de tipo `DEVOLUCION` originada por el Director_Area, THE Sistema SHALL asignar `nivel_revision = 1` a dicha entrada.
5. WHEN se registra una entrada de tipo `APROBACION_N2` en el historial, THE Sistema SHALL asignar `nivel_revision = 2` a dicha entrada.
6. WHEN se registra una entrada de tipo `DEVOLUCION` originada por la Directora_General, THE Sistema SHALL asignar `nivel_revision = 2` a dicha entrada.
7. WHEN el Director_Area, la Directora_General o el Operativo asignado solicita el historial de revisiones de una tarea, THE Sistema SHALL devolver todos los registros ordenados por `creado_en` ascendente, incluyendo `autor_nombre`, `tipo`, `nivel_revision` y `creado_en`.
8. IF un usuario sin relación con la tarea (ni Director_Area del evento, ni Directora_General, ni Operativo asignado) solicita el historial, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
9. THE Sistema SHALL garantizar que ningún registro del historial de revisiones pueda ser modificado o eliminado mediante las operaciones normales de la API.
10. FOR ALL registros existentes en `historial_revision_tarea` creados antes de esta migración, THE Sistema SHALL asignar `nivel_revision = 1` como valor por defecto al aplicar la migración.

---

### Requirement 6: Migración de Base de Datos

**User Story:** Como administrador del sistema, quiero que la base de datos sea migrada de forma segura e idempotente para soportar el nuevo flujo de doble revisión sin afectar los datos existentes.

#### Acceptance Criteria

1. THE Sistema SHALL extender el enum `estado_tarea` en la base de datos agregando el valor `EN_REVISION_DG` mediante un script SQL idempotente que utilice `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
2. THE Sistema SHALL agregar la columna `nivel_revision` a la tabla `historial_revision_tarea` con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS nivel_revision SMALLINT NOT NULL DEFAULT 1`, garantizando que los registros existentes reciban el valor 1.
3. THE Sistema SHALL extender el constraint `CHECK` de la columna `tipo` en `historial_revision_tarea` para incluir los valores `APROBACION_N1` y `APROBACION_N2`, manteniendo los valores existentes `AVANCE` y `DEVOLUCION`.
4. IF el script de migración se ejecuta más de una vez, THEN THE Sistema SHALL aplicar todos los cambios de forma idempotente sin duplicar datos ni generar errores.
5. THE Sistema SHALL conservar sin modificación todos los registros existentes en `tareas_evento` e `historial_revision_tarea` al ejecutar la migración.

---

### Requirement 7: Visibilidad y Permisos por Rol

**User Story:** Como usuario del sistema, quiero que cada rol solo pueda ejecutar las acciones que le corresponden dentro del flujo de doble revisión, para mantener la integridad del proceso.

#### Acceptance Criteria

1. WHILE una tarea tiene estado `EN_REVISION`, THE Sistema SHALL permitir únicamente al Director_Area que creó el evento aprobar (transición a `EN_REVISION_DG`) o devolver (transición a `DEVUELTO`) la tarea.
2. WHILE una tarea tiene estado `EN_REVISION_DG`, THE Sistema SHALL permitir únicamente a la Directora_General aprobar (transición a `COMPLETADA`) o devolver (transición a `DEVUELTO`) la tarea.
3. WHILE una tarea tiene estado `DEVUELTO`, THE Sistema SHALL permitir únicamente al Operativo asignado reenviar el avance (transición a `EN_REVISION`), independientemente de qué nivel originó la devolución.
4. THE Sistema SHALL devolver en el listado de tareas del Operativo (`GET /eventos/mis-tareas`) las tareas donde el usuario autenticado es el `asignado_a_id`, incluyendo el nuevo estado `EN_REVISION_DG`.
5. WHEN la Directora_General consulta el panel de revisión, THE Sistema SHALL mostrar todas las tareas con estado `EN_REVISION_DG` de todos los eventos del sistema, sin restricción por unidad.
6. IF un Operativo o Director_Area intenta ejecutar una acción reservada a la Directora_General (aprobar o devolver desde `EN_REVISION_DG`), THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
7. IF la Directora_General intenta enviar un avance como si fuera el Operativo asignado, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
8. IF la Directora_General intenta ejecutar la aprobación de primer nivel reservada al Director_Area, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.

---

### Requirement 8: Notificaciones del Flujo de Doble Revisión

**User Story:** Como participante del proceso, quiero recibir notificaciones in-app cuando ocurran eventos relevantes en el segundo nivel de revisión, para estar informado sin necesidad de revisar manualmente el sistema.

#### Acceptance Criteria

1. WHEN una tarea transiciona a `EN_REVISION_DG`, THE Sistema SHALL enviar una notificación in-app a la Directora_General con el nombre de la tarea, el nombre del evento y el nombre del Director_Area que aprobó el primer nivel.
2. WHEN una tarea transiciona a `EN_REVISION_DG`, THE Sistema SHALL enviar una notificación in-app al Operativo asignado indicando que su avance fue aprobado por el Director_Area y está en espera de aprobación final.
3. WHEN una tarea transiciona a `COMPLETADA` por aprobación de la Directora_General, THE Sistema SHALL enviar una notificación in-app al Operativo asignado indicando que su avance fue aprobado definitivamente.
4. WHEN una tarea transiciona a `COMPLETADA` por aprobación de la Directora_General, THE Sistema SHALL enviar una notificación in-app al Director_Area que creó el evento indicando que la tarea fue aprobada por la Directora General.
5. WHEN una tarea transiciona a `DEVUELTO` por devolución de la Directora_General, THE Sistema SHALL enviar una notificación in-app al Operativo asignado con el nombre de la tarea, el comentario de devolución y la indicación de que proviene del segundo nivel de revisión.
6. IF el servicio de notificaciones falla al enviar cualquier notificación del flujo de doble revisión, THEN THE Sistema SHALL registrar el error en el log del servidor y continuar la operación principal sin interrumpirla ni revertir la transacción de base de datos.
7. THE Sistema SHALL soportar los nuevos tipos de evento de notificación: `TAREA_EN_REVISION_DG`, `TAREA_APROBADA_N1`, `TAREA_COMPLETADA_DG`, `TAREA_DEVUELTA_DG`.

---

### Requirement 9: Compatibilidad con el Historial y Flujo Existentes

**User Story:** Como administrador del sistema, quiero que la nueva funcionalidad sea compatible con el historial y los endpoints existentes del flujo de primer nivel, para no romper la funcionalidad ya implementada.

#### Acceptance Criteria

1. THE Sistema SHALL mantener los endpoints existentes `enviarRevision`, `devolverTarea` y `listarHistorial` sin cambios en su contrato de API, de modo que los clientes existentes no requieran modificaciones para las operaciones de primer nivel.
2. THE Sistema SHALL extender el endpoint `aprobarTarea` existente para que, en lugar de transicionar a `COMPLETADA`, transicione a `EN_REVISION_DG` y ejecute las notificaciones del criterio 2.1 y 2.2 del Requirement 2.
3. WHEN el endpoint `listarHistorial` devuelve registros, THE Sistema SHALL incluir el campo `nivel_revision` en cada entrada, de modo que los clientes puedan distinguir entre acciones de primer y segundo nivel.
4. THE Sistema SHALL agregar los nuevos endpoints `aprobarTareaDG` y `devolverTareaDG` bajo las rutas `PATCH /eventos/:id/tareas/:tareaId/aprobar-dg` y `PATCH /eventos/:id/tareas/:tareaId/devolver-dg` respectivamente; la adición de estos endpoints y la migración de datos SHALL ser atómica: si la adición de endpoints falla, THE Sistema SHALL revertir los cambios de datos de la migración.
5. FOR ALL tareas que actualmente tienen estado `COMPLETADA` en la base de datos, THE Sistema SHALL conservar ese estado sin modificación al aplicar la migración, ya que representan tareas completadas bajo el flujo anterior de un solo nivel.
