/**
 * Service: Dictamen de versión (curaduría jurídica)
 * File: src/modules/visor_documentos/services/dictamen.service.ts
 *
 * Puerto de fojas-dictamen.service.ts (VISAR): upsert por `foja_id` — a lo
 * sumo un dictamen vigente por foja (la tabla lo garantiza con UNIQUE).
 */
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import type { VisorDictamenVersion, CrearDictamenPayload } from '../visor.types';

export async function obtenerDictamen(fojaId: number): Promise<VisorDictamenVersion | null> {
  const dictamen = await db('visor_dictamenes_versiones_foja').where({ foja_id: fojaId }).first();
  return dictamen ?? null;
}

export async function guardarDictamen(
  fojaId: number,
  payload: CrearDictamenPayload,
  usuarioId: number,
): Promise<VisorDictamenVersion> {
  const foja = await db('visor_fojas').where({ id: fojaId }).first();
  if (!foja) throw new AppError('Foja no encontrada', 404);

  const imagenVersion = await db('visor_imagenes_foja')
    .where({ foja_id: fojaId, version: payload.version_seleccionada })
    .first();
  if (!imagenVersion) {
    throw new AppError(`La foja no tiene una imagen cargada para la versión ${payload.version_seleccionada}`, 422);
  }

  const [dictamen] = await db('visor_dictamenes_versiones_foja')
    .insert({
      foja_id:                fojaId,
      version_seleccionada:   payload.version_seleccionada,
      justificacion_juridica: payload.justificacion_juridica,
      usuario_id:             usuarioId,
      fecha_dictamen:         new Date(),
    })
    .onConflict('foja_id')
    .merge({
      version_seleccionada:   payload.version_seleccionada,
      justificacion_juridica: payload.justificacion_juridica,
      usuario_id:             usuarioId,
      fecha_dictamen:         new Date(),
    })
    .returning('*');

  return dictamen;
}
