/**
 * Shared frontend types
 * File: src/frontend/types.ts
 */

export type RolUsuario = 'OFICIAL' | 'ENCARGADO' | 'JURIDICO' | 'SECRETARIA' | 'DIRECTOR' | 'SUPERADMIN' | 'OPERATIVO' | 'PARTICULAR';

export type EstatusOficio =
  | 'RECIBIDO'
  | 'ASIGNADO'
  | 'EN_REVISION'
  | 'EN_RECONSIDERACION'
  | 'VOBO_APROBADO'
  | 'FINALIZADO';

export type TipoUnidad = 'DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION';

export interface AuthUser {
  id:          number;
  nombre:      string;
  email:       string;
  rol:         RolUsuario;
  oficina_id:  number;
  oficina_nombre: string;
  unidad_tipo: TipoUnidad; // tipo de unidad del usuario — routing sin depender de IDs
}

export interface Oficio {
  id:                    number;
  folio:                 string;
  remitente:             string;
  dependencia_origen:    string;
  unidad_interna?:       string | null;
  numero_oficio_origen?: string | null;
  /** Por dónde entró el oficio: VENTANILLA o CORREO_ELECTRONICO. */
  via_recepcion?:        string | null;
  correo_origen?:        string | null;
  correo_destino?:       string | null;
  fecha_oficio?:         string | null;
  dirigido_a_id:         number;
  oficial_registro_id:   number;
  oficina_registro_id:   number;
  fecha_registro:        string;   // ISO string
  descripcion_solicitud: string;
  tiene_termino:         boolean;
  fecha_vencimiento:     string | null;
  pdf_original_path:     string | null;
  estatus:               EstatusOficio;
  // SIQROO
  siqroo_aplica?:          boolean;
  siqroo_control_interno?: string | null;
  siqroo_boleta_url?:      string | null;
  siger_aplica?:           boolean;
  siger_control_interno?:  string | null;
  // computed by API
  dias_restantes?:       number | null;
  /** true si el usuario actual puede dar el VoBo / reconsiderar este oficio */
  puede_vobo?:           boolean;
  /** true si el usuario actual puede subir el firmado y finalizar este oficio */
  puede_finalizar?:      boolean;
  /** delegación a la que corresponde el oficio (según el "dirigido a") */
  delegacion_nombre?:    string | null;
  /** nombre del usuario que tiene el oficio en su bandeja ahora */
  en_bandeja_de?:        string | null;
  // ── Usuarios del oficio (para el panel de detalle) ──
  dirigido_a_nombre?:    string | null;
  dirigido_a_rol?:       RolUsuario | null;
  abogado_nombre?:       string | null;
  encargado_nombre?:     string | null;
  ingresado_por_nombre?: string | null;
  vobo_por_nombre?:      string | null;
  secretaria_nombre?:    string | null;
  /** fecha/hora en que se subió el documento firmado (paso a FINALIZADO) */
  fecha_firmado?:        string | null;
}

export interface Abogado {
  id:     number;
  nombre: string;
  email:  string;
  cargo?: string | null;
  oficina_nombre?: string | null;
}

export interface AsignacionJuridica {
  id:               number;
  oficio_id:        number;
  abogado_id:       number;
  asignado_por_id:  number;
  fecha_asignacion: string;
  observaciones:    string | null;
}

export interface GestionContestacion {
  id:                       number;
  oficio_id:                number;
  proyecto_url:             string;
  escaneo_firmado_url:      string | null;
  vobo_encargado:           boolean;
  fecha_vobo:               string | null;
  subido_por_secretaria_id: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

// ── Módulos ───────────────────────────────────────────────────

export interface Modulo {
  id:            number;
  clave:         string;
  nombre_display: string;
  descripcion:   string | null;
  activo:        boolean;
  orden:         number;
}

export interface ModuloConEstado extends Modulo {
  habilitado:  boolean;
  asignado_en: string | null;
}

export interface ResumenModulo {
  id:          number;
  clave:       string;
  nombre:      string;
  orden:       number;
  activos:     number | null;
  pendientes:  number | null;
  alertas:     number | null;
  error?:      string;
}

// ── Eventos ───────────────────────────────────────────────────

export type EstadoEvento = 'ABIERTO' | 'CERRADO';
export type EstadoTarea  = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'EN_REVISION' | 'EN_REVISION_DG' | 'DEVUELTO' | 'DEVUELTO_DG' | 'FINALIZADO';

export interface TareaEvento {
  id:                  number;
  evento_id:           number;
  titulo:              string;
  descripcion:         string | null;
  asignado_a_id:       number;
  asignado_a_nombre:   string;
  reasignado_a_id:     number | null;
  reasignado_a_nombre: string | null;
  estado:              EstadoTarea;
  fecha_programada:    string;
  fecha_compromiso:    string | null;
  fecha_actualizacion: string;
  vencida:             boolean;
  proxima_a_vencer:    boolean;
}

export interface EventoResumen {
  id:                 number;
  titulo:             string;
  descripcion:        string | null;
  estado:             EstadoEvento;
  fecha_creacion:     string;
  fecha_cierre:       string | null;
  fecha_programada:   string | null;
  responsable_id?:    number | null;
  total_tareas:       number;
  tareas_pendiente:   number;
  tareas_en_progreso: number;
  tareas_completada:  number;
  tareas_vencidas:    number;
  tareas_proximas:    number;
}

export interface RegistroHistorial {
  id:            number;
  tarea_id:      number;
  autor_id:      number;
  autor_nombre:  string;
  tipo:          'AVANCE' | 'DEVOLUCION' | 'APROBACION_N1' | 'APROBACION_N2' | 'REASIGNACION';
  contenido:     string | null;
  documento_url: string | null;
  creado_en:     string;
}

export interface EventoDetalle {
  id:               number;
  titulo:           string;
  descripcion:      string | null;
  estado:           EstadoEvento;
  fecha_creacion:   string;
  fecha_cierre:     string | null;
  fecha_programada: string | null;
  responsable_id?:    number | null;
  responsable_nombre?: string | null;
  es_responsable?:    boolean;
  justificacion_cierre?: string | null;
  cerrado_por_id?:       number | null;
  cerrado_por_nombre?:   string | null;
  tareas:           TareaEvento[];
  directores_participantes?: { id: number; nombre: string }[];
}

// ── Configuración de Flujos ───────────────────────────────────

export interface ConfiguracionFlujo {
  modulo_clave:           string;
  modulo_nombre:          string;
  rol_flujo:              string;
  usuario_id:             number | null;
  usuario_nombre:         string | null;
  usuario_email:          string | null;
  usuario_rol:            RolUsuario | null;
  actualizado_en:         string | null;
  actualizado_por_nombre: string | null;
  regla_compatibilidad:   { rol_sistema_requerido: string; unidad_tipo_requerida?: string; descripcion: string };
}

export interface UsuarioDisponible {
  id:           number;
  nombre:       string;
  email:        string;
  rol:          RolUsuario;
  unidad_nombre: string;
}
