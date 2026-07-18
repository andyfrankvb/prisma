# Documento de Requisitos — Configuración de Flujos por Módulo

## Introducción

El sistema cuenta con tres módulos operativos: **Oficialía de Partes** (`oficialia_partes`), **Supervisión de Eventos** (`supervision_eventos`) y **Seguimiento de Trámites** (`tramites_seguimiento`). Cada módulo tiene un flujo de trabajo con actores específicos que actualmente están hardcodeados en el backend mediante `unidad_id` fijos (por ejemplo, el Revisor de Trámites siempre es el usuario con `unidad_id=36` y el Finalizador siempre es el usuario con `unidad_id=35`).

Esta funcionalidad permite al **SuperAdmin** configurar, desde un dashboard dedicado, qué usuarios concretos desempeñan cada rol/paso del flujo en cada módulo. La configuración se persiste en base de datos y el backend la consulta en tiempo de ejecución en lugar de usar los valores hardcodeados.

---

## Glosario

- **Sistema**: La aplicación en su conjunto, incluyendo backend y frontend.
- **Dashboard_Configuracion**: Sección del dashboard del SuperAdmin dedicada a la configuración de flujos de módulos.
- **Modulo**: Unidad funcional del sistema registrada en la tabla `modulos` con una clave única (`oficialia_partes`, `supervision_eventos`, `tramites_seguimiento`).
- **Flujo**: Secuencia de pasos/roles que definen cómo se procesa la información dentro de un módulo.
- **Rol_Flujo**: Nombre del papel que un usuario desempeña dentro del flujo de un módulo (por ejemplo: `REVISOR`, `FINALIZADOR`, `ENCARGADO`, `SECRETARIA`). Distinto del rol de sistema (`rol_usuario`).
- **Configuracion_Flujo**: Registro que asocia un `Modulo`, un `Rol_Flujo` y un `usuario_id` concreto, indicando qué persona desempeña ese papel en ese módulo.
- **SuperAdmin**: Usuario con rol `SUPERADMIN` en la tabla `usuarios`, único actor autorizado para leer y modificar configuraciones de flujo.
- **Actor_Flujo**: Usuario concreto asignado a un `Rol_Flujo` dentro de un módulo.
- **Valor_Hardcodeado**: Referencia a un `unidad_id` o `usuario_id` fijo en el código fuente del backend que esta funcionalidad reemplaza.

---

## Requisitos

### Requisito 1: Almacenamiento de Configuraciones de Flujo

**Historia de usuario:** Como SuperAdmin, quiero que el sistema persista la configuración de actores de cada flujo en base de datos, para que los módulos la consulten en tiempo de ejecución en lugar de usar valores hardcodeados.

#### Criterios de Aceptación

1. THE Sistema SHALL crear una tabla `configuracion_flujos` con los campos: `id` (PK serial), `modulo_clave` (VARCHAR, FK a `modulos.clave`), `rol_flujo` (VARCHAR, nombre del rol dentro del flujo), `usuario_id` (INTEGER, FK a `usuarios.id`), `actualizado_por_id` (INTEGER, FK a `usuarios.id`), `actualizado_en` (TIMESTAMPTZ, default NOW()), con restricción UNIQUE sobre (`modulo_clave`, `rol_flujo`).
2. THE Sistema SHALL crear el script SQL de migración de forma idempotente (usando `CREATE TABLE IF NOT EXISTS` y `ON CONFLICT DO NOTHING` para los datos semilla).
3. THE Sistema SHALL poblar la tabla `configuracion_flujos` con los valores actuales hardcodeados como datos semilla iniciales, de modo que el sistema funcione correctamente desde el primer arranque sin intervención del SuperAdmin:
   - `tramites_seguimiento` / `REVISOR` → usuario con `unidad_id=36` y rol `DIRECTOR`
   - `tramites_seguimiento` / `FINALIZADOR` → usuario con `unidad_id=35` y rol `OPERATIVO`
   - `oficialia_partes` / `ENCARGADO` → usuario con rol `ENCARGADO` activo
   - `oficialia_partes` / `SECRETARIA` → usuario con rol `SECRETARIA` activo
4. IF la tabla `configuracion_flujos` no contiene un registro para un `Rol_Flujo` requerido por un módulo en tiempo de ejecución, THEN THE Sistema SHALL registrar un error en el log del servidor e indicar en la respuesta HTTP 500 que la configuración del flujo está incompleta.

---

### Requisito 2: API de Lectura de Configuraciones

**Historia de usuario:** Como SuperAdmin, quiero consultar la configuración actual de flujos de todos los módulos, para ver qué usuarios están asignados a cada rol antes de hacer cambios.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer el endpoint `GET /admin/flujos` que devuelve la lista completa de configuraciones de flujo agrupadas por módulo, incluyendo para cada entrada: `modulo_clave`, `modulo_nombre` (de `modulos.nombre_display`), `rol_flujo`, `usuario_id`, `usuario_nombre` (de `usuarios.nombre`), `usuario_email` (de `usuarios.email`), `usuario_rol` (de `usuarios.rol`), `actualizado_en` y `actualizado_por_nombre`.
2. WHEN un usuario con rol `SUPERADMIN` realiza una solicitud `GET /admin/flujos`, THE Sistema SHALL devolver la respuesta con código HTTP 200 y el listado completo de configuraciones.
3. WHEN un usuario sin rol `SUPERADMIN` realiza una solicitud `GET /admin/flujos`, THE Sistema SHALL rechazar la solicitud con código HTTP 403.
4. THE Sistema SHALL devolver también, para cada módulo, la lista de `Rol_Flujo` configurables definidos en el sistema, de modo que el frontend pueda mostrar los roles aunque aún no tengan usuario asignado.

---

### Requisito 3: API de Actualización de Configuraciones

**Historia de usuario:** Como SuperAdmin, quiero actualizar qué usuario desempeña un rol específico en el flujo de un módulo, para reemplazar los valores hardcodeados por la persona correcta.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer el endpoint `PUT /admin/flujos/:modulo_clave/:rol_flujo` que recibe en el cuerpo `{ usuario_id: number }` y actualiza (o inserta si no existe) el registro correspondiente en `configuracion_flujos`, registrando `actualizado_por_id` con el `id` del SuperAdmin autenticado y `actualizado_en` con la marca de tiempo actual.
2. WHEN un usuario con rol `SUPERADMIN` envía una solicitud válida a `PUT /admin/flujos/:modulo_clave/:rol_flujo`, THE Sistema SHALL persistir el cambio y devolver código HTTP 200 con la configuración actualizada.
3. WHEN un usuario sin rol `SUPERADMIN` envía una solicitud a `PUT /admin/flujos/:modulo_clave/:rol_flujo`, THE Sistema SHALL rechazar la solicitud con código HTTP 403.
4. IF el `modulo_clave` recibido no existe en la tabla `modulos`, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 404 y un mensaje descriptivo.
5. IF el `rol_flujo` recibido no es un rol configurable válido para el módulo indicado, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 y un mensaje que liste los roles válidos para ese módulo.
6. IF el `usuario_id` recibido no existe en la tabla `usuarios` o el usuario está inactivo (`activo = false`), THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 indicando que el usuario no existe o está inactivo.
7. THE Sistema SHALL validar que el usuario asignado tenga un rol de sistema compatible con el `Rol_Flujo` que se le asigna, según las reglas de cada módulo definidas en el Requisito 6; IF no es compatible, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 y un mensaje que indique el rol de sistema requerido.
8. THE Sistema SHALL ejecutar la actualización dentro de una transacción de base de datos para garantizar atomicidad.

---

### Requisito 4: Dashboard de Configuración en el Frontend

**Historia de usuario:** Como SuperAdmin, quiero ver un dashboard de configuración de flujos con todos los módulos y sus roles, para seleccionar visualmente qué usuario ocupa cada paso del flujo.

#### Criterios de Aceptación

1. THE Dashboard_Configuracion SHALL mostrar una sección por cada módulo del sistema (`Oficialía de Partes`, `Supervisión de Eventos`, `Seguimiento de Trámites`), con el nombre del módulo, su descripción y la lista de roles configurables de ese módulo.
2. THE Dashboard_Configuracion SHALL mostrar, para cada `Rol_Flujo` de cada módulo, el usuario actualmente asignado (nombre completo y correo electrónico) o un indicador visual de "Sin configurar" si no hay usuario asignado.
3. WHEN el SuperAdmin hace clic en el botón de edición de un `Rol_Flujo`, THE Dashboard_Configuracion SHALL mostrar un selector de usuario que lista únicamente los usuarios activos del sistema compatibles con ese rol (filtrados según las reglas de compatibilidad del Requisito 6).
4. WHEN el SuperAdmin selecciona un usuario en el selector y confirma el cambio, THE Dashboard_Configuracion SHALL enviar la solicitud `PUT /admin/flujos/:modulo_clave/:rol_flujo` y, al recibir respuesta exitosa, actualizar la vista sin recargar la página completa.
5. IF la solicitud de actualización falla, THE Dashboard_Configuracion SHALL mostrar un mensaje de error descriptivo al SuperAdmin sin perder el estado actual de la vista.
6. THE Dashboard_Configuracion SHALL ser accesible desde el sidebar del `Dashboard_SuperAdmin` como una nueva entrada de navegación con la etiqueta "Configuración de Flujos".
7. THE Dashboard_Configuracion SHALL mostrar la fecha y el nombre del SuperAdmin que realizó la última actualización de cada `Rol_Flujo`.

---

### Requisito 5: Consumo de Configuración en los Módulos del Backend

**Historia de usuario:** Como sistema, quiero que los módulos del backend consulten la configuración de flujos desde la base de datos en lugar de usar valores hardcodeados, para que los cambios del SuperAdmin tengan efecto inmediato.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer una función de servicio `getActorFlujo(moduloClave: string, rolFlujo: string): Promise<number>` que consulta `configuracion_flujos` y devuelve el `usuario_id` configurado para ese módulo y rol.
2. WHEN el módulo `tramites_seguimiento` necesita identificar al Revisor, THE Sistema SHALL obtener el `usuario_id` llamando a `getActorFlujo('tramites_seguimiento', 'REVISOR')` en lugar de usar `unidad_id=36` hardcodeado.
3. WHEN el módulo `tramites_seguimiento` necesita identificar al Finalizador, THE Sistema SHALL obtener el `usuario_id` llamando a `getActorFlujo('tramites_seguimiento', 'FINALIZADOR')` en lugar de usar `unidad_id=35` hardcodeado.
4. WHEN el módulo `oficialia_partes` necesita identificar al Encargado para notificaciones o validaciones de rol, THE Sistema SHALL obtener el `usuario_id` llamando a `getActorFlujo('oficialia_partes', 'ENCARGADO')`.
5. WHEN el módulo `oficialia_partes` necesita identificar a la Secretaria para notificaciones, THE Sistema SHALL obtener el `usuario_id` llamando a `getActorFlujo('oficialia_partes', 'SECRETARIA')`.
6. THE Sistema SHALL implementar un mecanismo de caché en memoria con TTL de 60 segundos para los resultados de `getActorFlujo`, de modo que no se realice una consulta a la base de datos en cada operación del flujo.
7. WHEN el SuperAdmin actualiza una configuración de flujo mediante `PUT /admin/flujos/:modulo_clave/:rol_flujo`, THE Sistema SHALL invalidar la entrada de caché correspondiente para que el nuevo valor sea efectivo en la siguiente consulta.
8. IF `getActorFlujo` no encuentra configuración para el par `(moduloClave, rolFlujo)` solicitado, THEN THE Sistema SHALL lanzar un error que resulte en una respuesta HTTP 500 con un mensaje que indique qué configuración falta.

---

### Requisito 6: Reglas de Compatibilidad de Roles por Módulo

**Historia de usuario:** Como sistema, quiero validar que el usuario asignado a un rol de flujo tenga el rol de sistema adecuado, para evitar configuraciones inválidas que rompan el flujo operativo.

#### Criterios de Aceptación

1. THE Sistema SHALL definir las siguientes reglas de compatibilidad para el módulo `tramites_seguimiento`:
   - `REVISOR`: el usuario debe tener rol de sistema `DIRECTOR` y pertenecer a una unidad de tipo `DIRECCION` (no `DELEGACION` ni `DIRECCION_GENERAL`).
   - `FINALIZADOR`: el usuario debe tener rol de sistema `OPERATIVO`.
2. THE Sistema SHALL definir las siguientes reglas de compatibilidad para el módulo `oficialia_partes`:
   - `ENCARGADO`: el usuario debe tener rol de sistema `ENCARGADO`.
   - `SECRETARIA`: el usuario debe tener rol de sistema `SECRETARIA`.
3. THE Sistema SHALL definir las siguientes reglas de compatibilidad para el módulo `supervision_eventos`:
   - `DIRECTORA_GENERAL`: el usuario debe tener rol de sistema `DIRECTOR` y pertenecer a una unidad de tipo `DIRECCION_GENERAL`.
4. IF el SuperAdmin intenta asignar un usuario que no cumple la regla de compatibilidad del rol de flujo, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 422 y un mensaje que indique el rol de sistema requerido y el tipo de unidad esperado cuando aplique.
5. THE Sistema SHALL exponer las reglas de compatibilidad como parte de la respuesta de `GET /admin/flujos`, de modo que el frontend pueda filtrar el selector de usuarios antes de mostrarlos al SuperAdmin.

---

### Requisito 7: API de Usuarios Disponibles para un Rol de Flujo

**Historia de usuario:** Como SuperAdmin, quiero obtener la lista de usuarios elegibles para un rol de flujo específico, para seleccionar al actor correcto sin tener que conocer las reglas de compatibilidad de memoria.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer el endpoint `GET /admin/flujos/:modulo_clave/:rol_flujo/usuarios-disponibles` que devuelve la lista de usuarios activos del sistema que cumplen las reglas de compatibilidad del `Rol_Flujo` indicado.
2. WHEN un usuario con rol `SUPERADMIN` solicita `GET /admin/flujos/:modulo_clave/:rol_flujo/usuarios-disponibles`, THE Sistema SHALL devolver código HTTP 200 con la lista de usuarios elegibles, incluyendo para cada uno: `id`, `nombre`, `email`, `rol` y `unidad_nombre`.
3. WHEN un usuario sin rol `SUPERADMIN` solicita este endpoint, THE Sistema SHALL rechazar la solicitud con código HTTP 403.
4. IF el `modulo_clave` o el `rol_flujo` no son válidos, THEN THE Sistema SHALL rechazar la solicitud con código HTTP 404 o 422 según corresponda.
5. THE Sistema SHALL excluir de la lista a los usuarios inactivos (`activo = false`).

---

### Requisito 8: Auditoría de Cambios de Configuración

**Historia de usuario:** Como SuperAdmin, quiero que cada cambio de configuración quede registrado con quién lo hizo y cuándo, para tener trazabilidad de las modificaciones al flujo.

#### Criterios de Aceptación

1. THE Sistema SHALL registrar en la tabla `configuracion_flujos` los campos `actualizado_por_id` y `actualizado_en` en cada operación de inserción o actualización, reflejando el `id` del SuperAdmin autenticado y la marca de tiempo del momento del cambio.
2. THE Sistema SHALL crear una tabla `auditoria_configuracion_flujos` con los campos: `id` (PK serial), `modulo_clave`, `rol_flujo`, `usuario_id_anterior` (nullable), `usuario_id_nuevo`, `actualizado_por_id`, `actualizado_en` (TIMESTAMPTZ), para registrar el historial completo de cambios.
3. WHEN el SuperAdmin actualiza un `Rol_Flujo`, THE Sistema SHALL insertar un registro en `auditoria_configuracion_flujos` con el `usuario_id` anterior (si existía) y el nuevo, dentro de la misma transacción de base de datos que actualiza `configuracion_flujos`.
4. THE Sistema SHALL garantizar que los registros de `auditoria_configuracion_flujos` no puedan ser modificados ni eliminados mediante la API (solo INSERT desde el backend).
5. THE Dashboard_Configuracion SHALL mostrar, para cada `Rol_Flujo`, la fecha y el nombre del SuperAdmin que realizó la última modificación, obtenidos del campo `actualizado_en` y `actualizado_por_id` de `configuracion_flujos`.

---

### Requisito 9: Integridad Referencial y Consistencia

**Historia de usuario:** Como sistema, quiero garantizar que la configuración de flujos sea siempre consistente con los datos de usuarios y módulos, para evitar referencias rotas que interrumpan la operación.

#### Criterios de Aceptación

1. THE Sistema SHALL definir la columna `usuario_id` de `configuracion_flujos` con una FK a `usuarios.id` con `ON UPDATE CASCADE ON DELETE RESTRICT`, de modo que no se pueda eliminar un usuario que esté asignado como actor de un flujo.
2. THE Sistema SHALL definir la columna `modulo_clave` de `configuracion_flujos` con una FK a `modulos.clave` con `ON UPDATE CASCADE ON DELETE RESTRICT`.
3. IF un administrador intenta desactivar (`activo = false`) a un usuario que está asignado como actor en algún flujo, THEN THE Sistema SHALL advertir al SuperAdmin mediante un mensaje en la respuesta de la API de administración de usuarios, indicando en qué módulos y roles está asignado ese usuario.
4. THE Sistema SHALL garantizar la restricción UNIQUE sobre (`modulo_clave`, `rol_flujo`) en la tabla `configuracion_flujos`, de modo que cada rol de flujo tenga exactamente un actor asignado a la vez.
5. FOR ALL módulos activos del sistema, THE Sistema SHALL verificar al arrancar que existe al menos un registro en `configuracion_flujos` por cada `Rol_Flujo` requerido por ese módulo, y registrar una advertencia en el log si alguno falta.
