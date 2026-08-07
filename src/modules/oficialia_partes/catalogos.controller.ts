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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
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
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_remitentes').where({ id }).delete();
    if (!deleted) throw new AppError('Remitente no encontrado', 404);
    res.json({ message: 'Remitente eliminado' });
  } catch (err) { next(err); }
}
