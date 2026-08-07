/**
 * OCR Engine — selecciona el adaptador según configuración
 * File: src/services/ocr/ocr.engine.ts
 *
 * Configuración:
 *   OCR_PROVIDER=tesseract      → local (default en desarrollo)
 *   OCR_PROVIDER=google-vision  → Google Cloud Vision (producción)
 *
 * Para cambiar a producción solo se necesita:
 *   1. Agregar OCR_PROVIDER=google-vision en infra/.env
 *   2. Agregar GOOGLE_VISION_API_KEY=... en infra/.env
 *   3. Reiniciar el contenedor
 */

import { logger }               from '../../utils/logger';
import { tesseractAdapter }     from './tesseract.adapter';
import { googleVisionAdapter }  from './google-vision.adapter';
import type { OcrAdapter, OcrResult } from './ocr.interface';

// Registro de adaptadores disponibles
const ADAPTERS: Record<string, OcrAdapter> = {
  'tesseract':    tesseractAdapter,
  'google-vision': googleVisionAdapter,
};

// Seleccionar adaptador según variable de entorno
function getAdapter(): OcrAdapter {
  const provider = process.env.OCR_PROVIDER ?? 'tesseract';
  const adapter  = ADAPTERS[provider];

  if (!adapter) {
    logger.warn({ provider }, `OCR provider desconocido, usando tesseract`);
    return tesseractAdapter;
  }

  return adapter;
}

// ── API pública ───────────────────────────────────────────────

/**
 * Extrae texto de un PDF escaneado.
 * Usa el adaptador configurado en OCR_PROVIDER.
 */
export async function extractTextFromPdf(pdfBuffer: Buffer, maxPages?: number): Promise<OcrResult> {
  const adapter = getAdapter();

  logger.info({ provider: adapter.name }, 'OCR extraction started');

  const available = await adapter.isAvailable();
  if (!available) {
    logger.error({ provider: adapter.name }, 'OCR adapter not available — check dependencies');
    return {
      text:        '',
      confidence:  0,
      pages:       0,
      provider:    adapter.name,
      duration_ms: 0,
    };
  }

  const result = await adapter.extractText(pdfBuffer, maxPages);

  logger.info({
    provider:    result.provider,
    pages:       result.pages,
    chars:       result.text.length,
    confidence:  result.confidence,
    duration_ms: result.duration_ms,
  }, 'OCR extraction completed');

  return result;
}

export type { OcrResult };
