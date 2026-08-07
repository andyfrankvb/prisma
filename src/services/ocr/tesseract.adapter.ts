/**
 * OCR Adapter: Tesseract (local)
 * File: src/services/ocr/tesseract.adapter.ts
 *
 * Flujo:
 *  1. pdftoppm convierte cada página del PDF a imagen PNG (300 DPI)
 *  2. tesseract.js procesa cada imagen con modelo español
 *  3. Limpia y concatena el texto
 *
 * Requiere en el contenedor:
 *   apk add poppler-utils tesseract-ocr tesseract-ocr-data-spa
 */

import { execFile }  from 'child_process';
import { promisify } from 'util';
import fs            from 'fs';
import os            from 'os';
import path          from 'path';
import { logger }    from '../../utils/logger';
import type { OcrAdapter, OcrResult } from './ocr.interface';

// execFile asíncrono: NO bloquea el event loop (a diferencia de execSync),
// así el resto de las peticiones siguen respondiendo durante el OCR y los
// timeouts a nivel de controlador pueden dispararse.
const execFileAsync = promisify(execFile);

// Máximo de páginas a procesar (las primeras N son suficientes para un oficio)
const MAX_PAGES = 3;
// DPI para la conversión — 200 es suficiente para OCR de documentos A4 y más rápido
const DPI = 200;
// Timeout de pdftoppm: por debajo del límite del gateway (60s) para no provocar 504
const PDFTOPPM_TIMEOUT_MS = 20_000;

export const tesseractAdapter: OcrAdapter = {
  name: 'tesseract',

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('pdftoppm', ['-v'], { timeout: 3000 });
      await execFileAsync('tesseract', ['--version'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  },

  async extractText(pdfBuffer: Buffer, maxPages?: number): Promise<OcrResult> {
    const startedAt = Date.now();
    const tmpDir    = os.tmpdir();
    const uid       = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpPdf    = path.join(tmpDir, `${uid}.pdf`);
    const tmpPrefix = path.join(tmpDir, uid);

    let pagesProcessed = 0;
    let fullText       = '';

    try {
      // 1. Escribir PDF en disco temporal
      await fs.promises.writeFile(tmpPdf, pdfBuffer);

      // 2. Convertir PDF → imágenes PNG con pdftoppm (asíncrono, no bloquea)
      await execFileAsync(
        'pdftoppm',
        ['-r', String(DPI), '-png', '-l', String(maxPages ?? MAX_PAGES), tmpPdf, tmpPrefix],
        { timeout: PDFTOPPM_TIMEOUT_MS },
      );

      // 3. Recopilar imágenes generadas (orden: -1, -2, -3…)
      const images = fs.readdirSync(tmpDir)
        .filter((f) => f.startsWith(path.basename(tmpPrefix)) && f.endsWith('.png'))
        .sort()
        .map((f) => path.join(tmpDir, f));

      if (images.length === 0) {
        throw new Error('pdftoppm no generó imágenes');
      }

      // 4. OCR con tesseract.js en cada imagen
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('spa', 1, {
        logger: () => {},  // silenciar logs de progreso
        errorHandler: (e: any) => logger.warn({ err: e }, 'tesseract worker error'),
      });

      // Configurar para documentos de texto — modo 6 no requiere osd.traineddata
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any,  // Assume a single uniform block of text
      });

      for (const imgPath of images) {
        try {
          const { data } = await worker.recognize(imgPath);
          if (data.text?.trim()) {
            fullText += data.text + '\n';
          }
          pagesProcessed++;
        } finally {
          fs.unlinkSync(imgPath);
        }
      }

      await worker.terminate();

      // 5. Limpiar texto
      const cleaned = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      return {
        text:        cleaned,
        confidence:  cleaned.length > 100 ? 85 : cleaned.length > 30 ? 60 : 20,
        pages:       pagesProcessed,
        provider:    'tesseract',
        duration_ms: Date.now() - startedAt,
      };

    } finally {
      // Limpiar archivos temporales
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }
  },
};
