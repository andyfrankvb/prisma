/**
 * Registry: Oficialía de Partes — métricas para supervisión
 * File: src/modules/oficialia_partes/oficios.registry.ts
 *
 * Registra la función de métricas del módulo 'oficialia_partes'
 * en el ModuleRegistry. Debe llamarse al arrancar el servidor.
 *
 * Métricas:
 *   activos    → oficios con estatus distinto de FINALIZADO
 *   pendientes → oficios con estatus RECIBIDO o ASIGNADO
 *   alertas    → oficios con término vencido (fecha_vencimiento <= hoy)
 */

import { moduleRegistry } from '../module-registry/module.registry';
import { db }             from '../../db';

export function registerOficialiaPartes(): void {
  moduleRegistry.register('oficialia_partes', async () => {
    const [{ activos }] = await db('oficios')
      .whereNot('estatus', 'FINALIZADO')
      .count('id as activos');

    const [{ pendientes }] = await db('oficios')
      .whereIn('estatus', ['RECIBIDO', 'ASIGNADO'])
      .count('id as pendientes');

    const [{ alertas }] = await db('oficios')
      .where('tiene_termino', true)
      .whereNot('estatus', 'FINALIZADO')
      .whereRaw(`fecha_vencimiento::date <= CURRENT_DATE`)
      .count('id as alertas');

    return {
      activos:    Number(activos),
      pendientes: Number(pendientes),
      alertas:    Number(alertas),
    };
  });
}
