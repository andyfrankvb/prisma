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

export async function listarImagenesDeFoja(fojaId: number): Promise<VisorImagenFoja[]> {
  return db('visor_imagenes_foja').where({ foja_id: fojaId }).orderBy('version', 'asc');
}
