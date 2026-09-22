/**
 * Service: Catálogos del Visor (delegaciones/secciones)
 * File: src/modules/visor_documentos/services/catalogo.service.ts
 */
import { db } from '../../../db';
import type { VisorDelegacion, VisorSeccion } from '../visor.types';

export async function listarDelegaciones(): Promise<VisorDelegacion[]> {
  return db('visor_delegaciones').where({ activo: true }).orderBy('nombre', 'asc');
}

export async function listarSecciones(): Promise<VisorSeccion[]> {
  return db('visor_secciones').orderBy('numero', 'asc');
}
