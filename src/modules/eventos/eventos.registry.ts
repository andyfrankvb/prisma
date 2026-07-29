/**
 * Registry: Supervisión de Eventos — métricas para supervisión
 * File: src/modules/eventos/eventos.registry.ts
 *
 * Registra la función de métricas del módulo 'supervision_eventos'
 * en el ModuleRegistry. Debe llamarse al arrancar el servidor.
 *
 * Métricas:
 *   activos    → eventos con estado ABIERTO
 *   pendientes → tareas sin terminar en eventos ABIERTOS
 *   alertas    → tareas vencidas (fecha_programada < hoy) sin terminar en eventos ABIERTOS
 *
 * Nota: los estados terminales de una tarea son COMPLETADA y FINALIZADO
 * (FINALIZADO es el cierre real cuando la Dirección General aprueba). Ambos
 * se excluyen de pendientes y alertas para no inflar los números.
 */

import { moduleRegistry } from '../module-registry/module.registry';
import { db }             from '../../db';

// Estados en los que una tarea ya está terminada (no cuentan como pendientes)
const ESTADOS_TERMINADOS = ['COMPLETADA', 'FINALIZADO'];

export function registerSupervisionEventos(): void {
  moduleRegistry.register('supervision_eventos', async () => {
    const [{ activos }] = await db('eventos')
      .where('estado', 'ABIERTO')
      .count('id as activos');

    const [{ pendientes }] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNotIn('t.estado', ESTADOS_TERMINADOS)
      .count('t.id as pendientes');

    const [{ alertas }] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNotIn('t.estado', ESTADOS_TERMINADOS)
      .whereRaw(`t.fecha_programada < CURRENT_DATE`)
      .count('t.id as alertas');

    return {
      activos:    Number(activos),
      pendientes: Number(pendientes),
      alertas:    Number(alertas),
    };
  });
}
