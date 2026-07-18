/**
 * OCR Service — procesa PDFs en background y guarda en DB
 * File: src/services/ocr.service.ts
 *
 * Usa el OCR Engine (Tesseract local / Google Vision en producción).
 * Se llama de forma asíncrona después de guardar el oficio.
 */

import { db }                 from '../db';
import { extractTextFromPdf } from './ocr/ocr.engine';
import { logger }             from '../utils/logger';

const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH
  ?? require('path').join(process.cwd(), 'storage');

export async function processOcr(oficio_id: number, filePath: string): Promise<void> {
  const startedAt = Date.now();
  logger.info({ oficio_id }, 'OCR background processing started');

  try {
    const fs   = require('fs');
    const path = require('path');

    const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const absolute = path.join(STORAGE_BASE, relative);

    if (!fs.existsSync(absolute)) {
      logger.warn({ oficio_id, filePath }, 'OCR: file not found on disk');
      return;
    }

    const buffer = fs.readFileSync(absolute);
    const result = await extractTextFromPdf(buffer);

    await db('oficios').where({ id: oficio_id }).update({
      texto_ocr:     result.text || null,
      ocr_procesado: true,
      ocr_fecha:     new Date(),
      ocr_metodo:    result.provider,
    });

    logger.info({
      oficio_id,
      provider:    result.provider,
      chars:       result.text.length,
      duration_ms: Date.now() - startedAt,
    }, 'OCR background processing completed');

  } catch (err: any) {
    logger.error({ err, oficio_id }, 'OCR background processing failed');
    await db('oficios').where({ id: oficio_id }).update({
      ocr_procesado: true,
      ocr_fecha:     new Date(),
      ocr_metodo:    'error',
    }).catch(() => {});
  }
}
