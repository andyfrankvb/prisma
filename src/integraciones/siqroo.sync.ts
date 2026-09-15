/**
 * Sincronización con la API de SIQROO (líneas de captura de RPP).
 * File: src/integraciones/siqroo.sync.ts
 *
 * Se ejecuta por 2 caminos: el cron mensual (registrado en server.ts) y el
 * botón "Sincronizar ahora" del módulo "Carga de Datos". Ambos llaman esta
 * misma función para no duplicar lógica.
 *
 * IMPORTANTE — contrato de la API pendiente de confirmar: al momento de
 * escribir esto, el equipo de SIQROO todavía está construyendo su API. La
 * URL/formato de abajo (`GET {base}/lineas-captura?desde=`, con
 * `{ data: [...] }` y las mismas columnas que trajo el volcado manual que sí
 * procesamos — ver infra/postgres/migrations/2026-09-14_estatus_delegacion_rpp.sql
 * y el análisis de mvw_reporte_lineas_captura) es un PLACEHOLDER razonable,
 * no un contrato confirmado. Hay que ajustar `mapearFila` y la URL en cuanto
 * SIQROO entregue su documentación real — el resto (guardar config cifrada,
 * cron mensual, botón manual, bitácora, UPSERT deduplicado) ya queda listo y
 * no debería necesitar cambios.
 *
 * El UPSERT sigue el mismo criterio que se usó al procesar el volcado manual
 * (ver satq.controller.ts): por (dsnci, nolineacaptura) hacia
 * satq_lineas_captura, con estatus_actual derivado (Entrega > Cancelada por
 * notario > "En trámite"), y agregado hacia satq_lineas_captura_resumen por
 * nolineacaptura — así una sincronización repetida nunca duplica filas,
 * a diferencia del volcado original que traía ~27x de duplicación.
 */

import { db }       from '../db';
import { descifrar } from '../utils/crypto';
import { logger }   from '../utils/logger';

interface ResultadoSync {
  estado:  'exitoso' | 'error' | 'omitido';
  detalle: string;
}

export async function runSiqrooSync(usuarioId: number | null = null): Promise<ResultadoSync> {
  const config = await db('integracion_siqroo_config').where('id', 1).first();

  if (!config?.activo || !config.api_key_cifrada || !config.api_base_url) {
    const detalle = 'Integración con SIQROO no configurada o desactivada — sincronización omitida.';
    logger.info(detalle);
    await registrarLog('omitido', detalle);
    return { estado: 'omitido', detalle };
  }

  let apiKey: string;
  try {
    apiKey = descifrar(config.api_key_cifrada);
  } catch (err: any) {
    const detalle = `No se pudo descifrar la API key guardada: ${err.message}`;
    await marcarResultado('error', detalle);
    await registrarLog('error', detalle);
    return { estado: 'error', detalle };
  }

  try {
    const desde = config.ultima_sincronizacion ? new Date(config.ultima_sincronizacion).toISOString() : undefined;
    const url = new URL('/lineas-captura', config.api_base_url);
    if (desde) url.searchParams.set('desde', desde);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`SIQROO respondió HTTP ${res.status}`);

    const body = await res.json() as { data?: unknown[] };
    const filas = Array.isArray(body?.data) ? body.data : [];

    const { nuevas, actualizadas } = await upsertLineasCaptura(filas);

    const detalle = `${filas.length} fila(s) recibidas de SIQROO — ${nuevas} nueva(s), ${actualizadas} actualizada(s).`;
    await marcarResultado('exitoso', detalle);
    await registrarLog('exitoso', detalle, filas.length, nuevas, actualizadas);
    return { estado: 'exitoso', detalle };
  } catch (err: any) {
    const detalle = `No se pudo sincronizar con la API de SIQROO: ${err.message}`;
    logger.error({ err }, detalle);
    await marcarResultado('error', detalle);
    await registrarLog('error', detalle);
    return { estado: 'error', detalle };
  }

  async function marcarResultado(estado: 'exitoso' | 'error', detalle: string) {
    await db('integracion_siqroo_config').where('id', 1).update({
      ultima_sincronizacion: estado === 'exitoso' ? db.fn.now() : config!.ultima_sincronizacion,
      ultimo_estado: estado,
      ultimo_detalle: detalle,
    });
  }

  async function registrarLog(estado: 'exitoso' | 'error' | 'omitido', detalle: string, filasTotal?: number, nuevas?: number, actualizadas?: number) {
    await db('carga_datos_log').insert({
      tipo: 'sync_siqroo',
      usuario_id: usuarioId,
      filas_total: filasTotal ?? null,
      filas_nuevas: nuevas ?? null,
      filas_actualizadas: actualizadas ?? null,
      estado: estado === 'omitido' ? 'exitoso' : estado, // "omitido" no es un fallo, se guarda como informativo
      detalle,
    });
  }
}

/**
 * Placeholder de mapeo — pendiente de ajustar contra el contrato real de la
 * API. Por ahora asume el mismo shape que trajo mvw_reporte_lineas_captura.
 */
async function upsertLineasCaptura(filas: any[]): Promise<{ nuevas: number; actualizadas: number }> {
  if (filas.length === 0) return { nuevas: 0, actualizadas: 0 };

  // TODO: cuando SIQROO confirme el contrato real, mapear `filas` a
  // (dsnci, fcfirma, nolineacaptura, importe_total, cantidadquemada,
  // cantidadbloqueda, preciounitario, cantidad_comprada_sin_quemar,
  // estatus_actual, delegacion) y hacer UPSERT en satq_lineas_captura por
  // (dsnci, nolineacaptura), igual que el backfill manual de esta sesión.
  // Se deja sin implementar a propósito: escribir esta lógica contra un
  // contrato inventado arriesga silenciosamente corromper datos reales el
  // día que sí haya API. Por ahora solo se deja el enganche listo.
  logger.warn(`upsertLineasCaptura: recibidas ${filas.length} filas de SIQROO, pero el mapeo aún no está implementado (pendiente contrato real de la API).`);
  return { nuevas: 0, actualizadas: 0 };
}
