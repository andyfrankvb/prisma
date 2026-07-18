/**
 * Service: Configuración de Flujos por Módulo
 * File: src/services/flujo-config.service.ts
 *
 * Provee acceso a la configuración de actores de flujo con caché en memoria TTL 60s.
 */

import { db } from '../db';
import { AppError } from '../utils/AppError';

// ── Reglas de compatibilidad por módulo/rol ───────────────────

export const COMPATIBILITY_RULES = {
  tramites_seguimiento: {
    REVISOR: {
      rolSistema:  'DIRECTOR' as const,
      unidadTipo:  'DIRECCION' as const,
      descripcion: 'Director de área (no Dirección General ni Delegación)',
    },
    FINALIZADOR: {
      rolSistema:  'OPERATIVO' as const,
      descripcion: 'Usuario operativo',
    },
  },
  supervision_eventos: {
    DIRECTORA_GENERAL: {
      rolSistema:  'DIRECTOR' as const,
      unidadTipo:  'DIRECCION_GENERAL' as const,
      descripcion: 'Director de la Dirección General',
    },
  },
  oficialia_partes: {
    ENCARGADO: {
      rolSistema:  'ENCARGADO' as const,
      descripcion: 'Usuario con rol Encargado',
    },
    SECRETARIA: {
      rolSistema:  'SECRETARIA' as const,
      descripcion: 'Usuario con rol Secretaria',
    },
    OFICIAL: {
      rolSistema:  'OFICIAL' as const,
      descripcion: 'Usuario con rol Oficial de Partes',
    },
    JURIDICO: {
      rolSistema:  'JURIDICO' as const,
      descripcion: 'Abogado — múltiples por delegación',
    },
  },
} as const;

// ── Caché en memoria TTL 60s ──────────────────────────────────

const cache = new Map<string, { userId: number; expiresAt: number }>();
const TTL = 60_000;

// ── getActorFlujo ─────────────────────────────────────────────

/**
 * Devuelve el usuario_id configurado para el par (moduloClave, rolFlujo).
 * Usa caché en memoria con TTL de 60 segundos.
 * Lanza AppError 500 si no hay configuración.
 */
export async function getActorFlujo(moduloClave: string, rolFlujo: string): Promise<number> {
  const key = `${moduloClave}:${rolFlujo}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.userId;

  const row = await db('configuracion_flujos')
    .where({ modulo_clave: moduloClave, rol_flujo: rolFlujo })
    .select('usuario_id')
    .first();

  if (!row) {
    throw new AppError(
      `Configuración de flujo incompleta: no se encontró actor para '${moduloClave}/${rolFlujo}'`,
      500,
    );
  }

  cache.set(key, { userId: row.usuario_id, expiresAt: Date.now() + TTL });
  return row.usuario_id;
}

// ── invalidateActorFlujoCache ─────────────────────────────────

/**
 * Elimina la entrada de caché para el par (moduloClave, rolFlujo).
 * Llamar tras actualizar la configuración para que el nuevo valor sea inmediato.
 */
export function invalidateActorFlujoCache(moduloClave: string, rolFlujo: string): void {
  cache.delete(`${moduloClave}:${rolFlujo}`);
}

// ── isCompatible ──────────────────────────────────────────────

/**
 * Verifica si un usuario cumple la regla de compatibilidad para un rol de flujo.
 */
export function isCompatible(
  usuario: { rol: string; unidad_tipo?: string },
  moduloClave: string,
  rolFlujo: string,
): boolean {
  const rules = (COMPATIBILITY_RULES as any)[moduloClave]?.[rolFlujo];
  if (!rules) return false;
  if (usuario.rol !== rules.rolSistema) return false;
  if (rules.unidadTipo && usuario.unidad_tipo !== rules.unidadTipo) return false;
  return true;
}

// ── getRolesConfigurables ─────────────────────────────────────

/**
 * Devuelve los roles configurables para un módulo según COMPATIBILITY_RULES.
 */
export function getRolesConfigurables(moduloClave: string): string[] {
  return Object.keys((COMPATIBILITY_RULES as any)[moduloClave] ?? {});
}
