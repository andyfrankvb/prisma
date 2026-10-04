/**
 * Service: Campañas de digitalización
 * File: src/modules/visor_documentos/services/campanias.service.ts
 *
 * El acervo registral se ha digitalizado varias veces y las campañas no se
 * reemplazan: se complementan. `visor_imagenes_foja.version` guarda de cuál
 * viene cada documento, y este catálogo le pone nombre y año.
 *
 * Antes la lista de versiones vivía escrita en el código —las tres campañas del
 * prototipo VISAR— y eso tenía una consecuencia que no se veía: la validación
 * rechazaba `V_SID` y `V_PEMR2025`, así que no se podía elegir ni dictaminar
 * ninguna campaña real. Con el catálogo en la base, agregar PEMR 2026 es un
 * renglón y no un despliegue.
 */
import { db } from '../../../db';

export interface VisorCampania {
  id:          number;
  clave:       string;
  nombre:      string;
  anio:        number | null;
  descripcion: string | null;
  orden:       number;
  activo:      boolean;
}

/** De la más antigua a la más reciente, que es como se muestran y se eligen. */
export async function listarCampanias(): Promise<VisorCampania[]> {
  return db('visor_campanias')
    .where({ activo: true })
    // `estado` es imprescindible en la pantalla: distingue una campaña sin
    // documentos para ese tomo de una cuyo acervo todavía no se carga. Sin él,
    // las fichas de PEM 2023, PEM 2024 y PEMR 2026 se veían seleccionables y
    // filtrar por ellas dejaba la búsqueda en blanco sin explicar por qué.
    .select('id', 'clave', 'nombre', 'anio', 'descripcion', 'orden', 'estado', 'activo')
    .orderBy('orden', 'asc');
}

/** Si la clave corresponde a una campaña registrada y activa. */
export async function existeCampania(clave: unknown): Promise<boolean> {
  if (typeof clave !== 'string' || !clave.trim()) return false;
  const fila = await db('visor_campanias').where({ clave, activo: true }).first('id');
  return Boolean(fila);
}
