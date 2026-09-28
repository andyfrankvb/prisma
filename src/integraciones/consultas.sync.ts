/**
 * Sincronización con la API de Consulta Pública de SID.
 * File: src/integraciones/consultas.sync.ts
 *
 * Trae a `consulta_publica` las búsquedas que SID ha registrado desde el
 * último corte. Se ejecuta por 2 caminos: el cron cada 5 minutos (registrado
 * en server.ts) y el botón "Sincronizar ahora" del módulo Consulta Pública.
 *
 * ── Contrato real de la API (verificado contra el servicio en vivo) ─────────
 *   GET {base}/api/consultas?per_page=50&page=1
 *   → { data: [ { id, nombre_completo, nombres, apellido, codigo_acceso,
 *                 busqueda, filtro_busqueda, tipo_usuario, oficina, folio,
 *                 estado_contador, hora_busqueda, usuario, tramite,
 *                 fecha_registro } ],
 *       meta: { current_page, per_page, total, last_page, from, to } }
 *
 * Tres límites medidos que condicionan el diseño:
 *   · NO acepta filtros incrementales (`desde`, `since`, `min_id`: los ignora),
 *     así que no se puede pedir "lo posterior a X". Sí respeta los filtros de
 *     búsqueda (nombre_completo, oficina…), que aquí no se usan.
 *   · `per_page` máximo 50 — con 100 responde un redirect, no JSON.
 *   · Devuelve de lo más NUEVO a lo más viejo (id descendente).
 *
 * De ahí la estrategia: leer desde la página 1 hacia atrás y cortar al topar
 * con la MARCA DE AGUA (`integracion_consultas_config.origen_id_continuo`),
 * que es el id por debajo del cual el histórico ya está completo. En régimen
 * normal son 1 o 2 páginas; la primera corrida tiene que recorrer el rezago
 * acumulado, acotado por MAX_PAGINAS_POR_CORRIDA.
 *
 * La marca de agua NO es `MAX(origen_id)`: como se guarda primero lo más
 * nuevo, ese máximo salta al tope en la primera página y el rezago intermedio
 * se quedaría sin traer para siempre. Solo se avanza la marca cuando la
 * corrida logra descender completa hasta ella; si se corta antes (error de red
 * o tope de páginas), la marca se queda donde estaba y la siguiente corrida
 * vuelve a bajar. Lo ya guardado no se duplica, así que reintentar es barato.
 *
 * Idempotente: `consulta_publica.origen_id` es UNIQUE y cada INSERT lleva
 * ON CONFLICT DO NOTHING (ver 2026-09-18_consulta_publica.sql). Correrlo dos
 * veces seguidas, o pegarle al botón manual justo después del cron, nunca
 * duplica filas.
 */

import { db }       from '../db';
import { logger }   from '../utils/logger';
import { evaluarYRegistrarAlertas } from '../modules/consultas/vigilancia.matching';
import { Consulta, ValorBusqueda }  from '../modules/consultas/dtos/consulta.dto';

/** Tope de la API de SID: con 100 deja de responder JSON. */
const PER_PAGE = 50;

/**
 * Techo de páginas por corrida — lo manda el límite de la API, no nosotros.
 *
 * SID responde `x-ratelimit-limit: 60` por minuto y devuelve HTTP 429 al
 * pasarse (medido en vivo). Con 40 páginas por corrida queda margen para el
 * kiosco y para cualquier otro consumidor de esa API, que no es nuestra.
 *
 * 40 × 50 = 2,000 búsquedas por corrida. Con el cron cada 5 minutos, el rezago
 * inicial (~17,000) se absorbe en unas 9 corridas, menos de una hora, sin que
 * nadie tenga que hacer nada. Después bastan 1 o 2 páginas por corrida.
 */
const MAX_PAGINAS_POR_CORRIDA = 40;

/**
 * Tope para el relleno del rezago histórico, que se pide a mano una sola vez.
 *
 * No sirve dejar que el cron cierre el rezago solo: cada corrida vuelve a
 * empezar en la página 1 (la API no permite pedir "desde tal id"), así que con
 * el tope normal siempre releería las mismas 2,000 más nuevas sin bajar nunca.
 * El rezago se cierra con una corrida larga explícita — la del botón, con
 * `paginas` — y a partir de ahí el cron ya solo trae 1 o 2 páginas.
 */
const MAX_PAGINAS_RELLENO = 600;

/**
 * Espera entre páginas para no consumir el presupuesto de golpe: ~50
 * peticiones por minuto contra un límite de 60.
 */
const PAUSA_ENTRE_PAGINAS_MS = 1_200;

/** Si SID pide esperar más que esto, se cierra la corrida y se retoma en la siguiente. */
const MAX_ESPERA_429_S = 30;

/** Páginas extra que se revisan tras cruzar la marca, por el desorden de ids entre búsquedas del mismo segundo. */
const PAGINAS_DE_GRACIA = 1;

/**
 * La API de SID responde de forma despareja: medido en vivo, la misma página
 * tarda entre 1 y 9 segundos, con picos que pasan de 20. Por eso el margen es
 * amplio y cada página se reintenta: un tropiezo aislado no debe abortar una
 * corrida que ya lleva miles de filas traídas.
 */
const TIMEOUT_MS      = 45_000;
const REINTENTOS      = 3;
const ESPERA_REINTENTO_MS = 2_000;

/**
 * Solo se evalúa el Catálogo de Vigilancia sobre búsquedas recientes.
 *
 * El matching existe para avisar de consultas que están ocurriendo, no para
 * reconstruir el pasado: al traer el rezago histórico, evaluar 17,000 filas
 * viejas llenaría de avisos a SUPERADMIN/DIRECTOR por búsquedas de hace
 * semanas y dispararía una consulta por fila contra una base que ya vimos
 * lenta. Las filas más viejas se guardan igual, solo no generan alerta.
 */
const HORAS_PARA_ALERTAR = 24;

interface ResultadoSync {
  estado:  'exitoso' | 'error' | 'omitido';
  detalle: string;
}

/** Fila tal como la entrega la API de SID (nombres del legacy, sin limpiar). */
interface FilaApiSid {
  id:               number;
  nombre_completo:  string | null;
  nombres:          string | null;
  apellido:         string | null;
  codigo_acceso:    string | null;
  busqueda:         Record<string, ValorBusqueda> | null;
  filtro_busqueda:  string | null;
  tipo_usuario:     string | null;
  oficina:          string | null;
  folio:            string | null;
  estado_contador:  string | null;
  hora_busqueda:    string | null;
}

interface RespuestaApiSid {
  data: FilaApiSid[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
}

/** Nombre a usar cuando el legacy no trae `nombre_completo` — mismo criterio que db/migrate-consultas-sid.mjs. */
function resolverNombre(fila: FilaApiSid): string {
  const directo = (fila.nombre_completo ?? '').trim();
  if (directo) return directo;
  const compuesto = `${fila.nombres ?? ''} ${fila.apellido ?? ''}`.trim();
  return compuesto || 'SIN NOMBRE';
}

/** Filas sin lo mínimo indispensable se registran y se saltan, en vez de tumbar la corrida completa. */
function motivoDeDescarte(fila: FilaApiSid): string | null {
  if (typeof fila.id !== 'number')                          return 'id ausente o no numérico';
  if (!fila.codigo_acceso || !String(fila.codigo_acceso).trim()) return 'codigo_acceso vacío';
  if (fila.busqueda === null || typeof fila.busqueda !== 'object' || Array.isArray(fila.busqueda)) {
    return 'busqueda nula o inválida';
  }
  if (!fila.hora_busqueda) return 'hora_busqueda vacía';
  return null;
}

const dormir = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

function esReciente(horaBusqueda: string): boolean {
  const t = new Date(horaBusqueda).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= HORAS_PARA_ALERTAR * 60 * 60 * 1000;
}

export interface RevisionPagina {
  /** Filas que hay que guardar: por encima de la marca y con los campos mínimos. */
  pendientes:  FilaApiSid[];
  /** Filas inservibles, con el motivo — se registran y se saltan, nunca abortan la corrida. */
  descartadas: { id: number | null; motivo: string }[];
  /** Id más alto visto hasta ahora (entra el acumulado previo). */
  idMasAlto:   number;
  /** Si en esta página ya apareció algo por debajo de la marca de agua. */
  bajoLaMarca: boolean;
}

/**
 * Separa una página en "hay que guardar" / "ya la teníamos" / "no sirve".
 *
 * Vive aparte del resto por dos razones: es lo único con reglas sutiles —el
 * desorden de ids del mismo segundo y la marca de agua— y así se puede probar
 * sin base de datos ni API de por medio (ver src/tests/unit/consultas.sync.test.ts).
 *
 * Importante: al toparse con un id bajo la marca NO corta el recorrido de la
 * página. La API ordena por hora, no por id, y dos búsquedas del mismo segundo
 * salen cruzadas (visto en la data real: 89892, 89890, 89891); cortar ahí
 * dejaría fuera al id rezagado del cruce.
 */
export function revisarPagina(filas: FilaApiSid[], marca: number, idMasAltoPrevio: number): RevisionPagina {
  const resultado: RevisionPagina = {
    pendientes:  [],
    descartadas: [],
    idMasAlto:   idMasAltoPrevio,
    bajoLaMarca: false,
  };

  for (const fila of filas) {
    if (typeof fila.id !== 'number') {
      resultado.descartadas.push({ id: null, motivo: 'id ausente o no numérico' });
      continue;
    }
    if (fila.id <= marca) { resultado.bajoLaMarca = true; continue; }
    if (fila.id > resultado.idMasAlto) resultado.idMasAlto = fila.id;

    const motivo = motivoDeDescarte(fila);
    if (motivo) {
      resultado.descartadas.push({ id: fila.id, motivo });
      continue;
    }
    resultado.pendientes.push(fila);
  }

  return resultado;
}

export interface OpcionesSync {
  /**
   * Páginas máximas a recorrer. Sin esto se usa MAX_PAGINAS_POR_CORRIDA (el
   * ritmo del cron); se sube solo para el relleno del rezago histórico, desde
   * la pantalla del módulo.
   */
  maxPaginas?: number;
}

export async function runConsultasSync(
  usuarioId: number | null = null,
  opciones: OpcionesSync = {},
): Promise<ResultadoSync> {
  const maxPaginas = Math.min(
    Math.max(1, Math.trunc(opciones.maxPaginas ?? MAX_PAGINAS_POR_CORRIDA)),
    MAX_PAGINAS_RELLENO,
  );
  const config = await db('integracion_consultas_config').where('id', 1).first();

  if (!config?.activo || !config.api_base_url) {
    const detalle = 'Integración con la API de Consulta Pública (SID) no configurada o desactivada — sincronización omitida.';
    logger.info(detalle);
    await registrarLog('omitido', detalle);
    return { estado: 'omitido', detalle };
  }

  const marca = Number(config.origen_id_continuo ?? 0);

  let leidas    = 0;
  let nuevas    = 0;
  let descartadas = 0;
  let idMasAlto = marca;

  try {
    let alcanzado   = false;
    let bajoLaMarca = false;
    let paginasTrasLaMarca = 0;
    let pagina      = 1;

    for (; pagina <= maxPaginas && !alcanzado; pagina++) {
      if (pagina > 1) await dormir(PAUSA_ENTRE_PAGINAS_MS);
      const body  = await leerPagina(String(config.api_base_url), pagina);
      const filas = Array.isArray(body?.data) ? body.data : [];
      if (filas.length === 0) break;

      // Ordena por hora, no estrictamente por id: cuando dos búsquedas caen en
      // el mismo segundo los ids se cruzan (visto en la data real: 89892,
      // 89890, 89891). Por eso al topar con la marca NO se corta a media
      // página — se termina de revisar la página completa y se concede una
      // página extra, para que un id rezagado del cruce no se quede fuera.
      const revision = revisarPagina(filas, marca, idMasAlto);
      const pendientes = revision.pendientes;
      leidas      += filas.length;
      descartadas += revision.descartadas.length;
      idMasAlto    = revision.idMasAlto;
      if (revision.bajoLaMarca) bajoLaMarca = true;
      for (const d of revision.descartadas) {
        logger.warn({ origen_id: d.id, motivo: d.motivo }, 'Consulta de SID descartada en la sincronización');
      }

      if (pendientes.length > 0) nuevas += await insertarYAlertar(pendientes);

      // La última página del catálogo: no hay nada más atrás que traer.
      if (body.meta && pagina >= body.meta.last_page) { alcanzado = true; break; }

      // Ya se cruzó la marca: una página más de cortesía por el desorden de
      // ids descrito arriba, y se cierra la corrida.
      if (bajoLaMarca && ++paginasTrasLaMarca > PAGINAS_DE_GRACIA) alcanzado = true;
    }

    // Solo se avanza la marca si la corrida llegó hasta abajo: si se cortó por
    // el tope de páginas, el tramo intermedio sigue pendiente.
    if (alcanzado && idMasAlto > marca) {
      await db('integracion_consultas_config').where('id', 1).update({ origen_id_continuo: idMasAlto });
    }

    const corte = alcanzado
      ? ''
      : ` Se alcanzó el tope de ${maxPaginas} páginas en esta corrida; queda rezago pendiente.`;
    const detalle = `${leidas} búsqueda(s) leídas de SID — ${nuevas} nueva(s), ${descartadas} descartada(s).${corte}`;

    await marcarResultado('exitoso', detalle);
    await registrarLog('exitoso', detalle, leidas, nuevas);
    logger.info(detalle);
    return { estado: 'exitoso', detalle };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    const detalle = `No se pudo sincronizar con la API de Consulta Pública (SID): ${mensaje}`;
    logger.error({ err }, detalle);
    await marcarResultado('error', detalle);
    await registrarLog('error', detalle, leidas, nuevas);
    return { estado: 'error', detalle };
  }

  async function marcarResultado(estado: 'exitoso' | 'error', detalle: string): Promise<void> {
    await db('integracion_consultas_config').where('id', 1).update({
      ultima_sincronizacion: estado === 'exitoso' ? db.fn.now() : config!.ultima_sincronizacion,
      ultimo_estado:  estado,
      ultimo_detalle: detalle,
    });
  }

  async function registrarLog(
    estado: 'exitoso' | 'error' | 'omitido',
    detalle: string,
    filasTotal?: number,
    filasNuevas?: number,
  ): Promise<void> {
    await db('carga_datos_log').insert({
      tipo:         'sync_consultas',
      usuario_id:   usuarioId,
      filas_total:  filasTotal ?? null,
      filas_nuevas: filasNuevas ?? null,
      // "omitido" no es un fallo: se guarda como informativo, igual que en siqroo.sync.
      estado:       estado === 'omitido' ? 'exitoso' : estado,
      detalle,
    });
  }
}

/**
 * Lee una página de la API, reintentando los tropiezos de red. Solo se rinde
 * después de REINTENTOS intentos: ahí sí se propaga el error y la corrida
 * termina conservando todo lo que alcanzó a guardar.
 */
async function leerPagina(baseUrl: string, pagina: number): Promise<RespuestaApiSid> {
  const url = new URL('/api/consultas', baseUrl);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page',     String(pagina));

  let ultimoError: unknown;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });

      // 429: la API dice cuántos segundos esperar. Se respeta en vez de
      // insistir — es un servicio de otra área y el kiosco depende de él.
      if (res.status === 429) {
        const espera = Number(res.headers.get('retry-after') ?? 0);
        if (espera > 0 && espera <= MAX_ESPERA_429_S && intento < REINTENTOS) {
          logger.warn({ pagina, espera }, 'La API de Consulta Pública pidió esperar (429)');
          await dormir(espera * 1000);
          continue;
        }
        throw new Error(`la API de SID limitó las peticiones (HTTP 429, pide esperar ${espera}s)`);
      }

      if (!res.ok) throw new Error(`la API de SID respondió HTTP ${res.status}`);
      return await res.json() as RespuestaApiSid;
    } catch (err) {
      ultimoError = err;
      logger.warn({ pagina, intento }, 'Reintentando la página de la API de Consulta Pública');
      if (intento < REINTENTOS) await dormir(ESPERA_REINTENTO_MS * intento);
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
}

/**
 * Inserta las filas de una página y dispara la vigilancia solo sobre las
 * recientes. `ON CONFLICT DO NOTHING` + `returning` deja ver exactamente
 * cuáles entraron: las que ya existían no vuelven.
 */
async function insertarYAlertar(filas: FilaApiSid[]): Promise<number> {
  const insertadas = await db('consulta_publica')
    .insert(filas.map((fila) => ({
      origen_id:       fila.id,
      nombre_completo: resolverNombre(fila),
      codigo_acceso:   String(fila.codigo_acceso).trim(),
      busqueda:        JSON.stringify(fila.busqueda ?? {}),
      filtro_busqueda: fila.filtro_busqueda,
      tipo_usuario:    fila.tipo_usuario,
      oficina:         fila.oficina,
      folio:           fila.folio,
      estado_contador: fila.estado_contador,
      hora_busqueda:   fila.hora_busqueda,
    })))
    .onConflict('origen_id')
    .ignore()
    .returning('*') as Consulta[];

  for (const consulta of insertadas) {
    if (!esReciente(consulta.hora_busqueda)) continue;
    // No bloqueante y sin propagar errores: una alerta fallida no debe abortar
    // la sincronización ni perder las filas ya guardadas.
    await evaluarYRegistrarAlertas(consulta);
  }

  return insertadas.length;
}
