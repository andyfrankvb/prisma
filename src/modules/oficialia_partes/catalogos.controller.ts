/**
 * Controller: Catálogos de Ingreso de Oficio
 * File: src/modules/oficialia_partes/catalogos.controller.ts
 *
 * Jerarquía en cascada: Dependencia → Sub-unidad → Remitente (persona).
 * La sub-unidad pertenece a una dependencia; el remitente a una sub-unidad.
 * Todos se guardan en MAYÚSCULAS y se pueden agregar al vuelo desde el ingreso.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';

/**
 * Normaliza un nombre de catálogo antes de guardarlo: quita espacios en los
 * extremos, colapsa espacios internos dobles y lo pasa a MAYÚSCULAS. Así se
 * evitan casi-duplicados por espacios ("A  B" → "A B").
 */
const normNombre = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * ¿Puede este usuario depurar los catálogos (editar, eliminar, reorganizar)?
 *
 * Además del SUPERADMIN, cualquiera que tenga habilitado el módulo «Catálogo de
 * dependencias y remitentes». Se decide por módulo y no por un rol de flujo
 * porque el rol solo alcanzaba a quien entrara por la pantalla del oficial de
 * partes: una delegada, o cualquier persona de un área, no llegaba nunca.
 *
 * El catálogo es uno solo para toda la institución, así que el permiso no se
 * acota por unidad: quien lo tiene, lo depura completo.
 */
export async function puedeGestionarCatalogos(user: any): Promise<boolean> {
  if (user?.rol === 'SUPERADMIN') return true;
  const fila = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where({ 'um.usuario_id': user?.id ?? 0, 'm.clave': 'catalogos', 'm.activo': true })
    .first();
  return !!fila;
}

/** Corta la petición si el usuario no puede depurar catálogos. */
async function exigirGestionCatalogos(req: Request): Promise<void> {
  if (!(await puedeGestionarCatalogos(req.user))) {
    throw new AppError('No tienes permiso para modificar los catálogos', 403);
  }
}

// ═══════════════════════════ Dependencias (nivel raíz) ═══════════════════════════

// GET /catalogos/dependencias
export async function listarDependencias(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('catalogo_dependencias')
      .where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/dependencias
export async function crearDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre de la dependencia es requerido', 422);
    // ¿Ya existe? → devuélvela (reactivando si estaba inactiva) sin crear duplicado.
    const existente = await db('catalogo_dependencias').where({ nombre }).first();
    if (existente) {
      if (existente.activo === false) await db('catalogo_dependencias').where({ id: existente.id }).update({ activo: true });
      res.status(200).json({ data: { id: existente.id, nombre: existente.nombre }, yaExistia: true });
      return;
    }
    const [row] = await db('catalogo_dependencias')
      .insert({ nombre, creado_por_id: req.user!.id })
      .onConflict('nombre').merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row, yaExistia: false });
  } catch (err) { next(err); }
}

// PATCH /catalogos/dependencias/:id
export async function editarDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre de la dependencia es requerido', 422);
    const dup = await db('catalogo_dependencias').where({ nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe una dependencia con ese nombre', 409);
    const [row] = await db('catalogo_dependencias').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    if (!row) throw new AppError('Dependencia no encontrada', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/dependencias/:id  (borra en cascada sus sub-unidades y remitentes)
export async function eliminarDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_dependencias').where({ id }).delete();
    if (!deleted) throw new AppError('Dependencia no encontrada', 404);
    res.json({ message: 'Dependencia eliminada' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Sub-unidades (dentro de una dependencia) ═══════════════════════════

// GET /catalogos/dependencias/:id/unidades-internas
export async function listarUnidadesInternas(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const dependencia_id = parseInt(req.params.id, 10);
    const data = await db('catalogo_unidades_internas')
      .where({ dependencia_id, activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/dependencias/:id/unidades-internas
export async function crearUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const dependencia_id = parseInt(req.params.id, 10);
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre de la sub-unidad es requerido', 422);
    const dep = await db('catalogo_dependencias').where({ id: dependencia_id }).first();
    if (!dep) throw new AppError('Dependencia no encontrada', 404);
    const existente = await db('catalogo_unidades_internas').where({ dependencia_id, nombre }).first();
    if (existente) {
      if (existente.activo === false) await db('catalogo_unidades_internas').where({ id: existente.id }).update({ activo: true });
      res.status(200).json({ data: { id: existente.id, nombre: existente.nombre }, yaExistia: true });
      return;
    }
    const [row] = await db('catalogo_unidades_internas')
      .insert({ dependencia_id, nombre, creado_por_id: req.user!.id })
      .onConflict(['dependencia_id', 'nombre']).merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row, yaExistia: false });
  } catch (err) { next(err); }
}

// PATCH /catalogos/unidades-internas/:id
export async function editarUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre de la sub-unidad es requerido', 422);
    const actual = await db('catalogo_unidades_internas').where({ id }).first();
    if (!actual) throw new AppError('Sub-unidad no encontrada', 404);
    const dup = await db('catalogo_unidades_internas')
      .where({ dependencia_id: actual.dependencia_id, nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe una sub-unidad con ese nombre en esta dependencia', 409);
    const [row] = await db('catalogo_unidades_internas').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/unidades-internas/:id  (borra en cascada sus remitentes)
export async function eliminarUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_unidades_internas').where({ id }).delete();
    if (!deleted) throw new AppError('Sub-unidad no encontrada', 404);
    res.json({ message: 'Sub-unidad eliminada' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Reorganización de la jerarquía ═══════════════════════════
//
// Los oficios guardan `dependencia_origen` y `unidad_interna` como TEXTO (snapshot
// de lo capturado ese día), NO como llave foránea. Por eso reorganizar el catálogo
// no altera ni un oficio histórico: solo cambia la estructura del catálogo.

// POST /catalogos/dependencias/:id/convertir-en-subunidad   body: { dependencia_destino_id }
// Degrada una dependencia a sub-unidad de otra. Si tenía sub-unidades propias,
// se reasignan al destino (el catálogo solo tiene 2 niveles).
export async function dependenciaASubunidad(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id      = parseInt(req.params.id, 10);
    const destino = parseInt(req.body?.dependencia_destino_id, 10);
    if (!destino)      throw new AppError('Selecciona la dependencia destino', 422);
    if (id === destino) throw new AppError('La dependencia destino debe ser distinta', 422);

    const origen = await db('catalogo_dependencias').where({ id }).first();
    if (!origen) throw new AppError('Dependencia no encontrada', 404);
    const dep = await db('catalogo_dependencias').where({ id: destino }).first();
    if (!dep) throw new AppError('Dependencia destino no encontrada', 404);

    const movidas = await db.transaction(async (trx) => {
      // 1) La dependencia pasa a ser sub-unidad del destino.
      await trx('catalogo_unidades_internas')
        .insert({ dependencia_id: destino, nombre: origen.nombre, creado_por_id: req.user!.id })
        .onConflict(['dependencia_id', 'nombre']).merge({ activo: true });

      // 2) Sus sub-unidades se reasignan al destino (evitando chocar con las que ya existan).
      const hijas = await trx('catalogo_unidades_internas').where({ dependencia_id: id });
      let n = 0;
      for (const h of hijas) {
        const ya = await trx('catalogo_unidades_internas')
          .where({ dependencia_id: destino, nombre: h.nombre }).first();
        if (ya) {
          await trx('catalogo_unidades_internas').where({ id: h.id }).delete();
        } else {
          await trx('catalogo_unidades_internas').where({ id: h.id }).update({ dependencia_id: destino });
          n++;
        }
      }

      // 3) Se elimina la dependencia original (ya no quedan hijas colgando).
      await trx('catalogo_dependencias').where({ id }).delete();
      return n;
    });

    res.json({
      message: `«${origen.nombre}» ahora es sub-unidad de «${dep.nombre}»`
        + (movidas ? ` · ${movidas} sub-unidad(es) reasignada(s)` : ''),
    });
  } catch (err) { next(err); }
}

// POST /catalogos/unidades-internas/:id/convertir-en-dependencia
// Promueve una sub-unidad a dependencia independiente.
export async function subunidadADependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const uni = await db('catalogo_unidades_internas').where({ id }).first();
    if (!uni) throw new AppError('Sub-unidad no encontrada', 404);

    const row = await db.transaction(async (trx) => {
      const [nueva] = await trx('catalogo_dependencias')
        .insert({ nombre: uni.nombre, creado_por_id: req.user!.id })
        .onConflict('nombre').merge({ activo: true })
        .returning(['id', 'nombre']);
      await trx('catalogo_unidades_internas').where({ id }).delete();
      return nueva;
    });

    res.json({ data: row, message: `«${uni.nombre}» ahora es una dependencia independiente` });
  } catch (err) { next(err); }
}

// PATCH /catalogos/unidades-internas/:id/mover   body: { dependencia_destino_id }
// Reasigna una sub-unidad a otra dependencia (se capturó bajo el padre equivocado).
export async function moverSubunidad(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id      = parseInt(req.params.id, 10);
    const destino = parseInt(req.body?.dependencia_destino_id, 10);
    if (!destino) throw new AppError('Selecciona la dependencia destino', 422);

    const uni = await db('catalogo_unidades_internas').where({ id }).first();
    if (!uni) throw new AppError('Sub-unidad no encontrada', 404);
    if (uni.dependencia_id === destino) throw new AppError('Ya pertenece a esa dependencia', 422);
    const dep = await db('catalogo_dependencias').where({ id: destino }).first();
    if (!dep) throw new AppError('Dependencia destino no encontrada', 404);

    // Si el destino ya tiene una sub-unidad con ese nombre, se fusionan (se elimina la duplicada).
    const ya = await db('catalogo_unidades_internas')
      .where({ dependencia_id: destino, nombre: uni.nombre }).first();
    if (ya) {
      await db('catalogo_unidades_internas').where({ id }).delete();
      res.json({ message: `«${uni.nombre}» ya existía en «${dep.nombre}»; se fusionaron` });
      return;
    }

    await db('catalogo_unidades_internas').where({ id }).update({ dependencia_id: destino });
    res.json({ message: `«${uni.nombre}» se movió a «${dep.nombre}»` });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Remitentes (personas, dentro de una sub-unidad) ═══════════════════════════

// GET /catalogos/remitentes  (lista GLOBAL, independiente)
export async function listarRemitentes(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('catalogo_remitentes')
      .where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/remitentes
export async function crearRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre del remitente es requerido', 422);
    const existente = await db('catalogo_remitentes').where({ nombre }).first();
    if (existente) {
      if (existente.activo === false) await db('catalogo_remitentes').where({ id: existente.id }).update({ activo: true });
      res.status(200).json({ data: { id: existente.id, nombre: existente.nombre }, yaExistia: true });
      return;
    }
    const [row] = await db('catalogo_remitentes')
      .insert({ nombre, creado_por_id: req.user!.id })
      .onConflict('nombre').merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row, yaExistia: false });
  } catch (err) { next(err); }
}

// PATCH /catalogos/remitentes/:id
export async function editarRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const nombre = normNombre(req.body?.nombre);
    if (!nombre) throw new AppError('El nombre del remitente es requerido', 422);
    const dup = await db('catalogo_remitentes').where({ nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe un remitente con ese nombre', 409);
    const [row] = await db('catalogo_remitentes').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    if (!row) throw new AppError('Remitente no encontrado', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/remitentes/:id
export async function eliminarRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_remitentes').where({ id }).delete();
    if (!deleted) throw new AppError('Remitente no encontrado', 404);
    res.json({ message: 'Remitente eliminado' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Correos (dos listas independientes) ═══════════════════════════
//
// ORIGEN  = cuentas desde las que las autoridades envían el oficio.
// DESTINO = cuentas institucionales que lo reciben.
// No dependen una de la otra: cada una se captura y se busca por separado.
// Se exponen con la llave `nombre` para reutilizar los componentes de catálogo.

const TIPOS_CORREO = ['ORIGEN', 'DESTINO'] as const;
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza un correo: sin espacios y en minúsculas. */
const normCorreo = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Lee y valida el tipo de la ruta (`origen` | `destino`). */
function tipoDeRuta(req: Request): 'ORIGEN' | 'DESTINO' {
  const tipo = String(req.params.tipo ?? '').toUpperCase();
  if (!TIPOS_CORREO.includes(tipo as any)) {
    throw new AppError('Tipo de catálogo de correos no válido', 400);
  }
  return tipo as 'ORIGEN' | 'DESTINO';
}

/**
 * Los correos de cada quien.
 *
 * El catálogo era único para toda la institución, así que la cuenta de la
 * ventanilla de Chetumal le aparecía a quien captura en Cancún. Ahora cada
 * persona ve las que ella ha usado; los renglones sin dueño son los que ya
 * existían antes del cambio y se dejan a la vista de todos, para no hacerle
 * desaparecer a nadie una cuenta que quizá esté usando.
 */
const míos = (q: any, userId: number) =>
  q.where((sub: any) => sub.where('usuario_id', userId).orWhereNull('usuario_id'));

// GET /catalogos/correos/:tipo
export async function listarCorreos(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await míos(
      db('catalogo_correos').where({ tipo: tipoDeRuta(req), activo: true }),
      req.user!.id,
    )
      // `heredado` distingue los que venían del catálogo viejo, sin dueño: se le
      // muestran a todos hasta que alguien los reclame, y conviene que se note.
      .select('id', 'correo as nombre', db.raw('usuario_id IS NULL AS heredado'))
      .orderBy('correo', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

/**
 * Guarda un correo en la lista de una persona, si no lo tenía ya.
 *
 * Se llama al registrar un oficio por correo: es el único momento en que se sabe
 * cuáles usa de verdad. Por eso no hace falta darlos de alta a mano.
 *
 * Nunca interrumpe el registro: si algo falla aquí, el oficio ya quedó guardado
 * y lo único que se pierde es la comodidad de encontrar el correo la próxima vez.
 */
export async function recordarCorreo(
  tipo: 'ORIGEN' | 'DESTINO', valor: unknown, usuarioId: number,
): Promise<void> {
  const correo = normCorreo(valor);
  if (!correo || !FORMATO_CORREO.test(correo)) return;
  try {
    const existente = await míos(db('catalogo_correos').where({ tipo, correo }), usuarioId).first();
    if (existente) {
      const cambios: Record<string, unknown> = {};
      if (existente.activo === false) cambios.activo = true;
      // Sin dueño y alguien lo usa: pasa a ser suyo. Es la mejor pista que hay de
      // a quién pertenece, y si otra persona usa el mismo después, se le creará
      // el suyo aparte —ya no lo encontrará como heredado—.
      if (existente.usuario_id === null) cambios.usuario_id = usuarioId;
      if (Object.keys(cambios).length) {
        await db('catalogo_correos').where({ id: existente.id }).update(cambios);
      }
      return;
    }
    await db('catalogo_correos').insert({ tipo, correo, usuario_id: usuarioId, creado_por_id: usuarioId });
  } catch { /* la lista es una comodidad, no parte del registro */ }
}

// POST /catalogos/correos/:tipo
export async function crearCorreo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const tipo   = tipoDeRuta(req);
    const correo = normCorreo(req.body?.nombre ?? req.body?.correo);
    if (!correo) throw new AppError('El correo es requerido', 422);
    if (!FORMATO_CORREO.test(correo)) throw new AppError('El correo no tiene un formato válido', 422);

    // Si ya estaba en SU lista (aunque dado de baja), se reactiva en lugar de
    // duplicarlo. Que otra persona tenga el mismo correo no estorba: cada quien
    // lleva el suyo.
    const existente = await míos(db('catalogo_correos').where({ tipo, correo }), req.user!.id).first();
    if (existente) {
      if (existente.activo === false) {
        await db('catalogo_correos').where({ id: existente.id }).update({ activo: true });
      }
      res.status(200).json({ data: { id: existente.id, nombre: existente.correo }, yaExistia: true });
      return;
    }

    const [row] = await db('catalogo_correos')
      .insert({ tipo, correo, usuario_id: req.user!.id, creado_por_id: req.user!.id })
      .returning(['id', 'correo as nombre']);
    res.status(201).json({ data: row, yaExistia: false });
  } catch (err) { next(err); }
}

/**
 * PATCH /catalogos/correos/:tipo/:id/es-mio
 *
 * Reclamar un correo heredado —de los que venían del catálogo viejo, sin dueño—.
 * Usarlo al registrar también lo reclama solo; esto es para el que ya no se va a
 * volver a teclear y aun así alguien quiere tener en su lista.
 */
export async function adoptarCorreo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const tipo = tipoDeRuta(req);
    const id   = parseInt(req.params.id, 10);
    const [row] = await db('catalogo_correos')
      .where({ id, tipo })
      .whereNull('usuario_id')
      .update({ usuario_id: req.user!.id })
      .returning(['id', 'correo as nombre']);
    if (!row) throw new AppError('Ese correo ya tiene dueño o no existe', 409);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// PATCH /catalogos/correos/:tipo/:id
export async function editarCorreo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const tipo   = tipoDeRuta(req);
    const id     = parseInt(req.params.id, 10);
    const correo = normCorreo(req.body?.nombre ?? req.body?.correo);
    if (!correo) throw new AppError('El correo es requerido', 422);
    if (!FORMATO_CORREO.test(correo)) throw new AppError('El correo no tiene un formato válido', 422);

    const dup = await míos(db('catalogo_correos').where({ tipo, correo }), req.user!.id)
      .whereNot({ id }).first();
    if (dup) throw new AppError('Ese correo ya está en tu lista', 409);

    // Solo sobre los propios: la lista es de cada quien y nadie edita la de otro.
    const [row] = await míos(db('catalogo_correos').where({ id, tipo }), req.user!.id)
      .update({ correo }).returning(['id', 'correo as nombre']);
    if (!row) throw new AppError('Correo no encontrado', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/correos/:tipo/:id
export async function eliminarCorreo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await exigirGestionCatalogos(req);
    const tipo = tipoDeRuta(req);
    const id   = parseInt(req.params.id, 10);
    const deleted = await míos(db('catalogo_correos').where({ id, tipo }), req.user!.id).delete();
    if (!deleted) throw new AppError('Correo no encontrado', 404);
    res.json({ message: 'Correo eliminado' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Buscador global ═══════════════════════════
//
// El problema que resuelve: alguien no encuentra «Juzgado Segundo» y lo da de
// alta otra vez, cuando en realidad ya existía colgado de otra dependencia o
// capturado como remitente. Este buscador recorre los cuatro catálogos a la vez
// y dice DÓNDE está cada coincidencia.

// GET /catalogos/buscar?q=
export async function buscarEnCatalogos(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3) {
      res.json({ data: [], mensaje: 'Escribe al menos 3 caracteres' });
      return;
    }
    // Sin acentos y en mayúsculas: «JURÍDICA» debe encontrar «JURIDICA».
    const patron = `%${q.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}%`;
    const SIN_ACENTOS = (col: string) => `translate(upper(${col}), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')`;
    const LIMITE = 40;

    const [dependencias, unidades, remitentes, correos] = await Promise.all([
      db('catalogo_dependencias')
        .where('activo', true)
        .whereRaw(`${SIN_ACENTOS('nombre')} LIKE ?`, [patron])
        .select('id', 'nombre').orderBy('nombre').limit(LIMITE),

      db('catalogo_unidades_internas as ui')
        .leftJoin('catalogo_dependencias as d', 'd.id', 'ui.dependencia_id')
        .where('ui.activo', true)
        .whereRaw(`${SIN_ACENTOS('ui.nombre')} LIKE ?`, [patron])
        .select('ui.id', 'ui.nombre', 'd.nombre as padre')
        .orderBy('ui.nombre').limit(LIMITE),

      db('catalogo_remitentes')
        .where('activo', true)
        .whereRaw(`${SIN_ACENTOS('nombre')} LIKE ?`, [patron])
        .select('id', 'nombre').orderBy('nombre').limit(LIMITE),

      db('catalogo_correos')
        .where('activo', true)
        .whereRaw(`${SIN_ACENTOS('correo')} LIKE ?`, [patron])
        .select('id', 'correo as nombre', 'tipo').orderBy('correo').limit(LIMITE),
    ]);

    const data = [
      ...dependencias.map((r: any) => ({
        tipo: 'DEPENDENCIA', id: r.id, nombre: r.nombre, ubicacion: 'Dependencia solicitante',
      })),
      ...unidades.map((r: any) => ({
        tipo: 'SUBUNIDAD', id: r.id, nombre: r.nombre,
        ubicacion: r.padre ? `Sub-unidad de ${r.padre}` : 'Sub-unidad sin dependencia',
      })),
      ...remitentes.map((r: any) => ({
        tipo: 'REMITENTE', id: r.id, nombre: r.nombre, ubicacion: 'Remitente (lista global)',
      })),
      ...correos.map((r: any) => ({
        tipo: 'CORREO', id: r.id, nombre: r.nombre,
        ubicacion: r.tipo === 'ORIGEN' ? 'Correo de quien envía' : 'Correo que recibe',
      })),
    ];

    res.json({ data });
  } catch (err) { next(err); }
}

// GET /catalogos/permisos — ¿este usuario puede depurar los catálogos?
export async function permisosCatalogos(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    res.json({ data: { puede_gestionar: await puedeGestionarCatalogos(req.user) } });
  } catch (err) { next(err); }
}
