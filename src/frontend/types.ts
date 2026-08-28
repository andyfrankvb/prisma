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
  /** Cómo se capturó el plazo: por fecha límite, o por horas desde el ingreso. */
  termino_tipo?:         'FECHA' | 'HORAS' | null;
  /** Cuántas horas dura el plazo, de 1 a 24, cuando va por horas. */
  termino_horas?:        number | null;
  /** Instante exacto en que se agota el plazo. Lo calcula la base. */
  vence_en?:             string | null;
  pdf_original_path:     string | null;
  estatus:               EstatusOficio;
  // SIQROO
  siqroo_aplica?:          boolean;
  siqroo_control_interno?: string | null;
  siqroo_boleta_url?:      string | null;
  siger_aplica?:           boolean;
  siger_control_interno?:  string | null;
  /** Oficio informativo: se cierra sin pasar por el flujo de contestación. */
  de_conocimiento?:         boolean;
  de_conocimiento_en?:      string | null;
  /** Solo la Dirección Jurídica ve la casilla. Lo calcula el servidor. */
  puede_de_conocimiento?:   boolean;
  /**
   * El usuario responde por el área donde vive hoy el oficio —es su titular o su
   * encargado—. Ser encargado se sabe de forma global; esto lo dice por oficio,
   * que es lo que hace falta desde que un área conserva la vista de lo que mandó.
   */
  es_de_mi_area?:           boolean;
  /** El encargado del área que lo tiene puede turnarlo a otra. Lo calcula el servidor. */
  puede_turnar?:            boolean;
  /**
   * Puede solicitar información a otra área sobre este oficio. Más abierto que
   * turnar: el analista que lo trabaja también puede, porque es quien descubre
   * que le falta algo. Lo calcula el servidor; la pantalla no lo deduce.
   */
  puede_solicitar?:         boolean;
  /**
   * Llegó turnado y el área todavía no lo recibe. Hasta que lo acepte puede
   * regresarlo; después, la salida es turnarlo por no competencia.
   */
  puede_aceptar_turno?:     boolean;
  /** Llegó por un turno y sigue sin aceptarse: se puede regresar a quien lo mandó. */
  puede_devolver_turno?:    boolean;
  /** Llegó a esta área desde otra, no lo capturó su propia oficialía. */
  llego_de_otra_area?:      boolean;
  /** Cuántos turnos trajeron este oficio al área que lo tiene hoy. */
  turnos_recibidos?:        number;
  /** Delegatorios de este oficio que ninguna área ha contestado todavía. */
  delegatorios_pendientes?: number;
  /** El último turno que lo trajo aquí fue una devolución por competencia. */
  llego_por_devolucion?:    boolean;
  /** Marcado en SIGER sin delegatorio a una delegación: no puede cerrarse. */
  siger_sin_delegatorio?:   boolean;
  /** El folio real electrónico ya se incorporó a SIQROO. */
  fre_incorporado?:         boolean;
  fre_incorporado_en?:      string | null;
  /** FRE marcado sin delegatorio a la Dirección de Informática: no puede cerrarse. */
  fre_sin_delegatorio?:     boolean;
  /** El asunto lo resuelve la Dirección General: la delegación avanzó y lo mandó. */
  resolucion?:              boolean;
  resolucion_en?:           string | null;
  /** true si el usuario actual puede mandarlo como resolución a la Dirección General. */
  puede_marcar_resolucion?: boolean;
  /** Búsqueda de testamentos: plazo fijo de 10 días hábiles en dos etapas. */
  testamento?:              boolean;
  testamento_en?:           string | null;
  testamento_vence_delegaciones?: string | null;
  testamento_vence_encargado?:    string | null;
  /** Marcado como testamento sin delegatorio a ninguna delegación. */
  testamento_sin_delegatorio?:    boolean;
  // computed by API
  dias_restantes?:       number | null;
  /** Horas que faltan, solo cuando el término se capturó en horas. */
  horas_restantes?:      number | null;
  /**
   * Lo regresaron a corregir desde arriba —la Directora General, la carga del
   * firmado—, así que le toca al encargado que lo aprobó y no al analista que lo
   * redactó. Se levanta sola al subir la versión corregida.
   */
  reconsideracion_al_encargado?: boolean;
  /**
   * Hay un proyecto de contestación guardado. Lo dice el servidor mirando el
   * archivo, no el estatus: un oficio turnado vuelve a RECIBIDO y aun así puede
   * traer el borrador que redactó la otra área. Al firmar se borra y esto pasa a
   * ser falso.
   */
  tiene_proyecto?:       boolean;
  /** true si el usuario actual puede dar el VoBo / reconsiderar este oficio */
  puede_vobo?:           boolean;
  /** true si el usuario actual puede subir el firmado y finalizar este oficio */
  puede_finalizar?:      boolean;
  /** Es quien da el visto bueno en su área, aunque ahora esté bloqueado. */
  es_aprobador?:         boolean;
  /**
   * Puede regresar el oficio a corregir. Alcanza a más gente que aprobar: el
   * aprobador, el titular del área —la Directora General en lo suyo— y quien
   * tiene la carga del firmado, que es el último en verlo antes de que salga.
   */
  puede_reconsiderar?:   boolean;
  /** Por qué no se puede cerrar todavía, dicho con palabras. Vacío si no hay freno. */
  bloqueo?:              string | null;
  /** el oficio está esperando la firma de la Dirección General */
  en_pase_firma?:        boolean;
  /**
   * Qué paso del flujo espera una acción del usuario actual en este oficio.
   * Vacío si ahora mismo le toca a alguien más, o si ya está cerrado.
   */
  mi_paso?:              'ASIGNAR' | 'REDACTAR' | 'VISTO_BUENO' | 'FIRMAR' | null;
  /** true si el usuario actual puede mandarlo a firma de la Dirección General */
  puede_mandar_firma?:   boolean;
  /** true si el usuario actual puede regresarlo al área sin firmarlo */
  puede_devolver_pase_firma?: boolean;
  /** por qué lo regresó la Dirección General la última vez, si pasó */
  pase_firma_devuelto_motivo?: string | null;
  /** delegación a la que corresponde el oficio (según el "dirigido a") */
  delegacion_nombre?:    string | null;
  /** nombre del usuario que tiene el oficio en su bandeja ahora */
  en_bandeja_de?:        string | null;
  // ── Usuarios del oficio (para el panel de detalle) ──
  dirigido_a_nombre?:    string | null;
  /** A quién iba dirigido el documento, aunque después se haya turnado. */
  dirigido_a_original_nombre?: string | null;
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
