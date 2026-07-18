# Documento de Requisitos

## Introducción

Este documento describe los requisitos para la funcionalidad **Módulos de Supervisión y Director** del Sistema de Gestión de Oficios — Oficialía de Partes del Gobierno del Estado de Quintana Roo.

### Módulo inicial del sistema

El módulo de **Oficialía de Partes** (recepción, registro y seguimiento de oficios) es el **módulo inicial y semilla** del sistema. Es el primer módulo funcional existente y sirve como referencia concreta del patrón extensible que seguirán todos los módulos futuros.

El catálogo de módulos (`tabla modulos`) se inicializa con Oficialía de Partes como dato semilla. En el futuro, otros módulos podrán integrarse siguiendo el mismo patrón, por ejemplo: **Recursos Humanos** (gestión de personal y expedientes), **Contratos** (seguimiento de contratos y licitaciones), **Transparencia** (solicitudes de acceso a la información) y **Jurídico** (asuntos legales y litigios), entre otros.

### Segundo módulo del sistema: Supervisión de Eventos

El módulo de **Supervisión de Eventos** es el **segundo módulo funcional** del sistema. Permite a la Directora General crear y gestionar eventos operativos internos, asignar tareas a los directores de área bajo su jerarquía, y supervisar el avance de cada tarea desde su panel. Los directores de área ven y actualizan únicamente las tareas que les fueron asignadas.

El catálogo de módulos se extiende con el registro de Supervisión de Eventos (`clave = 'supervision_eventos'`) como segundo dato semilla, siguiendo el mismo patrón extensible del módulo inicial.

### Capas de supervisión que agrega esta funcionalidad

1. **Panel de Gestión de Módulos (SuperAdmin)**: permite al Super Administrador ver todos los usuarios del sistema, conocer qué módulos tiene habilitado cada uno (incluyendo Oficialía de Partes y Supervisión de Eventos), y asignar o revocar el acceso a módulos de forma individual.

2. **Panel de Supervisión del Director General**: extiende el dashboard existente del Director para que pueda supervisar el estado y los pendientes de todos los módulos integrados al sistema. La tarjeta de **Oficialía de Partes** aparece como la primera tarjeta del panel por ser el módulo inicial. El diseño es extensible: cuando se agregue un nuevo módulo al sistema, el Director podrá verlo desde su panel sin necesidad de cambios estructurales.

---

## Glosario

- **SuperAdmin**: Usuario con rol `SUPERADMIN`. Tiene acceso irrestricto a todos los módulos del sistema y es el único que puede gestionar la asignación de módulos a otros usuarios.
- **Director**: Usuario con rol `DIRECTOR`. Corresponde a la Directora General, máxima autoridad del sistema. Tiene acceso al panel de supervisión general y es la única que puede crear eventos y asignar tareas a los directores de área.
- **Director_Area**: Usuario con rol `DIRECTOR` perteneciente a una de las tres direcciones de área subordinadas: Dirección de Informática, Innovación y Archivo; Dirección Jurídica; o Dirección Administrativa. Recibe tareas asignadas por la Directora General y actualiza su estado de avance.
- **Módulo**: Unidad funcional del sistema. Cada módulo puede estar habilitado o deshabilitado para un usuario específico. El módulo inicial del sistema es **Oficialía de Partes**; el segundo módulo es **Supervisión de Eventos**; módulos futuros previstos incluyen Recursos Humanos, Contratos, Transparencia y Jurídico.
- **Módulo_Registry**: Componente del backend que mantiene el catálogo de módulos registrados en el sistema y expone sus métricas de supervisión.
- **Asignacion_Modulo**: Registro que vincula un usuario con un módulo habilitado. Su ausencia implica que el módulo está deshabilitado para ese usuario.
- **Panel_SuperAdmin**: Vista del frontend correspondiente al dashboard del SuperAdmin (`Dashboard_SuperAdmin.tsx`).
- **Panel_Director**: Vista del frontend correspondiente al dashboard del Director (`Dashboard_Director.tsx`).
- **API_SuperAdmin**: Conjunto de endpoints bajo `/api/v1/superadmin` que sirven al Panel_SuperAdmin.
- **API_Director**: Conjunto de endpoints bajo `/api/v1/director` que sirven al Panel_Director.
- **Resumen_Modulo**: Objeto que describe el estado actual de un módulo: nombre, total de ítems activos, pendientes y alertas.
- **Evento**: Evento operativo interno creado por la Directora General. Agrupa un conjunto de tareas orientadas a cumplir un objetivo institucional. Tiene al menos los campos: `id`, `titulo`, `descripcion`, `fecha_creacion`, `creado_por_id` (FK a usuarios con rol DIRECTOR) y `estado` (`ABIERTO` o `CERRADO`).
- **Tarea_Evento**: Tarea asociada a un Evento, asignada a un Director_Area específico. Tiene al menos los campos: `id`, `evento_id` (FK a eventos), `titulo`, `descripcion`, `asignado_a_id` (FK a usuarios), `estado` (`PENDIENTE`, `EN_PROGRESO` o `COMPLETADA`) y `fecha_programada` (fecha límite).
- **API_Eventos**: Conjunto de endpoints bajo `/api/v1/eventos` que gestionan la creación de eventos, la administración de tareas y la supervisión del avance.
- **Panel_Eventos_Director**: Sección del Panel_Director dedicada a la supervisión de todos los eventos y sus tareas.
- **Panel_Tareas_Area**: Vista del frontend que muestra a cada Director_Area únicamente las tareas que le fueron asignadas y le permite actualizar su estado.

---

## Requisitos

---

### Requisito 1: Catálogo de módulos del sistema

**User Story:** Como SuperAdmin, quiero ver un catálogo de todos los módulos disponibles en el sistema, para poder gestionar el acceso de los usuarios a cada uno de ellos.

#### Criterios de Aceptación

1. THE Módulo_Registry SHALL mantener un catálogo persistente de módulos con al menos los campos: `id`, `clave` (slug único), `nombre_display`, `descripcion` y `activo`.
2. WHEN el SuperAdmin solicita el listado de módulos, THE API_SuperAdmin SHALL devolver todos los módulos registrados en el catálogo con su estado `activo`.
3. IF un módulo tiene `activo = false`, THEN THE API_SuperAdmin SHALL incluirlo en el listado con su estado indicado, sin ocultarlo.
4. THE Módulo_Registry SHALL garantizar que la clave de cada módulo sea única en el catálogo.

---

### Requisito 2: Gestión de módulos habilitados por usuario (SuperAdmin)

**User Story:** Como SuperAdmin, quiero ver qué módulos tiene habilitado cada usuario y poder asignar o revocar módulos individualmente, para controlar el acceso a las funcionalidades del sistema.

#### Criterios de Aceptación

1. WHEN el SuperAdmin solicita el detalle de un usuario, THE API_SuperAdmin SHALL devolver la lista de módulos del catálogo indicando, para cada uno, si está habilitado o no para ese usuario.
2. WHEN el SuperAdmin habilita un módulo para un usuario, THE API_SuperAdmin SHALL crear un registro de Asignacion_Modulo vinculando al usuario con el módulo y SHALL devolver el estado actualizado.
3. WHEN el SuperAdmin revoca un módulo a un usuario, THE API_SuperAdmin SHALL eliminar el registro de Asignacion_Modulo correspondiente y SHALL devolver el estado actualizado.
4. IF el SuperAdmin intenta habilitar un módulo que ya está habilitado para ese usuario, THEN THE API_SuperAdmin SHALL devolver un error HTTP 409 con un mensaje descriptivo.
5. IF el SuperAdmin intenta revocar un módulo que no está habilitado para ese usuario, THEN THE API_SuperAdmin SHALL devolver un error HTTP 404 con un mensaje descriptivo.
6. THE API_SuperAdmin SHALL restringir todos los endpoints de gestión de módulos exclusivamente al rol `SUPERADMIN`, devolviendo HTTP 403 para cualquier otro rol.
7. WHEN el SuperAdmin revoca el acceso a un módulo de su propia cuenta, THE API_SuperAdmin SHALL devolver un error HTTP 422 indicando que no es posible modificar los módulos de la propia sesión activa.

---

### Requisito 3: Vista de usuarios con módulos en el Panel SuperAdmin

**User Story:** Como SuperAdmin, quiero ver en mi panel una tabla de todos los usuarios del sistema con sus módulos habilitados, para tener visibilidad completa del acceso de cada persona.

#### Criterios de Aceptación

1. WHEN el Panel_SuperAdmin carga la sección de gestión de módulos, THE Panel_SuperAdmin SHALL mostrar una tabla con todos los usuarios del sistema incluyendo: nombre, email, rol, oficina y la lista de módulos habilitados para cada uno.
2. WHEN el SuperAdmin selecciona un usuario en la tabla, THE Panel_SuperAdmin SHALL mostrar un panel de detalle con los módulos del catálogo y el estado habilitado/deshabilitado de cada uno para ese usuario.
3. WHEN el SuperAdmin activa o desactiva un módulo desde el panel de detalle, THE Panel_SuperAdmin SHALL llamar al endpoint correspondiente de la API_SuperAdmin y SHALL reflejar el cambio en la UI sin recargar la página completa.
4. IF la llamada a la API_SuperAdmin falla al cambiar el estado de un módulo, THEN THE Panel_SuperAdmin SHALL mostrar un mensaje de error descriptivo sin alterar el estado visual previo del toggle.
5. THE Panel_SuperAdmin SHALL mostrar un indicador de carga mientras se obtienen o actualizan los datos de módulos.

---

### Requisito 4: Panel de supervisión de módulos del Director

**User Story:** Como Director General, quiero ver en mi panel el estado de todos los módulos integrados al sistema, para supervisar pendientes y alertas de cada área sin necesidad de acceder a cada módulo individualmente.

#### Criterios de Aceptación

1. WHEN el Director accede a la sección de supervisión de módulos, THE Panel_Director SHALL mostrar una tarjeta de resumen por cada módulo registrado en el Módulo_Registry con estado `activo = true`.
2. THE Panel_Director SHALL mostrar en cada tarjeta de módulo: nombre del módulo, total de ítems activos, cantidad de pendientes y cantidad de alertas críticas.
3. WHEN el Director solicita los datos de supervisión, THE API_Director SHALL devolver un arreglo de objetos Resumen_Modulo, uno por cada módulo activo registrado.
4. IF un módulo activo no puede calcular sus métricas en el momento de la consulta, THEN THE API_Director SHALL incluir el Resumen_Modulo de ese módulo con los campos numéricos en `null` y un campo `error` con un mensaje descriptivo, sin omitir el módulo del resultado.
5. THE API_Director SHALL restringir el endpoint de supervisión exclusivamente al rol `DIRECTOR`, devolviendo HTTP 403 para cualquier otro rol.
6. WHEN el Director actualiza el panel de supervisión, THE Panel_Director SHALL reflejar los datos más recientes obtenidos de la API_Director.

---

### Requisito 5: Extensibilidad del panel de supervisión

**User Story:** Como desarrollador del sistema, quiero que el panel de supervisión del Director sea extensible, para que al agregar un nuevo módulo al sistema el Director pueda verlo automáticamente sin cambios en el frontend.

#### Criterios de Aceptación

1. WHEN se registra un nuevo módulo en el Módulo_Registry con `activo = true`, THE API_Director SHALL incluir automáticamente el Resumen_Modulo de ese módulo en la respuesta del endpoint de supervisión sin requerir cambios en el código del Panel_Director.
2. THE Módulo_Registry SHALL exponer una interfaz de registro que permita a cada módulo del sistema declarar su función de cálculo de métricas (total activos, pendientes, alertas) al inicializarse.
3. WHEN el sistema arranca, THE Módulo_Registry SHALL registrar automáticamente todos los módulos que hayan declarado su función de métricas durante la inicialización.
4. IF un módulo no declara una función de métricas al registrarse, THEN THE Módulo_Registry SHALL registrar el módulo con una función de métricas que devuelve `{ activos: 0, pendientes: 0, alertas: 0 }` como valor por defecto.

---

### Requisito 6: Métricas del módulo de Oficialía de Partes para supervisión

**User Story:** Como Director General, quiero ver los pendientes y alertas del módulo de Oficialía de Partes en el panel de supervisión como la primera tarjeta del panel, para conocer el estado operativo del módulo inicial del sistema sin entrar a su vista detallada.

Este requisito es el **ejemplo concreto del patrón extensible** definido en el Requisito 5: Oficialía de Partes es el primer módulo en registrar su función de métricas en el Módulo_Registry. Los módulos futuros (Recursos Humanos, Contratos, Transparencia, etc.) seguirán exactamente el mismo patrón de registro y cálculo de métricas.

#### Criterios de Aceptación

1. WHEN el Módulo_Registry calcula las métricas del módulo de Oficialía de Partes, THE Módulo_Registry SHALL devolver como `activos` el total de oficios con estatus distinto de `FINALIZADO`.
2. WHEN el Módulo_Registry calcula las métricas del módulo de Oficialía de Partes, THE Módulo_Registry SHALL devolver como `pendientes` el total de oficios con estatus `RECIBIDO` o `ASIGNADO`.
3. WHEN el Módulo_Registry calcula las métricas del módulo de Oficialía de Partes, THE Módulo_Registry SHALL devolver como `alertas` el total de oficios con `tiene_termino = true`, estatus distinto de `FINALIZADO` y `fecha_vencimiento` menor o igual a la fecha actual.
4. IF la consulta a la base de datos para calcular las métricas del módulo de Oficialía de Partes falla, THEN THE Módulo_Registry SHALL propagar el error para que la API_Director lo capture y lo incluya en el campo `error` del Resumen_Modulo correspondiente.
5. WHEN el Panel_Director muestra las tarjetas de módulos, THE Panel_Director SHALL mostrar la tarjeta del módulo de Oficialía de Partes en la primera posición del panel de supervisión.

---

### Requisito 7: Persistencia y consistencia de asignaciones de módulos

**User Story:** Como administrador del sistema, quiero que las asignaciones de módulos a usuarios sean persistentes y consistentes en la base de datos, para garantizar que los cambios de acceso sobrevivan reinicios del sistema.

#### Criterios de Aceptación

1. THE Sistema SHALL almacenar las asignaciones de módulos en una tabla `usuario_modulos` con al menos los campos: `usuario_id` (FK a `usuarios`), `modulo_id` (FK al catálogo de módulos), `asignado_en` (timestamp) y `asignado_por_id` (FK a `usuarios`).
2. THE Sistema SHALL almacenar el catálogo de módulos en una tabla `modulos` con al menos los campos: `id`, `clave` (único), `nombre_display`, `descripcion` y `activo`. El script de inicialización de la base de datos SHALL incluir como datos semilla: el registro del módulo de Oficialía de Partes con `clave = 'oficialia_partes'`, `nombre_display = 'Oficialía de Partes'` y `activo = true`; y el registro del módulo de Supervisión de Eventos con `clave = 'supervision_eventos'`, `nombre_display = 'Supervisión de Eventos'` y `activo = true`.
3. THE Sistema SHALL aplicar una restricción de unicidad sobre el par `(usuario_id, modulo_id)` en la tabla `usuario_modulos` para evitar duplicados.
4. WHEN se elimina un usuario del sistema, THE Sistema SHALL eliminar en cascada todos los registros de `usuario_modulos` asociados a ese usuario.
5. WHEN se desactiva un módulo en el catálogo (`activo = false`), THE Sistema SHALL conservar los registros de `usuario_modulos` existentes para ese módulo sin eliminarlos, de modo que puedan restaurarse si el módulo se reactiva.

---

### Requisito 8: Seguridad y autorización de los nuevos endpoints

**User Story:** Como administrador de seguridad, quiero que los nuevos endpoints estén protegidos por autenticación JWT y verificación de rol, para evitar accesos no autorizados.

#### Criterios de Aceptación

1. THE API_SuperAdmin SHALL requerir un token JWT válido en el encabezado `Authorization: Bearer <token>` para todos sus endpoints, devolviendo HTTP 401 si el token está ausente o es inválido.
2. THE API_Director SHALL requerir un token JWT válido en el encabezado `Authorization: Bearer <token>` para todos sus endpoints, devolviendo HTTP 401 si el token está ausente o es inválido.
3. IF un usuario autenticado con rol distinto de `SUPERADMIN` accede a cualquier endpoint de la API_SuperAdmin de gestión de módulos, THEN THE API_SuperAdmin SHALL devolver HTTP 403.
4. IF un usuario autenticado con rol distinto de `DIRECTOR` accede al endpoint de supervisión de módulos de la API_Director, THEN THE API_Director SHALL devolver HTTP 403.
5. WHEN el SuperAdmin consulta la lista de usuarios con sus módulos, THE API_SuperAdmin SHALL devolver únicamente los campos necesarios para la gestión (id, nombre, email, rol, oficina, módulos habilitados), sin exponer `password_hash` ni datos sensibles.

---

### Requisito 9: Gestión de eventos operativos

**User Story:** Como Directora General, quiero crear eventos operativos y agregarles tareas asignadas a directores de área, para coordinar el cumplimiento de objetivos institucionales desde mi panel.

#### Criterios de Aceptación

1. WHEN la Directora General envía una solicitud de creación de evento con `titulo`, `descripcion` y al menos una tarea, THE API_Eventos SHALL crear el Evento con `estado = 'ABIERTO'`, registrar las tareas asociadas y devolver el evento creado con sus tareas.
2. WHEN la Directora General agrega una tarea a un evento existente, THE API_Eventos SHALL crear la Tarea_Evento con `estado = 'PENDIENTE'`, vinculada al evento y al Director_Area indicado, y SHALL devolver la tarea creada.
3. IF la Directora General intenta crear un evento sin `titulo`, THEN THE API_Eventos SHALL devolver HTTP 422 con un mensaje descriptivo indicando que el título es obligatorio.
4. IF la Directora General intenta asignar una tarea a un usuario que no tiene rol `DIRECTOR` o que no pertenece a ninguna de las tres direcciones de área reconocidas, THEN THE API_Eventos SHALL devolver HTTP 422 con un mensaje descriptivo.
5. THE API_Eventos SHALL restringir la creación de eventos y la asignación de tareas exclusivamente al rol `DIRECTOR` con perfil de Directora General, devolviendo HTTP 403 para cualquier otro rol.
6. WHEN la Directora General cierra un evento, THE API_Eventos SHALL actualizar el `estado` del Evento a `'CERRADO'` y SHALL devolver el evento actualizado.
7. IF la Directora General intenta cerrar un evento que ya tiene `estado = 'CERRADO'`, THEN THE API_Eventos SHALL devolver HTTP 409 con un mensaje descriptivo.

---

### Requisito 10: Ciclo de vida de tareas de evento

**User Story:** Como Director de Área, quiero actualizar el estado de avance de las tareas que me fueron asignadas, para que la Directora General pueda supervisar el progreso en tiempo real.

#### Criterios de Aceptación

1. THE Sistema SHALL gestionar el ciclo de vida de cada Tarea_Evento mediante los estados: `PENDIENTE` → `EN_PROGRESO` → `COMPLETADA`, en ese orden secuencial.
2. WHEN un Director_Area actualiza el estado de una tarea asignada a él, THE API_Eventos SHALL validar que la transición de estado sea válida (PENDIENTE→EN_PROGRESO o EN_PROGRESO→COMPLETADA) y SHALL persistir el nuevo estado.
3. IF un Director_Area intenta realizar una transición de estado no permitida (por ejemplo, de COMPLETADA a PENDIENTE), THEN THE API_Eventos SHALL devolver HTTP 422 con un mensaje descriptivo indicando la transición inválida.
4. IF un Director_Area intenta actualizar el estado de una tarea que no le fue asignada, THEN THE API_Eventos SHALL devolver HTTP 403.
5. THE Sistema SHALL almacenar en cada Tarea_Evento una `fecha_programada` (fecha límite) obligatoria al momento de la creación de la tarea.
6. IF se intenta crear una Tarea_Evento sin `fecha_programada`, THEN THE API_Eventos SHALL devolver HTTP 422 con un mensaje descriptivo indicando que la fecha programada es obligatoria.
7. WHEN un Director_Area actualiza el estado de una tarea, THE API_Eventos SHALL registrar la `fecha_actualizacion` con el timestamp del momento del cambio.

---

### Requisito 11: Supervisión de eventos por la Directora General

**User Story:** Como Directora General, quiero ver desde mi panel el avance de todos los eventos y sus tareas, incluyendo alertas de tareas vencidas o próximas a vencer, para tomar decisiones oportunas.

#### Criterios de Aceptación

1. WHEN la Directora General solicita el listado de eventos, THE API_Eventos SHALL devolver todos los eventos con su `estado`, la cantidad total de tareas, la cantidad de tareas por estado (`PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`) y la cantidad de tareas vencidas.
2. WHEN la Directora General solicita el detalle de un evento, THE API_Eventos SHALL devolver el evento con la lista completa de sus Tarea_Evento, incluyendo para cada tarea: `titulo`, `estado`, `fecha_programada`, `fecha_actualizacion` y el nombre del Director_Area asignado.
3. THE API_Eventos SHALL considerar una tarea como **vencida** cuando su `fecha_programada` sea menor a la fecha actual y su `estado` sea distinto de `COMPLETADA`.
4. THE API_Eventos SHALL considerar una tarea como **próxima a vencer** cuando su `fecha_programada` esté dentro de los próximos 3 días naturales y su `estado` sea distinto de `COMPLETADA`.
5. WHEN la Directora General solicita el listado de eventos, THE API_Eventos SHALL incluir en cada evento el conteo de tareas vencidas y el conteo de tareas próximas a vencer.
6. THE Panel_Eventos_Director SHALL mostrar una alerta visual diferenciada para los eventos que contengan al menos una tarea vencida.
7. THE API_Eventos SHALL restringir el acceso al listado completo de eventos y sus métricas exclusivamente al rol `DIRECTOR`, devolviendo HTTP 403 para cualquier otro rol.

---

### Requisito 12: Vista de tareas asignadas para directores de área

**User Story:** Como Director de Área, quiero ver únicamente las tareas que me fueron asignadas y poder actualizar su estado, para gestionar mis responsabilidades sin acceder a información de otras áreas.

#### Criterios de Aceptación

1. WHEN un Director_Area solicita sus tareas, THE API_Eventos SHALL devolver únicamente las Tarea_Evento cuyo `asignado_a_id` corresponda al usuario autenticado.
2. THE Panel_Tareas_Area SHALL mostrar para cada tarea asignada: el título del evento al que pertenece, el título de la tarea, el estado actual, la fecha programada y un indicador visual si la tarea está vencida o próxima a vencer.
3. WHEN un Director_Area actualiza el estado de una tarea desde el Panel_Tareas_Area, THE Panel_Tareas_Area SHALL llamar al endpoint correspondiente de la API_Eventos y SHALL reflejar el nuevo estado en la UI sin recargar la página completa.
4. IF la llamada a la API_Eventos falla al actualizar el estado de una tarea, THEN THE Panel_Tareas_Area SHALL mostrar un mensaje de error descriptivo sin alterar el estado visual previo de la tarea.
5. THE Panel_Tareas_Area SHALL permitir filtrar las tareas por estado (`PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`) y por evento.
6. THE API_Eventos SHALL requerir un token JWT válido en el encabezado `Authorization: Bearer <token>` para todos sus endpoints, devolviendo HTTP 401 si el token está ausente o es inválido.

---

### Requisito 13: Métricas del módulo de Supervisión de Eventos para el panel del Director

**User Story:** Como Directora General, quiero ver en la tarjeta de Supervisión de Eventos del panel de supervisión el resumen de eventos activos, tareas pendientes y alertas, para tener visibilidad inmediata del estado del módulo.

#### Criterios de Aceptación

1. WHEN el Módulo_Registry calcula las métricas del módulo de Supervisión de Eventos, THE Módulo_Registry SHALL devolver como `activos` el total de eventos con `estado = 'ABIERTO'`.
2. WHEN el Módulo_Registry calcula las métricas del módulo de Supervisión de Eventos, THE Módulo_Registry SHALL devolver como `pendientes` el total de Tarea_Evento con `estado` distinto de `COMPLETADA` pertenecientes a eventos con `estado = 'ABIERTO'`.
3. WHEN el Módulo_Registry calcula las métricas del módulo de Supervisión de Eventos, THE Módulo_Registry SHALL devolver como `alertas` el total de Tarea_Evento con `estado` distinto de `COMPLETADA`, `fecha_programada` menor o igual a la fecha actual y pertenecientes a eventos con `estado = 'ABIERTO'`.
4. IF la consulta a la base de datos para calcular las métricas del módulo de Supervisión de Eventos falla, THEN THE Módulo_Registry SHALL propagar el error para que la API_Director lo capture y lo incluya en el campo `error` del Resumen_Modulo correspondiente.
5. WHEN el Panel_Director muestra las tarjetas de módulos, THE Panel_Director SHALL mostrar la tarjeta del módulo de Supervisión de Eventos en la segunda posición del panel de supervisión, después de la tarjeta de Oficialía de Partes.
