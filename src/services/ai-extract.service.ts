/**
 * AI Extract Service
 * File: src/services/ai-extract.service.ts
 *
 * Extrae campos estructurados de un oficio escaneado:
 *  1. OCR Engine (Tesseract local / Google Vision en producción)
 *  2. Extractor de campos con patrones inteligentes
 *  3. Opcional: OpenAI GPT para mayor precisión
 */

import { extractTextFromPdf } from './ocr/ocr.engine';
import { logger }             from '../utils/logger';

export interface ExtractedFields {
  remitente?:            string;
  dependencia_origen?:   string;
  sub_unidad?:           string;
  numero_oficio_origen?: string;
  fecha_oficio?:         string | null;
  dirigido_a?:           string;
  descripcion?:          string;
  tiene_termino?:        boolean;
  fecha_vencimiento?:    string | null;
  texto_completo?:     string;
  confianza:           'alta' | 'media' | 'baja';
  ocr_provider?:       string;
}

// ── Extractor de campos con patrones ─────────────────────────

function extractWithPatterns(text: string): Omit<ExtractedFields, 'texto_completo' | 'ocr_provider'> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const upper = text.toUpperCase();

  // ── Remitente ─────────────────────────────────────────────
  let remitente: string | undefined;

  // Buscar después de ATENTAMENTE (patrón más común en oficios mexicanos)
  const atentIdx = upper.indexOf('ATENTAMENTE');
  if (atentIdx !== -1) {
    const afterAten = text.slice(atentIdx + 11).trim().split('\n');
    for (const line of afterAten.slice(0, 6)) {
      const clean = line.trim();
      // Nombre: entre 5 y 80 chars, contiene mayúsculas, no es solo puntuación
      if (clean.length >= 5 && clean.length <= 80 && /[A-ZÁÉÍÓÚÑ]{2,}/.test(clean) && !/^[-_=*]+$/.test(clean)) {
        remitente = clean;
        break;
      }
    }
  }

  // Fallback: buscar patrones de nombre con título
  if (!remitente) {
    const titleMatch = text.match(
      /(?:C\.|Lic\.|Ing\.|Dr\.|Dra\.|Mtra?\.|Mtro\.|Arq\.)\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s\.]{4,60})/,
    );
    if (titleMatch) remitente = titleMatch[0].trim();
  }

  // Fallback: buscar "REMITENTE:" o "DE:"
  if (!remitente) {
    const remMatch = text.match(/(?:remitente|de)\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s\.]{4,60})/i);
    if (remMatch) remitente = remMatch[1].trim();
  }

  // ── Dependencia de origen ─────────────────────────────────
  let dependencia: string | undefined;

  // Buscar en membrete (primeras 10 líneas)
  const membreteKeywords = /secretar[ií]a|direcci[oó]n|coordinaci[oó]n|subsecretar[ií]a|instituto|comisi[oó]n|gobierno|municipio|delegaci[oó]n|procuradur[ií]a|fiscal[ií]a|tribunal/i;

  for (const line of lines.slice(0, 12)) {
    if (line.length >= 8 && line.length <= 120 && membreteKeywords.test(line)) {
      dependencia = line;
      break;
    }
  }

  // Fallback: buscar patrón "de la Secretaría de..."
  if (!dependencia) {
    const depMatch = text.match(
      /((?:Secretar[ií]a|Direcci[oó]n|Coordinaci[oó]n|Subsecretar[ií]a|Instituto|Comisi[oó]n|Gobierno|Municipio|Procuradur[ií]a)\s+(?:de\s+(?:la\s+|el\s+|los\s+|las\s+)?)?[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,80})/,
    );
    if (depMatch) dependencia = depMatch[1].trim().slice(0, 100);
  }

  // ── Dirigido a (destinatario) ─────────────────────────────
  // En los oficios el destinatario es el bloque de texto que va JUSTO ANTES de
  // "PRESENTE / PRESENTES" (a veces con letras espaciadas por el OCR). Puede ser
  // una persona ("MTRA. … PRESENTE") o un grupo ("PERSONAS TITULARES … PRESENTES").
  let dirigido_a: string | undefined;

  const presenteBloque = text.match(
    /((?:[^\n]{2,}\n){0,5}[^\n]{2,})\s*\n\s*P\s*R\s*E\s*S\s*E\s*N\s*T\s*E\s*S?\b/i,
  );
  if (presenteBloque) {
    dirigido_a = presenteBloque[1]
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 250);
  }

  // Secundario: "DIRIGIDO A:", "PARA:", "DESTINATARIO:"
  if (!dirigido_a) {
    const dirMatch = text.match(/(?:dirigido a|destinatario|para)\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s\.]{4,80})/i);
    if (dirMatch) dirigido_a = dirMatch[1].trim();
  }

  // ── Asunto / descripción ──────────────────────────────────
  let descripcion: string | undefined;

  // Buscar "ASUNTO:", "ASUNTO.-", "REF:", "REFERENCIA:"
  const asuntoMatch = text.match(
    /(?:asunto|objeto|ref(?:erencia)?|motivo)\s*[:\.\-]\s*(.{15,400}?)(?:\n|$)/i,
  );
  if (asuntoMatch) {
    descripcion = asuntoMatch[1].trim().replace(/\s+/g, ' ').slice(0, 400);
  }

  // Fallback: primer párrafo sustancial (no encabezado)
  if (!descripcion) {
    for (const line of lines) {
      if (
        line.length >= 40 && line.length <= 400 &&
        !/^[A-Z\s\d\-\/]+$/.test(line) &&  // no es solo mayúsculas (encabezado)
        !/^\d/.test(line)                    // no empieza con número
      ) {
        descripcion = line.slice(0, 300);
        break;
      }
    }
  }

  // ── Fecha de vencimiento / término ───────────────────────
  let tiene_termino  = false;
  let fecha_vencimiento: string | null = null;

  const terminoKeywords = /plazo|t[eé]rmino|vencimiento|fecha l[ií]mite|a m[aá]s tardar|dentro de\s+\d+|días h[aá]biles|días naturales|improrrogable/i;

  if (terminoKeywords.test(text)) {
    tiene_termino = true;

    const meses: Record<string, string> = {
      enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
      julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
    };

    // DD de mes de YYYY
    const fechaLarga = text.match(
      /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i,
    );
    if (fechaLarga) {
      const mes = meses[fechaLarga[2].toLowerCase()];
      if (mes) fecha_vencimiento = `${fechaLarga[3]}-${mes}-${fechaLarga[1].padStart(2,'0')}`;
    }

    // DD/MM/YYYY o DD-MM-YYYY
    if (!fecha_vencimiento) {
      const fechaCorta = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (fechaCorta) {
        fecha_vencimiento = `${fechaCorta[3]}-${fechaCorta[2].padStart(2,'0')}-${fechaCorta[1].padStart(2,'0')}`;
      }
    }
  }

  // ── Número de oficio de origen ("Oficio Número: ...") ────
  let numero_oficio_origen: string | undefined;
  const numMatch = text.match(/oficio\s*(?:n[uú]mero|no\.?|n[uú]m\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\._]{3,60})/i);
  if (numMatch) numero_oficio_origen = numMatch[1].trim().replace(/[.,;]+$/, '');

  // ── Fecha del oficio (fecha impresa en el documento) ─────
  const MESES: Record<string, string> = {
    enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
    julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
  };
  let fecha_oficio: string | null = null;
  const fechaDoc = text.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})/i);
  if (fechaDoc) {
    const mes = MESES[fechaDoc[2].toLowerCase()];
    if (mes) fecha_oficio = `${fechaDoc[3]}-${mes}-${fechaDoc[1].padStart(2, '0')}`;
  }

  // ── Sub-unidad / oficina responsable ─────────────────────
  let sub_unidad: string | undefined;
  const subMatch = text.match(/oficina\s+responsable\s*[:\-]?\s*(.{4,120}?)(?:\n|$)/i);
  if (subMatch) sub_unidad = subMatch[1].trim().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');

  // ── Confianza ─────────────────────────────────────────────
  const found = [remitente, dependencia, descripcion].filter(Boolean).length;
  const confianza: 'alta' | 'media' | 'baja' =
    found === 3 ? 'alta' : found >= 1 ? 'media' : 'baja';

  return {
    remitente, dependencia_origen: dependencia, sub_unidad, numero_oficio_origen, fecha_oficio,
    dirigido_a, descripcion, tiene_termino, fecha_vencimiento, confianza,
  };
}

// ── Extractor con OpenAI (opcional, mayor precisión) ─────────

async function extractWithOpenAI(text: string): Promise<Omit<ExtractedFields, 'texto_completo' | 'ocr_provider'> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 500, temperature: 0,
        messages: [
          {
            role: 'system',
            content: `Eres un asistente especializado en oficios gubernamentales mexicanos.
Extrae estos campos del texto OCR y responde SOLO con JSON válido:
{
  "remitente": "nombre completo de quien firma",
  "dependencia_origen": "nombre de la institución que envía",
  "dirigido_a": "nombre de la persona a quien va dirigido el oficio (destinatario)",
  "descripcion": "resumen del asunto en máximo 200 caracteres",
  "tiene_termino": true/false,
  "fecha_vencimiento": "YYYY-MM-DD o null",
  "confianza": "alta/media/baja"
}`,
          },
          { role: 'user', content: `Texto OCR del oficio:\n\n${text.slice(0, 4000)}` },
        ],
      }),
    });

    if (!response.ok) return null;
    const data    = await response.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';
    return JSON.parse(content.replace(/```json|```/g, '').trim());
  } catch (err: any) {
    logger.warn({ err: err.message }, 'OpenAI extraction failed');
    return null;
  }
}

// ── Función principal ─────────────────────────────────────────

export async function extractFieldsFromPdf(buffer: Buffer, maxPages?: number): Promise<ExtractedFields> {
  // 1. OCR — siempre Tesseract en local, Google Vision en producción
  const ocrResult = await extractTextFromPdf(buffer, maxPages);

  if (!ocrResult.text || ocrResult.text.length < 30) {
    logger.warn({ chars: ocrResult.text.length }, 'OCR returned insufficient text');
    return {
      confianza:    'baja',
      texto_completo: ocrResult.text,
      ocr_provider: ocrResult.provider,
    };
  }

  // 2. Extraer campos — OpenAI si está disponible, patrones si no
  const fields = (await extractWithOpenAI(ocrResult.text)) ?? extractWithPatterns(ocrResult.text);

  return {
    ...fields,
    texto_completo: ocrResult.text,
    ocr_provider:   ocrResult.provider,
  };
}
