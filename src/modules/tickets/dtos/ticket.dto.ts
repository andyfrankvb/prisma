/**
 * DTOs: Tickets
 * File: src/modules/tickets/dtos/ticket.dto.ts
 *
 * Migrado desde SID (backend/app/Models/Ticket.php, TicketFile.php y los
 * catálogos estáticos de backend/routes/api.php:/tickets/opciones/*).
 * Valores en MAYÚSCULAS con guion bajo — igual convención que el resto de
 * catálogos de PRISMA (estatus_oficio, estado_tarea), a diferencia de SID
 * que los guardaba en minúsculas.
 */

export type TipoTicket      = 'APERTURA' | 'MODIFICACION';
export type EstadoTicket    = 'NUEVO' | 'ABIERTO' | 'EN_PROCESO' | 'EN_ESPERA' | 'RESUELTO' | 'CERRADO';
export type UrgenciaTicket  = 'URGENTE' | 'MEDIA' | 'BAJA' | 'INDEFINIDA';
export type PrioridadTicket = 'ALTA' | 'MEDIA' | 'BAJA';
export type ImpactoTicket   = 'ALTO' | 'MEDIO' | 'BAJO';
export type CategoriaTicket =
  | 'TRASPASO_FOLIO' | 'REPOSICION' | 'CARGA_ACTO'
  | 'UNIFICACION_FOLIO' | 'ACTUALIZACION_IMAGEN' | 'INTEGRACION';

/**
 * Valores que solo existen en los 13,760 tickets históricos migrados de SID
 * (db/migrate-tickets-sid.mjs) — 15 años de captura libre incluyen urgencias/
 * prioridades/impactos que el catálogo estático actual
 * (`/tickets/opciones/*`, estos mismos 4/3/3 valores de arriba) nunca ofreció.
 * Se admiten para no romper la lectura de datos reales, pero un ticket
 * NUEVO nunca los recibe: los validadores de creación/edición
 * (tickets.controller.ts) siguen exigiendo solo los valores "vivos" de
 * arriba, vía URGENCIAS_TICKET/PRIORIDADES_TICKET/IMPACTOS_TICKET.
 */
export type UrgenciaTicketHistorica  = UrgenciaTicket | 'MUY_URGENTE' | 'ALTA';
export type PrioridadTicketHistorica = PrioridadTicket | 'URGENTE';
export type ImpactoTicketHistorica   = ImpactoTicket | 'MUY_ALTO';

export const TIPOS_TICKET: TipoTicket[] = ['APERTURA', 'MODIFICACION'];
export const ESTADOS_TICKET: EstadoTicket[] = ['NUEVO', 'ABIERTO', 'EN_PROCESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO'];
export const URGENCIAS_TICKET: UrgenciaTicket[] = ['URGENTE', 'MEDIA', 'BAJA', 'INDEFINIDA'];
export const PRIORIDADES_TICKET: PrioridadTicket[] = ['ALTA', 'MEDIA', 'BAJA'];
export const IMPACTOS_TICKET: ImpactoTicket[] = ['ALTO', 'MEDIO', 'BAJO'];

/** Estados en los que se admite (y persiste) `solucion` — EN_PROCESO como avance, CERRADO como definitiva. */
export const ESTADOS_CON_SOLUCION: EstadoTicket[] = ['EN_PROCESO', 'CERRADO'];

export interface CategoriaTicketOpcion {
  value: CategoriaTicket;
  label: string;
  rol_asignado: string;
}

export const CATEGORIAS_TICKET: CategoriaTicketOpcion[] = [
  { value: 'TRASPASO_FOLIO',       label: 'Traspaso de folio',        rol_asignado: 'Director Jurídico' },
  { value: 'REPOSICION',           label: 'Reposición',               rol_asignado: 'Director Jurídico' },
  { value: 'CARGA_ACTO',           label: 'Carga de acto',            rol_asignado: 'Director Jurídico' },
  { value: 'UNIFICACION_FOLIO',    label: 'Unificación de folio',     rol_asignado: 'Mesa de Control' },
  { value: 'ACTUALIZACION_IMAGEN', label: 'Actualización de imagen',  rol_asignado: 'Mesa de Control' },
  { value: 'INTEGRACION',          label: 'Integración',              rol_asignado: 'Mesa de Control' },
];

/** Extensiones/mimetypes admitidos para adjuntos — regla del backend legacy (Laravel `mimes:jpg,jpeg,png,pdf,doc,docx|max:5120`). */
export const ADJUNTO_MAX_BYTES = 5 * 1024 * 1024;
export const ADJUNTO_MIMES_PERMITIDOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export interface ActorTicket {
  id:            number;
  nombre:        string;
  email:         string | null;
  rol:           string;
  unidad_id:     number;
  unidad_nombre: string | null;
}

export interface CambioCampoTicket {
  old: unknown;
  new: unknown;
}

export interface HistorialTicketEntry {
  at:     string;
  action: string;
  user:   ActorTicket;
  diff:   Record<string, CambioCampoTicket>;
}

export interface AdjuntoTicket {
  id:             number;
  ticket_id:      number;
  file_path:      string;
  original_name:  string;
  file_size:      number;
  file_type:      string;
  created_at:     string;
}

/**
 * Un ticket tal como se lista. `remitente_unidad_id`/`remitente_unidad_nombre`
 * son la unidad de quien lo abrió (derivada por JOIN, no una columna propia
 * de `tickets`) — mismo dato que SID exponía como `oficina`/`oficina_id`,
 * renombrado aquí para no dar a entender que es la unidad "dueña" del ticket.
 *
 * `remitente_id`/`destinatario_id` son nullable, y `remitente_nombre`/
 * `destinatario_nombre` caen a `*_legacy_nombre` cuando lo son: varios de
 * los 13,760 tickets históricos de SID pertenecen a personas que todavía no
 * tienen cuenta en PRISMA (ver 2026-09-20_tickets.sql). `remitente_nombre`
 * nunca es null — el service ya resuelve el fallback — pero la unidad del
 * remitente sí puede faltar si no hay cuenta que la traiga.
 */
export interface Ticket {
  id:                      number;
  ticket_code:             string;
  titulo:                  string;
  descripcion:             string;
  tipo:                    TipoTicket | null;
  estado:                  EstadoTicket;
  urgencia:                UrgenciaTicketHistorica;
  prioridad:               PrioridadTicketHistorica | null;
  impacto:                 ImpactoTicketHistorica | null;
  categoria:               CategoriaTicket | null;
  /** Categoría original de SID cuando no tiene equivalente en el catálogo nuevo (ver migración de ajustes). */
  categoria_legacy:        string | null;
  remitente_id:            number | null;
  remitente_nombre:        string;
  remitente_unidad_id:     number | null;
  remitente_unidad_nombre: string | null;
  destinatario_id:         number | null;
  destinatario_nombre:     string | null;
  solucion:                string | null;
  fecha_solucion:          string | null;
  last_action:             string | null;
  created_at:              string;
  updated_at:              string;
}

export interface TicketDetalle extends Ticket {
  change_log: HistorialTicketEntry[];
  archivos:   AdjuntoTicket[];
}

export interface FiltrosTicket {
  estado?:    EstadoTicket;
  categoria?: CategoriaTicket;
  search?:    string;
  page?:      number;
  limit?:     number;
}

export interface CrearTicketPayload {
  titulo:          string;
  descripcion:     string;
  tipo:            TipoTicket;
  urgencia:        UrgenciaTicket;
  categoria?:      CategoriaTicket | null;
  destinatario_id?: number | null;
}

export interface ActualizarTicketPayload {
  titulo?:          string;
  descripcion?:     string;
  estado?:          EstadoTicket;
  urgencia?:        UrgenciaTicket;
  categoria?:       CategoriaTicket | null;
  destinatario_id?: number | null;
  solucion?:        string;
}

export interface TicketListResponse {
  data: Ticket[];
  meta: { total: number; page: number; limit: number; puede_gestionar: boolean };
}

export interface TicketDetalleResponse {
  data: TicketDetalle;
}

export interface CrearTicketResponse {
  data:    TicketDetalle;
  message: string;
}
