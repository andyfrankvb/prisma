/**
 * ModuleRegistry — Singleton
 * File: src/modules/module-registry/module.registry.ts
 *
 * Patrón extensible para el panel de supervisión del Director.
 * Cada módulo del sistema registra su función de métricas al
 * arrancar el servidor. El endpoint GET /director/supervision
 * llama a computeAll() para obtener el resumen de todos los
 * módulos activos sin necesidad de cambios en el frontend.
 *
 * Uso:
 *   // Al arrancar el servidor:
 *   moduleRegistry.register('mi_modulo', async () => ({
 *     activos: 5, pendientes: 2, alertas: 1,
 *   }));
 *
 *   // En el endpoint de supervisión:
 *   const resumenes = await moduleRegistry.computeAll();
 */

import { db } from '../../db';

// ── Interfaces públicas ───────────────────────────────────────

/** Función que calcula las métricas de un módulo */
export type ModuleMetricsFn = () => Promise<{
  activos:    number;
  pendientes: number;
  alertas:    number;
}>;

/** Resumen de estado de un módulo para el panel del Director */
export interface ResumenModulo {
  clave:      string;
  nombre:     string;
  orden:      number;
  activos:    number | null;
  pendientes: number | null;
  alertas:    number | null;
  error?:     string;
}

// ── Clase singleton ───────────────────────────────────────────

class ModuleRegistry {
  private static instance: ModuleRegistry;
  private registry = new Map<string, ModuleMetricsFn>();

  private constructor() {}

  static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry();
    }
    return ModuleRegistry.instance;
  }

  /**
   * Registra la función de métricas de un módulo.
   * Debe llamarse al arrancar el servidor, antes de que lleguen
   * peticiones al endpoint de supervisión.
   */
  register(clave: string, fn: ModuleMetricsFn): void {
    this.registry.set(clave, fn);
  }

  /**
   * Calcula las métricas de todos los módulos activos en la BD,
   * en el orden definido por el campo `orden`.
   *
   * Si la función de un módulo lanza un error, ese módulo se
   * incluye en el resultado con campos null y un campo `error`,
   * sin interrumpir el cálculo de los demás módulos.
   *
   * Si un módulo activo no tiene función registrada, se devuelven
   * ceros (no es un error — el módulo existe pero no tiene métricas).
   */
  async computeAll(): Promise<ResumenModulo[]> {
    const modulos: { clave: string; nombre: string; orden: number }[] =
      await db('modulos')
        .where({ activo: true })
        .select('clave', 'nombre_display as nombre', 'orden')
        .orderBy('orden', 'asc');

    return Promise.all(
      modulos.map(async (m) => {
        const fn = this.registry.get(m.clave);

        if (!fn) {
          return {
            clave:      m.clave,
            nombre:     m.nombre,
            orden:      m.orden,
            activos:    0,
            pendientes: 0,
            alertas:    0,
          };
        }

        try {
          const metrics = await fn();
          return {
            clave:      m.clave,
            nombre:     m.nombre,
            orden:      m.orden,
            activos:    metrics.activos,
            pendientes: metrics.pendientes,
            alertas:    metrics.alertas,
          };
        } catch (err: any) {
          return {
            clave:      m.clave,
            nombre:     m.nombre,
            orden:      m.orden,
            activos:    null,
            pendientes: null,
            alertas:    null,
            error:      err?.message ?? 'Error al calcular métricas',
          };
        }
      }),
    );
  }
}

/** Instancia singleton exportada — usar en toda la aplicación */
export const moduleRegistry = ModuleRegistry.getInstance();
