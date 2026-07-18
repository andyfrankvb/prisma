# Documento de Requisitos — Seguimiento de Trámites

## Introducción

El módulo **Seguimiento de Trámites** (`tramites-seguimiento`) es un sistema de tickets para gestionar trámites jurídicos entre las delegaciones del organismo y la Dirección Jurídica. Permite a los delegados (DIRECTOR de una delegación) o a su personal designado crear solicitudes formales (trámites), que son revisadas y aprobadas por el Director Jurídico (Oscar Gopar, `unidad_id=36`), y finalmente cerradas por el personal operativo de TICS (Claudina, `unidad_id=35`). La Directora General (Mariann, `unidad_id=34`) tiene visibilidad total del sistema.

El módulo se registra en la tabla `modulos` con la clave `tramites_seguimiento` y se asigna a los usuarios relevantes mediante la tabla `usuario_modulos`, siguiendo el patrón establecido por los módulos existentes.

---

## Glosario

- **Sistema**: El módulo Seguimiento de Trámites en su conjunto.
- **Tramite**: Solicitud formal creada por un Delegado o su representante, que sigue un flujo de estados hasta su cierre.
- **Creador**: Usuario con rol DIRECTOR de una delegación (tipo `DELEGACION`) o usuario OPERATIVO designado por ese director, que crea un trámite.
- **Revisor**: Oscar Gopar, Director Jurídico (`unidad_id=36`, rol DIRECTOR), responsable de revisar y aprobar o rechazar trámites.
- **Finalizador**: Claudina, usuario OPERATIVO de la Dirección de TICS (`unidad_id=35`), responsable de cerrar los trámites aprobados.
- **Supervisora**: Mariann, Directora General (`unidad_id=34`, rol DIRECTOR de tipo `DIRECCION_GENERAL`), con visibilidad de lectura sobre todos los trámites.
- **Fecha_Compromiso**: Fecha límite de resolución que el Revisor establece al aprobar un trámite.
- **Comentario_Tramite**: Texto libre que cualquier participante puede agregar a un trámite para registrar avances o aclaraciones.
- **Tipo_Tramite**: Categoría del trámite seleccionada de un catálogo predefinido (ej. "Convenio", "Contrato", "Consulta Jurídica", "Otro").
- **Documento_Adjunto**: Archivo (PDF, Word, imagen) que el Creador puede adjuntar al crear o actualizar un trámite.
- **Folio_Tramite**: Identificador único generado automáticamente por el Sistema al crear un trámite. Formato: `TRM-{UNIDAD_ID}-{AÑO}-{SECUENCIA_4_DIGITOS}`.
- **Auditoria_Tramite**: Registro inmutable de cada cambio de estado de un trámite, incluyendo quién lo realizó y cuándo.
- **Numero_Ticket**: Identificador alfanumérico ingresado manualmente por el Creador al momento de crear el trámite, distinto del Folio_Tramite generado por el Sistema.
- **Fecha_Registro**: Marca de tiempo generada automáticamente por el Sistema al momento de crear el trámite; no es editable por ningún usuario.
- **Checklist_Documentacion**: Confirmación obligatoria de que la documentación está correctamente adjunta al ID del trámite. Debe estar marcada para poder enviar el formulario de creación.
- **Checklist_Proyecto**: Confirmación obligatoria de que el proyecto de resolución fue remitido a la Dirección Jurídica por correo electrónico. Debe estar marcada para poder enviar el formulario de creación.
- **DEVUELTO_DELEGADO**: Estado en que el ticket ha sido regresado por el Revisor al Creador por información incompleta o requisitos no cumplidos.
- **DEVUELTO_JURIDICO**: Estado en que el ticket ha sido regresado por el Finalizador al Revisor porque el trámite no está listo para cierre.

---

## Requisitos

### Requisito 1: Creación de Trámites

**Historia de usuario:** Como Delegado (o su representante designado), quiero crear un trámite con número de ticket, datos del solicitante, tipo, documentos adjuntos y confirmaciones de checklist, para que la Dirección Jurídica pueda revisarlo formalmente.

#### Criterios de Aceptación

1. WHEN un usuario autenticado con rol DIRECTOR de una unidad de tipo `DELEGACION` envía una solicitud de creación de trámite con los campos obligatorios completos, THE Sistema SHALL crear el trámite con estatus `NUEVO`, asignar un `Folio_Tramite` único, registrar la `Fecha_Registro` con la marca de tiempo actual y persistir todos los campos del formulario.
2. WHEN un usuario autenticado con rol OPERATIVO cuya `unidad_id` corresponde a una delegación envía una solicitud de creación de trámite, THE Sistema SHALL crear el trámite en nombre de esa delegación con las mismas reglas del criterio anterior.
3. THE Sistema SHALL generar el `Folio_Tramite` con el formato `TRM-{unidad_id}-{año}-{secuencia_4_digitos}`, garantizando unicidad dentro de la tabla `tramites`.
4. THE Sistema SHALL aceptar en el formulario de creación los siguientes campos: `numero_ticket` (texto, obligatorio, ingresado por el Creador), `nombre_solicitante` (texto, obligatorio), `correo_solicitante` (correo electrónico válido, obligatorio), `telefono_solicitante` (texto, obligatorio), `titulo` (texto, obligatorio), `descripcion` (texto, obligatorio), `tipo_tramite` (valor del catálogo, obligatorio), `checklist_documentacion` (booleano, obligatorio), `checklist_proyecto` (booleano, obligatorio), `comentarios` (texto libre, opcional).
5. WHEN el cuerpo de la solicitud de creación no incluye alguno de los campos obligatorios (`numero_ticket`, `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `titulo`, `descripcion`, `tipo_tramite`), THE Sistema SHALL rechazar la solicitud con código HTTP 422 y un mensaje descriptivo por cada campo faltante.
6. IF el campo `checklist_documentacion` o el campo `checklist_proyecto` no están marcados como `true` en la solicitud de creación, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 indicando cuál checklist no fue confirmado.
7. THE Sistema SHALL almacenar la `Fecha_Registro` automáticamente al momento de crear el trámite y no exponer ningún endpoint que permita modificar este campo.
8. WHERE el Creador adjunta uno o más archivos al crear el trámite, THE Sistema SHALL almacenar cada archivo en el servicio de almacenamiento existente bajo la ruta `tramites/adjuntos/` y registrar la ruta en la tabla `tramite_documentos`.
9. IF el archivo adjunto supera 10 MB o no es de tipo PDF, Word o imagen (JPEG, PNG), THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 y un mensaje que indique el límite o los tipos permitidos.
10. WHEN el trámite es creado exitosamente, THE Sistema SHALL enviar una notificación in-app al Revisor (Director Jurídico, `unidad_id=36`) indicando el folio y el título del nuevo trámite.
11. THE Sistema SHALL registrar en `auditoria_tramites` la transición de estado `null → NUEVO` con el `usuario_id` del Creador y la marca de tiempo.

---

### Requisito 2: Listado y Visibilidad de Trámites

**Historia de usuario:** Como usuario del módulo, quiero ver únicamente los trámites que me corresponden según mi rol, para mantener la confidencialidad y el enfoque operativo.

#### Criterios de Aceptación

1. WHEN un usuario con rol DIRECTOR de una delegación solicita el listado de trámites, THE Sistema SHALL devolver únicamente los trámites cuyo `unidad_creadora_id` coincide con la `unidad_id` de ese usuario.
2. WHEN un usuario con rol OPERATIVO de una delegación solicita el listado de trámites, THE Sistema SHALL devolver únicamente los trámites cuyo `unidad_creadora_id` coincide con la `unidad_id` de ese usuario.
3. WHEN el Revisor (Director Jurídico, `unidad_id=36`) solicita el listado de trámites, THE Sistema SHALL devolver todos los trámites del sistema independientemente de su unidad de origen.
4. WHEN el Finalizador (OPERATIVO, `unidad_id=35`) solicita el listado de trámites, THE Sistema SHALL devolver únicamente los trámites con estatus `EN_PROCESO`.
5. WHEN la Supervisora (DIRECTOR, `unidad_id=34`) solicita el listado de trámites, THE Sistema SHALL devolver todos los trámites del sistema independientemente de su estatus o unidad de origen.
6. WHEN un usuario no autorizado (rol o unidad sin acceso al módulo) solicita el listado de trámites, THE Sistema SHALL rechazar la solicitud con código HTTP 403.
7. THE Sistema SHALL soportar filtrado del listado por `estatus`, `tipo_tramite` y rango de `fecha_creacion` mediante parámetros de consulta opcionales.
8. THE Sistema SHALL devolver el listado paginado con los parámetros `page` y `limit`, con un máximo de 100 registros por página.

---

### Requisito 3: Revisión de Trámites por el Director Jurídico

**Historia de usuario:** Como Director Jurídico (Oscar Gopar), quiero revisar los trámites recibidos y ejecutar una de tres acciones explícitas —turnar a TICS, regresar al delegado o rechazar definitivamente—, cada una con comentario obligatorio, para gestionar formalmente las solicitudes de las delegaciones.

#### Criterios de Aceptación

1. WHEN el Revisor solicita el detalle de un trámite con estatus `NUEVO` o `EN_REVISION`, THE Sistema SHALL devolver el trámite completo incluyendo título, descripción, tipo, datos del solicitante, documentos adjuntos, comentarios y el historial de auditoría.

**Acción 1 — Aprobar y turnar a Claudina (botón "Turnar a TICS")**

2. WHEN el Revisor envía una acción de aprobación sobre un trámite con estatus `NUEVO` o `EN_REVISION`, incluyendo un comentario no vacío y una `fecha_compromiso` válida (fecha futura), THE Sistema SHALL actualizar el estatus del trámite a `EN_PROCESO`, registrar la `fecha_compromiso` y notificar al Finalizador (Claudina, `unidad_id=35`) con el folio, título y `fecha_compromiso`.
3. IF el Revisor envía una acción de aprobación sin comentario o con comentario vacío, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que el comentario es obligatorio.
4. IF el Revisor envía una acción de aprobación sin incluir `fecha_compromiso` o con una fecha en el pasado, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 y un mensaje descriptivo.

**Acción 2 — Regresar al delegado**

5. WHEN el Revisor envía una acción de devolución sobre un trámite con estatus `NUEVO` o `EN_REVISION`, incluyendo un comentario no vacío que explique qué información falta o qué requisito no se cumple, THE Sistema SHALL actualizar el estatus del trámite a `DEVUELTO_DELEGADO` y notificar al Creador del trámite con el folio y el comentario del Revisor.
6. IF el Revisor envía una acción de devolución al delegado sin comentario o con comentario vacío, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que el comentario es obligatorio.

**Acción 3 — Rechazar definitivamente**

7. WHEN el Revisor envía una acción de rechazo sobre un trámite con estatus `NUEVO` o `EN_REVISION`, incluyendo un comentario no vacío con la justificación del rechazo, THE Sistema SHALL actualizar el estatus del trámite a `RECHAZADO` y notificar al Creador del trámite con el nuevo estatus, el folio y el comentario de justificación.
8. IF el Revisor envía una acción de rechazo sin comentario o con comentario vacío, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que el comentario es obligatorio.

**Reglas generales**

9. THE Sistema SHALL requerir comentario no vacío en las tres acciones (aprobar, regresar y rechazar); cualquier acción enviada sin comentario SHALL ser rechazada con código HTTP 422.
10. WHEN el Revisor agrega un comentario a cualquier trámite visible para él, THE Sistema SHALL persistir el comentario en `comentarios_tramite` con el `autor_id`, `contenido` y `creado_en`.
11. THE Sistema SHALL registrar en `auditoria_tramites` cada transición de estado con el `estado_anterior`, `estado_nuevo`, `usuario_id` del Revisor, `fecha_cambio` y el comentario obligatorio de la acción ejecutada.

---

### Requisito 4: Finalización de Trámites

**Historia de usuario:** Como Claudina (OPERATIVO de TICS), quiero marcar los trámites aprobados como finalizados, agregar comentarios de cierre o devolverlos al Revisor cuando algo no esté listo, para gestionar formalmente la conclusión del proceso.

#### Criterios de Aceptación

1. WHEN el Finalizador solicita el detalle de un trámite con estatus `EN_PROCESO`, THE Sistema SHALL devolver el trámite completo incluyendo la `fecha_compromiso`, datos del solicitante, documentos adjuntos y comentarios.
2. WHEN el Finalizador presiona el botón "Cerrar Proceso" en el frontend y envía la acción de finalización sobre un trámite con estatus `EN_PROCESO`, incluyendo un comentario de cierre no vacío, THE Sistema SHALL actualizar el estatus del trámite a `FINALIZADO` y registrar automáticamente la `fecha_cierre` con la marca de tiempo del momento en que se ejecuta la acción; la `fecha_cierre` no es ingresada por el usuario.
3. IF el Finalizador envía la acción de finalización (botón "Cerrar Proceso") sin comentario de cierre o con comentario vacío, THEN THE Sistema SHALL rechazar la acción con código HTTP 422.
4. IF el Finalizador intenta finalizar un trámite con estatus distinto a `EN_PROCESO`, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar el estatus actual del trámite.
5. WHEN el Finalizador envía una acción de devolución sobre un trámite con estatus `EN_PROCESO`, incluyendo un comentario no vacío que explique por qué no está listo para cierre, THE Sistema SHALL actualizar el estatus del trámite a `DEVUELTO_JURIDICO`.
6. IF el Finalizador envía una acción de devolución al Revisor sin comentario de justificación, THEN THE Sistema SHALL rechazar la acción con código HTTP 422.
7. WHEN un trámite es finalizado, THE Sistema SHALL enviar una notificación in-app al Creador del trámite y al Revisor indicando que el trámite ha sido cerrado, incluyendo el folio y la fecha de cierre.
8. WHEN el estatus de un trámite cambia a `DEVUELTO_JURIDICO`, THE Sistema SHALL enviar una notificación in-app al Revisor (Oscar Gopar, `unidad_id=36`) indicando el folio y el comentario del Finalizador.
9. THE Sistema SHALL registrar en `auditoria_tramites` cada transición de estado con el `usuario_id` del Finalizador, la marca de tiempo y el comentario asociado cuando aplique.

---

### Requisito 5: Flujo de Estados y Transiciones Válidas

**Historia de usuario:** Como sistema, quiero garantizar que los trámites solo puedan transicionar entre estados permitidos, para mantener la integridad del proceso.

#### Criterios de Aceptación

1. THE Sistema SHALL implementar el siguiente flujo de estados con las transiciones válidas:
   - `NUEVO → EN_REVISION` (el Revisor abre el trámite)
   - `EN_REVISION → EN_PROCESO` (el Revisor aprueba con `fecha_compromiso`)
   - `EN_REVISION → RECHAZADO` (el Revisor rechaza definitivamente, comentario obligatorio)
   - `EN_REVISION → DEVUELTO_DELEGADO` (el Revisor devuelve al Creador por requisitos incompletos, comentario obligatorio)
   - `DEVUELTO_DELEGADO → NUEVO` (el Creador corrige y reenvía)
   - `EN_PROCESO → FINALIZADO` (el Finalizador cierra con comentario de cierre obligatorio)
   - `EN_PROCESO → DEVUELTO_JURIDICO` (el Finalizador devuelve al Revisor porque no está listo, comentario obligatorio)
   - `DEVUELTO_JURIDICO → EN_PROCESO` (el Revisor resuelve y reenvía al Finalizador con comentario)
2. WHEN el Revisor abre el detalle de un trámite con estatus `NUEVO`, THE Sistema SHALL actualizar automáticamente el estatus a `EN_REVISION` y registrar la transición en `auditoria_tramites`.
3. IF cualquier actor intenta realizar una transición de estado no incluida en las transiciones válidas del criterio 1, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 e indicar la transición inválida.
4. THE Sistema SHALL garantizar que las transiciones de estado se ejecuten dentro de una transacción de base de datos, de modo que el cambio de estatus y el registro de auditoría sean atómicos.
5. FOR ALL trámites en el sistema, el campo `estatus` SHALL corresponder a uno de los valores del enum `estatus_tramite`: `NUEVO`, `EN_REVISION`, `EN_PROCESO`, `FINALIZADO`, `RECHAZADO`, `DEVUELTO_DELEGADO`, `DEVUELTO_JURIDICO`.
6. THE Sistema SHALL permitir que un trámite sea devuelto y reenviado sin límite de veces, siempre que cada devolución siga una transición válida del flujo definido en el criterio 1.
7. THE Sistema SHALL registrar en `auditoria_tramites` cada devolución con el `usuario_id` del actor que la realizó, la marca de tiempo y el comentario obligatorio que explica el motivo.

---

### Requisito 6: Comentarios en Trámites

**Historia de usuario:** Como participante del proceso, quiero agregar comentarios a un trámite para registrar avances, aclaraciones o decisiones a lo largo del flujo.

#### Criterios de Aceptación

1. WHEN el Creador del trámite agrega un comentario a un trámite de su delegación, THE Sistema SHALL persistir el comentario con `autor_id`, `contenido` y `creado_en`.
2. WHEN el Revisor agrega un comentario a cualquier trámite visible para él, THE Sistema SHALL persistir el comentario con `autor_id`, `contenido` y `creado_en`.
3. WHEN el Finalizador agrega un comentario a un trámite con estatus `EN_PROCESO`, THE Sistema SHALL persistir el comentario con `autor_id`, `contenido` y `creado_en`.
4. IF un usuario intenta agregar un comentario a un trámite que no tiene permiso de ver, THEN THE Sistema SHALL rechazar la acción con código HTTP 403.
5. IF el contenido del comentario está vacío o contiene solo espacios en blanco, THEN THE Sistema SHALL rechazar la acción con código HTTP 422.
6. THE Sistema SHALL devolver los comentarios de un trámite ordenados por `creado_en` ascendente, incluyendo el `autor_nombre` de cada comentario.

---

### Requisito 7: Registro del Módulo y Asignación de Accesos

**Historia de usuario:** Como administrador del sistema, quiero que el módulo `tramites_seguimiento` esté registrado en la tabla `modulos` y asignado a los usuarios relevantes, para que aparezca en la pantalla de selección de módulo.

#### Criterios de Aceptación

1. THE Sistema SHALL registrar el módulo con clave `tramites_seguimiento`, nombre `Seguimiento de Trámites` y `orden=3` en la tabla `modulos` mediante un script SQL idempotente.
2. THE Sistema SHALL asignar el módulo a los usuarios con rol DIRECTOR de unidades de tipo `DELEGACION` (delegados), al Revisor (`unidad_id=36`), al Finalizador (`unidad_id=35`) y a la Supervisora (`unidad_id=34`) mediante registros en `usuario_modulos`.
3. WHEN un usuario con el módulo asignado inicia sesión y selecciona `tramites_seguimiento`, THE Sistema SHALL redirigirlo al dashboard correspondiente a su rol dentro del módulo.
4. THE Sistema SHALL registrar la función de métricas del módulo en el `ModuleRegistry` al arrancar el servidor, reportando: `activos` (trámites en `NUEVO`, `EN_REVISION`, `EN_PROCESO`, `DEVUELTO_DELEGADO` o `DEVUELTO_JURIDICO`), `pendientes` (trámites en `NUEVO` o `DEVUELTO_DELEGADO`), `alertas` (trámites en `EN_PROCESO` con `fecha_compromiso` anterior a la fecha actual).

---

### Requisito 8: Auditoría e Historial de Cambios

**Historia de usuario:** Como supervisor o auditor, quiero consultar el historial completo de cambios de estado de un trámite, para tener trazabilidad del proceso.

#### Criterios de Aceptación

1. THE Sistema SHALL mantener una tabla `auditoria_tramites` con los campos: `id`, `tramite_id`, `estado_anterior` (nullable), `estado_nuevo`, `usuario_id`, `comentario` (nullable), `fecha_cambio`.
2. WHEN se solicita el detalle de un trámite, THE Sistema SHALL incluir el historial de auditoría ordenado por `fecha_cambio` ascendente, con el `nombre` del usuario que realizó cada cambio.
3. THE Sistema SHALL garantizar que ningún registro de `auditoria_tramites` pueda ser modificado o eliminado mediante las operaciones normales de la API (solo INSERT, nunca UPDATE ni DELETE sobre esta tabla desde la API).
4. FOR ALL trámites, el primer registro de `auditoria_tramites` SHALL tener `estado_anterior = NULL` y `estado_nuevo = 'NUEVO'`, correspondiendo a la creación del trámite.

---

### Requisito 9: Notificaciones

**Historia de usuario:** Como participante del proceso, quiero recibir notificaciones in-app cuando ocurran eventos relevantes en los trámites que me conciernen, para estar informado sin necesidad de revisar manualmente el sistema.

#### Criterios de Aceptación

1. WHEN se crea un nuevo trámite, THE Sistema SHALL enviar una notificación in-app al Revisor con el folio y título del trámite.
2. WHEN un trámite es aprobado (transición a `EN_PROCESO`), THE Sistema SHALL enviar notificaciones in-app al Creador del trámite y al Finalizador.
3. WHEN un trámite es rechazado (transición a `RECHAZADO`), THE Sistema SHALL enviar una notificación in-app al Creador del trámite con el motivo del rechazo.
4. WHEN un trámite es finalizado (transición a `FINALIZADO`), THE Sistema SHALL enviar notificaciones in-app al Creador del trámite y al Revisor.
5. WHEN un trámite transiciona a `DEVUELTO_DELEGADO`, THE Sistema SHALL enviar una notificación in-app al Creador del trámite con el folio y el comentario del Revisor que indica los requisitos faltantes.
6. WHEN un trámite transiciona a `DEVUELTO_JURIDICO`, THE Sistema SHALL enviar una notificación in-app al Revisor (Oscar Gopar, `unidad_id=36`) con el folio y el comentario del Finalizador.
7. IF el servicio de notificaciones falla al enviar una notificación, THEN THE Sistema SHALL registrar el error en el log del servidor y continuar la operación principal sin interrumpirla.
8. THE Sistema SHALL utilizar el canal de notificaciones in-app existente (`inapp.channel.ts`) y el dispatcher (`notification.dispatcher.ts`) para enviar todas las notificaciones del módulo.
9. THE Sistema SHALL soportar los tipos de notificación: `TRAMITE_NUEVO`, `TRAMITE_APROBADO`, `TRAMITE_RECHAZADO`, `TRAMITE_FINALIZADO`, `TRAMITE_DEVUELTO_DELEGADO`, `TRAMITE_DEVUELTO_JURIDICO`.

---

### Requisito 10: Corrección de Trámites Devueltos al Delegado

**Historia de usuario:** Como Delegado (o su representante designado), quiero poder editar y corregir un trámite que me fue devuelto por el Director Jurídico, para subsanar los requisitos faltantes y reenviarlo sin necesidad de crear un nuevo ticket.

#### Criterios de Aceptación

1. WHEN el Creador solicita el detalle de un trámite con estatus `DEVUELTO_DELEGADO`, THE Sistema SHALL devolver el trámite completo incluyendo el comentario del Revisor que indica los requisitos faltantes y el historial de auditoría.
2. WHEN el Creador envía una solicitud de actualización sobre un trámite con estatus `DEVUELTO_DELEGADO`, THE Sistema SHALL permitir la modificación de los campos: `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `checklist_documentacion`, `checklist_proyecto` y `comentarios`.
3. IF el Creador intenta modificar los campos `numero_ticket`, `titulo`, `tipo_tramite` o `fecha_registro` de un trámite en cualquier estatus, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando que esos campos no son editables.
4. WHERE el Creador adjunta nuevos documentos a un trámite con estatus `DEVUELTO_DELEGADO`, THE Sistema SHALL almacenar cada archivo bajo la ruta `tramites/adjuntos/` y registrar la ruta en `tramite_documentos`, conservando los documentos previamente adjuntos.
5. WHEN el Creador envía una acción de reenvío sobre un trámite con estatus `DEVUELTO_DELEGADO`, con ambos checklists marcados como `true`, THE Sistema SHALL actualizar el estatus del trámite a `NUEVO` para que el Revisor lo procese nuevamente.
6. IF el Creador envía una acción de reenvío con `checklist_documentacion` o `checklist_proyecto` sin marcar, THEN THE Sistema SHALL rechazar la acción con código HTTP 422 indicando cuál checklist no fue confirmado.
7. THE Sistema SHALL registrar en `auditoria_tramites` la transición `DEVUELTO_DELEGADO → NUEVO` con el `usuario_id` del Creador, la marca de tiempo y el comentario opcional que el Creador agregue al reenviar.
