/**
 * Types: FRE — universo de Folios Registrales Electrónicos (SIQROO)
 * File: src/modules/fre/fre.types.ts
 */

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

/** Un año de la tendencia — cantidad total y desglose por tipo, para poder alternar la gráfica. */
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

/** Comparativo del año más reciente del rango filtrado contra el año inmediato anterior (sin filtrar por rango, para que la comparación no se corte si el rango empieza justo en ese año). */
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
  /** folios cuyo año no se pudo determinar de forma confiable (fecha inválida y sin año en el folio) — se excluyen de la tendencia anual */
  folios_sin_anio:   number;
  oficinas_activas:  number;
  comparativo_anio_anterior: ComparativoAnioFolio | null;
  por_tipo:      TipoFolioResumen[];
  por_oficina:   OficinaFolioResumen[];
  tendencia_anual: AnioFolioResumen[];
  cruce_oficina_tipo: CruceOficinaTipo[];
}
