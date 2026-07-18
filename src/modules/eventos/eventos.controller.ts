/**
 * Controller: Supervisión de Eventos
 * File: src/modules/eventos/eventos.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  POST   /eventos                              → crearEvento
 *  GET    /eventos                              → listarEventos
 *  GET    /eventos/mis-tareas                   → listarTareasArea
 *  GET    /eventos/:id                          → obtenerEvento
 *  POST   /eventos/:id/tareas                   → agregarTarea
 *  PATCH  /eventos/:id/tareas/:tareaId/estado   → actualizarEstadoTarea
 *  PATCH  /eventos/:id/cerrar                   → cerrarEvento
 *
 * Reglas de autorización:
 *  - DIRECTOR con oficina_id = 5 (DIRECCION GENERAL) → Directora General
 *  - DIRECTOR con otro oficina_id                    → Director de Área
 */

import { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { storage }  from '../../services/storage.service';
import { notifyEventoTarea } from '../../notifications/notification.dispatcher';
import { logger }   from '../../utils/logger';
import {
  isValidTransition,
  isVencida,
  isProximaAVencer,
  type CrearEventoBody,
  type CrearTareaBody,
  type ActualizarEstadoTareaBody,
  type EstadoTarea,
} from './eventos.types';

/**
 * ID de la unidad DIRECCION_GENERAL.
 * Se resuelve dinámicamente al primer uso para no depender de un valor hardcodeado.
 * El seed garantiza que la Dirección General es la primera unidad insertada (id=1),
 * pero lo consultamos por tipo para mayor robustez.
 */
let _idDireccionGeneral: number | null = null;

async function getIdDireccionGeneral(): Promise<number> {
  if (_idDireccionGeneral !== null) return _idDireccionGeneral;
  const row = await db('catalogo_unidades')
    .where({ tipo: 'DIRECCION_GENERAL', activo: true })
    .select('id')
    .first();
  if (!row) throw new AppError('No se encontró la unidad DIRECCION_GENERAL en la BD', 500);
  _idDireccionGeneral = row.id as number;
  return _idDireccionGeneral;
}

/**
 * Resuelve el ID de la Directora General consultando la BD en tiempo de ejecución.
 * Identifica al usuario con rol DIRECTOR en la unidad de tipo DIRECCION_GENERAL.
 * Si hay más de uno, retorna el de menor id (resultado determinista).
 * Lanza AppError 503 si no existe ninguno.
 *
 * No usa caché para reflejar cambios de asignación sin reiniciar el servidor.
 */
async function resolverDirectoraGeneral(db: Knex): Promise<number> {
  const rows = await db('usuarios as u')
    .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
    .where('cu.tipo', 'DIRECCION_GENERAL')
    .where('u.rol', 'DIRECTOR')
    .where('u.activo', true)
    .select('u.id')
    .orderBy('u.id', 'asc');

  if (rows.length === 0) {
    throw new AppError(
      'El segundo nivel de revisión no está configurado: no existe un Director activo en la unidad DIRECCION_GENERAL',
      503,
    );
  }

  return rows[0].id as number;
}

// ── Asistentes de la Directora General ────────────────────────
/**
 * Asistentes de la DG que ACTÚAN como la Directora General en este módulo:
 * tienen los mismos permisos y roles que ella (crear/cerrar eventos, aprobar y
 * devolver en revisión final, asignar responsable). Se identifican por email,
 * igual que en la migración `asistentes_dg_observadores`, y deben estar en la
 * unidad de tipo DIRECCION_GENERAL.
 */
const ASISTENTES_DG_EMAILS = [
  'fabianmontiel',
  'taniahuerta',
];

function esAsistenteDG(user: any): boolean {
  return user?.unidad_tipo === 'DIRECCION_GENERAL'
    && ASISTENTES_DG_EMAILS.includes(String(user?.email ?? '').toLowerCase());
}

/** true si el usuario actúa como la DG: la DG real o uno de sus asistentes. */
function actuaComoDG(user: any): boolean {
  return user?.rol === 'DIRECTOR' || esAsistenteDG(user);
}

// ── Guards ────────────────────────────────────────────────────

function requireDirector(req: Request): void {
  // Acceso de lectura: DIRECTOR, PARTICULAR, o cualquier usuario de Dirección
  // General (la DG y sus asistentes observadores pueden VER; las acciones
  // del flujo tienen guardas propias que exigen rol DIRECTOR).
  const esDireccionGeneral = (req.user as any)?.unidad_tipo === 'DIRECCION_GENERAL';
  if (req.user?.rol !== 'DIRECTOR' && req.user?.rol !== 'PARTICULAR' && !esDireccionGeneral) {
    throw new AppError('Acceso restringido al Director', 403);
  }
}

/** Exige actuar como director: rol DIRECTOR o asistente de la DG. */
function requireRolDirector(req: Request): void {
  if (!actuaComoDG(req.user)) {
    throw new AppError('Esta acción está restringida a directores', 403);
  }
}

// ── Helper: resolver encargado N1 de un operativo ────────────
/**
 * Dado el unidad_id de un operativo, busca el DIRECTOR activo de esa misma unidad.
 * Ese director es el revisor N1 de las tareas del operativo.
 * Retorna null si la unidad no tiene un director activo.
 */
async function resolverEncargadoN1(unidad_id: number): Promise<number | null> {
  const director = await db('usuarios')
    .where({ unidad_id, rol: 'DIRECTOR', activo: true })
    .select('id')
    .orderBy('id', 'asc')
    .first();
  return director?.id ?? null;
}

// Nota: el auto-cierre de eventos se eliminó. Los eventos permanecen ABIERTOS
// aunque todas sus tareas estén finalizadas, para poder agregar más tareas.
// El cierre es siempre manual y con justificación (ver cerrarEvento).

// ── POST /eventos ─────────────────────────────────────────────

export async function crearEvento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);
    requireRolDirector(req); // cualquier DIRECTOR puede crear; bloquea observadores/operativos

    // Tipo de evento según quién lo crea:
    //   · DG (DIRECCION_GENERAL) → evento que requiere aprobación final de la DG
    //   · Director de área       → evento privado de su equipo, él da la aprobación final
    const idDG = await getIdDireccionGeneral();
    const esDG = req.user!.oficina_id === idDG;
    const requiereAprobacionDG = esDG;

    const { titulo, descripcion, director_ids, fecha_programada, responsable_id } = req.body as CrearEventoBody;

    if (!titulo?.trim()) {
      throw new AppError('El título del evento es requerido', 422);
    }

    // La fecha del evento es OPCIONAL. Si se proporciona, validar que no sea pasada.
    if (fecha_programada) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaEvento = new Date(fecha_programada);
      if (fechaEvento < hoy) {
        throw new AppError('La fecha programada del evento no puede ser en el pasado', 422);
      }
    }

    // El responsable y los directores participantes SOLO aplican a eventos de la DG.
    // Un director de área crea un evento privado de su propio equipo.
    const responsableVal = esDG ? (responsable_id ?? null) : null;
    if (esDG && responsableVal !== null) {
      const resp = await db('usuarios').where({ id: responsableVal, activo: true }).first();
      if (!resp || resp.rol !== 'DIRECTOR') {
        throw new AppError('El responsable debe ser un director de área activo', 422);
      }
    }

    const [evento] = await db('eventos')
      .insert({
        titulo:                 titulo.trim(),
        descripcion:            descripcion?.trim() ?? null,
        estado:                 'ABIERTO',
        creado_por_id:          req.user!.id,
        fecha_creacion:         db.fn.now(),
        fecha_programada:       fecha_programada ?? null,
        responsable_id:         responsableVal,
        requiere_aprobacion_dg: requiereAprobacionDG,
      })
      .returning(['id', 'titulo', 'descripcion', 'estado', 'creado_por_id', 'fecha_creacion', 'fecha_cierre', 'fecha_programada', 'responsable_id', 'requiere_aprobacion_dg']);

    // Directores participantes — solo para eventos de la DG
    if (esDG) {
      const participantes = new Set<number>();
      if (Array.isArray(director_ids)) {
        director_ids.forEach((id: number) => participantes.add(Number(id)));
      }
      if (responsableVal) participantes.add(Number(responsableVal));
      participantes.delete(req.user!.id);
      if (participantes.size > 0) {
        const rows = [...participantes].map((director_id) => ({ evento_id: evento.id, director_id }));
        await db('evento_directores').insert(rows).onConflict(['evento_id', 'director_id']).ignore();
      }
    }

    res.status(201).json({ data: evento, message: 'Evento creado correctamente' });
  } catch (err) { next(err); }
}

// ── GET /eventos ──────────────────────────────────────────────

export async function listarEventos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    let query = db('eventos as e')
      .select(
        'e.id',
        'e.titulo',
        'e.descripcion',
        'e.estado',
        'e.creado_por_id',
        'e.fecha_creacion',
        'e.fecha_cierre',
        'e.responsable_id',
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id)::int AS total_tareas`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado = 'PENDIENTE')::int AS tareas_pendiente`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado = 'EN_PROGRESO')::int AS tareas_en_progreso`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado IN ('COMPLETADA','FINALIZADO'))::int AS tareas_completada`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado NOT IN ('COMPLETADA','FINALIZADO') AND t.fecha_programada < CURRENT_DATE)::int AS tareas_vencidas`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado NOT IN ('COMPLETADA','FINALIZADO') AND t.fecha_programada BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days')::int AS tareas_proximas`),
      )
      .orderBy('e.fecha_creacion', 'desc');

    // Directora General ve todos los eventos de SU flujo; directores de área ven los suyos
    // + en los que participan. Los eventos privados de directores (requiere_aprobacion_dg=false)
    // NO los ve la DG.
    const idDG = await getIdDireccionGeneral();
    if (req.user!.oficina_id === idDG) {
      query = query.where('e.requiere_aprobacion_dg', true);
    } else {
      query = query.where(function () {
        this.where('e.creado_por_id', req.user!.id)
          .orWhereExists(
            db('evento_directores')
              .where('evento_directores.evento_id', db.ref('e.id'))
              .where('evento_directores.director_id', req.user!.id)
              .select(1),
          );
      });
    }

    const eventos = await query;
    res.json({ data: eventos });
  } catch (err) { next(err); }
}

// ── GET /eventos/:id ──────────────────────────────────────────

export async function obtenerEvento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    const id = parseInt(req.params.id, 10);

    const evento = await db('eventos')
      .select('id', 'titulo', 'descripcion', 'estado', 'fecha_creacion', 'fecha_cierre', 'fecha_programada', 'creado_por_id', 'responsable_id', 'requiere_aprobacion_dg', 'justificacion_cierre', 'cerrado_por_id')
      .where({ id })
      .first();

    if (!evento) throw new AppError('Evento no encontrado', 404);

    // Determinar si quien consulta es la DG o el responsable del evento
    const idDG = await getIdDireccionGeneral();
    const esDG = req.user!.oficina_id === idDG;

    // Los eventos privados de un director NO son visibles para la DG
    if (esDG && evento.requiere_aprobacion_dg === false) {
      throw new AppError('Evento no encontrado', 404);
    }
    const esResponsable = evento.responsable_id === req.user!.id;

    let tareasQuery = db('tareas_evento as t')
      .join('usuarios as u', 'u.id', 't.asignado_a_id')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .leftJoin('usuarios as ur', 'ur.id', 't.reasignado_a_id')
      .select(
        't.id',
        't.evento_id',
        't.titulo',
        't.descripcion',
        't.asignado_a_id',
        'u.nombre as asignado_a_nombre',
        'u.unidad_id as asignado_unidad_id',
        'cu.nombre as asignado_unidad_nombre',
        't.reasignado_a_id',
        'ur.nombre as reasignado_a_nombre',
        't.estado',
        't.fecha_programada',
        't.fecha_compromiso',
        't.fecha_actualizacion',
      )
      .where('t.evento_id', id);

    // REGLA: Director de Área solo ve tareas de su propia unidad.
    // La DG y el RESPONSABLE del evento ven todas las tareas del evento.
    // Así un director normal no ve las tareas de otra área, pero el
    // responsable designado coordina el evento completo.
    if (!esDG && !esResponsable) {
      tareasQuery = tareasQuery.where('u.unidad_id', req.user!.oficina_id);
    }

    const tareasRaw = await tareasQuery.orderBy('t.id', 'asc');

    // REGLA: La Directora General NO ve quién fue asignado a cada actividad.
    // En su lugar ve al director responsable del área (o el nombre del área).
    // Construimos un mapa unidad_id → nombre del director responsable.
    let directorPorUnidad = new Map<number, string>();
    if (esDG) {
      const unidadIds = [...new Set(tareasRaw.map((t: any) => t.asignado_unidad_id))];
      if (unidadIds.length > 0) {
        const directores = await db('usuarios')
          .whereIn('unidad_id', unidadIds)
          .where({ rol: 'DIRECTOR', activo: true })
          .select('unidad_id', 'nombre')
          .orderBy('id', 'asc');
        for (const d of directores) {
          if (!directorPorUnidad.has(d.unidad_id)) {
            directorPorUnidad.set(d.unidad_id, d.nombre);
          }
        }
      }
    }

    const tareas = tareasRaw.map((t) => {
      const fechaStr = typeof t.fecha_programada === 'string'
        ? t.fecha_programada
        : (t.fecha_programada as Date).toISOString().split('T')[0];

      // Para la DG: ocultar el operativo asignado, mostrar el director del área
      // (o el nombre del área si la unidad no tiene director activo).
      const nombreParaDG = directorPorUnidad.get(t.asignado_unidad_id)
        ?? t.asignado_unidad_nombre;

      return {
        ...t,
        asignado_a_nombre:   esDG ? nombreParaDG : t.asignado_a_nombre,
        // La DG nunca ve el reasignado (operativo delegado)
        reasignado_a_id:     esDG ? null : t.reasignado_a_id,
        reasignado_a_nombre: esDG ? null : t.reasignado_a_nombre,
        fecha_programada: fechaStr,
        vencida:          isVencida(fechaStr, t.estado as EstadoTarea),
        proxima_a_vencer: isProximaAVencer(fechaStr, t.estado as EstadoTarea),
      };
    });

    // Directores participantes del evento
    const directoresParticipantes = await db('evento_directores as ed')
      .join('usuarios as u', 'u.id', 'ed.director_id')
      .select('u.id', 'u.nombre')
      .where('ed.evento_id', id);

    // Nombre del responsable (si hay)
    let responsable_nombre: string | null = null;
    if (evento.responsable_id) {
      const r = await db('usuarios').select('nombre').where({ id: evento.responsable_id }).first();
      responsable_nombre = r?.nombre ?? null;
    }

    // Nombre de quien cerró el evento (si está cerrado)
    let cerrado_por_nombre: string | null = null;
    if (evento.cerrado_por_id) {
      const c = await db('usuarios').select('nombre').where({ id: evento.cerrado_por_id }).first();
      cerrado_por_nombre = c?.nombre ?? null;
    }

    res.json({
      data: {
        ...evento,
        responsable_nombre,
        cerrado_por_nombre,
        es_responsable: esResponsable,
        tareas,
        directores_participantes: directoresParticipantes,
      },
    });
  } catch (err) { next(err); }
}

// ── POST /eventos/:id/tareas ──────────────────────────────────

export async function agregarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);
    requireRolDirector(req); // solo directores crean tareas (no observadores)

    const eventoId = parseInt(req.params.id, 10);
    const { titulo, descripcion, asignado_a_id, fecha_programada } = req.body as CrearTareaBody;

    if (!titulo?.trim())    throw new AppError('El título de la tarea es requerido', 422);
    if (!asignado_a_id)     throw new AppError('El campo asignado_a_id es requerido', 422);
    if (!fecha_programada)  throw new AppError('La fecha programada es requerida', 422);

    // Verificar que el evento existe
    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') throw new AppError('No se pueden agregar tareas a un evento cerrado', 409);

    const idDG = await getIdDireccionGeneral();
    const usuarioEsDG     = req.user!.oficina_id === idDG;
    const esCreadorEvento = req.user!.id === evento.creado_por_id;
    const esResponsable   = evento.responsable_id === req.user!.id;

    // Un Director de Área puede agregar tareas si:
    //   a) Es el creador del evento, O
    //   b) Es el responsable del evento, O
    //   c) Está registrado como participante en evento_directores
    if (!usuarioEsDG && !esCreadorEvento && !esResponsable) {
      const participa = await db('evento_directores')
        .where({ evento_id: eventoId, director_id: req.user!.id })
        .first();
      if (!participa) {
        throw new AppError('Solo los directores participantes del evento pueden agregar tareas', 403);
      }
    }

    // Validar asignado según quién agrega:
    //   - DG o RESPONSABLE → pueden asignar a cualquier DIRECTOR de área
    //   - Director de Área normal → solo a OPERATIVOS de su unidad o a sí mismo
    const asignado = await db('usuarios')
      .select('id', 'rol', 'unidad_id')
      .where({ id: asignado_a_id })
      .first();
    if (!asignado) throw new AppError('El usuario asignado no existe', 404);

    if (usuarioEsDG) {
      if (asignado.rol !== 'DIRECTOR') {
        throw new AppError('La Directora General solo puede asignar tareas a directores de área', 422);
      }
    } else if (esResponsable) {
      // El responsable coordina el evento: puede asignar a otros directores,
      // a sí mismo, o a operativos de su propia unidad.
      const esAutoasignacion = Number(asignado_a_id) === req.user!.id;
      if (!esAutoasignacion && asignado.rol === 'OPERATIVO' && asignado.unidad_id !== req.user!.oficina_id) {
        throw new AppError('Solo puedes asignar a operativos de tu propia dirección; a otras áreas asigna al director', 422);
      }
    } else {
      // Director de Área normal: puede asignar a sí mismo o a sus operativos
      const esAutoasignacion = Number(asignado_a_id) === req.user!.id;
      if (!esAutoasignacion) {
        if (asignado.rol !== 'OPERATIVO') {
          throw new AppError('Solo puedes asignar tareas a tu equipo operativo o a ti mismo', 422);
        }
        if (asignado.unidad_id !== req.user!.oficina_id) {
          throw new AppError('Solo puedes asignar tareas a colaboradores de tu misma dirección', 422);
        }
      }
    }

    // En eventos de la DG, si se asigna la tarea a un director de área, se
    // registra automáticamente como participante del evento (evita que quede
    // con una tarea sin aparecer en la lista de participantes).
    if (evento.requiere_aprobacion_dg && asignado.rol === 'DIRECTOR' && asignado.unidad_id !== idDG) {
      await db('evento_directores')
        .insert({ evento_id: eventoId, director_id: Number(asignado_a_id) })
        .onConflict(['evento_id', 'director_id']).ignore();
    }

    const [tarea] = await db('tareas_evento')
      .insert({
        evento_id:           eventoId,
        titulo:              titulo.trim(),
        descripcion:         descripcion?.trim() ?? null,
        asignado_a_id:       Number(asignado_a_id),
        estado:              'PENDIENTE',
        fecha_programada,
        fecha_actualizacion: db.fn.now(),
      })
      .returning([
        'id', 'evento_id', 'titulo', 'descripcion',
        'asignado_a_id', 'estado', 'fecha_programada', 'fecha_actualizacion',
      ]);

    res.status(201).json({ data: tarea, message: 'Tarea creada correctamente' });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/responsable ────────────────────────────
/**
 * La Directora General designa (o cambia) al director responsable del evento.
 * Body: { responsable_id: number | null }  (null = quitar responsable)
 */
export async function setResponsable(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    const eventoId = parseInt(req.params.id, 10);
    const { responsable_id } = req.body as { responsable_id: number | null };

    // Solo la DG puede designar responsable
    const idDG = await getIdDireccionGeneral();
    if (req.user!.oficina_id !== idDG || !actuaComoDG(req.user)) {
      throw new AppError('Solo la Directora General puede asignar el responsable del evento', 403);
    }

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // Validar el nuevo responsable (si no es null)
    if (responsable_id !== null && responsable_id !== undefined) {
      const resp = await db('usuarios').where({ id: responsable_id, activo: true }).first();
      if (!resp || resp.rol !== 'DIRECTOR') {
        throw new AppError('El responsable debe ser un director de área activo', 422);
      }
      // Asegurar que el responsable también sea participante del evento
      await db('evento_directores')
        .insert({ evento_id: eventoId, director_id: responsable_id })
        .onConflict(['evento_id', 'director_id']).ignore();
    }

    await db('eventos').where({ id: eventoId }).update({ responsable_id: responsable_id ?? null });

    res.json({ message: 'Responsable del evento actualizado', responsable_id: responsable_id ?? null });
  } catch (err) { next(err); }
}

// ── POST /eventos/:id/directores ──────────────────────────────
/**
 * Agrega un director participante a un evento de la DG ya creado (aunque tenga
 * actividades), por si más adelante resulta necesario sumar a alguien.
 * Solo la Directora General (o sus asistentes). Body: { director_id: number }
 */
export async function agregarDirector(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    const eventoId = parseInt(req.params.id, 10);
    const { director_id } = req.body as { director_id: number };

    const idDG = await getIdDireccionGeneral();
    if (req.user!.oficina_id !== idDG || !actuaComoDG(req.user)) {
      throw new AppError('Solo la Directora General puede agregar participantes', 403);
    }

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden agregar participantes a un evento cerrado', 409);
    }
    if (!evento.requiere_aprobacion_dg) {
      throw new AppError('Solo los eventos de la Dirección General tienen directores participantes', 422);
    }

    if (!director_id) throw new AppError('director_id es requerido', 422);
    const dir = await db('usuarios').where({ id: director_id, activo: true }).first();
    if (!dir || dir.rol !== 'DIRECTOR' || dir.unidad_id === idDG) {
      throw new AppError('El participante debe ser un director de área activo', 422);
    }

    await db('evento_directores')
      .insert({ evento_id: eventoId, director_id })
      .onConflict(['evento_id', 'director_id']).ignore();

    // Devolver la lista actualizada de participantes
    const participantes = await db('evento_directores as ed')
      .join('usuarios as u', 'u.id', 'ed.director_id')
      .where('ed.evento_id', eventoId)
      .select('u.id', 'u.nombre')
      .orderBy('u.nombre', 'asc');

    res.json({ data: participantes, message: 'Participante agregado correctamente' });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/estado ─────────────────

export async function actualizarEstadoTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tareaId = parseInt(req.params.tareaId, 10);
    const { estado: nuevoEstado } = req.body as ActualizarEstadoTareaBody;

    const tarea = await db('tareas_evento').where({ id: tareaId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    // Quién trabaja la tarea:
    //   · Delegada (reasignado)  → SOLO el colaborador delegado. El director ya
    //     no la trabaja: su rol pasa a revisor (N1).
    //   · No delegada            → el asignado directo.
    const esDelegada  = !!tarea.reasignado_a_id;
    const puedeTrabajar = esDelegada
      ? req.user!.id === tarea.reasignado_a_id
      : req.user!.id === tarea.asignado_a_id;
    if (!puedeTrabajar) {
      throw new AppError(
        esDelegada
          ? 'La tarea está delegada: solo el colaborador delegado puede trabajarla'
          : 'Solo el responsable asignado puede actualizar esta tarea',
        403,
      );
    }

    // Validar transición de estado
    if (!isValidTransition(tarea.estado as EstadoTarea, nuevoEstado)) {
      throw new AppError(
        `Transición de estado inválida: ${tarea.estado} → ${nuevoEstado}`,
        422,
      );
    }

    const [tareaActualizada] = await db('tareas_evento')
      .where({ id: tareaId })
      .update({
        estado:              nuevoEstado,
        fecha_actualizacion: db.fn.now(),
      })
      .returning([
        'id', 'evento_id', 'titulo', 'descripcion',
        'asignado_a_id', 'estado', 'fecha_programada', 'fecha_actualizacion',
      ]);

    res.json({ data: tareaActualizada });

    // Notificar al dueño del evento sobre el cambio de estado
    const evento = await db('eventos').where({ id: tarea.evento_id }).select('titulo', 'creado_por_id').first();
    if (evento && evento.creado_por_id !== req.user!.id) {
      notifyEventoTarea({
        recipient_id:  evento.creado_por_id,
        event:         'TAREA_ESTADO',
        title:         `Tarea actualizada`,
        body:          `${req.user!.nombre} cambió el estado de "${tarea.titulo}" a ${nuevoEstado}`,
        tarea_id:      tareaId,
        evento_titulo: evento.titulo,
      }).catch(() => {});
    }
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/cerrar ─────────────────────────────────

export async function cerrarEvento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Cualquier DIRECTOR puede cerrar sus propios eventos
    requireDirector(req);
    requireRolDirector(req); // observadores no pueden cerrar

    const id = parseInt(req.params.id, 10);

    // La justificación del cierre es obligatoria (queda como registro).
    const justificacion = String((req.body?.justificacion ?? '')).trim();
    if (!justificacion) {
      throw new AppError('La justificación del cierre es obligatoria', 422);
    }

    const evento = await db('eventos').where({ id }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    if (evento.estado === 'CERRADO') {
      throw new AppError('El evento ya está cerrado', 409);
    }

    // Quién puede cerrar:
    //   · Evento de la DG  → solo la Directora General
    //   · Evento de director → solo el director que lo creó
    const idDG = await getIdDireccionGeneral();
    const esDG = req.user!.oficina_id === idDG;
    if (evento.requiere_aprobacion_dg) {
      if (!esDG) throw new AppError('Solo la Directora General puede cerrar este evento', 403);
    } else {
      if (req.user!.id !== evento.creado_por_id) {
        throw new AppError('Solo el director que creó el evento puede cerrarlo', 403);
      }
    }

    const [eventoActualizado] = await db('eventos')
      .where({ id })
      .update({
        estado:               'CERRADO',
        fecha_cierre:         db.fn.now(),
        justificacion_cierre: justificacion,
        cerrado_por_id:       req.user!.id,
      })
      .returning(['id', 'titulo', 'descripcion', 'estado', 'fecha_creacion', 'fecha_cierre', 'justificacion_cierre']);

    res.json({ data: eventoActualizado, message: 'Evento cerrado correctamente' });
  } catch (err) { next(err); }
}

// ── GET /eventos/mis-tareas ───────────────────────────────────

export async function listarTareasArea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Accesible para DIRECTOR y OPERATIVO — ambos pueden tener tareas asignadas
    const userId = req.user!.id;
    const { estado, evento_id } = req.query;

    let query = db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .leftJoin('usuarios as ur', 'ur.id', 't.reasignado_a_id')
      .select(
        't.id',
        't.evento_id',
        'e.titulo as evento_titulo',
        't.titulo',
        't.descripcion',
        't.asignado_a_id',
        't.reasignado_a_id',
        'ur.nombre as reasignado_a_nombre',
        't.estado',
        't.fecha_programada',
        't.fecha_compromiso',
        't.fecha_actualizacion',
      )
      // El usuario ve las tareas asignadas a él directamente O delegadas a él
      // (reasignado), para que el colaborador delegado pueda trabajarlas.
      .where(function () {
        this.where('t.asignado_a_id', userId).orWhere('t.reasignado_a_id', userId);
      });

    // Una tarea DEVUELTO_DG está en manos del DIRECTOR de área (el asignado):
    // el colaborador delegado no la ve como pendiente suya hasta que el director
    // se la baje con observaciones (pasa a DEVUELTO).
    query = query.whereRaw(`NOT (t.estado = 'DEVUELTO_DG' AND t.asignado_a_id <> ?)`, [userId]);

    if (estado) {
      query = query.where('t.estado', estado as string);
    }

    if (evento_id) {
      query = query.where('t.evento_id', Number(evento_id));
    }

    const tareasRaw = await query.orderBy('t.fecha_programada', 'asc');

    const tareas = tareasRaw.map((t) => {
      const fechaStr = typeof t.fecha_programada === 'string'
        ? t.fecha_programada
        : (t.fecha_programada as Date).toISOString().split('T')[0];
      return {
        ...t,
        fecha_programada: fechaStr,
        vencida:          isVencida(fechaStr, t.estado as EstadoTarea),
        proxima_a_vencer: isProximaAVencer(fechaStr, t.estado as EstadoTarea),
      };
    });

    res.json({ data: tareas });
  } catch (err) { next(err); }
}

// ── POST /eventos/:id/tareas/:tareaId/comentarios ─────────────

export async function agregarComentario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tareaId = parseInt(req.params.tareaId, 10);
    const { contenido } = req.body as { contenido: string };

    if (!contenido?.trim()) {
      throw new AppError('El contenido del comentario es requerido', 422);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    // Puede comentar:
    // - El asignado directo (OPERATIVO o DIRECTOR)
    // - El dueño del evento (director que creó el evento)
    // - La Directora General (puede comentar en cualquier tarea)
    const evento = await db('eventos').where({ id: tarea.evento_id }).select('creado_por_id', 'titulo').first();
    const esDueno    = evento?.creado_por_id === req.user!.id;
    const esAsignado = req.user!.id === tarea.asignado_a_id;
    const esDelegado = req.user!.id === tarea.reasignado_a_id;
    const idDG       = await getIdDireccionGeneral();
    const esDG       = req.user!.oficina_id === idDG;

    if (!esAsignado && !esDelegado && !esDueno && !esDG) {
      throw new AppError('Solo el responsable asignado, el colaborador delegado, el director del evento o la Directora General puede comentar', 403);
    }

    const [comentario] = await db('comentarios_tarea')
      .insert({
        tarea_id:  tareaId,
        autor_id:  req.user!.id,
        contenido: contenido.trim(),
        creado_en: db.fn.now(),
      })
      .returning(['id', 'tarea_id', 'autor_id', 'contenido', 'creado_en']);

    // Devolver con autor_nombre para que el frontend pueda renderizarlo sin recargar
    res.status(201).json({
      data: { ...comentario, autor_nombre: req.user!.nombre },
      message: 'Comentario agregado',
    });

    // ── Notificar según jerarquía ─────────────────────────
    // Obtener info del evento para el título
    if (!evento) return;

    const autorRol = req.user!.rol;
    let recipientId: number | null = null;

    if (autorRol === 'OPERATIVO') {
      // Operativo comenta → notificar al director dueño del evento
      recipientId = evento.creado_por_id;
    } else if (autorRol === 'DIRECTOR') {
      const idDG = await getIdDireccionGeneral();
      if (req.user!.oficina_id === idDG) {
        // DG comenta → notificar al director asignado a la tarea
        recipientId = tarea.asignado_a_id;
      } else {
        // Director de área comenta → notificar a la DG
        const dgUser = await db('usuarios')
          .join('catalogo_unidades as cu', 'cu.id', 'usuarios.unidad_id')
          .where('cu.tipo', 'DIRECCION_GENERAL')
          .where('usuarios.rol', 'DIRECTOR')
          .select('usuarios.id')
          .first();
        recipientId = dgUser?.id ?? null;
      }
    }

    if (recipientId && recipientId !== req.user!.id) {
      notifyEventoTarea({
        recipient_id:  recipientId,
        event:         'TAREA_COMENTARIO',
        title:         `Nuevo comentario en tarea`,
        body:          `${req.user!.nombre} comentó en "${tarea.titulo}": ${contenido.trim().slice(0, 80)}${contenido.length > 80 ? '…' : ''}`,
        tarea_id:      tareaId,
        evento_titulo: evento.titulo,
      }).catch(() => {});
    }
  } catch (err) { next(err); }
}

// ── GET /eventos/:id/tareas/:tareaId/comentarios ──────────────

export async function listarComentarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tareaId = parseInt(req.params.tareaId, 10);

    const tarea = await db('tareas_evento').where({ id: tareaId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const idDG = await getIdDireccionGeneral();
    const esDG = actuaComoDG(req.user) && req.user!.oficina_id === idDG;

    // ── Reglas de acceso ─────────────────────────────────────────
    // DG        → acceso total (el filtro de visibilidad se aplica abajo)
    // Director  → puede ver si es el asignado directo OR
    //             es el encargado N1 (mismo unidad_id que el asignado)
    // Operativo → solo las tareas donde él es asignado_a_id
    const rol = req.user!.rol;

    if (!esDG) {
      if (rol === 'DIRECTOR') {
        const esAsignado = req.user!.id === tarea.asignado_a_id;
        if (!esAsignado) {
          // Verificar si es el encargado jerárquico (N1) de la unidad del asignado
          const asignadoUnidad = await db('usuarios')
            .where({ id: tarea.asignado_a_id })
            .select('unidad_id')
            .first();
          const esEncargado = asignadoUnidad?.unidad_id === req.user!.oficina_id;
          // O el responsable del evento (observador: ve avances de todo el evento)
          const eventoResp = await db('eventos').where({ id: tarea.evento_id }).select('responsable_id').first();
          const esResponsable = eventoResp?.responsable_id === req.user!.id;
          if (!esEncargado && !esResponsable) {
            throw new AppError('No tienes permiso para ver estos comentarios', 403);
          }
        }
      } else if (rol === 'OPERATIVO') {
        // El operativo asignado directamente O el colaborador delegado (reasignado)
        if (req.user!.id !== tarea.asignado_a_id && req.user!.id !== tarea.reasignado_a_id) {
          throw new AppError('No tienes permiso para ver estos comentarios', 403);
        }
      } else {
        throw new AppError('No tienes permiso para ver estos comentarios', 403);
      }
    }

    // ── Consulta con filtro de visibilidad ───────────────────────
    // REGLA: la DG NO ve la comunicación interna Operativo↔Director de área.
    //        Solo ve comentarios de otros DIRECTORs (canal Director↔DG).
    //        Los datos completos se conservan en BD para auditoría.
    let query = db('comentarios_tarea as c')
      .join('usuarios as u', 'u.id', 'c.autor_id')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'c.id',
        'c.tarea_id',
        'c.contenido',
        'c.creado_en',
        'u.id  as autor_id',
        'u.nombre as autor_nombre',
        'u.rol as autor_rol',
        'cu.tipo as autor_unidad_tipo',
      )
      .where('c.tarea_id', tareaId);

    if (esDG) {
      // DG: oculta comentarios de OPERATIVOs — solo canal DIRECTOR↔DG
      query = query.where('u.rol', 'DIRECTOR');
    }

    const comentariosRaw = await query.orderBy('c.creado_en', 'asc');

    // La Dirección General se identifica institucionalmente como "Dirección General".
    // El nombre real lo ven el grupo DG y los directores de área; los operativos no.
    const viewerVeNombreDG = rol === 'DIRECTOR' || esDG;
    const comentarios = comentariosRaw.map((c: any) => ({
      ...c,
      autor_nombre: c.autor_unidad_tipo === 'DIRECCION_GENERAL'
        ? (viewerVeNombreDG ? `Dirección General · ${c.autor_nombre}` : 'Dirección General')
        : c.autor_nombre,
    }));

    res.json({ data: comentarios });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/fecha-compromiso ───────

export async function setFechaCompromiso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tareaId = parseInt(req.params.tareaId, 10);
    const { fecha_compromiso } = req.body as { fecha_compromiso: string };

    if (!fecha_compromiso) {
      throw new AppError('La fecha compromiso es requerida', 422);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    // Puede establecer la fecha compromiso el director asignado O el
    // colaborador a quien se delegó la tarea (reasignado), que es quien la trabaja.
    if (req.user!.id !== tarea.asignado_a_id && req.user!.id !== tarea.reasignado_a_id) {
      throw new AppError('Solo el responsable o el colaborador delegado puede establecer la fecha compromiso', 403);
    }

    // La fecha compromiso no puede ser posterior a la fecha programada de la tarea
    const fechaComp = new Date(fecha_compromiso);
    const fechaProg = new Date(tarea.fecha_programada);
    if (fechaComp > fechaProg) {
      throw new AppError(
        `La fecha compromiso no puede ser posterior a la fecha programada de la tarea (${tarea.fecha_programada})`,
        422,
      );
    }

    // La fecha compromiso no puede ser posterior a la fecha programada del evento
    const eventoData = await db('eventos')
      .where({ id: tarea.evento_id })
      .select('titulo', 'creado_por_id', 'fecha_programada')
      .first();
    if (eventoData?.fecha_programada) {
      const fechaEvento = new Date(eventoData.fecha_programada);
      if (fechaComp > fechaEvento) {
        throw new AppError(
          `La fecha compromiso no puede ser posterior a la fecha del evento (${eventoData.fecha_programada})`,
          422,
        );
      }
    }

    const [tareaActualizada] = await db('tareas_evento')
      .where({ id: tareaId })
      .update({
        fecha_compromiso,
        fecha_actualizacion: db.fn.now(),
      })
      .returning([
        'id', 'evento_id', 'titulo', 'descripcion',
        'asignado_a_id', 'estado', 'fecha_programada',
        'fecha_compromiso', 'fecha_actualizacion',
      ]);

    res.json({ data: tareaActualizada, message: 'Fecha compromiso actualizada' });

    // Notificar al dueño del evento sobre la fecha compromiso
    if (eventoData && eventoData.creado_por_id !== req.user!.id) {
      notifyEventoTarea({
        recipient_id:  eventoData.creado_por_id,
        event:         'TAREA_FECHA_COMPROMISO',
        title:         `Fecha compromiso actualizada`,
        body:          `${req.user!.nombre} estableció fecha compromiso ${fecha_compromiso} en "${tarea.titulo}"`,
        tarea_id:      tareaId,
        evento_titulo: eventoData.titulo,
      }).catch(() => {});
    }
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/enviar-revision ───────

export async function enviarRevision(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    // 1. Existencia
    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'titulo', 'creado_por_id').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // 2. Autorización — si la tarea está delegada, SOLO el colaborador delegado
    //    puede enviar el avance (el director ya no la trabaja: es el revisor N1).
    const esDelegadaAuth = !!tarea.reasignado_a_id;
    const puedeEnviar = esDelegadaAuth
      ? req.user!.id === tarea.reasignado_a_id
      : req.user!.id === tarea.asignado_a_id;
    if (!puedeEnviar) {
      throw new AppError(
        esDelegadaAuth
          ? 'La tarea está delegada: solo el colaborador delegado puede enviar el avance'
          : 'Solo el responsable asignado puede enviar esta tarea a revisión',
        403,
      );
    }

    // 3. Transición válida
    if (!isValidTransition(tarea.estado as EstadoTarea, 'EN_REVISION')) {
      throw new AppError(
        `Transición de estado inválida: ${tarea.estado} → EN_REVISION`,
        422,
      );
    }

    // 4. Al menos comentario no vacío O archivo presente
    const { comentario } = req.body as { comentario?: string };
    const tieneComentario = !!(comentario?.trim());
    const file            = (req as any).file as Express.Multer.File | undefined;
    const tieneArchivo    = !!file;

    if (!tieneComentario && !tieneArchivo) {
      throw new AppError('Debes incluir un comentario o un documento de avance', 422);
    }

    // 5. Guardar archivo si viene
    let documento_url: string | null = null;
    if (tieneArchivo) {
      documento_url = await storage.save(file!, 'eventos/avances');
    }

    // 6. Determinar estado destino:
    //    - Si la tarea está DELEGADA (reasignado) → la hizo un operativo,
    //      va a EN_REVISION para que su jefe directo (el director asignado) la revise (N1).
    //    - Si NO está delegada y el asignado es DIRECTOR → directo a EN_REVISION_DG (sin N1).
    //    - Si el asignado es OPERATIVO → EN_REVISION (Encargado N1 revisa primero).
    const asignadoUser = await db('usuarios')
      .where({ id: tarea.asignado_a_id })
      .select('rol')
      .first();

    const esDelegada = !!tarea.reasignado_a_id;
    const esEventoDirector = evento.requiere_aprobacion_dg === false;
    // Tarea propia de un director (no delegada):
    //   · evento de director → FINALIZADO (él es la autoridad final)
    //   · evento de la DG     → EN_REVISION_DG (sube a la DG)
    // Cualquier otro (operativo / delegada) → EN_REVISION (revisa su jefe N1)
    const estadoDestino: EstadoTarea =
      (!esDelegada && asignadoUser?.rol === 'DIRECTOR')
        ? (esEventoDirector ? 'FINALIZADO' : 'EN_REVISION_DG')
        : 'EN_REVISION';

    // 7. Transacción: actualizar estado + insertar historial
    await db.transaction(async (trx) => {
      await trx('tareas_evento')
        .where({ id: tareaId })
        .update({ estado: estadoDestino, fecha_actualizacion: trx.fn.now() });

      await trx('historial_revision_tarea').insert({
        tarea_id:       tareaId,
        autor_id:       req.user!.id,
        tipo:           'AVANCE',
        nivel_revision: estadoDestino === 'EN_REVISION' ? 1 : 2,
        contenido:      tieneComentario ? comentario!.trim() : null,
        documento_url,
        creado_en:      trx.fn.now(),
      });
    });

    res.json({ message: 'Avance enviado correctamente' });

    // El evento NO se cierra automáticamente: queda ABIERTO para poder agregar
    // más tareas. El cierre es manual, con justificación (ver cerrarEvento).

    // 8. Notificar según destino
    if (estadoDestino === 'EN_REVISION_DG') {
      // Tarea de Director → notificar a la DG directamente
      const dgId = await resolverDirectoraGeneral(db).catch(() => null);
      if (dgId) {
        notifyEventoTarea({
          recipient_id:  dgId,
          event:         'TAREA_EN_REVISION_DG',
          title:         'Avance pendiente de aprobación final',
          body:          `${req.user!.nombre} envió avance en "${tarea.titulo}" (${evento.titulo})`,
          tarea_id:      tareaId,
          evento_titulo: evento.titulo,
        }).catch(() => {});
      }
    } else {
      // Tarea de Operativo → notificar al Encargado N1 (Director de su unidad)
      const encargadoId = await resolverEncargadoN1(req.user!.oficina_id);
      if (encargadoId) {
        notifyEventoTarea({
          recipient_id:  encargadoId,
          event:         'TAREA_EN_REVISION',
          title:         'Avance enviado para revisión',
          body:          `${req.user!.nombre} envió avance en "${tarea.titulo}" (${evento.titulo})`,
          tarea_id:      tareaId,
          evento_titulo: evento.titulo,
        }).catch(() => {});
      }
    }
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/aprobar ────────────────

export async function aprobarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    // 1. Existencia
    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'titulo', 'creado_por_id', 'requiere_aprobacion_dg').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // 2. Autorización: debe ser el DIRECTOR de la misma unidad del operativo asignado (Encargado N1)
    const asignadoTarea = await db('usuarios')
      .where({ id: tarea.asignado_a_id })
      .select('unidad_id', 'rol')
      .first();

    if (!asignadoTarea) throw new AppError('Usuario asignado no encontrado', 404);

    const encargadoN1Id = await resolverEncargadoN1(asignadoTarea.unidad_id);
    if (req.user!.id !== encargadoN1Id) {
      throw new AppError('Solo el director responsable de la unidad puede aprobar esta tarea', 403);
    }

    // En eventos de director (sin aprobación de la DG), la aprobación del director
    // es la FINAL → FINALIZADO directo. En eventos de la DG, sube a EN_REVISION_DG.
    const esEventoDirector = evento.requiere_aprobacion_dg === false;
    const estadoDestino: EstadoTarea = esEventoDirector ? 'FINALIZADO' : 'EN_REVISION_DG';

    if (!isValidTransition(tarea.estado as EstadoTarea, estadoDestino)) {
      throw new AppError(`Transición de estado inválida: ${tarea.estado} → ${estadoDestino}`, 422);
    }

    await db.transaction(async (trx) => {
      await trx('tareas_evento')
        .where({ id: tareaId })
        .update({ estado: estadoDestino, fecha_actualizacion: trx.fn.now() });

      await trx('historial_revision_tarea').insert({
        tarea_id:       tareaId,
        autor_id:       req.user!.id,
        tipo:           esEventoDirector ? 'APROBACION_N2' : 'APROBACION_N1',
        nivel_revision: esEventoDirector ? 2 : 1,
        contenido:      null,
        creado_en:      trx.fn.now(),
      });
    });

    if (esEventoDirector) {
      res.json({ message: 'Tarea finalizada correctamente' });
      // Notificar al colaborador que su tarea quedó finalizada
      notifyEventoTarea({
        recipient_id:  tarea.reasignado_a_id ?? tarea.asignado_a_id,
        event:         'TAREA_COMPLETADA_DG',
        title:         'Actividad finalizada',
        body:          `${req.user!.nombre} finalizó tu actividad "${tarea.titulo}"`,
        tarea_id:      tareaId,
        evento_titulo: evento.titulo,
      }).catch(() => {});
      // El evento no se cierra automáticamente: el cierre es manual con justificación.
      return;
    }

    // Evento de la DG: sube a aprobación final de la Directora General
    const dgId = await resolverDirectoraGeneral(db);
    res.json({ message: 'Tarea aprobada y enviada a revisión de la Directora General' });

    notifyEventoTarea({
      recipient_id:  dgId,
      event:         'TAREA_EN_REVISION_DG',
      title:         'Tarea pendiente de aprobación final',
      body:          `${req.user!.nombre} aprobó el avance de "${tarea.titulo}" en el evento "${evento.titulo}". Requiere tu aprobación final.`,
      tarea_id:      tareaId,
      evento_titulo: evento.titulo,
    }).catch(() => {});

    notifyEventoTarea({
      recipient_id:  tarea.reasignado_a_id ?? tarea.asignado_a_id,
      event:         'TAREA_APROBADA_N1',
      title:         'Avance aprobado por el Director',
      body:          `Tu avance en "${tarea.titulo}" fue aprobado por ${req.user!.nombre}. Está pendiente de aprobación final de la Directora General.`,
      tarea_id:      tareaId,
      evento_titulo: evento.titulo,
    }).catch(() => {});
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/devolver ───────────────

export async function devolverTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    // 1. Existencia
    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'titulo', 'creado_por_id').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // 2. Autorización: debe ser el Encargado N1 (Director de la unidad del operativo)
    const asignadoDev = await db('usuarios')
      .where({ id: tarea.asignado_a_id })
      .select('unidad_id')
      .first();
    const encargadoN1Dev = await resolverEncargadoN1(asignadoDev?.unidad_id ?? 0);
    if (req.user!.id !== encargadoN1Dev) {
      throw new AppError('Solo el director responsable de la unidad puede devolver esta tarea', 403);
    }

    // 3. Transición válida
    if (!isValidTransition(tarea.estado as EstadoTarea, 'DEVUELTO')) {
      throw new AppError(
        `Transición de estado inválida: ${tarea.estado} → DEVUELTO`,
        422,
      );
    }

    // 4. Comentario obligatorio
    const { comentario } = req.body as { comentario: string };
    if (!comentario?.trim()) {
      throw new AppError('El comentario de devolución es obligatorio', 422);
    }

    // 5. Transacción: actualizar estado + insertar historial
    await db.transaction(async (trx) => {
      await trx('tareas_evento')
        .where({ id: tareaId })
        .update({
          estado:              'DEVUELTO',
          fecha_actualizacion: trx.fn.now(),
        });

      await trx('historial_revision_tarea').insert({
        tarea_id:      tareaId,
        autor_id:      req.user!.id,
        tipo:          'DEVOLUCION',
        contenido:     comentario.trim(),
        documento_url: null,
        creado_en:     trx.fn.now(),
      });
    });

    res.json({ message: 'Tarea devuelta correctamente' });

    // 6. Notificar a quien debe corregir: el colaborador delegado si la tarea
    //    está delegada, de lo contrario el asignado directo.
    notifyEventoTarea({
      recipient_id:  tarea.reasignado_a_id ?? tarea.asignado_a_id,
      event:         'TAREA_DEVUELTA',
      title:         'Tarea devuelta para corrección',
      body:          `${req.user!.nombre} devolvió la tarea "${tarea.titulo}": ${comentario.trim().slice(0, 100)}${comentario.length > 100 ? '…' : ''}`,
      tarea_id:      tareaId,
      evento_titulo: evento.titulo,
    }).catch(() => {});
  } catch (err) { next(err); }
}

// ── GET /eventos/:id/tareas/:tareaId/historial ────────────────

export async function listarHistorial(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    // 1. Existencia
    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'creado_por_id', 'responsable_id').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // 2. Autorización — puede ver el historial:
    //   a) El operativo asignado directamente
    //   b) El colaborador a quien se delegó la tarea (reasignado)
    //   c) El creador del evento (DG u otro director)
    //   d) El Director de la misma unidad que el asignado (encargado N1 jerárquico)
    //   e) La Directora General (supervisión total)
    //   f) El responsable del evento (observador: ve avances, no autoriza)
    const esAsignado      = req.user!.id === tarea.asignado_a_id;
    const esDelegado      = req.user!.id === tarea.reasignado_a_id;
    const esCreadorEvento = req.user!.id === evento.creado_por_id;
    const esResponsable   = req.user!.id === evento.responsable_id;

    let esEncargadoJerarquico = false;
    if (req.user!.rol === 'DIRECTOR' && !esCreadorEvento && !esAsignado) {
      // Verificar si es el Director de la misma unidad del asignado
      const asignadoUnidad = await db('usuarios')
        .where({ id: tarea.asignado_a_id })
        .select('unidad_id')
        .first();
      esEncargadoJerarquico = asignadoUnidad?.unidad_id === req.user!.oficina_id;
    }

    const idDG = await getIdDireccionGeneral();
    const esDG = req.user!.oficina_id === idDG;

    if (!esAsignado && !esDelegado && !esCreadorEvento && !esEncargadoJerarquico && !esDG && !esResponsable) {
      throw new AppError('No tienes permiso para ver el historial de esta tarea', 403);
    }

    // 3. Consulta del historial
    // La DG solo ve la comunicación Director↔DG (nivel 2 + APROBACION_N1).
    // El Director y el Operativo ven el historial completo.
    // La BD conserva todos los registros para auditoría.
    let query = db('historial_revision_tarea as h')
      .join('usuarios as u', 'u.id', 'h.autor_id')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'h.id',
        'h.tarea_id',
        'h.autor_id',
        'u.nombre as autor_nombre',
        'u.rol as autor_rol',
        'u.unidad_id as autor_unidad_id',
        'cu.tipo as autor_unidad_tipo',
        'h.tipo',
        'h.nivel_revision',
        'h.contenido',
        'h.documento_url',
        'h.creado_en',
      )
      .where('h.tarea_id', tareaId);

    if (esDG) {
      // La DG ve: sus propias acciones (nivel 2), la aprobación del director
      // (APROBACION_N1) y los AVANCES entregados con su documento adjunto, para
      // poder revisar el trabajo real antes de finalizar o devolver.
      query = query.where(function () {
        this.where('h.nivel_revision', 2)
            .orWhere('h.tipo', 'APROBACION_N1')
            .orWhere('h.tipo', 'AVANCE');
      });
    }

    const registrosRaw = await query.orderBy('h.creado_en', 'asc');

    // Para la DG, los operativos se muestran bajo el director de su área (no su
    // nombre real), consistente con el resto de sus vistas.
    const directorPorUnidad = new Map<number, string>();
    if (esDG) {
      const unidades = [...new Set(
        registrosRaw.filter((r: any) => r.autor_rol === 'OPERATIVO').map((r: any) => r.autor_unidad_id),
      )];
      if (unidades.length > 0) {
        const dirs = await db('usuarios')
          .whereIn('unidad_id', unidades)
          .where({ rol: 'DIRECTOR', activo: true })
          .select('unidad_id', 'nombre')
          .orderBy('id', 'asc');
        for (const d of dirs) {
          if (!directorPorUnidad.has(d.unidad_id)) directorPorUnidad.set(d.unidad_id, d.nombre);
        }
      }
    }

    // El nombre real de quien actuó por la DG lo ven el grupo de Dirección General
    // y los directores de área (para trazabilidad); los operativos solo ven la
    // etiqueta institucional "Dirección General".
    const viewerVeNombreDG = req.user!.rol === 'DIRECTOR' || esDG;

    const registros = registrosRaw.map((r: any) => {
      let autor_nombre = r.autor_nombre;
      if (r.autor_unidad_tipo === 'DIRECCION_GENERAL') {
        autor_nombre = viewerVeNombreDG
          ? `Dirección General · ${r.autor_nombre}`
          : 'Dirección General';
      } else if (esDG && r.autor_rol === 'OPERATIVO') {
        autor_nombre = directorPorUnidad.get(r.autor_unidad_id) ?? autor_nombre;
      }
      return { ...r, autor_nombre };
    });

    res.json({ data: registros });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/reasignar ──────────────
// Solo el Director de Área puede reasignar — los operativos no pueden reasignar

export async function reasignarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tareaId = parseInt(req.params.tareaId, 10);
    const { reasignado_a_id } = req.body as { reasignado_a_id: number };

    if (!reasignado_a_id) {
      throw new AppError('El campo reasignado_a_id es requerido', 422);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    // Solo el director asignado puede reasignar — los operativos no pueden
    if (req.user!.id !== tarea.asignado_a_id) {
      throw new AppError('Solo el director asignado puede reasignar esta tarea', 403);
    }

    // Bloquear a operativos — solo directores pueden reasignar
    if (req.user!.rol !== 'DIRECTOR') {
      throw new AppError('Solo los directores pueden reasignar tareas', 403);
    }

    // Verificar que el operativo existe, tiene rol OPERATIVO y es de la misma unidad
    const operativo = await db('usuarios')
      .select('id', 'nombre', 'rol', 'unidad_id')
      .where({ id: reasignado_a_id })
      .first();

    if (!operativo) {
      throw new AppError('Usuario no encontrado', 404);
    }

    if (operativo.rol !== 'OPERATIVO') {
      throw new AppError('El colaborador debe tener rol OPERATIVO', 422);
    }

    // req.user.oficina_id y req.user.unidad_id son el mismo valor (ambos vienen del JWT)
    if (operativo.unidad_id !== req.user!.oficina_id) {
      throw new AppError('Solo puedes reasignar a colaboradores de tu misma dirección', 422);
    }

    const [tareaActualizada] = await db('tareas_evento')
      .where({ id: tareaId })
      .update({
        reasignado_a_id:     Number(reasignado_a_id),
        fecha_actualizacion: db.fn.now(),
      })
      .returning([
        'id', 'evento_id', 'titulo', 'descripcion',
        'asignado_a_id', 'reasignado_a_id', 'estado',
        'fecha_programada', 'fecha_compromiso', 'fecha_actualizacion',
      ]);

    // Registrar la delegación en el historial (con fecha/hora automática)
    await db('historial_revision_tarea').insert({
      tarea_id:       tareaId,
      autor_id:       req.user!.id,
      tipo:           'REASIGNACION',
      contenido:      `Delegó la tarea a ${operativo.nombre}`,
      nivel_revision: 1,
    });

    res.json({
      data: { ...tareaActualizada, reasignado_a_nombre: operativo.nombre },
      message: `Tarea reasignada a ${operativo.nombre}`,
    });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/aprobar-dg ─────────────
/**
 * La Directora General aprueba una tarea que está en EN_REVISION_DG → FINALIZADO.
 * Después de finalizar, verifica si todas las tareas del evento están FINALIZADO
 * y cierra el evento automáticamente.
 */
export async function aprobarTareaDG(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    const tarea  = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'titulo', 'creado_por_id').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // Solo la Directora General puede aprobar en N2
    const idDG = await getIdDireccionGeneral();
    if (req.user!.oficina_id !== idDG || !actuaComoDG(req.user)) {
      throw new AppError('Solo la Directora General puede aprobar en revisión final', 403);
    }

    if (tarea.estado !== 'EN_REVISION_DG') {
      throw new AppError(`La tarea debe estar EN_REVISION_DG para aprobación final (estado actual: ${tarea.estado})`, 422);
    }

    // Justificación obligatoria: salvaguarda para no finalizar por accidente y
    // dejar registro de por qué la DG aprobó la conclusión.
    const justificacion = String((req.body?.justificacion ?? req.body?.comentario ?? '')).trim();
    if (!justificacion) {
      throw new AppError('La justificación de la aprobación es obligatoria', 422);
    }

    await db.transaction(async (trx) => {
      await trx('tareas_evento')
        .where({ id: tareaId })
        .update({ estado: 'FINALIZADO', fecha_actualizacion: trx.fn.now() });

      await trx('historial_revision_tarea').insert({
        tarea_id:       tareaId,
        autor_id:       req.user!.id,
        tipo:           'APROBACION_N2',
        nivel_revision: 2,
        contenido:      justificacion,
        creado_en:      trx.fn.now(),
      });
    });

    res.json({ message: 'Tarea finalizada correctamente' });

    // Notificar al asignado
    notifyEventoTarea({
      recipient_id:  tarea.asignado_a_id,
      event:         'TAREA_COMPLETADA_DG',
      title:         'Actividad finalizada',
      body:          `La Directora General finalizó la actividad "${tarea.titulo}"`,
      tarea_id:      tareaId,
      evento_titulo: evento.titulo,
    }).catch(() => {});

    // El evento no se cierra automáticamente: el cierre es manual con justificación.
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/devolver-dg ────────────
/**
 * La Directora General devuelve una tarea desde EN_REVISION_DG → DEVUELTO.
 * El comentario es obligatorio.
 */
export async function devolverTareaDG(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    const tarea  = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Tarea no encontrada', 404);

    const evento = await db('eventos').where({ id: eventoId }).select('id', 'titulo').first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    // Solo la DG puede devolver desde N2
    const idDG = await getIdDireccionGeneral();
    if (req.user!.oficina_id !== idDG || !actuaComoDG(req.user)) {
      throw new AppError('Solo la Directora General puede devolver desde revisión final', 403);
    }

    const { comentario } = req.body as { comentario: string };
    if (!comentario?.trim()) {
      throw new AppError('El comentario de devolución es obligatorio', 422);
    }

    if (tarea.estado !== 'EN_REVISION_DG') {
      throw new AppError(`La tarea debe estar EN_REVISION_DG para ser devuelta (estado actual: ${tarea.estado})`, 422);
    }

    await db.transaction(async (trx) => {
      // La devolución de la DG NO salta al operativo: queda en manos del
      // director de área, que luego la baja a su colaborador con observaciones.
      await trx('tareas_evento')
        .where({ id: tareaId })
        .update({ estado: 'DEVUELTO_DG', fecha_actualizacion: trx.fn.now() });

      await trx('historial_revision_tarea').insert({
        tarea_id:       tareaId,
        autor_id:       req.user!.id,
        tipo:           'DEVOLUCION',
        nivel_revision: 2,
        contenido:      comentario.trim(),
        creado_en:      trx.fn.now(),
      });
    });

    res.json({ message: 'Tarea devuelta al director de área con observaciones' });

    // Notificar al DIRECTOR de área responsable de la tarea (no al operativo):
    // él debe revisarla y bajarla a su colaborador con observaciones extra.
    notifyEventoTarea({
      recipient_id:  tarea.asignado_a_id,
      event:         'TAREA_DEVUELTA_DG',
      title:         'Actividad devuelta por la Directora General',
      body:          `La DG devolvió "${tarea.titulo}": ${comentario.trim().slice(0, 100)}`,
      tarea_id:      tareaId,
      evento_titulo: evento.titulo,
    }).catch(() => {});
  } catch (err) { next(err); }
}
