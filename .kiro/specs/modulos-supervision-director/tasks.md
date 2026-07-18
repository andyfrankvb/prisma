# Plan de Implementación: Módulos de Supervisión y Director

## Descripción general

Implementación incremental de las tres capacidades nuevas del sistema: gestión de módulos por usuario (SuperAdmin), panel de supervisión del Director General con ModuleRegistry, y módulo de Supervisión de Eventos. El stack es TypeScript + Express 4 + Knex.js en backend, React 18 + CSS-in-JS en frontend, PostgreSQL 15.

## Tareas

- [x] 1. Migraciones de base de datos y datos semilla
  - [x] 1.1 Crear archivo de migración SQL con las cuatro tablas nuevas
    - Crear `src/notifications/migrations/add_modulos_supervision.sql`
    - Agregar `ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'SUPERADMIN'` al inicio del script
    - Definir tabla `modulos` con columnas `id`, `clave` (UNIQUE), `nombre_display`, `descripcion`, `activo`, `orden`; incluir índices `idx_modulos_clave` e `idx_modulos_activo`
    - Definir tabla `usuario_modulos` con PK compuesta `(usuario_id, modulo_id)`, FK a `usuarios` con ON DELETE CASCADE, FK a `modulos` con ON DELETE RESTRICT; incluir índices `idx_usuario_modulos_usuario` e `idx_usuario_modulos_modulo`
    - Definir `CREATE TYPE estado_evento AS ENUM ('ABIERTO', 'CERRADO')` y tabla `eventos` con columnas `id`, `titulo`, `descripcion`, `estado`, `creado_por_id`, `fecha_creacion`, `fecha_cierre`; incluir índices correspondientes
    - Definir `CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA')` y tabla `tareas_evento` con columnas `id`, `evento_id`, `titulo`, `descripcion`, `asignado_a_id`, `estado`, `fecha_programada`, `fecha_actualizacion`; incluir índices correspondientes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.2 Agregar datos semilla de módulos al script de inicialización
    - En `infra/postgres/init/03_seed_dev.sql`, agregar INSERT en tabla `modulos` con los dos registros semilla: `('oficialia_partes', 'Oficialía de Partes', ..., TRUE, 1)` y `('supervision_eventos', 'Supervisión de Eventos', ..., TRUE, 2)` usando `ON CONFLICT (clave) DO NOTHING`
    - Agregar usuarios de prueba para directores de área con rol `DIRECTOR` y `oficina_id` de DIRECCION JURIDICA, DIRECCION DE TICS y DIRECCION ADMINISTRATIVA; agregar usuario SuperAdmin con rol `SUPERADMIN`
    - _Requirements: 7.2_

  - [x] 1.3 Agregar referencia al script de migración en el init de Docker
    - En `infra/postgres/init/02_schema.sql`, agregar `\i /docker-entrypoint-initdb.d/add_modulos_supervision.sql` después de la línea existente
    - Copiar el archivo de migración al directorio `infra/postgres/init/` para que Docker lo ejecute al inicializar
    - _Requirements: 7.1, 7.2_

- [x] 2. ModuleRegistry — singleton en backend
  - [x] 2.1 Crear el módulo `module-registry` con interfaces y clase singleton
    - Crear directorio `src/modules/module-registry/`
    - Crear `src/modules/module-registry/module.registry.ts` con la interfaz `ModuleMetricsFn`, la interfaz `ResumenModulo` y la clase `ModuleRegistry` con métodos `getInstance()`, `register(clave, fn)` y `computeAll()`
    - En `computeAll()`: consultar `db('modulos').where({ activo: true }).orderBy('orden', 'asc')`, iterar con `Promise.all`, invocar la función registrada para cada módulo, capturar errores individuales devolviendo `ResumenModulo` con campos `null` y `error` si la función falla; devolver ceros si no hay función registrada para esa clave
    - Exportar la instancia singleton `moduleRegistry`
    - _Requirements: 5.2, 5.3, 5.4, 4.4_

  - [x]* 2.2 Escribir tests unitarios para ModuleRegistry
    - Caso: `register` + `computeAll` con función mock que devuelve métricas fijas — verificar que el resultado contiene el módulo con los valores correctos
    - Caso: `computeAll` cuando la función registrada lanza error — verificar que devuelve `activos: null`, `pendientes: null`, `alertas: null` y campo `error` con el mensaje
    - Caso: `computeAll` cuando el módulo no tiene función registrada — verificar que devuelve `activos: 0`, `pendientes: 0`, `alertas: 0`
    - Mockear `db` con `vi.mock('../../db', ...)` siguiendo el patrón de `permission.guard.test.ts`
    - Ubicar en `src/tests/unit/module.registry.test.ts`
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 3. Registro de métricas del módulo Oficialía de Partes
  - [x] 3.1 Crear `src/modules/oficialia_partes/oficios.registry.ts`
    - Importar `moduleRegistry` desde `../module-registry/module.registry` y `db` desde `../../db`
    - Implementar `registerOficialiaPartes()`: llamar a `moduleRegistry.register('oficialia_partes', async () => { ... })` con tres consultas Knex independientes sobre la tabla `oficios`:
      - `activos`: `count` de oficios con `estatus != 'FINALIZADO'`
      - `pendientes`: `count` de oficios con `estatus IN ('RECIBIDO', 'ASIGNADO')`
      - `alertas`: `count` de oficios con `tiene_termino = true`, `estatus != 'FINALIZADO'` y `fecha_vencimiento::date <= CURRENT_DATE`
    - Propagar cualquier error de BD sin capturarlo (el ModuleRegistry lo captura)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 3.2 Escribir property test para métricas de Oficialía de Partes
    - **Property 7: Corrección de métricas de Oficialía de Partes**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Usar `fc.array(fc.record({ estatus: fc.constantFrom('RECIBIDO','ASIGNADO','EN_REVISION','VOBO_APROBADO','FINALIZADO'), tiene_termino: fc.boolean(), fecha_vencimiento: fc.option(fc.date()) }))` para generar conjuntos de oficios
    - Calcular manualmente `activos`, `pendientes` y `alertas` sobre el array generado y comparar con el resultado de la función de métricas ejecutada sobre datos insertados en BD de test
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/oficios.registry.test.ts`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. API SuperAdmin — endpoints de gestión de módulos
  - [x] 4.1 Agregar funciones de módulos a `src/modules/admin/admin.controller.ts`
    - Implementar `listarModulos(req, res, next)`: consultar `db('modulos').select('id','clave','nombre_display','descripcion','activo','orden').orderBy('orden','asc')` y devolver `{ data: modulos }`
    - Implementar `listarModulosUsuario(req, res, next)`: recibir `params.id`, verificar que el usuario existe (404 si no), consultar todos los módulos del catálogo con LEFT JOIN a `usuario_modulos` para el usuario dado, devolver array de `ModuloConEstado` con campo `habilitado: boolean` y `asignado_en`; excluir `password_hash` de cualquier consulta de usuario
    - Implementar `habilitarModulo(req, res, next)`: recibir `params.id` y `params.moduloId`, verificar que el usuario no es el propio requester (422), verificar que el módulo existe (404), intentar INSERT en `usuario_modulos`; si viola PK única devolver 409 "El módulo ya está habilitado para este usuario"
    - Implementar `revocarModulo(req, res, next)`: recibir `params.id` y `params.moduloId`, verificar que el usuario no es el propio requester (422), intentar DELETE en `usuario_modulos`; si `rowCount === 0` devolver 404 "El módulo no está habilitado para este usuario"
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.1, 8.3, 8.5_

  - [x] 4.2 Registrar las nuevas rutas en `src/modules/admin/admin.routes.ts`
    - Importar las cuatro nuevas funciones del controller
    - Agregar rutas bajo el router existente (que ya tiene el guard SUPERADMIN):
      - `GET /modulos` → `listarModulos`
      - `GET /usuarios/:id/modulos` → `listarModulosUsuario`
      - `POST /usuarios/:id/modulos/:moduloId` → `habilitarModulo`
      - `DELETE /usuarios/:id/modulos/:moduloId` → `revocarModulo`
    - _Requirements: 2.6, 8.1, 8.3_

  - [x]* 4.3 Escribir tests unitarios para los endpoints de módulos del admin
    - Caso: `listarModulosUsuario` devuelve todos los módulos con `habilitado = true` solo para los asignados
    - Caso: `habilitarModulo` devuelve 409 si el módulo ya está habilitado
    - Caso: `revocarModulo` devuelve 404 si el módulo no está habilitado
    - Caso: `habilitarModulo` devuelve 422 si el requester intenta modificar sus propios módulos
    - Mockear `db` con `vi.mock`; ubicar en `src/tests/unit/admin.modulos.test.ts`
    - _Requirements: 2.1, 2.4, 2.5, 2.7_

  - [x]* 4.4 Escribir property test para corrección del estado habilitado por usuario
    - **Property 3: Corrección del estado habilitado por usuario**
    - **Validates: Requirements 2.1**
    - Usar `fc.array(fc.integer({ min: 1, max: 10 }))` para generar subconjuntos de IDs de módulos asignados; verificar que `habilitado = true` exactamente para los módulos en el subconjunto y `false` para los demás
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/admin.modulos.property.test.ts`
    - _Requirements: 2.1_

  - [x]* 4.5 Escribir property test para round-trip de asignación y revocación
    - **Property 4: Round-trip de asignación y revocación de módulo**
    - **Validates: Requirements 2.2, 2.3**
    - Usar `fc.integer({ min: 1, max: 10 })` para generar `moduloId`; habilitar el módulo, verificar `habilitado = true`, revocar, verificar `habilitado = false`; el estado final debe ser igual al estado previo a la asignación
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/admin.modulos.property.test.ts`
    - _Requirements: 2.2, 2.3_

- [x] 5. API Director — endpoint de supervisión
  - [x] 5.1 Agregar función `getSupervision` a `src/modules/director/director.controller.ts`
    - Importar `moduleRegistry` desde `../module-registry/module.registry`
    - Implementar `getSupervision(req, res, next)`: verificar rol `DIRECTOR` con el guard `requireDirector` ya existente, llamar a `moduleRegistry.computeAll()` y devolver `{ data: resumenes }`
    - El endpoint nunca falla por un módulo individual: si `computeAll` devuelve un módulo con `error`, ese error se incluye en el objeto del módulo pero la respuesta HTTP es 200
    - _Requirements: 4.3, 4.4, 4.5, 5.1, 8.2, 8.4_

  - [x] 5.2 Registrar la nueva ruta en `src/modules/director/director.routes.ts`
    - Importar `getSupervision` del controller
    - Agregar `router.get('/supervision', getSupervision)` al router existente
    - _Requirements: 4.5, 8.2, 8.4_

  - [ ]* 5.3 Escribir property test para completitud del panel de supervisión
    - **Property 6: Completitud del panel de supervisión**
    - **Validates: Requirements 4.3, 5.1**
    - Usar `fc.array(fc.record({ clave: fc.string(), nombre: fc.string(), activo: fc.boolean() }), { minLength: 1, maxLength: 8 })` para generar conjuntos de módulos; insertar en BD de test, registrar funciones mock en el registry, llamar a `computeAll()` y verificar que el resultado contiene exactamente un `ResumenModulo` por cada módulo con `activo = true`
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/supervision.property.test.ts`
    - _Requirements: 4.3, 5.1_

- [x] 6. Módulo de Eventos — backend completo
  - [x] 6.1 Crear `src/modules/eventos/eventos.types.ts` con todas las interfaces TypeScript
    - Definir tipos `EstadoEvento`, `EstadoTarea`, `TareaEvento`, `EventoResumen`, `EventoDetalle`
    - Definir bodies de request: `CrearEventoBody`, `CrearTareaBody`, `ActualizarEstadoTareaBody`
    - Definir responses: `ListarEventosResponse`, `DetalleEventoResponse`
    - Exportar la función pura `isValidTransition(actual: EstadoTarea, nuevo: EstadoTarea): boolean` que implementa la máquina de estados `PENDIENTE → EN_PROGRESO → COMPLETADA`
    - Exportar las funciones puras `isVencida(fecha_programada: string, estado: EstadoTarea): boolean` y `isProximaAVencer(fecha_programada: string, estado: EstadoTarea): boolean` (próxima = dentro de 3 días naturales)
    - _Requirements: 10.1, 10.2, 10.3, 11.3, 11.4_

  - [x] 6.2 Crear `src/modules/eventos/eventos.controller.ts` con todos los handlers
    - Implementar `crearEvento(req, res, next)`: verificar rol DIRECTOR y que `oficina_id` corresponde a DIRECCION GENERAL (usar ID de la oficina del seed); validar `titulo` no vacío (422); insertar en `eventos` con `estado = 'ABIERTO'`; devolver 201 con el evento creado
    - Implementar `listarEventos(req, res, next)`: verificar rol DIRECTOR; consultar todos los eventos con conteos de tareas por estado usando subqueries o GROUP BY; calcular `tareas_vencidas` y `tareas_proximas` con las funciones de `eventos.types.ts`; devolver array de `EventoResumen`
    - Implementar `obtenerEvento(req, res, next)`: verificar rol DIRECTOR; consultar evento por ID (404 si no existe); consultar tareas con JOIN a `usuarios` para obtener `asignado_a_nombre`; calcular `vencida` y `proxima_a_vencer` por tarea; devolver `EventoDetalle`
    - Implementar `agregarTarea(req, res, next)`: verificar rol DIRECTOR y DIRECCION GENERAL; validar `titulo`, `asignado_a_id` y `fecha_programada` (422 si falta alguno); verificar que el usuario asignado existe y tiene rol DIRECTOR (422 si no); verificar que el evento existe (404); insertar en `tareas_evento` con `estado = 'PENDIENTE'`; devolver 201 con la tarea creada
    - Implementar `actualizarEstadoTarea(req, res, next)`: verificar que el usuario autenticado es el `asignado_a_id` de la tarea (403 si no); validar transición con `isValidTransition` (422 si inválida); actualizar `estado` y `fecha_actualizacion = NOW()`; devolver la tarea actualizada
    - Implementar `cerrarEvento(req, res, next)`: verificar rol DIRECTOR y DIRECCION GENERAL; verificar que el evento existe (404); si `estado = 'CERRADO'` devolver 409; actualizar `estado = 'CERRADO'` y `fecha_cierre = NOW()`; devolver el evento actualizado
    - Implementar `listarTareasArea(req, res, next)`: devolver solo las tareas donde `asignado_a_id = req.user.id`; incluir `titulo` del evento padre; calcular `vencida` y `proxima_a_vencer`; soportar filtros opcionales por `estado` y `evento_id` via query params
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.1_

  - [x] 6.3 Crear `src/modules/eventos/eventos.routes.ts` con todas las rutas
    - Aplicar `authenticate` a todo el router
    - `POST /` → `crearEvento` (solo DIRECTOR + DIRECCION GENERAL, verificado en el handler)
    - `GET /` → `listarEventos` (solo DIRECTOR, verificado en el handler)
    - `GET /:id` → `obtenerEvento` (solo DIRECTOR, verificado en el handler)
    - `POST /:id/tareas` → `agregarTarea` (solo DIRECTOR + DIRECCION GENERAL)
    - `PATCH /:id/tareas/:tareaId/estado` → `actualizarEstadoTarea` (solo el asignado)
    - `PATCH /:id/cerrar` → `cerrarEvento` (solo DIRECTOR + DIRECCION GENERAL)
    - `GET /mis-tareas` → `listarTareasArea` (cualquier DIRECTOR autenticado)
    - _Requirements: 9.5, 10.4, 11.7, 12.1, 12.6_

  - [x]* 6.4 Escribir tests unitarios para funciones puras de eventos
    - Casos para `isValidTransition`: PENDIENTE→EN_PROGRESO (válido), EN_PROGRESO→COMPLETADA (válido), PENDIENTE→COMPLETADA (inválido), COMPLETADA→PENDIENTE (inválido), COMPLETADA→EN_PROGRESO (inválido)
    - Casos para `isVencida`: tarea con fecha pasada y estado != COMPLETADA → true; tarea COMPLETADA con fecha pasada → false; tarea con fecha futura → false
    - Casos para `isProximaAVencer`: tarea con fecha en 2 días y estado != COMPLETADA → true; tarea COMPLETADA con fecha en 2 días → false; tarea con fecha en 5 días → false
    - Ubicar en `src/tests/unit/eventos.utils.test.ts`
    - _Requirements: 10.1, 10.2, 10.3, 11.3, 11.4_

  - [x]* 6.5 Escribir property test para validez de transiciones de estado
    - **Property 11: Validez de transiciones de estado de tareas**
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - Usar `fc.constantFrom('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA')` para ambos estados; verificar que `isValidTransition(actual, nuevo)` devuelve `true` solo para los pares `PENDIENTE→EN_PROGRESO` y `EN_PROGRESO→COMPLETADA`
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/eventos.utils.test.ts`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 6.6 Escribir property test para corrección de métricas en listado de eventos
    - **Property 13: Corrección de métricas en el listado de eventos**
    - **Validates: Requirements 11.1, 11.5**
    - Usar `fc.array(fc.record({ estado: fc.constantFrom('PENDIENTE','EN_PROGRESO','COMPLETADA'), fecha_programada: fc.date() }), { minLength: 0, maxLength: 10 })` para generar tareas de un evento; calcular manualmente los conteos y comparar con los devueltos por `listarEventos`
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/eventos.metricas.property.test.ts`
    - _Requirements: 11.1, 11.5_

- [x] 7. Registro de métricas del módulo Supervisión de Eventos
  - [x] 7.1 Crear `src/modules/eventos/eventos.registry.ts`
    - Importar `moduleRegistry` y `db`
    - Implementar `registerSupervisionEventos()`: llamar a `moduleRegistry.register('supervision_eventos', async () => { ... })` con tres consultas Knex:
      - `activos`: `count` de eventos con `estado = 'ABIERTO'`
      - `pendientes`: `count` de `tareas_evento` con JOIN a `eventos`, `e.estado = 'ABIERTO'` y `t.estado != 'COMPLETADA'`
      - `alertas`: `count` de `tareas_evento` con JOIN a `eventos`, `e.estado = 'ABIERTO'`, `t.estado != 'COMPLETADA'` y `t.fecha_programada < CURRENT_DATE`
    - Propagar cualquier error de BD sin capturarlo
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 7.2 Escribir property test para métricas de Supervisión de Eventos
    - **Property 8: Corrección de métricas de Supervisión de Eventos**
    - **Validates: Requirements 13.1, 13.2, 13.3**
    - Usar `fc.array(fc.record({ estado_evento: fc.constantFrom('ABIERTO','CERRADO'), tareas: fc.array(fc.record({ estado_tarea: fc.constantFrom('PENDIENTE','EN_PROGRESO','COMPLETADA'), fecha_programada: fc.date() })) }))` para generar conjuntos de eventos con tareas; calcular manualmente `activos`, `pendientes` y `alertas` y comparar con el resultado de la función de métricas
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/eventos.registry.test.ts`
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 8. Checkpoint — verificar backend completo
  - Asegurarse de que todos los tests unitarios y de propiedades del backend pasan con `npm run test:unit`
  - Verificar que TypeScript compila sin errores con `npm run build`
  - Preguntar al usuario si hay dudas antes de continuar con el frontend

- [x] 9. Frontend SuperAdmin — sección de gestión de módulos
  - [x] 9.1 Agregar tipos de módulos al archivo `src/frontend/types.ts`
    - Agregar interfaces `Modulo`, `ModuloConEstado`, `ResumenModulo`, `EstadoEvento`, `EstadoTarea`, `TareaEvento`, `EventoResumen`, `EventoDetalle` siguiendo las definiciones del diseño técnico
    - _Requirements: 3.1, 4.2_

  - [x] 9.2 Crear el componente `SeccionModulos` en `src/frontend/views/SeccionModulos.tsx`
    - Implementar tabla de usuarios que consume `GET /api/v1/admin/usuarios` (endpoint ya existente); mostrar columnas: nombre, email, rol, oficina y módulos habilitados como pills de color guinda
    - Al hacer clic en una fila, mostrar un panel lateral de detalle a la derecha dentro del mismo contenedor (sin modal); el panel muestra nombre y rol del usuario seleccionado
    - En el panel de detalle, mostrar la lista de módulos del catálogo (`GET /api/v1/admin/modulos`) con un toggle ON/OFF por módulo; el estado inicial de cada toggle se obtiene de `GET /api/v1/admin/usuarios/:id/modulos`
    - Al cambiar un toggle a ON: llamar a `POST /api/v1/admin/usuarios/:id/modulos/:moduloId`; al cambiar a OFF: llamar a `DELETE /api/v1/admin/usuarios/:id/modulos/:moduloId`
    - Si la llamada a la API falla: mostrar mensaje de error inline junto al toggle afectado y revertir el toggle al estado previo sin alterar el estado visual de los demás toggles
    - Mostrar spinner/indicador de carga mientras se obtienen o actualizan datos
    - Usar colores del `theme` institucional: guinda para toggle activo, gris para inactivo
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 9.3 Integrar `SeccionModulos` en `Dashboard_SuperAdmin.tsx`
    - Agregar entrada `{ key: 'modulos', icon: '🧩', label: 'Módulos', sublabel: 'Gestión de acceso', color: '#4C1D95' }` al array `NAV_ITEMS`
    - Actualizar el tipo `ModuloKey` para incluir `'modulos'`
    - En la sección de renderizado condicional, agregar `{modulo === 'modulos' && <SeccionModulos />}`
    - _Requirements: 3.1_

- [x] 10. Frontend Director — sección de supervisión con tarjetas de módulos
  - [x] 10.1 Crear el componente `SeccionSupervision` en `src/frontend/views/SeccionSupervision.tsx`
    - Consumir `GET /api/v1/director/supervision` al montar el componente; mostrar spinner mientras carga
    - Renderizar un grid de tarjetas `TarjetaModulo`, una por cada `ResumenModulo` devuelto, ordenadas según el campo `orden` de la respuesta (Oficialía de Partes primero, Supervisión de Eventos segundo)
    - Cada `TarjetaModulo` muestra: nombre del módulo, métrica "Activos" (número grande), métrica "Pendientes" y métrica "Alertas"
    - Lógica de borde de color: si `alertas > 0` → borde izquierdo rojo (`theme.colors.alert.red`); si `pendientes > 0` y `alertas === 0` → borde izquierdo amarillo (`theme.colors.alert.yellow`); si todo en cero → borde verde (`theme.colors.alert.green`)
    - Si el módulo tiene campo `error`: mostrar el mensaje de error en lugar de las métricas numéricas
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 5.1, 6.5, 13.5_

  - [x] 10.2 Integrar `SeccionSupervision` en `Dashboard_Director.tsx`
    - Agregar un selector de sección (tabs o botones) en la parte superior del dashboard con al menos dos opciones: "Métricas" (contenido actual) y "Supervisión de Módulos"
    - Cuando la sección activa es "Supervisión de Módulos", renderizar `<SeccionSupervision />`; cuando es "Métricas", renderizar el contenido existente sin modificarlo
    - _Requirements: 4.1, 4.6_

- [x] 11. Frontend Director — sección de eventos con gestión de tareas
  - [x] 11.1 Crear el componente `SeccionEventos` en `src/frontend/views/SeccionEventos.tsx`
    - Consumir `GET /api/v1/eventos` al montar; mostrar spinner mientras carga
    - Renderizar lista de `EventoCard`: título, badge de estado (ABIERTO/CERRADO), barra de progreso de tareas (pendiente/en_progreso/completada proporcional), indicador de alertas si `tareas_vencidas > 0`
    - Los eventos CERRADOS se muestran con opacidad reducida al final de la lista (ordenar: ABIERTOS primero)
    - Al hacer clic en un `EventoCard`: expandir detalle inline con la lista de tareas del evento (`GET /api/v1/eventos/:id`); cada `TareaRow` muestra título, nombre del asignado, badge de estado, fecha programada e indicador visual si está vencida o próxima a vencer
    - Botón "Agregar Tarea" en el detalle expandido: abre modal `ModalCrearTarea` con campos `titulo`, `descripcion` (opcional), selector de `asignado_a_id` (usuarios con rol DIRECTOR excluyendo a la Directora General), y `fecha_programada`; al confirmar llama a `POST /api/v1/eventos/:id/tareas`
    - Botón "Cerrar Evento" en eventos ABIERTOS: mostrar confirmación antes de llamar a `PATCH /api/v1/eventos/:id/cerrar`; actualizar la UI sin recargar
    - Botón "Nuevo Evento" en la parte superior: abre modal `ModalCrearEvento` con campos `titulo` y `descripcion`; al confirmar llama a `POST /api/v1/eventos`; agregar el nuevo evento a la lista sin recargar
    - _Requirements: 9.1, 9.2, 9.6, 11.1, 11.2, 11.5, 11.6_

  - [x] 11.2 Integrar `SeccionEventos` en `Dashboard_Director.tsx`
    - Agregar una tercera opción "Eventos" al selector de sección creado en la tarea 10.2
    - Cuando la sección activa es "Eventos", renderizar `<SeccionEventos />`
    - _Requirements: 9.1_

- [x] 12. Frontend Director de Área — vista de tareas asignadas
  - [x] 12.1 Crear `src/frontend/views/Dashboard_DirectorArea.tsx`
    - Consumir `GET /api/v1/eventos/mis-tareas` al montar; mostrar spinner mientras carga
    - Renderizar lista de tareas agrupadas por evento (encabezado de grupo con el título del evento)
    - Cada `TareaRow` muestra: título de la tarea, badge de estado actual, fecha programada, indicador visual diferenciado si la tarea está vencida (rojo) o próxima a vencer (amarillo)
    - Botón "Avanzar estado" en cada tarea: si `estado = 'PENDIENTE'` → botón "Iniciar" (transición a EN_PROGRESO); si `estado = 'EN_PROGRESO'` → botón "Completar" (transición a COMPLETADA); si `estado = 'COMPLETADA'` → sin botón
    - Al hacer clic en "Avanzar estado": llamar a `PATCH /api/v1/eventos/:evento_id/tareas/:tareaId/estado` con el nuevo estado; actualizar el badge en la UI sin recargar la página
    - Si la llamada falla: mostrar mensaje de error inline junto a la tarea afectada sin alterar el estado visual previo
    - Implementar filtros por estado (`PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`) y por evento usando selects en la parte superior; los filtros son locales (sobre los datos ya cargados)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 12.2 Registrar `Dashboard_DirectorArea` en `src/frontend/App.tsx`
    - Importar `Dashboard_DirectorArea`
    - Agregar ruta `/dashboard/director-area` con `ProtectedRoute` y `AppShell`
    - En `AuthContext` o en el componente de redirección post-login, distinguir entre Directora General (oficina_id de DIRECCION GENERAL) y Director de Área (cualquier otro oficina_id con rol DIRECTOR); redirigir a `/dashboard/director-area` para directores de área y a `/dashboard/director` para la Directora General
    - _Requirements: 12.1, 12.2_

- [x] 13. Instalación de fast-check y tests de propiedades adicionales
  - [x] 13.1 Instalar fast-check como dependencia de desarrollo
    - Ejecutar `npm install --save-dev fast-check` en la raíz del proyecto
    - Verificar que la versión instalada es compatible con Vitest 1.x
    - _Requirements: (infraestructura de testing)_

  - [x]* 13.2 Escribir property test para completitud del listado de módulos
    - **Property 1: Completitud del listado de módulos**
    - **Validates: Requirements 1.2, 1.3**
    - Usar `fc.array(fc.record({ clave: fc.string({ minLength: 1 }), nombre_display: fc.string({ minLength: 1 }), activo: fc.boolean() }), { minLength: 1, maxLength: 10 })` para generar conjuntos de módulos; insertar en BD de test, llamar a `GET /admin/modulos` y verificar que la respuesta contiene exactamente los módulos insertados (incluyendo los inactivos)
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/admin.modulos.property.test.ts`
    - _Requirements: 1.2, 1.3_

  - [x]* 13.3 Escribir property test para restricción de acceso por rol en endpoints de módulos
    - **Property 5: Restricción de acceso por rol en endpoints de módulos**
    - **Validates: Requirements 2.6, 8.3**
    - Usar `fc.constantFrom('OFICIAL', 'ENCARGADO', 'JURIDICO', 'SECRETARIA', 'DIRECTOR')` para generar roles no-SUPERADMIN; para cada rol, llamar a cada endpoint bajo `/api/v1/admin/modulos` y `/api/v1/admin/usuarios/:id/modulos` con un token JWT del rol generado; verificar que todos devuelven HTTP 403
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/admin.modulos.property.test.ts`
    - _Requirements: 2.6, 8.3_

  - [x]* 13.4 Escribir property test para autorización de actualización de tareas
    - **Property 12: Autorización de actualización de tareas**
    - **Validates: Requirements 10.4**
    - Usar `fc.integer({ min: 1, max: 1000 })` para generar IDs de usuario distintos del asignado; para cada ID generado, intentar actualizar el estado de una tarea asignada a otro usuario y verificar que la respuesta es HTTP 403
    - Configurar con `{ numRuns: 100 }`; ubicar en `src/tests/unit/eventos.auth.property.test.ts`
    - _Requirements: 10.4_

- [x] 14. Integración final en `server.ts` y `App.tsx`
  - [x] 14.1 Registrar el router de eventos y los registros de módulos en `src/server.ts`
    - Importar `eventosRouter` desde `./modules/eventos/eventos.routes`
    - Agregar `app.use('/api/v1/eventos', eventosRouter)` junto a los demás routers
    - Importar `registerOficialiaPartes` desde `./modules/oficialia_partes/oficios.registry`
    - Importar `registerSupervisionEventos` desde `./modules/eventos/eventos.registry`
    - Llamar a `registerOficialiaPartes()` y `registerSupervisionEventos()` antes de `server.listen()`, después de la configuración de rutas
    - _Requirements: 5.3, 6.4_

  - [x] 14.2 Verificar que la ruta `/dashboard/director-area` está correctamente registrada en `src/frontend/App.tsx`
    - Confirmar que la importación de `Dashboard_DirectorArea` y la ruta `/dashboard/director-area` están presentes (agregadas en la tarea 12.2)
    - Verificar que la lógica de redirección post-login en `AuthContext` o en el componente de login distingue correctamente entre Directora General y Director de Área usando `oficina_id`
    - _Requirements: 12.1, 12.2_

- [x] 15. Checkpoint final — verificar sistema completo
  - Ejecutar `npm run test` para correr todos los tests unitarios y de propiedades
  - Ejecutar `npm run build` para verificar que TypeScript compila sin errores
  - Verificar manualmente que los endpoints responden correctamente con un cliente HTTP (curl o Postman): login como SUPERADMIN, listar módulos, asignar módulo, login como DIRECTOR, obtener supervisión
  - Asegurarse de que todos los tests pasan; preguntar al usuario si hay dudas antes de cerrar

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia los requisitos específicos para trazabilidad
- Los tests de propiedades usan fast-check con mínimo 100 iteraciones (`numRuns: 100`)
- La distinción entre Directora General y Director de Área se hace por `oficina_id`: DIRECCION GENERAL (id 5 en el seed) → Directora General; cualquier otro id con rol DIRECTOR → Director de Área
- El ModuleRegistry es un singleton en memoria; los registros se ejecutan al arrancar el servidor y no requieren persistencia entre reinicios
- Los ENUMs de PostgreSQL (`estado_evento`, `estado_tarea`) deben crearse antes de las tablas que los usan; el script de migración debe respetar ese orden

