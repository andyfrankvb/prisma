/**
 * A qué áreas le puede escribir un área.
 *
 * Antes esto se decidía en tres lugares que no coincidían: la lista del turnado
 * mostraba todas las unidades sin mirar quién preguntaba, la del delegatorio se
 * recortaba según si la *persona* era de Jurídica, y la validación al guardar
 * repetía la regla por su cuenta. Quien cargaba dos papeles —encargado de
 * Jurídica y de la Dirección General— recibía la lista recortada aun trabajando
 * un oficio de la Dirección General.
 *
 * Aquí la pregunta es siempre por el oficio: «esta área, ¿a quién le puede
 * escribir?». Deja de importar cuántos sombreros traiga puesto quien la hace.
 *
 * La configuración guarda excepciones, no permisos: lo que no tiene renglón está
 * permitido. Así una unidad nueva queda disponible sola en vez de permanecer
 * invisible hasta que alguien se acuerde de habilitarla.
 */
import { db } from '../../db';

export interface UnidadDestino {
  id:     number;
  nombre: string;
  tipo:   'DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION';
  /** Titular al que quedaría dirigido el oficio. Nulo si el área no tiene. */
  titular_id:     number | null;
  titular_nombre: string | null;
}

/**
 * Las áreas a las que `unidadOrigenId` puede dirigirse hoy.
 *
 * Se listan aunque les falte titular; el renglón lo dice y quien elige se entera
 * en el momento. Filtrarlas aquí las hacía desaparecer de la lista sin que nadie
 * supiera por qué —y el día que un director causara baja, su área simplemente
 * dejaba de existir para los demás.
 */
export async function destinosPermitidos(unidadOrigenId: number): Promise<UnidadDestino[]> {
  const filas = await db('catalogo_unidades as cu')
    .leftJoin('configuracion_destinos as cd', function () {
      this.on('cd.unidad_destino_id', 'cu.id')
          .andOn('cd.unidad_origen_id', db.raw('?', [unidadOrigenId]));
    })
    // De todos los titulares posibles se toma uno solo y siempre el mismo, para
    // que la lista no cambie de orden ni de destinatario entre dos consultas.
    .leftJoin(
      db.raw(`(
        SELECT DISTINCT ON (unidad_id) unidad_id, id, nombre
          FROM usuarios
         WHERE rol = 'DIRECTOR' AND activo
         ORDER BY unidad_id, id ASC
      ) as titular`),
      'titular.unidad_id', 'cu.id',
    )
    .where('cu.activo', true)
    .andWhereNot('cu.id', unidadOrigenId)
    .andWhere((q) => q.whereNull('cd.permitido').orWhere('cd.permitido', true))
    .select(
      'cu.id', 'cu.nombre', 'cu.tipo',
      'titular.id as titular_id',
      'titular.nombre as titular_nombre',
    )
    // Las direcciones primero y la General a la cabeza: es el orden en que la
    // gente las nombra, y deja los dos bloques de la pantalla ya armados.
    .orderByRaw(`CASE cu.tipo
                   WHEN 'DIRECCION_GENERAL' THEN 0
                   WHEN 'DIRECCION'         THEN 1
                   ELSE 2 END`)
    .orderBy('cu.nombre', 'asc');

  return filas as UnidadDestino[];
}

/**
 * ¿Puede este origen dirigirse a este destino?
 *
 * Se pregunta al guardar, no solo al pintar la lista: entre que alguien abre el
 * panel y lo envía, la configuración pudo cambiar, y nada impide llamar a la API
 * sin haber pasado por la pantalla.
 */
export async function puedeEnviarA(unidadOrigenId: number, unidadDestinoId: number): Promise<boolean> {
  if (!unidadOrigenId || !unidadDestinoId) return false;
  if (unidadOrigenId === unidadDestinoId)  return false;

  const destino = await db('catalogo_unidades')
    .where({ id: unidadDestinoId, activo: true })
    .first();
  if (!destino) return false;

  const veto = await db('configuracion_destinos')
    .where({ unidad_origen_id: unidadOrigenId, unidad_destino_id: unidadDestinoId })
    .andWhere('permitido', false)
    .first();
  return !veto;
}

/** La unidad donde vive hoy un oficio: la de su destinatario actual. */
export async function unidadDelOficio(oficioId: number, trx?: any): Promise<number | null> {
  const fila = await (trx ?? db)('oficios as o')
    .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
    .where('o.id', oficioId)
    .select('dir.unidad_id')
    .first();
  return fila?.unidad_id ?? null;
}
