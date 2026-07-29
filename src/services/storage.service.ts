/**
 * Storage service — local filesystem
 * File: src/services/storage.service.ts
 *
 * Genera nombres de archivo seguros: UUID + extensión validada.
 * Nunca usa el nombre original del cliente para evitar path traversal
 * y nombres predecibles.
 */

import fs   from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { compressPdfIfHeavy } from './pdf-compress.service';

const BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');

/** Extensiones permitidas por MIME type */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  'application/pdf':                                                          'pdf',
  'application/msword':                                                       'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg':                                                              'jpg',
  'image/png':                                                               'png',
};

function safeExtension(mimetype: string): string {
  return ALLOWED_EXTENSIONS[mimetype] ?? 'bin';
}

export interface SaveResult {
  /** Ruta relativa guardada (p. ej. /oficios/originales/uuid.pdf) */
  url: string;
  /** Tamaño en bytes del archivo tal como llegó */
  originalSize: number;
  /** Tamaño en bytes de lo que quedó guardado (comprimido si aplicó) */
  finalSize: number;
  /** true si la compresión dejó el archivo más chico */
  compressed: boolean;
}

export interface SaveOptions {
  /**
   * Comprime el PDF antes de guardarlo. Por defecto FALSE: se guarda el original
   * tal cual para no perder calidad. Solo se activa en la ingesta del Oficial de
   * Partes (oficios/originales), que son escaneos de referencia; el resto de
   * documentos (proyectos, firmados, avances, adjuntos) se guardan intactos.
   */
  compress?: boolean;
  /**
   * Nombre base del archivo (sin extensión). Se sanea antes de usarse. Si se omite
   * se usa un UUID. Útil para nombres trazables tipo `${oficioId}_${tipo}_${ts}`.
   */
  filename?: string;
}

/** Sanea un nombre base: solo alfanuméricos, guion y guion bajo (evita path traversal). */
function safeBaseName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9_-]/g, '');
  return clean.length > 0 ? clean.slice(0, 120) : randomUUID();
}

export const storage = {
  /**
   * Guarda el archivo y devuelve la ruta + los tamaños antes/después de guardar.
   * Solo comprime si `opts.compress` es true.
   */
  async saveWithInfo(
    file: Express.Multer.File,
    folder: string,
    opts: SaveOptions = {},
  ): Promise<SaveResult> {
    // Validate MIME type
    if (!ALLOWED_EXTENSIONS[file.mimetype]) {
      throw new Error(`Tipo de archivo no permitido: ${file.mimetype}`);
    }

    const dir = path.join(BASE, folder);
    fs.mkdirSync(dir, { recursive: true });

    // Nombre base seguro (UUID por defecto, o el provisto ya saneado) + extensión validada.
    // Nunca se usa el originalname del cliente (evita path traversal).
    const ext      = safeExtension(file.mimetype);
    const base     = opts.filename ? safeBaseName(opts.filename) : randomUUID();
    const filename = `${base}.${ext}`;
    const dest     = path.join(dir, filename);

    // Security: ensure dest stays inside BASE
    const resolved = path.resolve(dest);
    if (!resolved.startsWith(path.resolve(BASE))) {
      throw new Error('Ruta de destino inválida');
    }

    // La compresión es opt-in: solo se aplica cuando el llamador lo pide
    // (ingesta del Oficial de Partes). En cualquier otro caso se guarda el
    // original sin tocar la calidad.
    const originalSize = file.buffer.length;
    const buffer       = opts.compress
      ? await compressPdfIfHeavy(file.buffer, file.mimetype)
      : file.buffer;
    const finalSize    = buffer.length;

    await fs.promises.writeFile(dest, buffer);

    return {
      url:        `/${folder}/${filename}`,
      originalSize,
      finalSize,
      compressed: finalSize < originalSize,
    };
  },

  /** Compat: guarda el archivo y devuelve solo la ruta relativa. */
  async save(file: Express.Multer.File, folder: string, opts: SaveOptions = {}): Promise<string> {
    return (await this.saveWithInfo(file, folder, opts)).url;
  },

  /** Delete a stored file by its relative path (e.g. /oficios/originales/uuid.pdf) */
  delete(filePath: string): void {
    if (!filePath) return;
    const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const absolute = path.resolve(path.join(BASE, relative));

    if (!absolute.startsWith(path.resolve(BASE))) return; // path traversal guard

    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  },
};

/**
 * Arma la info de compresión para la respuesta de una subida.
 * Devuelve `null` cuando el archivo no se comprimió (Word, ya liviano, etc.),
 * así el frontend solo muestra el aviso cuando de verdad hubo optimización.
 */
export function compresionInfo(r: SaveResult): {
  original_bytes: number;
  final_bytes:    number;
  ahorro_pct:     number;
} | null {
  if (!r.compressed) return null;
  return {
    original_bytes: r.originalSize,
    final_bytes:    r.finalSize,
    ahorro_pct:     Math.round((1 - r.finalSize / r.originalSize) * 100),
  };
}
