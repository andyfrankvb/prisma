/**
 * Formatter: Folio de salida
 * File: src/modules/oficialia_partes/folios_salida/folio-salida.formatter.ts
 *
 * Plantillas heredadas del módulo de Folios de SID (FolioController::generarFolioPorRol),
 * confirmadas vigentes para producción. Puro: no toca la base de datos — recibe
 * los datos ya resueltos y arma el texto. La cabeza de sector y la dependencia
 * son fijas porque PRISMA es, para este módulo, la misma dependencia que SID
 * (SEGOB/DGRPPC): a diferencia de SID, no administra varias dependencias.
 *
 * El abreviado de oficina/unidad YA NO es un mapa fijo en código (ese era el
 * problema que arrastraba SID: una oficina nueva exigía tocar el fuente). Se
 * recibe como parámetro — sale de `catalogo_unidades.codigo_folio`, la misma
 * columna que ya usa `oficios.controller.ts` para el folio de entrada
 * (ver 2026-09-10_codigo_folio_por_unidad.sql).
 */
import type { RolFormatoFolio } from './folio-salida.types';

export const CABEZA_SECTOR = 'SEGOB';
export const DEPENDENCIA   = 'DGRPPC';

const MESES_ROMANO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Mes actual en números romanos, como lo pintan los folios (I..XII). */
export function mesRomanoActual(fecha: Date = new Date()): string {
  return MESES_ROMANO[fecha.getMonth() + 1];
}

export interface DatosFormatoFolio {
  consecutivo:    number;
  anio:           number;
  mesRomano:      string;
  /** catalogo_unidades.codigo_folio de la unidad "Dirección Jurídica". Requerido para DIRECTOR_JURIDICO. */
  codigoUnidad?:  string;
}

/**
 * Arma el texto del folio según la plantilla del rol.
 *
 *   JURIDICO:           SEGOB/DGRPPC/{consecutivo4}/{mes}/{año}
 *   DIRECTOR_JURIDICO:  SEGOB/DGRPPC/{codigoUnidad}/DJ/{consecutivo4}/{mes}/{año}
 *
 * Los demás roles que SID sabía formatear (RRHH, Delegación, Administrador) no
 * tienen todavía un flujo equivalente en Oficialía de Partes — quedan fuera de
 * este formateador a propósito, y no se generan folios nuevos con ellos.
 */
export function formatearFolioSalida(
  rol: Extract<RolFormatoFolio, 'JURIDICO' | 'DIRECTOR_JURIDICO'>,
  datos: DatosFormatoFolio,
): string {
  const consecutivo = String(datos.consecutivo).padStart(4, '0');

  switch (rol) {
    case 'JURIDICO':
      return `${CABEZA_SECTOR}/${DEPENDENCIA}/${consecutivo}/${datos.mesRomano}/${datos.anio}`;

    case 'DIRECTOR_JURIDICO': {
      if (!datos.codigoUnidad) {
        throw new Error('codigoUnidad es requerido para el formato DIRECTOR_JURIDICO');
      }
      return `${CABEZA_SECTOR}/${DEPENDENCIA}/${datos.codigoUnidad}/DJ/${consecutivo}/${datos.mesRomano}/${datos.anio}`;
    }

    default: {
      const _exhaustivo: never = rol;
      throw new Error(`Rol de formato no soportado: ${_exhaustivo}`);
    }
  }
}
