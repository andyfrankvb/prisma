export const CAMPOS_INMUEBLE = [
  'folio', 'propietario', 'clave_catastral', 'superficie_total', 'calle', 'colonia',
  'lote', 'manzana', 'colindancias', 'localidad', 'no_exterior', 'no_interior',
  'super_manzana', 'fraccionamiento', 'condominio', 'predio_conocido',
] as const;

export interface AcervoDelegacion {
  id: number;
  nombre: string;
  oficina: number;
  disponible?: boolean;
  rpp_disponible?: boolean;
}

export type TipoCoincidenciaAcervo = 'precisa' | 'aproximada';

export interface AcervoPaginacion {
  tipo_busqueda?: TipoCoincidenciaAcervo;
  pagina: number;
  tamano_pagina: number;
}

export const CAMPOS_ORDEN_ANTECEDENTE = [
  'folio', 'inscripcion', 'inscripcion_final', 'foja_inicial', 'foja_final',
] as const;
export type CampoOrdenAntecedente = typeof CAMPOS_ORDEN_ANTECEDENTE[number];
export const CAMPOS_ORDEN_INMUEBLE = [
  'folio', 'propietario', 'clave_catastral', 'superficie_total', 'calle', 'colonia',
  'lote', 'manzana', 'localidad',
] as const;
export type CampoOrdenInmueble = typeof CAMPOS_ORDEN_INMUEBLE[number];
export type CampoOrdenAcervo = CampoOrdenAntecedente | CampoOrdenInmueble;
export type DireccionOrden = 'asc' | 'desc';
export interface AcervoOrden {
  campo: CampoOrdenAcervo;
  direccion: DireccionOrden;
}

export interface AntecedenteFiltros extends AcervoPaginacion {
  delegacion_id: number;
  seccion?: number;
  tomo?: string;
  volumen?: string;
  inscripcion?: number | string;
  foja?: number;
  orden_por?: CampoOrdenAntecedente;
  orden_direccion?: DireccionOrden;
}

export interface InmuebleFiltros extends AcervoPaginacion {
  delegacion_id: number;
  orden_por?: CampoOrdenInmueble;
  orden_direccion?: DireccionOrden;
  folio?: string;
  propietario?: string;
  clave_catastral?: string;
  superficie_total?: string;
  calle?: string;
  colonia?: string;
  lote?: string;
  manzana?: string;
  colindancias?: string;
  localidad?: string;
  no_exterior?: string;
  no_interior?: string;
  super_manzana?: string;
  fraccionamiento?: string;
  condominio?: string;
  predio_conocido?: string;
}

export interface AntecedenteResultado extends Partial<DatosFoliosRpp> {
  antecedente_id: string;
  folio_id: string;
  folio: string;
  seccion: number | null;
  tomo: string | null;
  volumen: string | null;
  registro: number | string | null;
  registro_final: number | string | null;
  foja_inicial: number | null;
  foja_final: number | null;
  acto: string | null;
}

export type EstadoVinculoRpp = 'vinculado' | 'sin_coincidencia' | 'ambiguo' | 'parcial' | 'no_disponible';
export interface DatosFoliosRpp {
  folios_rpp: string[];
  rpp_estado: EstadoVinculoRpp;
}

export interface InmuebleResultado extends Partial<DatosFoliosRpp> {
  folio_id: string;
  folio: string;
  folio_gisnet?: string;
  propietarios: string[];
  clave_catastral: string | null;
  superficie_total: string | null;
  unidad_superficie?: string | null;
  calle: string | null;
  colonia: string | null;
  lote: string | null;
  manzana: string | null;
  colindancias: string | null;
  localidad: string | null;
  no_exterior: string | null;
  no_interior: string | null;
  super_manzana: string | null;
  fraccionamiento: string | null;
  condominio: string | null;
  predio_conocido: string | null;
}

export interface AcervoSugerencia<T> {
  resultado: T;
  campos_coincidentes: string[];
  campos_diferentes: string[];
}

export interface AcervoBusqueda<T> {
  tipo_busqueda?: TipoCoincidenciaAcervo;
  modo: 'demo' | 'copia_local' | 'servidor';
  delegacion: AcervoDelegacion;
  unidad_resultado: 'antecedentes' | 'folios';
  total_resultados: number;
  total_folios: number;
  pagina: number;
  tamano_pagina: number;
  paginas_totales: number;
  orden?: AcervoOrden;
  mensaje: string | null;
  advertencia_rpp?: string | null;
  resultados: T[];
  total_aproximados: number;
  limite_aproximados: number;
  aproximados: AcervoSugerencia<T>[];
}

export interface AcervoTitular {
  id: string;
  nombre: string;
  vigente: boolean | null;
}

export interface AcervoActo {
  id: string;
  acto: string;
  descripcion_acto: string | null;
  fecha_prelacion: string | null;
  fecha_registro: string | null;
  numero_prelacion: string | null;
  numero_consecutivo: number | null;
  estatus: string | null;
  estatus_movimiento: string | null;
  id_movimiento: string | null;
  antecedentes_ids: string[];
}

export interface AcervoFolioDetalle {
  modo: 'demo' | 'copia_local' | 'servidor';
  delegacion: AcervoDelegacion;
  inmueble: InmuebleResultado;
  titulares: AcervoTitular[];
  antecedentes: AntecedenteResultado[];
  actos: AcervoActo[];
  total_titulares: number;
  total_antecedentes: number;
  total_actos: number;
}

export type CampoAntecedente = 'seccion' | 'tomo' | 'volumen' | 'inscripcion' | 'foja';
export type CampoInmueble = typeof CAMPOS_INMUEBLE[number];
export type FormularioAntecedente = Record<CampoAntecedente, string>;
export type FormularioInmueble = Record<CampoInmueble, string>;
export type FilaAcervo = { folio_id: string; folio: string };
export type TipoBusqueda = 'antecedente' | 'inmueble';

export interface AcervoEstado {
  estado: 'ok';
  modo: 'demo' | 'copia_local' | 'servidor';
  base_de_datos: 'acervo_demo' | 'acervo_cozumel' | 'stage' | 'consultas_gisnet';
}
