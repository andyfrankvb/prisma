/**
 * Types: Programas Sociales (INFONAVIT/FOVISSSTE, INSUS, AGEPROO, SEDETUS...)
 * File: src/modules/programas-sociales/programas-sociales.types.ts
 */

export interface FiltrosProgramasSociales {
  programa:   string | null;
  delegacion: string | null;
  desde:      string | null;
  hasta:      string | null;
  categoria:  'certificacion' | 'inscripcion' | null;
}

/** Catálogo de programas para el selector — un renglón por programa, sin filtrar por periodo. */
export interface ProgramaCatalogoFila {
  programa:   string;
  tramites:   number;
  pendientes: number;
  recaudado:  number;
}

/**
 * Un renglón por programa (o uno solo si `programa` viene en el filtro) — lado
 * productividad (RPP) + lado dinero (SATQ), unidos por el puente `programa_nci`.
 */
export interface ProgramaResumenFila {
  programa:                string;
  ingresados:               number;
  terminados:               number;
  firmadas:                 number;
  rechazadas:               number;
  dias_atencion_promedio:   number | null;
  pendiente_total:          number;
  /** neto (cargo - reversiones), filtrado por fecha_contable en el periodo — no por fecha_ingreso/fecha_firma. */
  recaudado:                number;
  subsidio:                 number;
  pct_conciliado:           number;
}

export interface ResumenProgramasSociales {
  filtros: FiltrosProgramasSociales;
  data:    ProgramaResumenFila[];
}

export interface SerieMensualFila { anio: number; mes: number; cantidad: number }
export interface DistribucionFila { etiqueta: string; cantidad: number }

export interface BandejaProgramaResumen {
  total:      number;
  por_mes:    SerieMensualFila[];
  por_etapa:  DistribucionFila[];
  por_tipo:   DistribucionFila[];
  por_origen: DistribucionFila[];
}

export interface TerminadosProgramaResumen {
  total:                   number;
  dias_atencion_promedio:  number | null;
  por_mes:                 SerieMensualFila[];
  por_estatus:              DistribucionFila[];
  por_origen:                DistribucionFila[];
  por_tipo_solicitud:        DistribucionFila[];
}

export interface SerieMensualMontoFila { anio: number; mes: number; monto: number }
export interface DistribucionMontoFila { etiqueta: string; cantidad: number; monto: number }

/** Lado dinero (SATQ), agrupado por estatus de conciliación con RPP — mismo criterio que el reporte de Conciliación. */
export interface DineroProgramaResumen {
  total_lineas:              number;
  recaudado:                 number;
  subsidio:                  number;
  pct_conciliado:            number;
  por_mes:                   SerieMensualMontoFila[];
  por_estatus_conciliacion:  DistribucionMontoFila[];
}

export interface RezagoBucket {
  bucket:         string;
  certificacion:  number;
  inscripcion:    number;
  total:          number;
}

export interface AvanceRezago {
  mismo_mes:                number;
  de_rezago:                number;
  mismo_mes_pct:            number;
  de_rezago_pct:            number;
  mismo_mes_certificacion:  number;
  mismo_mes_inscripcion:    number;
  de_rezago_certificacion:  number;
  de_rezago_inscripcion:    number;
}

export interface RezagoProgramaResumen {
  antiguedad: RezagoBucket[];
  avance:     AvanceRezago;
}

/**
 * Una fila del detalle ("la lupa"). Los campos varían según `fuente`
 * (ingresos / bandeja / terminados / dinero) — todos opcionales salvo los
 * comunes, para no repetir 4 interfaces casi idénticas.
 */
export interface ProgramasDetalleFila {
  id:                   number;
  nci?:                 string;
  fecha_ingreso?:       string;
  fecha_firma?:         string | null;
  delegacion?:          string | null;
  acto?:                string | null;
  des_acto?:            string | null;
  etapa?:               string | null;
  estatus?:             string | null;
  estatus_solicitud?:   string | null;
  dias_en_bandeja?:     number | null;
  dias_atencion?:       number | null;
  origen?:              string | null;
  notario?:             string | null;
  no_notaria?:          string | null;
  solicitante?:         string | null;
  folio?:               string | null;
  fre?:                 string | null;
  oficialia?:           string | null;
  asignado_a?:          string | null;
  // fuente = 'dinero'
  referencia?:          string;
  no_operacion?:        string;
  fecha_contable?:      string;
  municipio?:           string;
  concepto?:            string;
  importe?:             number;
  es_subsidio?:         boolean;
  estatus_conciliacion?: string;
}

export interface ProgramasDetalleResponse {
  data: ProgramasDetalleFila[];
  meta: { total: number; page: number; limit: number };
}
