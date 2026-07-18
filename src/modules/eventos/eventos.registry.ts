/**
 * Registry: Supervisión de Eventos — métricas para supervisión
 * File: src/modules/eventos/eventos.registry.ts
 *
 * Registra la función de métricas del módulo 'supervision_eventos'
 * en el ModuleRegistry. Debe llamarse al arrancar el servidor.
 *
 * Métricas:
 *   activos    → eventos con estado ABIERTO
 *   pendientes → tareas sin completar en eventos ABIERTOS
 *   alertas    → tareas vencidas (fecha_programada < hoy) en eventos ABIERTOS
 */

import { moduleRegistry } from '../module-registry/module.registry';
import { db }             from '../../db';

export function registerSupervisionEventos(): void {
  moduleRegistry.register('supervision_eventos', async () => {
    const [{ activos }] = await db('eventos')
      .where('estado', 'ABIERTO')
      .count('id as activos');

    const [{ pendientes }] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNot('t.estado', 'COMPLETADA')
      .count('t.id as pendientes');

    const [{ alertas }] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNot('t.estado', 'COMPLETADA')
      .whereRaw(`t.fecha_programada < CURRENT_DATE`)
      .count('t.id as alertas');

    return {
      activos:    Number(activos),
      pendientes: Number(pendientes),
      alertas:    Number(alertas),
    };
  });
}
