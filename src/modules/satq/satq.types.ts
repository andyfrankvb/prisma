/**
 * Types: SATQ — reportes de ingresos y conciliación con RPP
 * File: src/modules/satq/satq.types.ts
 */

export interface ConceptoResumen {
  id_concepto: number | null;
  concepto:    string;
  monto:       number;
  cantidad:    number;
}

export interface MunicipioResumen {
  municipio: string;
  monto:     number;
  cantidad:  number;
  /** neto del mismo rango de fechas, un año antes. null si ese año no tiene datos de SATQ. */
  monto_anio_anterior: number | null;
  pct_variacion_anio_anterior: number | null;
}

/**
 * Ingreso por delegación de RPP (Benito Juárez, Playa del Carmen, Cozumel,
 * Othón P. Blanco). A diferencia de `municipio` (propio de SATQ, siempre
 * presente), la delegación viene del cruce con RPP vía `referencia` — solo
 * se conoce para filas conciliadas o en trámite en RPP; `Sin delegación
 * (no en RPP)` agrupa lo que aún no tiene ese dato.
 */
export interface DelegacionResumen {
  delegacion: string;
  monto:      number;
  cantidad:   number;
}

/**
 * Desglose de conciliación en 4 categorías (ver nota del módulo sobre
 * `estatus_conciliacion`). `conciliado` (booleano, KPI principal) exige
 * 'Conciliado' — un trámite "En trámite en RPP" ya existe en el sistema de
 * RPP pero aún no llegó a Entrega, así que NO cuenta como conciliado.
 */
export interface ConciliacionResumen {
  conciliado:          number;
  en_tramite_rpp:       number;
  cancelado_rpp:        number;
  no_ingresado_rpp:     number;
  pct_conciliado:       number;
  pct_en_tramite_rpp:   number;
  pct_cancelado_rpp:    number;
  pct_no_ingresado_rpp: number;
  /** monto en pesos por categoría — suman exacto el ingreso_total del periodo */
  monto_conciliado:       number;
  monto_en_tramite_rpp:    number;
  monto_cancelado_rpp:     number;
  monto_no_ingresado_rpp:  number;
}

export interface ComparativoAnioAnterior {
  periodo:       { desde: string; hasta: string };
  ingreso_total: number;
  /** null si el mismo periodo del año anterior no tiene datos (evita dividir entre 0) */
  pct_variacion: number | null;
}

/**
 * Desglose bruto/subsidio/neto — mismas cifras para programa y tipo de acto.
 * `tramites_rpp_cargo`/`tramites_rpp_subsidio`: cuántos trámites (dsnci)
 * distintos de RPP tienen una línea de captura que aparece del lado del
 * cargo / del subsidio de esta categoría (mismo criterio de existencia que
 * `conciliado` — no es una igualación exacta 1 a 1, ver nota del módulo).
 * Un mismo trámite puede contar en ambos si tuvo cargo y subsidio a la vez.
 */
export interface DesgloseCategoria {
  categoria:    string;
  cargo_bruto:  number;
  subsidio:     number;
  neto:         number;
  pct_subsidiado: number;
  cantidad:     number;
  tramites_rpp_cargo:    number;
  tramites_rpp_subsidio: number;
  /** neto del mismo rango de fechas, un año antes. null si ese año no tiene datos de SATQ. */
  neto_anio_anterior: number | null;
  pct_variacion_anio_anterior: number | null;
}

/**
 * Comparativo anual — cubre TODOS los años con datos, sin acotar por periodo.
 * `tiene_datos_satq` distingue "cero ingreso" de "SATQ no cargado ese año":
 * por ahora solo 2025-2026 tienen `satq_ingresos`; RPP (trámites) sí cubre
 * 2024 en adelante. Cuando se cargue histórico de SATQ 2024 esto se resuelve
 * solo, sin cambiar el endpoint.
 */
export interface ComparativoAnual {
  anio:              number;
  cargo_bruto:       number | null;
  subsidio:          number | null;
  ingreso_neto:      number | null;
  tiene_datos_satq:  boolean;
  rango_satq:        { desde: string; hasta: string } | null;
  tramites_rpp:      number;
  rango_rpp:         { desde: string; hasta: string } | null;
}

/** Un día del periodo: cuánto de lo registrado ese día no tiene match en RPP. */
export interface DiagnosticoDia {
  fecha:         string;
  total:         number;
  sin_match:     number;
  pct_sin_match: number;
}

/** Un concepto: qué tan seguido y por cuánto dinero no hace match, dentro del periodo. */
export interface DiagnosticoConcepto {
  id_concepto:      number | null;
  concepto:         string;
  total:            number;
  sin_match:        number;
  pct_sin_match:    number;
  monto_sin_match:  number;
}

export interface DiagnosticoConciliacion {
  periodo:      { desde: string; hasta: string };
  por_dia:      DiagnosticoDia[];
  por_concepto: DiagnosticoConcepto[];
}

/**
 * Un mes del año: estimación del depto. de Ingresos vs. lo reportado por RPP
 * (fuente: Excel "RPPC- Recaudación vs Estimación") vs. lo que ya tenemos
 * cargado en `satq_ingresos` para ese mes. `reportado_excel` y `recaudado_bd`
 * casi nunca coinciden exacto — vienen de cortes distintos; se muestran los
 * dos para que la brecha sea visible, no se oculta promediando ni eligiendo uno.
 */
export interface EstimacionMes {
  anio:     number;
  mes:      number;
  estimado: number;
  /** cifra del Excel de RPP para ese mes; null si el mes aún no se reportó */
  reportado_excel: number | null;
  /** SUM(importe) de nuestra satq_ingresos para ese mes; null si no hay datos cargados */
  recaudado_bd: number | null;
  /** recaudado_bd - estimado (la comparación real, con lo que sí tenemos evidencia en BD) */
  diferencia_bd_vs_estimado: number | null;
  pct_diferencia_bd_vs_estimado: number | null;
  /** true cuando diferencia_bd_vs_estimado < 0 — la BD recaudó menos de lo estimado */
  es_decremento: boolean;
  /** recaudado_bd - reportado_excel — la brecha de conciliación entre las dos fuentes */
  diferencia_bd_vs_excel: number | null;
  /** subsidios del mes (mismo criterio que monto_subsidios en /satq/resumen); null si no hay datos cargados */
  monto_subsidios: number | null;
  /** recaudado_bd + monto_subsidios — el trabajo real de RPP ese mes, cobrado o no. Sirve para ver si el
   *  decremento viene de menos trabajo o de más subsidio: si gran_total sí llega a la estimación pero
   *  recaudado_bd no, el "decremento" es de subsidios, no de trabajo real. */
  gran_total: number | null;
  diferencia_gran_total_vs_estimado: number | null;
  pct_diferencia_gran_total_vs_estimado: number | null;
}

/** Un escenario de cierre de año: si el resto de los meses recauda tal cual. */
export interface EscenarioAnual {
  proyeccion_restante: number;
  total_anual:         number;
  diferencia_vs_meta_anual: number;
  pct_vs_meta_anual:        number;
}

/**
 * Proyección de cierre de año a partir de los meses que ya tenemos y la
 * estimación de Ingresos. `pct_variacion_promedio` es el promedio simple del
 * % de diferencia (BD vs. estimado) de los meses ya transcurridos — se usa
 * para el escenario "tendencia actual". No es una predicción estadística
 * rigurosa, es una extrapolación simple y transparente en su método.
 */
export interface ProyeccionAnual {
  anio: number;
  meses_con_datos: number;
  meses_restantes: number;
  recaudado_acumulado: number;
  estimado_transcurrido: number;
  deficit_acumulado: number;
  pct_variacion_promedio: number;
  estimado_restante: number;
  estimado_total_anual: number;
  /** si los meses que faltan cumplen exacto su propia estimación (100%) */
  escenario_meta:      EscenarioAnual;
  /** si los meses que faltan repiten el % de variación promedio observado */
  escenario_tendencia: EscenarioAnual;
  /** cuánto tendría que superar (o le faltaría) su estimación el resto del año para cerrar el año exacto en la meta anual */
  monto_necesario_resto_anio: number;
  pct_necesario_sobre_estimado_restante: number;
}

export interface ResumenSatq {
  periodo: { desde: string; hasta: string };
  ingreso_total:      number;
  /**
   * "Gran total": ingreso_total + monto_subsidios — el valor completo del
   * trabajo que RPP realizó en el periodo, se haya cobrado o no. Los
   * trámites subsidiados sí representan trabajo real de RPP, solo que el
   * gobierno condonó el cobro; ingreso_total (neto) por sí solo esconde ese
   * volumen de trabajo.
   */
  ingreso_bruto:      number;
  total_referencias:  number;
  monto_subsidios:    number;
  pct_subsidios:      number;
  tramites_rpp:       number;
  /** de tramites_rpp, cuántos tienen alguna línea de captura del lado del subsidio */
  tramites_subsidiados: number;
  pct_conciliado:     number;
  monto_no_conciliado: number;
  /** true cuando pct_conciliado cae bajo el umbral de alerta (ver ALERTA_CONCILIACION_UMBRAL) */
  alerta_conciliacion: boolean;
  /** desglose de conciliación en 4 categorías (conciliado / en trámite RPP / cancelado RPP / no ha ingresado) */
  conciliacion:        ConciliacionResumen;
  comparativo_anio_anterior: ComparativoAnioAnterior;
  top_conceptos:      ConceptoResumen[];
  por_municipio:      MunicipioResumen[];
  por_delegacion:     DelegacionResumen[];
  por_programa:       DesgloseCategoria[];
  por_tipo_acto:      DesgloseCategoria[];
}
