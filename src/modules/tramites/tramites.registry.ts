/**
 * Registry: Seguimiento de Trámites
 * File: src/modules/tramites/tramites.registry.ts
 */

import { moduleRegistry } from '../module-registry/module.registry';
import { db }             from '../../db';

export function registerTramitesSeguimiento(): void {
  moduleRegistry.register('tramites_seguimiento', async () => {
    const [{ activos }] = await db('tramites')
      .whereIn('estatus', ['NUEVO', 'EN_REVISION', 'EN_PROCESO', 'DEVUELTO_DELEGADO', 'DEVUELTO_JURIDICO'])
      .count('id as activos');

    const [{ pendientes }] = await db('tramites')
      .whereIn('estatus', ['NUEVO', 'DEVUELTO_DELEGADO'])
      .count('id as pendientes');

    const [{ alertas }] = await db('tramites')
      .where('estatus', 'EN_PROCESO')
      .andWhereRaw('fecha_compromiso < CURRENT_DATE')
      .count('id as alertas');

    return {
      activos:    Number(activos),
      pendientes: Number(pendientes),
      alertas:    Number(alertas),
    };
  });
}
