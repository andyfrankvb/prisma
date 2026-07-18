/**
 * PDF Compress Service
 * File: src/services/pdf-compress.service.ts
 *
 * Comprime PDFs con Ghostscript ANTES de guardarlos, para que los archivos
 * queden lo más livianos posible. Reglas de seguridad:
 *   · Solo actúa sobre PDFs (los Word se guardan tal cual).
 *   · Solo comprime a partir de un umbral (los ya livianos no se tocan).
 *   · Es asíncrono (execFile): NO bloquea el event loop.
 *   · Se queda con el archivo más chico → nunca agranda el original.
 *   · Degradación elegante: si Ghostscript no está o falla, devuelve el original
 *     y la subida continúa normal (nunca rompe la carga por comprimir).
 *
 * Configurable por entorno:
 *   PDF_COMPRESS_THRESHOLD_MB   (default 0.5)    → desde qué tamaño comprime
 *   PDF_COMPRESS_PRESET         (default /ebook) → /screen (+chico) /ebook /printer
 */

import { execFile }   from 'child_process';
import { promisify }  from 'util';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import { randomUUID } from 'crypto';
import { logger }     from '../utils/logger';

const execFileAsync = promisify(execFile);

const THRESHOLD_BYTES = Number(process.env.PDF_COMPRESS_THRESHOLD_MB ?? 0.5) * 1024 * 1024;
const GS_PRESET       = process.env.PDF_COMPRESS_PRESET ?? '/ebook';
const GS_TIMEOUT_MS   = 45_000;

// Se resuelve una sola vez y se cachea
let gsAvailable: boolean | null = null;

async function isGsAvailable(): Promise<boolean> {
  if (gsAvailable !== null) return gsAvailable;
  try {
    await execFileAsync('gs', ['--version'], { timeout: 3000 });
    gsAvailable = true;
  } catch {
    gsAvailable = false;
    logger.warn('Ghostscript (gs) no está instalado: los PDFs se guardarán sin comprimir');
  }
  return gsAvailable;
}

/**
 * Devuelve un buffer comprimido si el PDF vale la pena comprimir; de lo
 * contrario devuelve el buffer original intacto.
 */
export async function compressPdfIfHeavy(buffer: Buffer, mimetype: string): Promise<Buffer> {
  if (mimetype !== 'application/pdf')  return buffer;  // solo PDFs (no Word)
  if (buffer.length < THRESHOLD_BYTES) return buffer;  // ya es liviano
  if (!(await isGsAvailable()))        return buffer;  // sin gs → original

  const tmp     = os.tmpdir();
  const inPath  = path.join(tmp, `cmp_in_${randomUUID()}.pdf`);
  const outPath = path.join(tmp, `cmp_out_${randomUUID()}.pdf`);

  try {
    await fs.promises.writeFile(inPath, buffer);

    await execFileAsync('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${GS_PRESET}`,
      '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dSAFER',
      `-sOutputFile=${outPath}`,
      inPath,
    ], { timeout: GS_TIMEOUT_MS });

    const compressed = await fs.promises.readFile(outPath);

    // Solo usamos el comprimido si de verdad quedó más chico
    if (compressed.length > 0 && compressed.length < buffer.length) {
      const ahorroPct = Math.round((1 - compressed.length / buffer.length) * 100);
      logger.info(
        { antes: buffer.length, despues: compressed.length, ahorro_pct: ahorroPct, preset: GS_PRESET },
        'PDF comprimido antes de guardar',
      );
      return compressed;
    }

    return buffer; // no mejoró → dejamos el original
  } catch (err) {
    logger.warn({ err }, 'Compresión de PDF falló; se guarda el original');
    return buffer;
  } finally {
    await fs.promises.unlink(inPath).catch(() => {});
    await fs.promises.unlink(outPath).catch(() => {});
  }
}
