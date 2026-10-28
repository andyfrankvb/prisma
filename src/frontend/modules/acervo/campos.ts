import type {
  CampoAntecedente, CampoInmueble, FormularioAntecedente, FormularioInmueble,
  AntecedenteFiltros, InmuebleFiltros, AcervoOrden, CampoOrdenAntecedente, CampoOrdenInmueble,
} from './types';
import { CAMPOS_INMUEBLE } from './types';

export interface CampoFormulario<K extends string> {
  nombre: K;
  etiqueta: string;
  maximo?: number;
  modo?: 'text' | 'numeric' | 'decimal';
  deshabilitado?: boolean;
  placeholder?: string;
}

export const CAMPOS_ANTECEDENTE: CampoFormulario<CampoAntecedente>[] = [
  { nombre: 'seccion', etiqueta: 'Sección', modo: 'numeric', maximo: 2 },
  { nombre: 'tomo', etiqueta: 'Tomo', maximo: 40 },
  { nombre: 'inscripcion', etiqueta: 'Inscripción', maximo: 20 },
  { nombre: 'volumen', etiqueta: 'Volumen', maximo: 80 },
  { nombre: 'foja', etiqueta: 'Foja inicial', modo: 'numeric', maximo: 10 },
];

export const CAMPOS_IDENTIFICACION: CampoFormulario<CampoInmueble>[] = [
  { nombre: 'folio', etiqueta: 'Folio' },
  { nombre: 'propietario', etiqueta: 'Propietario' },
  { nombre: 'clave_catastral', etiqueta: 'Clave catastral' },
  { nombre: 'superficie_total', etiqueta: 'Superficie total' },
];

export const CAMPOS_UBICACION: CampoFormulario<CampoInmueble>[] = [
  { nombre: 'calle', etiqueta: 'Calle' },
  { nombre: 'colonia', etiqueta: 'Colonia' },
  { nombre: 'localidad', etiqueta: 'Localidad' },
  { nombre: 'no_exterior', etiqueta: 'No. exterior' },
  { nombre: 'no_interior', etiqueta: 'No. interior' },
  { nombre: 'lote', etiqueta: 'Lote' },
  { nombre: 'manzana', etiqueta: 'Manzana' },
  { nombre: 'super_manzana', etiqueta: 'Super manzana' },
  { nombre: 'fraccionamiento', etiqueta: 'Fraccionamiento' },
  { nombre: 'condominio', etiqueta: 'Condominio' },
  { nombre: 'predio_conocido', etiqueta: 'Predio conocido' },
  { nombre: 'colindancias', etiqueta: 'Colindancias', maximo: 1000 },
];

export const ETIQUETAS: Record<string, string> = Object.fromEntries(
  [...CAMPOS_ANTECEDENTE, ...CAMPOS_IDENTIFICACION, ...CAMPOS_UBICACION]
    .map((campo) => [campo.nombre, campo.etiqueta]),
);

export const ANTECEDENTE_VACIO: FormularioAntecedente = {
  seccion: '', tomo: '', volumen: '', inscripcion: '', foja: '',
};

export const INMUEBLE_VACIO: FormularioInmueble = {
  folio: '', propietario: '', clave_catastral: '', superficie_total: '', calle: '',
  colonia: '', lote: '', manzana: '', colindancias: '', localidad: '', no_exterior: '',
  no_interior: '', super_manzana: '', fraccionamiento: '', condominio: '', predio_conocido: '',
};

function comprobarDatos(delegacion: number, valores: Record<string, string>): void {
  if (!Number.isInteger(delegacion) || delegacion < 1 || delegacion > 4) {
    throw new Error('Selecciona una delegación.');
  }
  if (!Object.values(valores).some((valor) => valor.trim())) {
    throw new Error('Ingresa al menos un dato para buscar.');
  }
}

function entero(valor: string, etiqueta: string, maximo: number): number | undefined {
  if (!valor.trim()) return undefined;
  const limpio = valor.trim();
  const numero = Number(limpio);
  if (!/^\d+$/.test(limpio) || !Number.isSafeInteger(numero) || numero < 1 || numero > maximo) {
    throw new Error(etiqueta + ' debe ser un número entero entre 1 y ' + maximo + '.');
  }
  return numero;
}

export function filtrosAntecedente(
  delegacion: number, valores: FormularioAntecedente, pagina: number,
  orden: AcervoOrden = { campo: 'folio', direccion: 'asc' },
  precision: 'precisa' | 'aproximada' = 'precisa',
): AntecedenteFiltros {
  comprobarDatos(delegacion, valores);
  const registro = valores.inscripcion.trim();
  if (registro && !/^\d+$/.test(registro) && !/^\d{1,8}[A-Za-z]$/.test(registro)) {
    throw new Error('Inscripción debe ser un número o un número seguido de una letra.');
  }
  return {
    delegacion_id: delegacion, pagina, tamano_pagina: 10,
    orden_por: orden.campo as CampoOrdenAntecedente, orden_direccion: orden.direccion, tipo_busqueda: precision,
    seccion: entero(valores.seccion, 'Sección', 9),
    inscripcion: /^\d+$/.test(registro)
      ? entero(registro, 'Inscripción', 2147483647) : registro.toUpperCase() || undefined,
    foja: entero(valores.foja, 'Foja inicial', 2147483647),
    tomo: valores.tomo.trim().toUpperCase() || undefined,
    volumen: valores.volumen.trim() || undefined,
  };
}

export function filtrosInmueble(delegacion: number, valores: FormularioInmueble, pagina: number,
  precision: 'precisa' | 'aproximada' = 'precisa',
  orden: AcervoOrden = { campo: 'folio', direccion: 'asc' }): InmuebleFiltros {
  comprobarDatos(delegacion, valores);
  const filtros: InmuebleFiltros = { delegacion_id: delegacion, pagina, tamano_pagina: 10, tipo_busqueda: precision,
    orden_por: orden.campo as CampoOrdenInmueble, orden_direccion: orden.direccion };
  for (const nombre of CAMPOS_INMUEBLE) {
    const valor = valores[nombre].trim();
    if (valor) filtros[nombre] = valor;
  }
  if (filtros.superficie_total && /^\d+([.,]\d+)?$/.test(filtros.superficie_total)) {
    filtros.superficie_total = filtros.superficie_total.replace(',', '.');
  }
  return filtros;
}

export function mostrarDato(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined || valor === '' ? '—' : String(valor);
}

export function mostrarSuperficie(valor: string | null, unidad: string | null = 'm²'): string {
  if (valor === null || valor === '') return '—';
  if (!/^\d+([.,]\d+)?$/.test(valor)) return valor;
  return valor.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',')
    + (unidad ? ' ' + unidad : '');
}

export function mostrarFecha(valor: string | null): string {
  if (!valor) return '—';
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return partes ? partes[3] + '/' + partes[2] + '/' + partes[1] : valor;
}

export function mostrarFoliosRpp(inmueble: { folios_rpp?: string[]; rpp_estado?: string }, compacto = false): string {
  const folios = inmueble.folios_rpp ?? [];
  if (inmueble.rpp_estado === 'no_disponible' || inmueble.rpp_estado === undefined) return 'No disponible';
  if (folios.length && (inmueble.rpp_estado === 'vinculado' || inmueble.rpp_estado === 'parcial')) return folios.join(' · ') + (inmueble.rpp_estado === 'parcial' ? (compacto ? ' · Por verificar' : ' · Hay otras coincidencias por verificar') : '');
  return inmueble.rpp_estado === 'ambiguo' ? (compacto ? 'Por verificar' : 'Coincidencias por verificar') : (compacto ? '—' : 'Sin correspondencia identificada');
}
