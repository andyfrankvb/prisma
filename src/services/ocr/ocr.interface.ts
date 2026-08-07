/**
 * OCR Interface — contrato que todos los adaptadores deben cumplir
 * File: src/services/ocr/ocr.interface.ts
 */

export interface OcrResult {
  text:       string;       // Texto extraído completo
  confidence: number;       // 0-100
  pages:      number;       // Páginas procesadas
  provider:   string;       // 'tesseract' | 'google-vision' | 'mock'
  duration_ms: number;      // Tiempo de procesamiento
}

export interface OcrAdapter {
  name:      string;
  isAvailable(): Promise<boolean>;
  extractText(pdfBuffer: Buffer, maxPages?: number): Promise<OcrResult>;
}
