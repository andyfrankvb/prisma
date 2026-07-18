# Tareas de Implementación — Configuración de Flujos por Módulo

## Fase 1: Base de datos

- [x] 1.1 Crear script SQL `infra/postgres/init/08_configuracion_flujos.sql`
  - Crear tabla `configuracion_flujos` con PK serial, columnas `modulo_clave` (FK a `modulos.clave` ON UPDATE CASCADE ON DELETE RESTRICT), `rol_flujo`, `usuario_id` (FK a `usuarios.id` ON UPDATE CASCADE ON DELETE RESTRICT), `actualizado_por_id` (FK a `usuarios.id`), `actualizado_en` (TIMESTAMPTZ DEFAULT NOW()), y restricción UNIQUE sobre `(modulo_clave, rol_flujo)`
  - Crear tabla `auditoria_configuracion_flujos` con PK serial, columnas `modulo_clave`, `rol_flujo`, `usuario_id_anterior` (nullable, FK a `usuarios.id` ON DELETE SET NULL), `usuario_id_nuevo` (FK a `usuarios.id` ON DELETE RESTRICT), `actualizado_por_id` (FK a `usuarios.id` ON DELETE RESTRICT), `actualizado_en` (TIMESTAMPTZ DEFAULT NOW())
  - Crear índices en ambas tablas para `modulo_clave` y `actualizado_en`
  - Insertar datos semilla con `ON CONFLICT DO NOTHING` para los 4 roles configurables usando subconsultas dinámicas (no IDs hardcodeados): `tramites_seguimiento/REVISOR` → Director de unidad tipo DIRECCION, `tramites_seguimiento/FINALIZADOR` → Operativo de unidad tipo DIRECCION (TICS), `oficialia_partes/ENCARGADO` → primer usuario con rol ENCARGADO activo, `oficialia_partes/SECRETARIA` → primer usuario con rol SECRETARIA activo
  - Todo el script debe ser idempotente (usar `CREATE TABLE IF NOT EXISTS` y `ON CONFLICT DO NOTHING`)

- [x] 1.2 Aplicar el script en el contenedor Docker `db`
  - Ejecutar `docker exec -i db psql -U postgres -d oficialia_partes < infra/postgres/init/08_configuracion_flujos.sql`
  - Verificar que las tablas y datos semilla se crearon correctamente

## Fase 2: Servicio de configuración

- [x] 2.1 Crear `src/services/flujo-config.service.ts`
  - Definir el objeto `COMPATIBILITY_RULES` con las reglas de compatibilidad para los 3 módulos y sus roles:
    - `tramites_seguimiento/REVISOR`: rol `DIRECTOR`, unidad tipo `DIRECCION`
    - `tramites_seguimiento/FINALIZADOR`: rol `OPERATIVO`
    - `supervision_eventos/DIRECTORA_GENERAL`: rol `DIRECTOR`, unidad tipo `DIRECCION_GENERAL`
    - `oficialia_partes/ENCARGADO`: rol `ENCARGADO`
    - `oficialia_partes/SECRETARIA`: rol `SECRETARIA`
  - Implementar caché en memoria con `Map<string, { userId: number; expiresAt: number }>` y TTL de 60 000 ms
  - Implementar `getActorFlujo(moduloClave: string, rolFlujo: string): Promise<number>` que consulta la caché primero y la BD si hay cache miss; lanza `AppError` con HTTP 500 si no encuentra configuración
  - Implementar `invalidateActorFlujoCache(moduloClave: string, rolFlujo: string): void` que elimina la entrada del Map
  - Exportar `isCompatible(usuario: { rol: string; unidad_tipo: string }, moduloClave: string, rolFlujo: string): boolean` para reutilizar en validaciones del controller
  - Exportar `getRolesConfigurables(moduloClave: string): string[]` que devuelve los roles válidos para un módulo

## Fase 3: Backend — endpoints de administración

- [x] 3.1 Implementar `listarFlujos` en `src/modules/admin/admin.controller.ts`
  - Consultar `configuracion_flujos` con JOIN a `modulos`, `usuarios` (para nombre/email/rol del actor) y `usuarios` (para nombre del actualizador)
  - Agrupar por módulo en la respuesta
  - Incluir para cada módulo la lista de roles configurables de `COMPATIBILITY_RULES` aunque no tengan usuario asignado (LEFT JOIN o completar en código)
  - Incluir las reglas de compatibilidad (`rol_sistema_requerido`, `unidad_tipo_requerida`, `descripcion`) en la respuesta para que el frontend pueda filtrar

- [x] 3.2 Implementar `actualizarFlujo` en `src/modules/admin/admin.controller.ts`
  - Validar que `modulo_clave` existe en la tabla `modulos` (404 si no)
  - Validar que `rol_flujo` es un rol configurable para ese módulo usando `getRolesConfigurables` (422 si no)
  - Validar que `usuario_id` existe y tiene `activo = true` (422 si no)
  - Validar compatibilidad del usuario con el rol usando `isCompatible` (requiere JOIN con `catalogo_unidades` para obtener el tipo de unidad) (422 si no cumple)
  - Ejecutar dentro de una transacción: UPSERT en `configuracion_flujos` con `ON CONFLICT (modulo_clave, rol_flujo) DO UPDATE`, INSERT en `auditoria_configuracion_flujos` con el valor anterior (obtenido antes del UPSERT)
  - Llamar a `invalidateActorFlujoCache(modulo_clave, rol_flujo)` tras la transacción exitosa
  - Devolver la configuración actualizada con HTTP 200

- [x] 3.3 Implementar `listarUsuariosDisponibles` en `src/modules/admin/admin.controller.ts`
  - Validar `modulo_clave` y `rol_flujo` (404/422 si no son válidos)
  - Obtener la regla de compatibilidad de `COMPATIBILITY_RULES`
  - Consultar `usuarios` con JOIN a `catalogo_unidades` filtrando por `rol` y `tipo` de unidad según la regla, y `activo = true`
  - Devolver lista con `id`, `nombre`, `email`, `rol`, `unidad_nombre`

- [x] 3.4 Registrar las nuevas rutas en `src/modules/admin/admin.routes.ts`
  - `router.get('/flujos', listarFlujos)`
  - `router.put('/flujos/:modulo/:rol', actualizarFlujo)`
  - `router.get('/flujos/:modulo/:rol/usuarios-disponibles', listarUsuariosDisponibles)`

- [x] 3.5 Añadir advertencia en `toggleActivoUsuario` cuando el usuario está asignado a flujos
  - Antes de cambiar `activo`, consultar `configuracion_flujos` donde `usuario_id = id`
  - Si hay registros y se va a desactivar, incluir en la respuesta un campo `advertencia` con los módulos y roles afectados (no bloquear la operación, solo advertir)

## Fase 4: Integración en `tramites.controller.ts`

- [x] 4.1 Reemplazar valores hardcodeados en `getUserTramiteRole`
  - Importar `getActorFlujo` desde `../../services/flujo-config.service`
  - Reemplazar la comparación `user.oficina_id === 36` por `user.id === await getActorFlujo('tramites_seguimiento', 'REVISOR')`
  - Reemplazar la comparación `user.oficina_id === 35` por `user.id === await getActorFlujo('tramites_seguimiento', 'FINALIZADOR')`
  - Hacer la función `getUserTramiteRole` completamente `async` (ya lo es) y ajustar los `await` necesarios

- [x] 4.2 Reemplazar búsquedas de notificaciones hardcodeadas en `tramites.controller.ts`
  - En `crearTramite`: reemplazar `db('usuarios').where({ unidad_id: 36, rol: 'DIRECTOR', activo: true })` por `db('usuarios').where({ id: await getActorFlujo('tramites_seguimiento', 'REVISOR') })`
  - En `aprobarTramite`: reemplazar `db('usuarios').where({ unidad_id: 35, rol: 'OPERATIVO', activo: true })` por `db('usuarios').where({ id: await getActorFlujo('tramites_seguimiento', 'FINALIZADOR') })`
  - En `cerrarProceso`: reemplazar `db('usuarios').where({ unidad_id: 36, rol: 'DIRECTOR', activo: true })` por `db('usuarios').where({ id: await getActorFlujo('tramites_seguimiento', 'REVISOR') })`
  - En `reenviarDesdeDevueltoJuridico`: reemplazar `db('usuarios').where({ unidad_id: 35, rol: 'OPERATIVO', activo: true })` por `db('usuarios').where({ id: await getActorFlujo('tramites_seguimiento', 'FINALIZADOR') })`

## Fase 5: Frontend

- [x] 5.1 Añadir tipos en `src/frontend/types.ts`
  - Añadir interfaces `ConfiguracionFlujo`, `CompatibilityRuleInfo` y `UsuarioDisponible` según el diseño

- [x] 5.2 Crear `src/frontend/views/ConfiguracionFlujos.tsx`
  - Cargar datos con `GET /admin/flujos` al montar el componente
  - Mostrar una tarjeta por módulo con su nombre y descripción
  - Dentro de cada tarjeta, mostrar una fila por rol configurable con: nombre del rol, usuario asignado (nombre + email) o badge "Sin configurar", fecha y autor de la última modificación, botón "Editar"
  - Al hacer clic en "Editar": llamar a `GET /admin/flujos/:modulo/:rol/usuarios-disponibles`, mostrar un selector inline (dropdown o lista) con los usuarios elegibles
  - Al confirmar la selección: llamar a `PUT /admin/flujos/:modulo/:rol` con `{ usuario_id }`, actualizar el estado local sin recargar la página
  - Mostrar errores inline si la solicitud falla
  - Usar el theme existente (`src/frontend/theme.ts`) con inline styles, sin librerías de UI externas
  - Seguir el mismo patrón visual que `SeccionModulos.tsx` (tabla/tarjetas, colores del theme, tipografía Montserrat)

- [x] 5.3 Integrar `ConfiguracionFlujos` en `Dashboard_SuperAdmin.tsx`
  - Añadir entrada `{ key: 'flujos', icon: '⚙️', label: 'Flujos', sublabel: 'Configuración de actores', color: '#4C1D95' }` al array `NAV_ITEMS`
  - Actualizar el tipo `ModuloKey` para incluir `'flujos'`
  - Importar y renderizar `<ConfiguracionFlujos />` cuando `modulo === 'flujos'`

## Fase 6: Verificación

- [x] 6.1 Verificar compilación TypeScript sin errores
  - Ejecutar `npx tsc --noEmit` en la raíz del proyecto
  - Corregir cualquier error de tipos

- [x] 6.2 Verificar flujo completo de trámites con la nueva integración
  - Confirmar que `getUserTramiteRole` sigue devolviendo `'revisor'` y `'finalizador'` correctamente con los datos semilla
  - Confirmar que las notificaciones se envían al usuario correcto

- [x] 6.3 Verificar el dashboard de configuración en el frontend
  - Confirmar que la nueva sección aparece en el sidebar del SuperAdmin
  - Confirmar que se pueden ver y editar las configuraciones de flujo
