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
  /** ¿El oficio está en la bandeja de quien consulta, ahora mismo? */
  en_mi_bandeja?:           boolean;
  /** ¿Quien consulta es el encargado configurado de la unidad destinataria? */
  soy_encargado_del_area?:  boolean;
  /** ¿Puede corregir los datos que capturó la oficialía? Falso si ya finalizó. */
  puede_corregir?:          boolean;
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
  /** Búsqueda de testamentos: plazo fijo de 3 días hábiles en dos etapas. */
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
  /**
   * Solo al pedir candidatos para asignar un oficio: 0 si el analista está
   * designado en el área del oficio, 1 si viene de otra que el encargado dirige.
   * Ordena la lista y le dice a la pantalla cuándo nombrar el área de dónde sale.
   */
  orden_area?: number;
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
  proyecto_url:             string | null;
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
export type EstadoTarea  = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'EN_REVISION' | 'EN_REVISION_DG' | 'DEVUELTO' | 'DEVUELTO_DG' | 'FINALIZADO' | 'CANCELADA';

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
  /** Opcional: una actividad puede repartirse sin plazo. */
  fecha_programada:    string | null;
  fecha_compromiso:    string | null;
  /** Por qué se canceló. Solo viene con estado CANCELADA. */
  motivo_cancelacion?: string | null;
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
  creado_por_id?:     number;
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
  /** true en los eventos de la Dirección General; false en el evento propio de
   *  un director de área, donde los participantes son su equipo operativo. */
  requiere_aprobacion_dg?: boolean;
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

// ── SATQ — ingresos y conciliación con RPP ──────────────────────

export interface SatqDetalleFila {
  id:                number;
  referencia:        string;
  no_operacion:      string;
  fecha_contable:    string;
  municipio:         string;
  id_concepto:       number;
  concepto:          string;
  importe:           number;
  total_referencia:  number;
  conciliado:        boolean;
  programa:          string;
  tipo_acto:         string;
  es_subsidio:       boolean;
  /** 'Conciliado' | 'En trámite en RPP' | 'Cancelado en RPP' | 'No ha ingresado a RPP' */
  estatus_conciliacion: string;
  /** delegación de RPP (Benito Juárez, Playa del Carmen, Cozumel, Othón P. Blanco); null si no está en RPP */
  delegacion:        string | null;
}

export interface SatqConcepto {
  id_concepto: number;
  concepto:    string;
}

export interface SatqDetalleResponse {
  data: SatqDetalleFila[];
  meta: { total: number; page: number; limit: number; suma_importe: number };
}

export interface ConceptoResumenSatq {
  id_concepto: number | null;
  concepto:    string;
  monto:       number;
  cantidad:    number;
}

export interface MunicipioResumenSatq {
  municipio: string;
  monto:     number;
  cantidad:  number;
  monto_anio_anterior: number | null;
  pct_variacion_anio_anterior: number | null;
}

export interface DelegacionResumenSatq {
  delegacion: string;
  monto:      number;
  cantidad:   number;
}

export interface ConciliacionResumenSatq {
  conciliado:           number;
  en_tramite_rpp:        number;
  cancelado_rpp:         number;
  no_ingresado_rpp:      number;
  pct_conciliado:        number;
  pct_en_tramite_rpp:    number;
  pct_cancelado_rpp:     number;
  pct_no_ingresado_rpp:  number;
  monto_conciliado:        number;
  monto_en_tramite_rpp:     number;
  monto_cancelado_rpp:      number;
  monto_no_ingresado_rpp:   number;
}

export interface ComparativoAnioAnteriorSatq {
  periodo:       { desde: string; hasta: string };
  ingreso_total: number;
  pct_variacion: number | null;
}

export interface DesgloseCategoriaSatq {
  categoria:      string;
  cargo_bruto:    number;
  subsidio:       number;
  neto:           number;
  pct_subsidiado: number;
  cantidad:       number;
  tramites_rpp_cargo:    number;
  tramites_rpp_subsidio: number;
  neto_anio_anterior: number | null;
  pct_variacion_anio_anterior: number | null;
}

export interface ComparativoAnualSatq {
  anio:              number;
  cargo_bruto:       number | null;
  subsidio:          number | null;
  ingreso_neto:      number | null;
  tiene_datos_satq:  boolean;
  rango_satq:        { desde: string; hasta: string } | null;
  tramites_rpp:      number;
  rango_rpp:         { desde: string; hasta: string } | null;
}

export interface DiagnosticoDiaSatq {
  fecha:         string;
  total:         number;
  sin_match:     number;
  pct_sin_match: number;
}

export interface DiagnosticoConceptoSatq {
  id_concepto:      number | null;
  concepto:         string;
  total:            number;
  sin_match:        number;
  pct_sin_match:    number;
  monto_sin_match:  number;
}

export interface DiagnosticoConciliacionSatq {
  periodo:      { desde: string; hasta: string };
  por_dia:      DiagnosticoDiaSatq[];
  por_concepto: DiagnosticoConceptoSatq[];
}

export interface EstimacionMesSatq {
  anio:     number;
  mes:      number;
  estimado: number;
  reportado_excel: number | null;
  recaudado_bd:    number | null;
  diferencia_bd_vs_estimado: number | null;
  pct_diferencia_bd_vs_estimado: number | null;
  es_decremento: boolean;
  diferencia_bd_vs_excel: number | null;
  monto_subsidios: number | null;
  gran_total: number | null;
  diferencia_gran_total_vs_estimado: number | null;
  pct_diferencia_gran_total_vs_estimado: number | null;
}

export interface EscenarioAnualSatq {
  proyeccion_restante: number;
  total_anual:         number;
  diferencia_vs_meta_anual: number;
  pct_vs_meta_anual:        number;
}

export interface ProyeccionAnualSatq {
  anio: number;
  meses_con_datos: number;
  meses_restantes: number;
  recaudado_acumulado: number;
  estimado_transcurrido: number;
  deficit_acumulado: number;
  pct_variacion_promedio: number;
  estimado_restante: number;
  estimado_total_anual: number;
  escenario_meta:      EscenarioAnualSatq;
  escenario_tendencia: EscenarioAnualSatq;
  monto_necesario_resto_anio: number;
  pct_necesario_sobre_estimado_restante: number;
}

export interface ResumenSatq {
  periodo:             { desde: string; hasta: string };
  ingreso_total:       number;
  /** ingreso_total + monto_subsidios — valor total del trabajo de RPP, cobrado o subsidiado */
  ingreso_bruto:       number;
  total_referencias:   number;
  monto_subsidios:     number;
  pct_subsidios:       number;
  tramites_rpp:        number;
  tramites_subsidiados: number;
  pct_conciliado:      number;
  monto_no_conciliado: number;
  alerta_conciliacion: boolean;
  conciliacion:        ConciliacionResumenSatq;
  comparativo_anio_anterior: ComparativoAnioAnteriorSatq;
  top_conceptos:       ConceptoResumenSatq[];
  por_municipio:       MunicipioResumenSatq[];
  por_delegacion:      DelegacionResumenSatq[];
  por_programa:        DesgloseCategoriaSatq[];
  por_tipo_acto:       DesgloseCategoriaSatq[];
}

// ── FRE (Folio Registral Electrónico) ───────────────────────────

export interface TipoFolioResumen {
  tipo_folio: string;
  cantidad:   number;
  pct:        number;
}

export interface OficinaFolioResumen {
  oficina:  string;
  cantidad: number;
  pct:      number;
}

export interface AnioFolioResumen {
  anio:     number;
  cantidad: number;
  por_tipo: Record<string, number>;
}

export interface CruceOficinaTipo {
  oficina:    string;
  tipo_folio: string;
  cantidad:   number;
}

export interface ComparativoAnioFolio {
  anio:          number;
  cantidad:      number;
  anio_anterior: number;
  cantidad_anio_anterior: number | null;
  pct_variacion: number | null;
}

export interface ResumenFre {
  filtros: {
    anio_desde: number | null;
    anio_hasta: number | null;
    tipo_folio: string | null;
    oficina:    string | null;
  };
  total_folios:      number;
  folios_sin_anio:   number;
  oficinas_activas:  number;
  comparativo_anio_anterior: ComparativoAnioFolio | null;
  por_tipo:      TipoFolioResumen[];
  por_oficina:   OficinaFolioResumen[];
  tendencia_anual: AnioFolioResumen[];
  cruce_oficina_tipo: CruceOficinaTipo[];
}

export interface FreDetalleFila {
  id:            number;
  fre:           string;
  tipo_folio:    string;
  oficina:       string;
  anio:          number | null;
  fecha:         string | null;
  razon_social:  string | null;
}

export interface FreDetalleResponse {
  data: FreDetalleFila[];
  meta: { total: number; page: number; limit: number };
}

// ── Universo de Actos Registrales (RPPC) ─────────────────────────

export interface TipoTramiteResumen {
  tipo_tramite: string;
  cantidad:     number;
  pct:          number;
}

export interface ActoResumen {
  acto:     string;
  des_acto: string;
  cantidad: number;
  pct:      number;
}

export interface OficinaActoResumen {
  oficina:  string;
  cantidad: number;
  pct:      number;
}

export interface EstatusActoResumen {
  estatus_acto: string;
  cantidad:     number;
  pct:          number;
}

export interface AnioActoResumen {
  anio:     number;
  cantidad: number;
  por_tipo: Record<string, number>;
}

export interface ComparativoAnioActo {
  anio:          number;
  cantidad:      number;
  anio_anterior: number;
  cantidad_anio_anterior: number | null;
  pct_variacion: number | null;
}

export interface ResumenActos {
  filtros: {
    anio_desde:   number | null;
    anio_hasta:   number | null;
    mes_desde:    number | null;
    mes_hasta:    number | null;
    tipo_tramite: string | null;
    acto:         string | null;
    oficina:      string | null;
    estatus_acto: string | null;
  };
  total_actos:  number;
  actos_acervo: number;
  pct_acervo:   number;
  oficinas_activas: number;
  comparativo_anio_anterior: ComparativoAnioActo | null;
  por_tipo:     TipoTramiteResumen[];
  top_actos:    ActoResumen[];
  por_oficina:  OficinaActoResumen[];
  por_estatus:  EstatusActoResumen[];
  tendencia_anual: AnioActoResumen[];
}

export interface ActoCatalogoFila {
  acto:         string;
  des_acto:     string;
  tipo_tramite: string;
  cantidad:     number;
}

export interface ActoDetalleFila {
  id:             number;
  id_origen:      number | null;
  acto:           string;
  des_acto:       string;
  tipo_tramite:   string;
  fecha_registro: string | null;
  anio:           number | null;
  es_acervo:      boolean;
  oficina:        string;
  fre:            string | null;
  estatus_acto:   string | null;
}

export interface ActoDetalleResponse {
  data: ActoDetalleFila[];
  meta: { total: number; page: number; limit: number };
}

// ── Productividad por Delegación ─────────────────────────────────

export interface ProductividadDelegacionResumen {
  delegacion:              string;
  ingresados:              number;
  terminados:              number;
  firmadas:                number;
  rechazadas:              number;
  dias_atencion_promedio:  number | null;
  pendiente_total:         number;
}

export interface ResumenProductividad {
  filtros: {
    delegacion: string | null;
    desde:      string | null;
    hasta:      string | null;
    categoria:  'certificacion' | 'inscripcion' | null;
  };
  data: ProductividadDelegacionResumen[];
}

export interface ProductividadMensualFila {
  anio:     number;
  mes:      number;
  cantidad: number;
}

export interface DistribucionFila {
  etiqueta: string;
  cantidad: number;
}

export interface BandejaResumen {
  total:      number;
  por_mes:    ProductividadMensualFila[];
  por_etapa:  DistribucionFila[];
  por_tipo:   DistribucionFila[];
  por_origen: DistribucionFila[];
}

export interface TerminadosResumen {
  total:                   number;
  dias_atencion_promedio:  number | null;
  por_mes:                 ProductividadMensualFila[];
  por_estatus:             DistribucionFila[];
  por_origen:              DistribucionFila[];
  por_tipo_solicitud:      DistribucionFila[];
}

export interface ProductividadDetalleFila {
  id:                 number;
  nci:                string;
  fecha_ingreso:      string;
  fecha_firma?:       string | null;
  delegacion:         string;
  acto?:              string | null;
  des_acto?:          string | null;
  etapa?:             string | null;
  estatus?:           string | null;
  estatus_solicitud?: string | null;
  dias_en_bandeja?:   number | null;
  dias_atencion?:     number | null;
  origen?:            string | null;
  notario?:           string | null;
  no_notaria?:        string | null;
  solicitante?:       string | null;
  folio?:             string | null;
  fre?:               string | null;
  oficialia?:         string | null;
  asignado_a?:        string | null;
}

export interface ProductividadDetalleResponse {
  data: ProductividadDetalleFila[];
  meta: { total: number; page: number; limit: number };
}

export interface RezagoBucket {
  bucket:        string;
  certificacion: number;
  inscripcion:   number;
  total:         number;
}

export interface AvanceRezago {
  mismo_mes:               number;
  de_rezago:               number;
  mismo_mes_pct:           number;
  de_rezago_pct:           number;
  mismo_mes_certificacion: number;
  mismo_mes_inscripcion:   number;
  de_rezago_certificacion: number;
  de_rezago_inscripcion:   number;
}

export interface RezagoResumen {
  antiguedad: RezagoBucket[];
  avance:     AvanceRezago;
}

// ── Programas Sociales ───────────────────────────────────────────

export interface ProgramaCatalogoFila {
  programa:   string;
  tramites:   number;
  pendientes: number;
  recaudado:  number;
}

export interface ProgramaResumenFila {
  programa:                string;
  ingresados:              number;
  terminados:              number;
  firmadas:                number;
  rechazadas:              number;
  dias_atencion_promedio:  number | null;
  pendiente_total:         number;
  recaudado:               number;
  subsidio:                number;
  pct_conciliado:          number;
}

export interface ResumenProgramasSociales {
  filtros: {
    programa:   string | null;
    delegacion: string | null;
    desde:      string | null;
    hasta:      string | null;
    categoria:  'certificacion' | 'inscripcion' | null;
  };
  data: ProgramaResumenFila[];
}

export interface BandejaProgramaResumen {
  total:      number;
  por_mes:    ProductividadMensualFila[];
  por_etapa:  DistribucionFila[];
  por_tipo:   DistribucionFila[];
  por_origen: DistribucionFila[];
}

export interface TerminadosProgramaResumen {
  total:                   number;
  dias_atencion_promedio:  number | null;
  por_mes:                 ProductividadMensualFila[];
  por_estatus:             DistribucionFila[];
  por_origen:              DistribucionFila[];
  por_tipo_solicitud:      DistribucionFila[];
}

export interface SerieMensualMontoFila { anio: number; mes: number; monto: number }
export interface DistribucionMontoFila { etiqueta: string; cantidad: number; monto: number }

export interface DineroProgramaResumen {
  total_lineas:              number;
  recaudado:                 number;
  subsidio:                  number;
  pct_conciliado:            number;
  por_mes:                   SerieMensualMontoFila[];
  por_estatus_conciliacion:  DistribucionMontoFila[];
}

export interface RezagoProgramaResumen {
  antiguedad: RezagoBucket[];
  avance:     AvanceRezago;
}

export interface ProgramasDetalleFila {
  id:                     number;
  nci?:                   string;
  fecha_ingreso?:         string;
  fecha_firma?:           string | null;
  delegacion?:            string | null;
  acto?:                  string | null;
  des_acto?:              string | null;
  etapa?:                 string | null;
  estatus?:               string | null;
  estatus_solicitud?:     string | null;
  dias_en_bandeja?:       number | null;
  dias_atencion?:         number | null;
  origen?:                string | null;
  notario?:               string | null;
  no_notaria?:            string | null;
  solicitante?:           string | null;
  folio?:                 string | null;
  fre?:                   string | null;
  oficialia?:             string | null;
  asignado_a?:            string | null;
  referencia?:            string;
  no_operacion?:          string;
  fecha_contable?:        string;
  municipio?:             string;
  concepto?:              string;
  importe?:               number;
  es_subsidio?:           boolean;
  estatus_conciliacion?:  string;
}

export interface ProgramasDetalleResponse {
  data: ProgramasDetalleFila[];
  meta: { total: number; page: number; limit: number };
}

// ── Carga de Datos (Reportes) ───────────────────────────────────

export interface ResumenCargaSatq {
  dry_run:            boolean;
  filas_total:        number;
  filas_nuevas:        number;
  filas_actualizadas:  number;
  filas_sin_cambio:    number;
  fecha_desde:         string | null;
  fecha_hasta:         string | null;
  hojas_procesadas:    string[];
  hojas_omitidas:      string[];
}

export interface MesEstimacion {
  mes:             number;
  estimado:        number | null;
  reportado_excel: number | null;
}

export interface CargaDatosLogFila {
  id:                 number;
  tipo:               string;
  usuario_id:         number | null;
  usuario_nombre?:    string | null;
  archivo_nombre:     string | null;
  filas_nuevas:       number | null;
  filas_actualizadas: number | null;
  filas_total:        number | null;
  fecha_desde:        string | null;
  fecha_hasta:        string | null;
  estado:             string;
  detalle:            string | null;
  creado_en:          string;
}

export interface IntegracionSiqrooConfig {
  api_base_url:          string | null;
  api_key_ultimos4:      string | null;
  api_key_configurada:   boolean;
  activo:                boolean;
  ultima_sincronizacion: string | null;
  ultimo_estado:         string | null;
  ultimo_detalle:        string | null;
}

// ── Máquinas ─────────────────────────────────────────────────────

export interface Maquina {
  id_maquina:     number;
  numero_maquina: string;
  oficina:        string;
  libre:          boolean;
  fecha_registro: string;
}

/** Alta y edición usan el mismo payload — la edición reemplaza el recurso completo. */
export interface MaquinaPayload {
  numero_maquina: string;
  oficina:        string;
  libre:          boolean;
}

// ── Consulta Pública SIQROO ────────────────────────────────────────

/**
 * Una fila del histórico de búsquedas — migrado desde SID (`consulta_publica`).
 * Esquema limpio: sin `nombres`/`apellido` (redundantes con `nombre_completo`),
 * sin `usuario`/`tramite` (redundantes con `tipo_usuario`) ni `fecha_registro`
 * (duplicado de `hora_busqueda` con desfase de huso horario) — ver
 * consultas.types.ts en el backend para el detalle verificado contra la BD real.
 */
export interface Consulta {
  id:              number;
  /** Id del registro en SID, cuando esta fila vino de la migración de datos. `null` si nació en PRISMA. */
  origen_id:       number | null;
  nombre_completo: string;
  codigo_acceso:   string;
  busqueda:        Record<string, string | number | boolean | null>;
  filtro_busqueda: string | null;
  tipo_usuario:    string | null;
  /** Código de oficina — texto, igual que la columna real (no es un id numérico). */
  oficina:         string | null;
  folio:           string | null;
  estado_contador: string | null;
  hora_busqueda:   string;
}

export interface ConsultasMeta {
  current_page: number;
  per_page:     number;
  total:        number;
  last_page:    number;
  from:         number | null;
  to:           number | null;
}

export interface ConsultasResponse {
  data: Consulta[];
  meta: ConsultasMeta;
}

// ── Catálogo de Vigilancia y Alertas ─────────────────────────────

export type TipoSujetoVigilado = 'PERSONA' | 'EMPRESA';

export interface SujetoVigilado {
  id:                  number;
  nombre_razon_social: string;
  nombre_normalizado:  string;
  tipo:                TipoSujetoVigilado;
  activo:              boolean;
  creado_por:          number;
  fecha_creacion:      string;
}

export interface CrearSujetoVigiladoPayload {
  nombre_razon_social: string;
  tipo:                TipoSujetoVigilado;
}

export interface EditarSujetoVigiladoPayload {
  nombre_razon_social?: string;
  tipo?:                TipoSujetoVigilado;
}

export interface AlertaConsultaConDetalle {
  id:                         number;
  consulta_id:                number;
  sujeto_vigilado_id:         number;
  coincidencia_detectada:     string;
  fecha_alerta:               string;
  leido:                      boolean;
  sujeto_nombre_razon_social: string;
  sujeto_tipo:                TipoSujetoVigilado;
  consulta_nombre_completo:   string;
  consulta_codigo_acceso:     string;
  consulta_hora_busqueda:     string;
}

export interface AlertasConsultaResponse {
  data: AlertaConsultaConDetalle[];
  meta: ConsultasMeta;
}
