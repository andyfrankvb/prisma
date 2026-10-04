/**
 * Service: Fojas del Visor de Documentos
 * File: src/modules/visor_documentos/services/fojas.service.ts
 */
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import type { VisorFoja, VisorImagenFoja } from '../visor.types';

export async function obtenerFoja(id: number): Promise<VisorFoja> {
  const foja = await db('visor_fojas').where({ id }).first();
  if (!foja) throw new AppError('Foja no encontrada', 404);
  return foja;
}

/**
 * Las versiones disponibles de una foja, cada una con el nombre de su campaña y
 * la calidad que reportó quien la digitalizó.
 *
 * Se ordena por `visor_campanias.orden` —de la más antigua a la más reciente— y
 * no alfabéticamente por `version`, que dejaba "PEMR 2025" antes que la primera
 * digitalización sin ninguna razón. El orden importa: a falta de dictamen
 * jurídico, lo último de la lista es lo más reciente.
 *
 * El LEFT JOIN es a propósito: una imagen con una versión que no esté en el
 * catálogo sigue apareciendo, sin nombre, en vez de desaparecer de la pantalla.
 */
export async function listarImagenesDeFoja(fojaId: number): Promise<VisorImagenFoja[]> {
  return db('visor_imagenes_foja as i')
    .leftJoin('visor_campanias as c', 'c.clave', 'i.version')
    .where('i.foja_id', fojaId)
    .select(
      'i.id', 'i.foja_id', 'i.version', 'i.ruta_storage', 'i.formato',
      'i.estatus', 'i.observaciones', 'i.created_at',
      'c.nombre as campania_nombre', 'c.anio as campania_anio',
    )
    .orderByRaw('c.orden NULLS FIRST, i.version');
}
