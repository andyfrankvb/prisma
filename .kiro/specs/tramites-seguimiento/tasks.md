# Tareas de Implementación — Seguimiento de Trámites

## Tasks

- [x] 1. Base de datos — Schema y script SQL
  - [x] 1.1 Crear script `infra/postgres/init/06_tramites_seguimiento.sql` con enum `estatus_tramite`, tablas `tramites`, `tramite_documentos`, `comentarios_tramite`, `auditoria_tramites` e índices
  - [x] 1.2 Actualizar enum `estatus_tramite` para incluir los valores `DEVUELTO_DELEGADO` y `DEVUELTO_JURIDICO`
  - [x] 1.3 Actualizar tabla `tramites` para incluir columnas: `numero_ticket`, `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `checklist_documentacion`, `checklist_proyecto`, `fecha_registro`, `fecha_cierre`
  - [x] 1.4 Actualizar tabla `auditoria_tramites` para incluir columna `comentario` (nullable)
  - [x] 1.5 Ejecutar migraciones en la BD activa (docker exec)
  - [x] 1.6 Verificar que las tablas y columnas existen correctamente con `\d tramites` y `\d auditoria_tramites`

- [x] 2. Backend — Tipos y utilidades
  - [x] 2.1 Crear `src/modules/tramites/tramites.types.ts` con tipos TypeScript, enum de estatus y función `isValidTramiteTransition`
  - [x] 2.2 Actualizar `tramites.types.ts`: agregar `DEVUELTO_DELEGADO` y `DEVUELTO_JURIDICO` al enum, actualizar `isValidTramiteTransition` con las 8 transiciones válidas, agregar campos nuevos al tipo `Tramite` (`numero_ticket`, `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `checklist_documentacion`, `checklist_proyecto`, `fecha_registro`, `fecha_cierre`)
  - [x] 2.3 Agregar tipos de notificación `TRAMITE_NUEVO`, `TRAMITE_APROBADO`, `TRAMITE_RECHAZADO`, `TRAMITE_FINALIZADO` en `notification.types.ts`
  - [x] 2.4 Agregar tipos de notificación `TRAMITE_DEVUELTO_DELEGADO` y `TRAMITE_DEVUELTO_JURIDICO` en `notification.types.ts`
  - [x] 2.5 Agregar función `notifyTramite` en `notification.dispatcher.ts`
  - [x] 2.6 Actualizar `notifyTramite` en `notification.dispatcher.ts` para manejar los nuevos tipos `TRAMITE_DEVUELTO_DELEGADO` y `TRAMITE_DEVUELTO_JURIDICO`

- [x] 3. Backend — Controller
  - [x] 3.1 Crear `src/modules/tramites/tramites.controller.ts` con funciones: `crearTramite`, `listarTramites`, `obtenerTramite`
  - [x] 3.2 Actualizar `crearTramite`: validar campos obligatorios nuevos (`numero_ticket`, `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`), validar que `checklist_documentacion` y `checklist_proyecto` sean `true` (HTTP 422 si no), guardar `fecha_registro` automáticamente
  - [x] 3.3 Implementar `aprobarTramite`: comentario obligatorio (HTTP 422 si vacío), `fecha_compromiso` obligatoria y futura (HTTP 422 si falta o es pasada), transición `EN_REVISION → EN_PROCESO`, notificar a Claudina (`unidad_id=35`), registrar en `auditoria_tramites` con comentario
  - [x] 3.4 Implementar `rechazarTramite`: comentario obligatorio (HTTP 422 si vacío), transición `EN_REVISION → RECHAZADO`, notificar al Creador, registrar en `auditoria_tramites` con comentario
  - [x] 3.5 Implementar `devolverAlDelegado`: comentario obligatorio (HTTP 422 si vacío), transición `EN_REVISION → DEVUELTO_DELEGADO`, notificar al Creador con el comentario, registrar en `auditoria_tramites`
  - [x] 3.6 Implementar `cerrarProceso` (Claudina): comentario de cierre obligatorio (HTTP 422 si vacío), transición `EN_PROCESO → FINALIZADO`, guardar `fecha_cierre` automáticamente, notificar al Creador y al Revisor, registrar en `auditoria_tramites`
  - [x] 3.7 Implementar `devolverAlJuridico` (Claudina): comentario obligatorio (HTTP 422 si vacío), transición `EN_PROCESO → DEVUELTO_JURIDICO`, notificar al Revisor con el comentario, registrar en `auditoria_tramites`
  - [x] 3.8 Implementar `reenviarDesdeDevuelto` (Delegado): validar que ambos checklists sean `true` (HTTP 422 si no), permitir edición de `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `checklist_documentacion`, `checklist_proyecto`, `comentarios`, transición `DEVUELTO_DELEGADO → NUEVO`, registrar en `auditoria_tramites`
  - [x] 3.9 Implementar `reenviarDesdeDevueltoJuridico` (Oscar): comentario obligatorio, transición `DEVUELTO_JURIDICO → EN_PROCESO`, notificar a Claudina, registrar en `auditoria_tramites`
  - [x] 3.10 Implementar `agregarComentario` y `listarComentarios`

- [x] 4. Backend — Routes y registro
  - [x] 4.1 Crear `src/modules/tramites/tramites.routes.ts` con todos los endpoints
  - [x] 4.2 Actualizar `tramites.routes.ts`: agregar endpoints para `devolverAlDelegado`, `cerrarProceso`, `devolverAlJuridico`, `reenviarDesdeDevuelto`, `reenviarDesdeDevueltoJuridico`
  - [x] 4.3 Crear `src/modules/tramites/tramites.registry.ts` con métricas para ModuleRegistry
  - [x] 4.4 Actualizar `tramites.registry.ts`: incluir `DEVUELTO_DELEGADO` y `DEVUELTO_JURIDICO` en `activos`, incluir `DEVUELTO_DELEGADO` en `pendientes`
  - [x] 4.5 Montar el router en `src/server.ts` y registrar en ModuleRegistry

- [x] 5. Frontend — Dashboard_Tramites.tsx
  - [x] 5.1 Implementar detección de rol (Creador, Revisor, Finalizador, Supervisora)
  - [x] 5.2 Implementar vista Creador: lista de trámites con estatus, modal "Nuevo Trámite" con campos: `numero_ticket`, `nombre_solicitante`, `correo_solicitante`, `telefono_solicitante`, `titulo`, `descripcion`, `tipo_tramite`, dos checklists obligatorios, `comentarios` opcional; bloquear envío si algún checklist no está marcado
  - [x] 5.3 Implementar vista Creador — tickets devueltos: mostrar tickets en `DEVUELTO_DELEGADO` con el comentario del Revisor visible, formulario de edición de campos permitidos y botón "Reenviar" (valida checklists antes de enviar)
  - [x] 5.4 Implementar vista Revisor (Oscar Gopar): lista completa de trámites, panel de detalle con tres acciones explícitas:
    - Botón **"Turnar a TICS"**: campo comentario obligatorio + campo fecha compromiso (fecha futura obligatoria)
    - Botón **"Regresar al Delegado"**: campo comentario obligatorio
    - Botón **"Rechazar"**: campo comentario obligatorio
  - [x] 5.5 Implementar vista Revisor — tickets devueltos por Claudina: mostrar tickets en `DEVUELTO_JURIDICO` con comentario de Claudina visible, campo comentario obligatorio y botón "Reenviar a TICS"
  - [x] 5.6 Implementar vista Finalizador (Claudina): lista de trámites en `EN_PROCESO`, panel de detalle con dos acciones:
    - Botón **"Cerrar Proceso"**: campo comentario obligatorio; al confirmar guarda `fecha_cierre` automáticamente
    - Botón **"Devolver a Jurídico"**: campo comentario obligatorio
  - [x] 5.7 Implementar vista Supervisora (Mariann): lista completa solo lectura con filtros por estatus, tipo y rango de fechas
  - [x] 5.8 Implementar panel de detalle compartido: historial de auditoría con estado anterior → nuevo, usuario, fecha y comentario de cada transición; sección de comentarios ordenados por fecha

- [x] 6. Notificaciones en el frontend
  - [x] 6.1 Agregar íconos y colores para todos los tipos de notificación en `NotificationBell.tsx`: `TRAMITE_NUEVO`, `TRAMITE_APROBADO`, `TRAMITE_RECHAZADO`, `TRAMITE_FINALIZADO`, `TRAMITE_DEVUELTO_DELEGADO`, `TRAMITE_DEVUELTO_JURIDICO`
