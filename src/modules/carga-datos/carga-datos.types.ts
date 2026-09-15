/**
 * Types: Carga de Datos (Reportes) — SATQ, estimación SEFIPLAN, integración SIQROO
 * File: src/modules/carga-datos/carga-datos.types.ts
 */

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
