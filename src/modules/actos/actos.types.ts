/**
 * Types: Universo de Actos Registrales (RPPC)
 * File: src/modules/actos/actos.types.ts
 */

export interface TipoTramiteResumen {
  tipo_tramite: string;
  cantidad:     number;
  pct:          number;
}

export interface ActoResumen {
  acto:      string;
  des_acto:  string;
  cantidad:  number;
  pct:       number;
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

/** Un año de la tendencia (solo 2004+, ver nota de "acervo" en la migración) — cantidad total y desglose por tipo de trámite. */
export interface AnioActoResumen {
  anio:     number;
  cantidad: number;
  por_tipo: Record<string, number>;
}

/** Comparativo del año más reciente disponible (sin filtrar por rango) contra el año inmediato anterior. */
export interface ComparativoAnioActo {
  anio:          number;
  cantidad:      number;
  anio_anterior: number;
  cantidad_anio_anterior: number | null;
  pct_variacion: number | null;
}

export interface ResumenActos {
  filtros: {
    anio_desde:   number  | null;
    anio_hasta:   number  | null;
    tipo_tramite: string  | null;
    acto:         string  | null;
    oficina:      string  | null;
    estatus_acto: string  | null;
  };
  total_actos:  number;
  /** Actos con año < 2004 o sin fecha confiable — trámites históricos migrados poco a poco, no basura. Se excluyen de la tendencia anual. */
  actos_acervo: number;
  pct_acervo:   number;
  oficinas_activas: number;
  comparativo_anio_anterior: ComparativoAnioActo | null;
  por_tipo:     TipoTramiteResumen[];
  /** Top N actos por volumen — el catálogo completo (93 códigos) vive en GET /actos/catalogo. */
  top_actos:    ActoResumen[];
  por_oficina:  OficinaActoResumen[];
  por_estatus:  EstatusActoResumen[];
  tendencia_anual: AnioActoResumen[];
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
