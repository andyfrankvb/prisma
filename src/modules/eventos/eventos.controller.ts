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
import { storage, compresionInfo } from '../../services/storage.service';
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

/**
 * Lo mismo, pero admitiendo además a quien PARTICIPA en el evento.
 *
 * Hacía falta desde que un director de área puede invitar a su equipo operativo:
 * sin esto se les agregaba al evento y al entrar recibían «Acceso restringido al
 * Director». Quedaban trabajando a ciegas —hoy hay siete operativos con el módulo
 * asignado que pueden atender sus actividades pero no ver de qué evento salen—.
 *
 * Es acceso al evento en el que participan, no al módulo entero: quien no esté
 * invitado sigue sin poder abrirlo.
 */
async function requireDirectorOParticipanteEnAlguno(req: Request): Promise<void> {
  try {
    requireDirector(req);
    return;
  } catch (err) {
    const participa = await db('evento_directores')
      .where('director_id', req.user!.id).first();
    const tieneTarea = participa ? null : await db('tareas_evento')
      .where((q: any) => q.where('asignado_a_id', req.user!.id)
                          .orWhere('reasignado_a_id', req.user!.id))
      .first();
    // La consulta de `listarEventos` ya acota a lo suyo —lo que creó y aquello en
    // lo que participa—, así que dejar pasar aquí no muestra de más.
    if (!participa && !tieneTarea) throw err;
  }
}

async function requireDirectorOParticipante(req: Request, eventoId: number): Promise<void> {
  try {
    requireDirector(req);
    return;
  } catch (err) {
    const participa = await db('evento_directores')
      .where({ evento_id: eventoId, director_id: req.user!.id })
      .first();
    // O tiene una actividad suya dentro: se le encargó trabajo ahí, así que ver el
    // evento es lo mínimo para saber a qué pertenece lo que está haciendo.
    const tieneTarea = participa ? null : await db('tareas_evento')
      .where({ evento_id: eventoId })
      .andWhere((q: any) => q.where('asignado_a_id', req.user!.id)
                             .orWhere('reasignado_a_id', req.user!.id))
      .first();
    if (!participa && !tieneTarea) throw err;
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

    /**
     * Participantes y responsable, para los dos casos.
     *
     * Antes se descartaban salvo en la DG: un director de área creaba un evento y
     * el sistema tiraba en silencio a quién había elegido. Pero un director también
     * coordina —reparte el trabajo de su gente y nombra a alguien al frente—, solo
     * que su gente es su EQUIPO OPERATIVO, no otros directores.
     *
     * Quién puede entrar cambia según quién crea, y eso se valida aquí:
     *
     *   · La DG invita a titulares de área. Es coordinación entre direcciones.
     *   · Un director invita a los de SU unidad. No a los de otras: su evento no es
     *     lugar para meter personal ajeno, y sin esta comprobación bastaría con
     *     mandar cualquier id en la petición para colar a quien fuera.
     */
    const responsableVal = responsable_id ?? null;

    /** ¿Puede quien crea meter a esta persona en su evento? */
    const admisible = async (id: number): Promise<boolean> => {
      const u = await db('usuarios').where({ id, activo: true })
        .select('rol', 'unidad_id').first();
      if (!u) return false;
      return esDG
        ? u.rol === 'DIRECTOR'                      // la DG invita titulares
        : u.unidad_id === req.user!.oficina_id;     // el director, a los suyos
    };

    if (responsableVal !== null && !(await admisible(Number(responsableVal)))) {
      throw new AppError(
        esDG
          ? 'El responsable debe ser un director de área activo'
          : 'El responsable debe ser alguien activo de tu propia área',
        422,
      );
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

    // Participantes. Ya no solo en la DG: un director de área invita a su equipo.
    const participantes = new Set<number>();
    if (Array.isArray(director_ids)) {
      for (const id of director_ids) {
        if (await admisible(Number(id))) participantes.add(Number(id));
      }
    }
    if (responsableVal) participantes.add(Number(responsableVal));
    // Quien crea no se invita a sí mismo: ya es dueño del evento.
    participantes.delete(req.user!.id);
    if (participantes.size > 0) {
      const rows = [...participantes].map((director_id) => ({ evento_id: evento.id, director_id }));
      await db('evento_directores').insert(rows).onConflict(['evento_id', 'director_id']).ignore();
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
    // Deja entrar también a quien participa en algún evento: es su lista, y la
    // consulta de abajo ya la acota a lo que le corresponde.
    await requireDirectorOParticipanteEnAlguno(req);

    let query = db('eventos as e')
      .select(
        'e.id',
        'e.titulo',
        'e.descripcion',
        'e.estado',
        'e.creado_por_id',
        'e.fecha_creacion',
        'e.fecha_cierre',
        // La fecha límite del evento faltaba aquí, así que la tarjeta de la lista
        // nunca la mostraba aunque se hubiera capturado.
        'e.fecha_programada',
        'e.responsable_id',
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id)::int AS total_tareas`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado = 'PENDIENTE')::int AS tareas_pendiente`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado = 'EN_PROGRESO')::int AS tareas_en_progreso`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado IN ('COMPLETADA','FINALIZADO'))::int AS tareas_completada`),
        // CANCELADA entra en la lista de terminados: nadie la va a hacer, así que
        // no es trabajo atrasado ni por vencer. Sin esto, cancelar una actividad
        // dejaría el evento marcado en rojo para siempre.
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado NOT IN ('COMPLETADA','FINALIZADO','CANCELADA') AND t.fecha_programada < CURRENT_DATE)::int AS tareas_vencidas`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado NOT IN ('COMPLETADA','FINALIZADO','CANCELADA') AND t.fecha_programada BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days')::int AS tareas_proximas`),
        db.raw(`(SELECT COUNT(*) FROM tareas_evento t WHERE t.evento_id = e.id AND t.estado = 'CANCELADA')::int AS tareas_canceladas`),
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
    const id = parseInt(req.params.id, 10);
    // Aquí sí entra el equipo invitado: es el evento donde trabaja.
    await requireDirectorOParticipante(req, id);

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
        // Sin esto, una actividad cancelada llega a la pantalla sin su porqué, que es
        // lo único que le explica a quien la tenía asignada qué pasó con su trabajo.
        't.motivo_cancelacion',
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
      // La fecha es opcional desde la migración 2026-09-07: puede llegar nula.
      const fechaStr: string | null =
        t.fecha_programada == null
          ? null
          : typeof t.fecha_programada === 'string'
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

// ── PATCH /eventos/:id ────────────────────────────────────────
/**
 * Corrige el título y la descripción de un evento.
 *
 * No existía: lo que se escribía al crearlo quedaba congelado para siempre. Un
 * nombre mal puesto o una descripción que se quedó corta obligaban a cerrar el
 * evento y levantar otro, arrastrando o perdiendo las actividades ya repartidas.
 *
 * Solo cambia esos dos campos. Ni el estado, ni la fecha, ni el encargado, ni los
 * participantes: cada uno tiene su propia función porque cada uno tiene sus
 * propias consecuencias. Body: { titulo?, descripcion? }
 */
export async function editarEvento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const { titulo, descripcion } = req.body as { titulo?: string; descripcion?: string | null };

    const evento = await db('eventos').where({ id }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se puede editar un evento cerrado', 409);
    }
    // Como en el resto del módulo: el guardia de rol va después de leer el evento,
    // porque el encargado coordina aunque no sea director.
    if (evento.responsable_id !== req.user!.id) requireDirector(req);

    const idDG        = await getIdDireccionGeneral();
    const esDGReq     = req.user!.oficina_id === idDG && actuaComoDG(req.user);
    const esDueno     = evento.creado_por_id === req.user!.id;
    const esEncargado = evento.responsable_id === req.user!.id;

    if (!esDGReq && !esDueno && !esEncargado) {
      throw new AppError('Solo quien creó el evento o su encargado pueden editarlo', 403);
    }
    if (esDGReq && !evento.requiere_aprobacion_dg) {
      throw new AppError('Ese evento es privado de su área: no lo administra la Dirección General', 422);
    }

    // Se distingue «no lo mandaron» de «lo mandaron vacío»: omitir el campo lo deja
    // como está; mandarlo vacío borra la descripción a propósito.
    const cambios: Record<string, unknown> = {};
    if (titulo !== undefined) {
      if (!titulo?.trim()) throw new AppError('El título del evento es requerido', 422);
      cambios.titulo = titulo.trim();
    }
    if (descripcion !== undefined) {
      cambios.descripcion = descripcion?.trim() || null;
    }
    if (Object.keys(cambios).length === 0) {
      throw new AppError('No se indicó nada que cambiar', 422);
    }

    const [actualizado] = await db('eventos').where({ id }).update(cambios)
      .returning(['id', 'titulo', 'descripcion']);

    res.json({ data: actualizado, message: 'Evento actualizado' });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId ────────────────────────
/**
 * Corrige el título y la descripción de una actividad.
 *
 * Mismo hueco que en el evento: lo escrito al repartir el trabajo no se podía
 * enmendar. La encomienda se redacta rápido y muchas veces se afina después de
 * hablarlo con quien la va a hacer.
 *
 * Lo puede hacer quien coordina —los mismos que pueden repartir actividades—, no
 * quien la tiene asignada: la actividad describe lo que se le pidió, y dejar que
 * el propio asignado reescriba el encargo cambiaría a qué se comprometió.
 *
 * Una actividad ya terminada no se toca: reescribir lo que se pidió cuando el
 * trabajo ya se entregó y se aprobó deja el historial contando otra cosa.
 */
export async function editarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);
    const { titulo, descripcion } = req.body as { titulo?: string; descripcion?: string | null };

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden editar actividades de un evento cerrado', 409);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Actividad no encontrada', 404);
    if (tarea.estado === 'FINALIZADO' || tarea.estado === 'COMPLETADA') {
      throw new AppError('Esa actividad ya está terminada; su encomienda no se puede reescribir', 409);
    }

    const esResponsable = evento.responsable_id === req.user!.id;
    if (!esResponsable) requireDirector(req);

    // Las mismas llaves que para repartir la actividad, en el mismo orden.
    const idDG            = await getIdDireccionGeneral();
    const usuarioEsDG     = req.user!.oficina_id === idDG;
    const esCreadorEvento = req.user!.id === evento.creado_por_id;

    if (!usuarioEsDG && !esCreadorEvento && !esResponsable) {
      const participa = await db('evento_directores')
        .where({ evento_id: eventoId, director_id: req.user!.id })
        .first();
      if (!participa) {
        throw new AppError('Solo quien coordina el evento puede editar sus actividades', 403);
      }
    }

    const cambios: Record<string, unknown> = {};
    if (titulo !== undefined) {
      if (!titulo?.trim()) throw new AppError('El título de la actividad es requerido', 422);
      cambios.titulo = titulo.trim();
    }
    if (descripcion !== undefined) {
      cambios.descripcion = descripcion?.trim() || null;
    }
    if (Object.keys(cambios).length === 0) {
      throw new AppError('No se indicó nada que cambiar', 422);
    }
    cambios.fecha_actualizacion = db.fn.now();

    const [actualizada] = await db('tareas_evento').where({ id: tareaId }).update(cambios)
      .returning(['id', 'titulo', 'descripcion']);

    res.json({ data: actualizada, message: 'Actividad actualizada' });
  } catch (err) { next(err); }
}

/**
 * Quién coordina el evento, y por tanto puede tocar sus actividades.
 *
 * Es el mismo grupo que puede repartirlas: la Dirección General en los suyos,
 * quien creó el evento, su encargado, o un director que participa. Vive aquí
 * porque lo usan cuatro operaciones y tenerlo repetido acabaría con versiones
 * distintas de la misma regla — que es como se rompió la bandeja de firmas.
 */
async function requireCoordinaEvento(req: Request, evento: any): Promise<void> {
  const esResponsable = evento.responsable_id === req.user!.id;
  if (!esResponsable) requireDirector(req);

  const idDG            = await getIdDireccionGeneral();
  const usuarioEsDG     = req.user!.oficina_id === idDG;
  const esCreadorEvento = req.user!.id === evento.creado_por_id;

  if (!usuarioEsDG && !esCreadorEvento && !esResponsable) {
    const participa = await db('evento_directores')
      .where({ evento_id: evento.id, director_id: req.user!.id })
      .first();
    if (!participa) {
      throw new AppError('Solo quien coordina el evento puede hacer eso', 403);
    }
  }
}

/**
 * ¿Alguien trabajó ya esta actividad?
 *
 * Es lo que decide entre borrarla y cancelarla, y por eso no se le pregunta a
 * quien pulsa el botón: se mira si dejó rastro. Cuenta el historial de revisión
 * —donde viven los avances y los documentos— y los comentarios.
 */
async function rastroDeTarea(tareaId: number): Promise<{ avances: number; comentarios: number }> {
  const [h] = await db('historial_revision_tarea').where({ tarea_id: tareaId }).count('id as n');
  const [c] = await db('comentarios_tarea').where({ tarea_id: tareaId }).count('id as n');
  return { avances: Number(h?.n ?? 0), comentarios: Number(c?.n ?? 0) };
}

// ── DELETE /eventos/:id/tareas/:tareaId ───────────────────────
/**
 * Borra una actividad — solo si nadie la tocó.
 *
 * Existe para el duplicado y el dedazo: se repartió en el evento equivocado, o a
 * la persona equivocada, y todavía no ha pasado nada. Dejar rastro de algo que
 * nunca existió solo ensucia el tablero.
 *
 * En cuanto hay trabajo encima, se niega y manda a cancelar. No es prudencia
 * excesiva: de `tareas_evento` cuelgan en cascada el historial, los comentarios y
 * las notificaciones, y los documentos del historial viven en la carpeta
 * compartida, no en la base — borrar el renglón deja el archivo huérfano en el
 * disco para siempre, sin que nadie sepa de qué era.
 */
export async function borrarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden borrar actividades de un evento cerrado', 409);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Actividad no encontrada', 404);

    await requireCoordinaEvento(req, evento);

    const { avances, comentarios } = await rastroDeTarea(tareaId);
    const arrancada = tarea.estado !== 'PENDIENTE';

    if (avances > 0 || comentarios > 0 || arrancada) {
      const motivos: string[] = [];
      if (arrancada)        motivos.push('ya se empezó a trabajar');
      if (avances > 0)      motivos.push(`tiene ${avances} avance${avances === 1 ? '' : 's'} registrado${avances === 1 ? '' : 's'}`);
      if (comentarios > 0)  motivos.push(`tiene ${comentarios} comentario${comentarios === 1 ? '' : 's'}`);
      throw new AppError(
        `Esa actividad no se puede borrar porque ${motivos.join(' y ')}. `
        + 'Cancélala: se queda a la vista, con su historial y el motivo.',
        409,
      );
    }

    await db('tareas_evento').where({ id: tareaId }).del();
    res.json({ message: 'Actividad borrada' });
  } catch (err) { next(err); }
}

// ── PATCH /eventos/:id/tareas/:tareaId/cancelar ───────────────
/**
 * Cancela una actividad: deja de esperar trabajo, pero no desaparece.
 *
 * Para lo que sí ocurrió y ya no aplica. Conserva el historial, los comentarios y
 * los documentos —el trabajo de una persona no se borra porque el asunto se
 * cayera— y deja escrito el porqué, que es lo que quien la tenía asignada
 * necesita saber para no quedarse pensando que se le desechó el esfuerzo.
 *
 * Deja de contar como pendiente, vencida o por vencer.
 */
export async function cancelarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const tareaId  = parseInt(req.params.tareaId, 10);
    const { motivo } = req.body as { motivo?: string };

    if (!motivo?.trim()) {
      throw new AppError('Explica por qué se cancela: quien la tenía asignada necesita saberlo', 422);
    }

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden cancelar actividades de un evento cerrado', 409);
    }

    const tarea = await db('tareas_evento').where({ id: tareaId, evento_id: eventoId }).first();
    if (!tarea) throw new AppError('Actividad no encontrada', 404);
    if (tarea.estado === 'CANCELADA') throw new AppError('Esa actividad ya está cancelada', 409);
    if (tarea.estado === 'FINALIZADO' || tarea.estado === 'COMPLETADA') {
      throw new AppError('Esa actividad ya está terminada; cancelarla no cambiaría nada', 409);
    }

    await requireCoordinaEvento(req, evento);

    const [actualizada] = await db('tareas_evento').where({ id: tareaId }).update({
      estado:              'CANCELADA',
      motivo_cancelacion:  motivo.trim(),
      cancelada_en:        db.fn.now(),
      cancelada_por_id:    req.user!.id,
      fecha_actualizacion: db.fn.now(),
    }).returning(['id', 'estado', 'motivo_cancelacion']);

    res.json({ data: actualizada, message: 'Actividad cancelada' });
  } catch (err) { next(err); }
}

// ── DELETE /eventos/:id ───────────────────────────────────────
/**
 * Borra un evento — solo si está vacío.
 *
 * Con actividades dentro no se borra: se cierra, que es la función que ya existe y
 * que además exige justificación y guarda quién lo hizo. Borrar arrastraría en
 * cascada las actividades y, con ellas, historiales, comentarios y avisos.
 *
 * A diferencia de editar o repartir, esto NO lo puede el encargado: administrar el
 * evento y hacerlo desaparecer son cosas de distinta categoría.
 */
export async function borrarEvento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const evento = await db('eventos').where({ id }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);

    requireDirector(req);

    const idDG    = await getIdDireccionGeneral();
    const esDGReq = req.user!.oficina_id === idDG && actuaComoDG(req.user);
    const esDueno = evento.creado_por_id === req.user!.id;

    if (!esDGReq && !esDueno) {
      throw new AppError('Solo quien creó el evento puede borrarlo', 403);
    }
    if (esDGReq && !evento.requiere_aprobacion_dg) {
      throw new AppError('Ese evento es privado de su área: no lo administra la Dirección General', 422);
    }

    const [{ n }] = await db('tareas_evento').where({ evento_id: id }).count('id as n');
    const cuantas = Number(n ?? 0);
    if (cuantas > 0) {
      throw new AppError(
        `Ese evento tiene ${cuantas} actividad${cuantas === 1 ? '' : 'es'} y no se puede borrar. `
        + 'Ciérralo: queda con su justificación y su historia completa.',
        409,
      );
    }

    await db('eventos').where({ id }).del();
    res.json({ message: 'Evento borrado' });
  } catch (err) { next(err); }
}

// ── POST /eventos/:id/tareas ──────────────────────────────────

export async function agregarTarea(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const { titulo, descripcion, asignado_a_id, fecha_programada } = req.body as CrearTareaBody;

    if (!titulo?.trim())    throw new AppError('El título de la tarea es requerido', 422);
    if (!asignado_a_id)     throw new AppError('El campo asignado_a_id es requerido', 422);
    // La fecha es OPCIONAL. Exigirla obligaba a inventar un plazo cuando todavía
    // no se sabía cuál era, y una fecha inventada es peor que ninguna: el tablero
    // marca vencimientos que nadie pactó y la gente deja de creerle a los avisos.
    // Sin fecha, la actividad simplemente no vence.

    // Verificar que el evento existe
    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') throw new AppError('No se pueden agregar tareas a un evento cerrado', 409);

    const idDG = await getIdDireccionGeneral();
    const usuarioEsDG     = req.user!.oficina_id === idDG;
    const esCreadorEvento = req.user!.id === evento.creado_por_id;
    const esResponsable   = evento.responsable_id === req.user!.id;

    /**
     * El encargado del evento reparte el trabajo, tenga el rol que tenga.
     *
     * El guardia de rol estaba arriba, antes de leer el evento, así que rechazaba
     * a cualquiera que no fuera DIRECTOR sin llegar a mirar quién era. Eso dejaba
     * dos encargados muy distintos: cuando la Dirección General nombra encargado a
     * un titular de área, ese puede repartir actividades —pero por ser director, no
     * por ser encargado—; cuando un director nombra encargado a alguien de su
     * equipo, la palabra no valía nada: abría el evento y no podía hacer nada
     * dentro. Ahora se lee el evento primero y ser el encargado basta.
     *
     * Lo que sigue exigiendo rol de director es aprobar y devolver el trabajo: esa
     * es la revisión jerárquica, y en un evento de área la aprobación del director
     * es la final. Si la diera el encargado operativo, cerraría sus propias
     * actividades y el doble control desaparece.
     */
    if (!esResponsable) {
      requireDirector(req);
      requireRolDirector(req); // observadores y operativos ajenos al encargo
    }

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

    // En el evento propio de un director de área, la actividad solo se le
    // encomienda a quien fue incluido en el evento. Quien lo organiza —creador o
    // responsable— cuenta aunque no se haya agregado a sí mismo a la lista.
    //
    // Antes esta regla solo vivía en el selector de la pantalla, y el selector
    // ofrecía a todo el equipo operativo participara o no: al elegir a alguien
    // ajeno al evento el alta se rechazaba con un mensaje que hablaba de la
    // dirección y no de la participación, así que no se entendía por qué no se
    // guardaba. Los eventos de la Dirección General quedan fuera: ahí el
    // participante es el director del área, y él reparte entre su gente.
    if (!evento.requiere_aprobacion_dg) {
      const idAsignado = Number(asignado_a_id);
      const organiza   = idAsignado === evento.creado_por_id || idAsignado === evento.responsable_id;
      if (!organiza) {
        const participa = await db('evento_directores')
          .where({ evento_id: eventoId, director_id: idAsignado })
          .first();
        if (!participa) {
          throw new AppError(
            'Esa persona no está incluida en el evento. Agrégala como participante antes de encomendarle una actividad.',
            422,
          );
        }
      }
    }

    const [tarea] = await db('tareas_evento')
      .insert({
        evento_id:           eventoId,
        titulo:              titulo.trim(),
        descripcion:         descripcion?.trim() ?? null,
        asignado_a_id:       Number(asignado_a_id),
        estado:              'PENDIENTE',
        // Cadena vacía desde el formulario significa «sin fecha», no una fecha
        // inválida: se guarda como nulo.
        fecha_programada:    fecha_programada || null,
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
 * Designa (o cambia) al responsable del evento: la DG en los suyos, el director
 * de área en el propio.
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

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se puede cambiar el responsable de un evento cerrado', 409);
    }

    /**
     * Quién designa responsable, y a quién.
     *
     * Estaba reservado a la Directora General, y eso dejaba el evento del
     * director de área a medias: podía nombrar responsable al crearlo pero no
     * cambiarlo después, que es cuando se sabe a quién le tocó de verdad.
     *
     * Las mismas dos reglas que al crear y al sumar participantes:
     *   · la DG nombra titulares de área en sus eventos;
     *   · el dueño del evento nombra a alguien de SU unidad.
     */
    const idDG    = await getIdDireccionGeneral();
    const esDGReq = req.user!.oficina_id === idDG && actuaComoDG(req.user);
    const esDueno = evento.creado_por_id === req.user!.id;

    if (!esDGReq && !esDueno) {
      throw new AppError('Solo quien creó el evento puede designar a su responsable', 403);
    }
    if (esDGReq && !evento.requiere_aprobacion_dg) {
      throw new AppError('Ese evento es privado de su área: no lo administra la Dirección General', 422);
    }

    // Validar el nuevo responsable (si no es null)
    if (responsable_id !== null && responsable_id !== undefined) {
      const resp = await db('usuarios').where({ id: responsable_id, activo: true }).first();
      if (!resp) throw new AppError('Esa persona no existe o está inactiva', 422);

      const admitido = esDGReq
        ? resp.rol === 'DIRECTOR' && resp.unidad_id !== idDG
        : resp.unidad_id === req.user!.oficina_id;
      if (!admitido) {
        throw new AppError(
          esDGReq
            ? 'El responsable debe ser un director de área activo'
            : 'El responsable debe ser alguien activo de tu propia área',
          422,
        );
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
 * Suma un participante a un evento ya creado (aunque tenga actividades), por si
 * más adelante resulta necesario incorporar a alguien: la DG suma titulares de
 * área a los suyos, el director de área suma a los de su unidad en el propio.
 * Body: { director_id: number }
 */
export async function agregarDirector(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId = parseInt(req.params.id, 10);
    const { director_id } = req.body as { director_id: number };

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden agregar participantes a un evento cerrado', 409);
    }
    // El guardia de rol va después de leer el evento: el encargado arma la lista
    // aunque no sea director, y eso no se sabe hasta saber de qué evento se habla.
    if (evento.responsable_id !== req.user!.id) requireDirector(req);

    /**
     * Quién puede sumar a alguien, y a quién.
     *
     * Estaba reservado a la Directora General, y eso dejaba la función a medias
     * desde que un director puede invitar a su equipo AL CREAR el evento: podía
     * armarlo con su gente pero no sumar a nadie después, que es justo cuando uno
     * cae en la cuenta de que faltó alguien.
     *
     * Las mismas dos reglas que al crear:
     *   · la DG suma titulares de área a sus eventos;
     *   · el dueño del evento suma a los de SU unidad.
     */
    const idDG    = await getIdDireccionGeneral();
    const esDGReq = req.user!.oficina_id === idDG && actuaComoDG(req.user);
    const esDueno = evento.creado_por_id === req.user!.id;
    // El encargado arma el equipo del evento: es quien lo coordina y quien se da
    // cuenta de que falta alguien. Antes tenía que pedírselo a quien lo creó.
    const esEncargado = evento.responsable_id === req.user!.id;

    if (!esDGReq && !esDueno && !esEncargado) {
      throw new AppError('Solo quien creó el evento o su encargado pueden agregar participantes', 403);
    }
    if (esDGReq && !evento.requiere_aprobacion_dg) {
      throw new AppError('Ese evento es privado de su área: no lo administra la Dirección General', 422);
    }

    if (!director_id) throw new AppError('director_id es requerido', 422);
    const dir = await db('usuarios').where({ id: director_id, activo: true }).first();
    if (!dir) throw new AppError('Esa persona no existe o está inactiva', 422);

    /**
     * A quién se admite lo decide EL EVENTO, no quien está sumando.
     *
     * Antes se comparaba contra la unidad de quien hacía la petición, y eso
     * funcionaba mientras solo el dueño podía sumar: su unidad y la del evento son
     * la misma. Al abrirle la función al encargado deja de serlo — el encargado de
     * un evento de la Dirección General es el titular de OTRA área—, y con la
     * regla vieja habría podido meter a su equipo operativo en un evento de la DG,
     * donde los participantes son titulares.
     */
    const dueno = await db('usuarios').where({ id: evento.creado_por_id }).select('unidad_id').first();
    const admitido = evento.requiere_aprobacion_dg
      ? dir.rol === 'DIRECTOR' && dir.unidad_id !== idDG
      : dir.unidad_id === dueno?.unidad_id;
    if (!admitido) {
      throw new AppError(
        evento.requiere_aprobacion_dg
          ? 'El participante debe ser un director de área activo'
          : 'Solo puedes agregar a personas del área del evento',
        422,
      );
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

// ── DELETE /eventos/:id/directores/:directorId ────────────────
/**
 * Saca a alguien del evento.
 *
 * Nunca existió: se podía sumar gente pero no quitarla, ni siquiera la Dirección
 * General. Una lista a la que solo se agrega deja de describir quién trabaja el
 * evento —el que se fue del área, el que se puso por error— y a partir de ahí
 * estorba en todos los selectores que se apoyan en ella.
 *
 * Quita el renglón de participación y nada más. NO borra actividades ni historial:
 * lo que ya se trabajó ocurrió, y esconderlo sería peor que tener a alguien de más
 * en una lista. Por eso mismo se niega a sacar a quien tiene trabajo asignado
 * dentro; primero hay que reasignarlo.
 */
export async function quitarDirector(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventoId   = parseInt(req.params.id, 10);
    const directorId = parseInt(req.params.directorId, 10);

    const evento = await db('eventos').where({ id: eventoId }).first();
    if (!evento) throw new AppError('Evento no encontrado', 404);
    if (evento.estado === 'CERRADO') {
      throw new AppError('No se pueden quitar participantes de un evento cerrado', 409);
    }
    if (evento.responsable_id !== req.user!.id) requireDirector(req);

    // Las mismas tres llaves que para agregar.
    const idDG        = await getIdDireccionGeneral();
    const esDGReq     = req.user!.oficina_id === idDG && actuaComoDG(req.user);
    const esDueno     = evento.creado_por_id === req.user!.id;
    const esEncargado = evento.responsable_id === req.user!.id;

    if (!esDGReq && !esDueno && !esEncargado) {
      throw new AppError('Solo quien creó el evento o su encargado pueden quitar participantes', 403);
    }
    if (esDGReq && !evento.requiere_aprobacion_dg) {
      throw new AppError('Ese evento es privado de su área: no lo administra la Dirección General', 422);
    }

    // El encargado no se saca a sí mismo: el evento quedaría con un responsable que
    // no figura entre sus participantes, y quien lo nombró perdería la referencia.
    // Para salirse hay que pedirle a quien creó el evento que nombre a otro.
    if (directorId === evento.responsable_id) {
      throw new AppError(
        'Esa persona es la encargada del evento. Designa a otra antes de quitarla.',
        422,
      );
    }

    // Con trabajo dentro no se va. Quitarlo dejaría actividades a nombre de alguien
    // ajeno al evento —justo la incoherencia que se corrigió al repartirlas—, y
    // borrarlas sería perder lo ya trabajado.
    const conTrabajo = await db('tareas_evento')
      .where({ evento_id: eventoId })
      .andWhere((q: any) => q.where('asignado_a_id', directorId)
                             .orWhere('reasignado_a_id', directorId))
      .count('id as n')
      .first();
    if (Number(conTrabajo?.n ?? 0) > 0) {
      throw new AppError(
        'Esa persona tiene actividades en el evento. Reasígnalas antes de quitarla.',
        409,
      );
    }

    const quitados = await db('evento_directores')
      .where({ evento_id: eventoId, director_id: directorId })
      .del();
    if (quitados === 0) {
      throw new AppError('Esa persona no participa en el evento', 404);
    }

    const participantes = await db('evento_directores as ed')
      .join('usuarios as u', 'u.id', 'ed.director_id')
      .where('ed.evento_id', eventoId)
      .select('u.id', 'u.nombre')
      .orderBy('u.nombre', 'asc');

    res.json({ data: participantes, message: 'Participante quitado del evento' });
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
        // Sin esto, una actividad cancelada llega a la pantalla sin su porqué, que es
        // lo único que le explica a quien la tenía asignada qué pasó con su trabajo.
        't.motivo_cancelacion',
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
      // La fecha es opcional desde la migración 2026-09-07: puede llegar nula.
      const fechaStr: string | null =
        t.fecha_programada == null
          ? null
          : typeof t.fecha_programada === 'string'
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

// La fecha compromiso se retiró del módulo.
//
// Permitía que quien trabaja una actividad le pusiera una SEGUNDA fecha, encima
// de la que le había fijado quien se la asignó. Dos plazos para lo mismo y nadie
// los conciliaba: al final no se sabía cuál valía. Ahora manda la fecha de la
// actividad, que además pasó a ser opcional.
//
// La columna `tareas_evento.fecha_compromiso` se conserva con lo ya capturado.
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
    let compresion: ReturnType<typeof compresionInfo> = null;
    if (tieneArchivo) {
      const guardado = await storage.saveWithInfo(file!, 'eventos/avances');
      documento_url  = guardado.url;
      compresion     = compresionInfo(guardado);
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

    res.json({ message: 'Avance enviado correctamente', compresion });

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
      // Traemos nivel 2 (acciones de la DG y avances directos de un director),
      // APROBACION_N1 (el envío del director a la DG) y los AVANCE nivel 1 SOLO
      // para poder rescatar su documento entregado. Los avances nivel 1 se ocultan
      // después (registrosVisibles); su documento se traslada a la APROBACION_N1.
      query = query.where(function () {
        this.where('h.nivel_revision', 2)
            .orWhere('h.tipo', 'APROBACION_N1')
            .orWhere('h.tipo', 'AVANCE');
      });
    }

    const registrosRaw = await query.orderBy('h.creado_en', 'asc');

    // La DG solo debe ver el movimiento director de área → Dirección General.
    // Las transacciones operativo↔director (avances nivel 1 y sus correcciones)
    // se ocultan: no necesita ver todo lo que viene desde atrás. Pero el documento
    // ENTREGADO por el operativo sí debe llegar a ella, así que lo trasladamos a la
    // aprobación del director (APROBACION_N1), que es el movimiento que sí ve.
    const registrosVisibles = (() => {
      if (!esDG) return registrosRaw;

      const avancesN1 = registrosRaw
        .filter((r: any) => r.tipo === 'AVANCE' && r.nivel_revision === 1)
        .sort((a: any, b: any) => a.id - b.id);

      return registrosRaw
        // Ocultar los avances internos del operativo (nivel 1)
        .filter((r: any) => !(r.tipo === 'AVANCE' && r.nivel_revision === 1))
        // Adjuntar a cada aprobación del director el documento del avance que aprobó
        .map((r: any) => {
          if (r.tipo === 'APROBACION_N1' && !r.documento_url) {
            const avancePrevio = [...avancesN1].reverse().find((a: any) => a.id < r.id);
            if (avancePrevio?.documento_url) {
              return { ...r, documento_url: avancePrevio.documento_url };
            }
          }
          return r;
        });
    })();

    // Para la DG, los operativos se muestran bajo el director de su área (no su
    // nombre real), consistente con el resto de sus vistas.
    const directorPorUnidad = new Map<number, string>();
    if (esDG) {
      const unidades = [...new Set(
        registrosVisibles.filter((r: any) => r.autor_rol === 'OPERATIVO').map((r: any) => r.autor_unidad_id),
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

    const registros = registrosVisibles.map((r: any) => {
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
