/**
 * OCR Adapter: Google Cloud Vision
 * File: src/services/ocr/google-vision.adapter.ts
 *
 * Activar en producción:
 *   OCR_PROVIDER=google-vision
 *   GOOGLE_CLOUD_PROJECT_ID=tu-proyecto
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json
 *   # O bien:
 *   GOOGLE_VISION_API_KEY=tu-api-key
 *
 * Flujo:
 *  1. Convierte PDF a imágenes con pdftoppm
 *  2. Envía cada imagen a Vision API (DOCUMENT_TEXT_DETECTION)
 *  3. Concatena el texto con alta precisión
 *
 * Costo estimado: ~$1.50 USD por 1,000 páginas
 */

import { execFile }  from 'child_process';
import { promisify } from 'util';
import fs           from 'fs';
import os           from 'os';
import path         from 'path';
import { logger }   from '../../utils/logger';
import type { OcrAdapter, OcrResult } from './ocr.interface';

// Async: no bloquea el event loop (ver tesseract.adapter para el detalle).
const execFileAsync = promisify(execFile);

const MAX_PAGES = 4;
const DPI       = 200;
const PDFTOPPM_TIMEOUT_MS = 20_000;

export const googleVisionAdapter: OcrAdapter = {
  name: 'google-vision',

  async isAvailable(): Promise<boolean> {
    return !!(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_VISION_API_KEY
    );
  },

  async extractText(pdfBuffer: Buffer): Promise<OcrResult> {
    const startedAt = Date.now();
    const tmpDir    = os.tmpdir();
    const uid       = `gcv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpPdf    = path.join(tmpDir, `${uid}.pdf`);
    const tmpPrefix = path.join(tmpDir, uid);

    let fullText       = '';
    let pagesProcessed = 0;

    try {
      await fs.promises.writeFile(tmpPdf, pdfBuffer);

      // Convertir PDF → PNG (asíncrono, no bloquea el event loop)
      await execFileAsync(
        'pdftoppm',
        ['-r', String(DPI), '-png', '-l', String(MAX_PAGES), tmpPdf, tmpPrefix],
        { timeout: PDFTOPPM_TIMEOUT_MS },
      );

      const images = fs.readdirSync(tmpDir)
        .filter((f) => f.startsWith(path.basename(tmpPrefix)) && f.endsWith('.png'))
        .sort()
        .map((f) => path.join(tmpDir, f));

      // Llamar a Vision API por cada imagen
      for (const imgPath of images) {
        try {
          const imageContent = fs.readFileSync(imgPath).toString('base64');

          const apiKey = process.env.GOOGLE_VISION_API_KEY;
          const url    = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

          const response = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                image:    { content: imageContent },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                imageContext: { languageHints: ['es', 'es-MX'] },
              }],
            }),
          });

          if (!response.ok) {
            logger.warn({ status: response.status }, 'Google Vision API error');
            continue;
          }

          const data = await response.json() as any;
          const text = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
          if (text) fullText += text + '\n';
          pagesProcessed++;

        } finally {
          if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
      }

      const cleaned = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      return {
        text:        cleaned,
        confidence:  cleaned.length > 100 ? 95 : 50,
        pages:       pagesProcessed,
        provider:    'google-vision',
        duration_ms: Date.now() - startedAt,
      };

    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }
  },
};
