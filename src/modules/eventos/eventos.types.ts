/**
 * Types: Supervisión de Eventos
 * File: src/modules/eventos/eventos.types.ts
 */

// ── Enums ─────────────────────────────────────────────────────

export type EstadoEvento = 'ABIERTO' | 'CERRADO';
export type EstadoTarea  = 'PENDIENTE' | 'EN_PROGRESO' | 'EN_REVISION' | 'EN_REVISION_DG' | 'DEVUELTO' | 'DEVUELTO_DG' | 'COMPLETADA' | 'FINALIZADO';

// ── Entidades ─────────────────────────────────────────────────

export interface TareaEvento {
  id:                  number;
  evento_id:           number;
  titulo:              string;
  descripcion:         string | null;
  asignado_a_id:       number;
  asignado_a_nombre:   string;
  estado:              EstadoTarea;
  fecha_programada:    string | null;   // YYYY-MM-DD — opcional: sin plazo no vence
  fecha_actualizacion: string;   // ISO timestamp
  vencida:             boolean;
  proxima_a_vencer:    boolean;
}

export interface EventoResumen {
  id:               number;
  titulo:           string;
  descripcion:      string | null;
  estado:           EstadoEvento;
  fecha_creacion:   string;
  fecha_cierre:     string | null;
  total_tareas:     number;
  tareas_pendiente: number;
  tareas_en_progreso: number;
  tareas_completada: number;
  tareas_vencidas:  number;
  tareas_proximas:  number;
}

export interface EventoDetalle {
  id:             number;
  titulo:         string;
  descripcion:    string | null;
  estado:         EstadoEvento;
  fecha_creacion: string;
  fecha_cierre:   string | null;
  tareas:         TareaEvento[];
}

// ── Request bodies ────────────────────────────────────────────

export interface CrearEventoBody {
  titulo:           string;
  descripcion?:     string;
  director_ids?:    number[];  // IDs de directores de área que participarán en el evento
  fecha_programada?: string | null; // YYYY-MM-DD — fecha límite del evento (opcional)
  responsable_id?:  number | null; // director de área designado como responsable/coordinador
}

export interface CrearTareaBody {
  titulo:           string;
  descripcion?:     string;
  asignado_a_id:    number;
  fecha_programada?: string | null;   // YYYY-MM-DD — opcional
}

export interface ActualizarEstadoTareaBody {
  estado: EstadoTarea;
}

export interface EnviarRevisionBody {
  comentario?: string;   // al menos uno de los dos es obligatorio (el otro es req.file vía multer)
}

export interface DevolverTareaBody {
  comentario: string;   // obligatorio, no vacío
}

export interface RegistroHistorial {
  id:            number;
  tarea_id:      number;
  autor_id:      number;
  autor_nombre:  string;
  tipo:          'AVANCE' | 'DEVOLUCION' | 'APROBACION_N1' | 'APROBACION_N2';
  nivel_revision: 1 | 2;
  contenido:     string | null;
  documento_url: string | null;
  creado_en:     string;
}

export interface AprobarTareaDGBody {
  // Sin body requerido; la autorización se verifica por identidad de la DG
}

export interface DevolverTareaDGBody {
  comentario: string;   // obligatorio, no vacío ni solo espacios
}

// ── Responses ─────────────────────────────────────────────────

export interface ListarEventosResponse {
  data: EventoResumen[];
}

export interface DetalleEventoResponse {
  data: EventoDetalle;
}

// ── Funciones puras ───────────────────────────────────────────

/**
 * Valida si la transición de estado de una tarea es permitida.
 * Transiciones válidas (flujo de doble revisión):
 *   PENDIENTE      → EN_PROGRESO
 *   EN_PROGRESO    → EN_REVISION
 *   EN_REVISION    → EN_REVISION_DG | DEVUELTO
 *   EN_REVISION_DG → COMPLETADA | DEVUELTO
 *   DEVUELTO       → EN_REVISION
 */
export function isValidTransition(actual: EstadoTarea, nuevo: EstadoTarea): boolean {
  const TRANSICIONES: Partial<Record<EstadoTarea, EstadoTarea[]>> = {
    PENDIENTE:      ['EN_PROGRESO'],
    EN_PROGRESO:    ['EN_REVISION'],
    // EN_REVISION → FINALIZADO: aprobación del director en eventos privados (sin DG)
    EN_REVISION:    ['EN_REVISION_DG', 'FINALIZADO', 'DEVUELTO'],
    // La DG no devuelve directo al operativo: cae en el director de área (DEVUELTO_DG),
    // que luego la baja a su operativo con observaciones extra (DEVUELTO).
    EN_REVISION_DG: ['FINALIZADO', 'DEVUELTO_DG'],
    DEVUELTO_DG:    ['DEVUELTO'],
    DEVUELTO:       ['EN_REVISION'],
    // COMPLETADA se mantiene por compatibilidad con datos existentes
    COMPLETADA:     [],
    FINALIZADO:     [],
  };
  return TRANSICIONES[actual]?.includes(nuevo) ?? false;
}

/**
 * Parses a YYYY-MM-DD date string as a local midnight Date,
 * avoiding the UTC-parsing issue of `new Date('YYYY-MM-DD')`.
 */
function parseFechaLocal(fecha_programada: string): Date {
  const [year, month, day] = fecha_programada.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Determina si una tarea está vencida.
 * Una tarea está vencida cuando su fecha_programada es anterior a hoy
 * y su estado es distinto de COMPLETADA.
 *
 * La fecha es opcional: una actividad sin plazo no puede vencer.
 */
export function isVencida(fecha_programada: string | null, estado: EstadoTarea): boolean {
  if (!fecha_programada) return false;
  if (estado === 'COMPLETADA') return false;
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = parseFechaLocal(fecha_programada);
  return fecha < hoy;
}

/**
 * Determina si una tarea está próxima a vencer.
 * Una tarea está próxima a vencer cuando su fecha_programada está dentro
 * de los próximos 3 días naturales (inclusive hoy) y su estado es distinto
 * de COMPLETADA.
 *
 * La fecha es opcional: una actividad sin plazo nunca está próxima a vencer.
 */
export function isProximaAVencer(fecha_programada: string | null, estado: EstadoTarea): boolean {
  if (!fecha_programada) return false;
  if (estado === 'COMPLETADA') return false;
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + 3);
  const fecha = parseFechaLocal(fecha_programada);
  return fecha >= hoy && fecha <= limite;
}
