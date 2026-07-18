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
};

function safeExtension(mimetype: string): string {
  return ALLOWED_EXTENSIONS[mimetype] ?? 'bin';
}

export const storage = {
  async save(file: Express.Multer.File, folder: string): Promise<string> {
    // Validate MIME type
    if (!ALLOWED_EXTENSIONS[file.mimetype]) {
      throw new Error(`Tipo de archivo no permitido: ${file.mimetype}`);
    }

    const dir = path.join(BASE, folder);
    fs.mkdirSync(dir, { recursive: true });

    // UUID + validated extension — never use originalname
    const ext      = safeExtension(file.mimetype);
    const filename = `${randomUUID()}.${ext}`;
    const dest     = path.join(dir, filename);

    // Security: ensure dest stays inside BASE
    const resolved = path.resolve(dest);
    if (!resolved.startsWith(path.resolve(BASE))) {
      throw new Error('Ruta de destino inválida');
    }

    // Comprime el PDF si vale la pena (no-op para Word o archivos ya livianos).
    // Aplica a los 3 módulos porque todos guardan a través de este método.
    const buffer = await compressPdfIfHeavy(file.buffer, file.mimetype);

    await fs.promises.writeFile(dest, buffer);

    return `/${folder}/${filename}`;
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
