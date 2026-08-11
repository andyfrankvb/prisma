/**
 * Controller: Recursos públicos
 * File: src/modules/recursos/recursos.controller.ts
 *
 * Dos apartados que se muestran en la pantalla de inicio de sesión. Cada uno es
 * genérico y lo controla el SUPERADMIN:
 *   · habilitado → si no lo está, no aparece en el login
 *   · titulo     → el encabezado del apartado
 *   · tipo       → 'enlace' (p. ej. YouTube) o 'archivo' (PDF cargado)
 *
 * La lectura es PÚBLICA (el login aún no tiene sesión); escribir exige SUPERADMIN.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs   from 'fs';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { storage }  from '../../services/storage.service';

const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');

const SLOTS = [1, 2] as const;
type Slot = (typeof SLOTS)[number];

const claves = (n: Slot) => [
  `recurso${n}_habilitado`, `recurso${n}_titulo`, `recurso${n}_tipo`,
  `recurso${n}_url`, `recurso${n}_archivo`,
];

const POR_DEFECTO: Record<string, string> = {
  recurso1_habilitado: 'false', recurso1_titulo: 'Video demostrativo de PRISMA',
  recurso1_tipo: 'enlace', recurso1_url: '', recurso1_archivo: '',
  recurso2_habilitado: 'false', recurso2_titulo: 'Manual de funcionamiento de PRISMA',
  recurso2_tipo: 'archivo', recurso2_url: '', recurso2_archivo: '',
};

async function leerConfig(): Promise<Record<string, string>> {
  const todas = [...claves(1), ...claves(2)];
  const rows = await db('configuracion_sistema').whereIn('clave', todas).select('clave', 'valor');
  const map: Record<string, string> = { ...POR_DEFECTO };
  for (const r of rows as any[]) map[r.clave] = r.valor ?? '';
  return map;
}

async function guardar(pares: [string, string][], usuarioId: number) {
  await db.transaction(async (trx) => {
    for (const [clave, valor] of pares) {
      await trx('configuracion_sistema')
        .insert({ clave, valor, actualizado_en: new Date(), actualizado_por_id: usuarioId })
        .onConflict('clave')
        .merge({ valor, actualizado_en: new Date(), actualizado_por_id: usuarioId });
    }
  });
}

/** Solo enlaces http(s); evita esquemas peligrosos como javascript: */
function urlValida(u: string): boolean {
  if (!u) return true;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch { return false; }
}

/** Un recurso se muestra solo si está habilitado Y tiene contenido según su tipo. */
function armar(c: Record<string, string>, n: Slot) {
  const tipo = c[`recurso${n}_tipo`] === 'archivo' ? 'archivo' : 'enlace';
  const url  = c[`recurso${n}_url`] ?? '';
  const arch = c[`recurso${n}_archivo`] ?? '';
  const hayContenido = tipo === 'enlace' ? !!url : !!arch;
  return {
    titulo:     c[`recurso${n}_titulo`] ?? '',
    tipo,
    habilitado: c[`recurso${n}_habilitado`] === 'true',
    url,
    tieneArchivo: !!arch,
    visible:    c[`recurso${n}_habilitado`] === 'true' && hayContenido,
  };
}

// ── GET /recursos  (PÚBLICO — lo consume la pantalla de login) ──
export async function obtenerRecursos(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const c = await leerConfig();
    const r1 = armar(c, 1);
    const r2 = armar(c, 2);
    // Vista pública: solo lo visible y sin exponer configuración interna.
    const publico = [
      { slot: 1, ...r1 },
      { slot: 2, ...r2 },
    ].filter((r) => r.visible)
     .map((r) => ({ slot: r.slot, titulo: r.titulo, tipo: r.tipo, url: r.url }));

    res.json({ data: publico });
  } catch (err) { next(err); }
}

// ── GET /recursos/:slot/archivo  (PÚBLICO — abre el PDF) ──
export async function descargarArchivo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const slot = Number(req.params.slot) as Slot;
    if (!SLOTS.includes(slot)) throw new AppError('Recurso inválido', 404);

    const c = await leerConfig();
    const r = armar(c, slot);
    if (!r.visible || r.tipo !== 'archivo') throw new AppError('Recurso no disponible', 404);

    const rel = c[`recurso${slot}_archivo`];
    const absolute = path.join(STORAGE_BASE, rel.startsWith('/') ? rel.slice(1) : rel);
    // Salvaguarda contra path traversal: debe quedar dentro del almacén.
    if (!path.resolve(absolute).startsWith(path.resolve(STORAGE_BASE))) {
      throw new AppError('Ruta inválida', 400);
    }
    if (!fs.existsSync(absolute)) throw new AppError('El archivo no está disponible', 404);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"');
    fs.createReadStream(absolute).pipe(res);
  } catch (err) { next(err); }
}

// ── GET /recursos/admin  (SUPERADMIN — configuración completa) ──
export async function obtenerConfig(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const c = await leerConfig();
    res.json({ data: { recurso1: armar(c, 1), recurso2: armar(c, 2) } });
  } catch (err) { next(err); }
}

// ── PUT /recursos/:slot  (SUPERADMIN) — habilitado, título, tipo y enlace ──
export async function actualizarRecurso(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const slot = Number(req.params.slot) as Slot;
    if (!SLOTS.includes(slot)) throw new AppError('Recurso inválido', 404);

    const titulo     = String(req.body?.titulo ?? '').trim();
    const tipo       = String(req.body?.tipo ?? '').trim();
    const url        = String(req.body?.url ?? '').trim();
    const habilitado = req.body?.habilitado === true || req.body?.habilitado === 'true';

    if (!titulo)                            throw new AppError('El título no puede quedar vacío', 422);
    if (tipo !== 'enlace' && tipo !== 'archivo') throw new AppError('Tipo inválido (enlace o archivo)', 422);
    if (tipo === 'enlace' && !urlValida(url))    throw new AppError('El enlace no es una URL válida (http/https)', 422);

    await guardar([
      [`recurso${slot}_habilitado`, habilitado ? 'true' : 'false'],
      [`recurso${slot}_titulo`,     titulo],
      [`recurso${slot}_tipo`,       tipo],
      [`recurso${slot}_url`,        url],
    ], req.user!.id);

    res.json({ message: 'Recurso actualizado' });
  } catch (err) { next(err); }
}

// ── POST /recursos/:slot/archivo  (SUPERADMIN) — sube/reemplaza el PDF ──
export async function subirArchivo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const slot = Number(req.params.slot) as Slot;
    if (!SLOTS.includes(slot)) throw new AppError('Recurso inválido', 404);
    if (!req.file) throw new AppError('Selecciona el archivo PDF', 422);
    if (req.file.mimetype !== 'application/pdf') throw new AppError('El archivo debe ser un PDF', 422);

    const url = await storage.save(req.file, 'recursos', { filename: `recurso${slot}_${Date.now()}` });
    await guardar([[`recurso${slot}_archivo`, url]], req.user!.id);

    res.json({ message: 'Archivo cargado', data: { archivo: url } });
  } catch (err) { next(err); }
}

// ── DELETE /recursos/:slot/archivo  (SUPERADMIN) — quita el PDF ──
export async function quitarArchivo(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const slot = Number(req.params.slot) as Slot;
    if (!SLOTS.includes(slot)) throw new AppError('Recurso inválido', 404);
    await guardar([[`recurso${slot}_archivo`, '']], req.user!.id);
    res.json({ message: 'Archivo retirado' });
  } catch (err) { next(err); }
}
