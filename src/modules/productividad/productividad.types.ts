/**
 * Types: Productividad por Delegación (RPPC)
 * File: src/modules/productividad/productividad.types.ts
 */

export interface ProductividadDelegacionResumen {
  delegacion:               string;
  ingresados:                number;
  terminados:                number;
  firmadas:                  number;
  rechazadas:                number;
  dias_atencion_promedio:    number | null;
  pendiente_total:           number;
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
  total:                    number;
  dias_atencion_promedio:   number | null;
  por_mes:                  ProductividadMensualFila[];
  por_estatus:              DistribucionFila[];
  por_origen:                DistribucionFila[];
  por_tipo_solicitud:        DistribucionFila[];
}

/**
 * Una fila del detalle ("la lupa"). Los campos varían según `fuente`
 * (ingresos / bandeja / terminados) — todos opcionales salvo los comunes a
 * las 3 tablas, para no repetir 3 interfaces casi idénticas.
 */
export interface ProductividadDetalleFila {
  id:                 number;
  nci:                string;
  fecha_ingreso:       string;
  fecha_firma?:        string | null;
  delegacion:          string;
  acto?:               string | null;
  des_acto?:           string | null;
  etapa?:              string | null;
  estatus?:            string | null;
  estatus_solicitud?:  string | null;
  dias_en_bandeja?:    number | null;
  dias_atencion?:      number | null;
  origen?:             string | null;
  notario?:            string | null;
  no_notaria?:         string | null;
  solicitante?:        string | null;
  folio?:              string | null;
  fre?:                string | null;
  oficialia?:          string | null;
  asignado_a?:         string | null;
}

export interface ProductividadDetalleResponse {
  data: ProductividadDetalleFila[];
  meta: { total: number; page: number; limit: number };
}

/** Antigüedad del pendiente ahora, dividido en certificación/inscripción. */
export interface RezagoBucket {
  bucket:         string;   // '0-3 meses' | '3-6 meses' | '6-12 meses' | 'Más de 1 año'
  certificacion:  number;
  inscripcion:    number;
  total:          number;
}

/** De lo terminado en el periodo filtrado: cuánto era del mismo mes en que entró vs. rezago viejo. */
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

export interface RezagoResumen {
  antiguedad: RezagoBucket[];
  avance:     AvanceRezago;
}
