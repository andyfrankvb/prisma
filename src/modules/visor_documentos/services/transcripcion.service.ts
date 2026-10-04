/**
 * Service: Transcripción de foja (IA/humana)
 * File: src/modules/visor_documentos/services/transcripcion.service.ts
 *
 * Puerto de fojas-transcripcion.service.ts (VISAR), con una diferencia
 * deliberada: VISAR dejaba la generación IA como un endpoint sin motor real
 * conectado. PRISMA ya trae su propio motor de OCR reutilizable
 * (src/services/ocr/ocr.engine.ts, con adaptadores tesseract.js/Google
 * Vision seleccionables por OCR_PROVIDER) — se reutiliza aquí en vez de
 * inventar un texto de relleno, siguiendo la regla del proyecto de no
 * duplicar infraestructura ya existente.
 *
 * `extractTextFromPdf` espera un PDF. Cuando la imagen de la foja ya es un
 * PDF (caso normal: fojas migradas de SID/VISAR) se le pasan sus bytes tal
 * cual — nada que convertir. Solo cuando la imagen es un raster (jpg/png/
 * tiff, p. ej. las fojas de prueba sembradas por seed-visor-test.mjs) se
 * embebe primero en un PDF de una sola página con `pdf-lib`.
 */
import fs from 'fs';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import { extractTextFromPdf } from '../../../services/ocr/ocr.engine';
import { resolverImagenFoja } from './imagen.service';
import type { VisorTranscripcion } from '../visor.types';

/**
 * Resuelve de qué campaña se está hablando.
 *
 * Sin versión explícita se usa la misma que serviría el visor —la dictaminada
 * por Jurídico, o la más reciente— para que transcribir y leer caigan siempre
 * sobre el documento que la persona tiene enfrente.
 */
async function versionEfectiva(fojaId: number, version?: string): Promise<string> {
  if (version) return version;
  const { version: resuelta } = await resolverImagenFoja(fojaId);
  return resuelta;
}

export async function obtenerTranscripcion(
  fojaId: number,
  version?: string,
): Promise<VisorTranscripcion | null> {
  const clave = await versionEfectiva(fojaId, version);
  const transcripcion = await db('visor_transcripciones_foja')
    .where({ foja_id: fojaId, version: clave })
    .first();
  return transcripcion ?? null;
}

async function imagenAPdfBuffer(rutaAbsoluta: string): Promise<Buffer> {
  const pngBuffer = await sharp(rutaAbsoluta).png().toBuffer();
  const metadata  = await sharp(rutaAbsoluta).metadata();
  const width  = metadata.width  || 1200;
  const height = metadata.height || 1600;

  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBuffer);
  const pagina = pdfDoc.addPage([width, height]);
  pagina.drawImage(pngImage, { x: 0, y: 0, width, height });

  return Buffer.from(await pdfDoc.save());
}

export async function generarTranscripcionIA(
  fojaId: number,
  usuarioId: number,
  version?: string,
): Promise<VisorTranscripcion> {
  const foja = await db('visor_fojas').where({ id: fojaId }).first();
  if (!foja) throw new AppError('Foja no encontrada', 404);

  // Se transcribe el documento de UNA campaña concreta y se guarda junto con
  // ella: dos escaneos del mismo acto registral no dan el mismo texto, y antes
  // el segundo sobrescribía al primero sin dejar rastro.
  const { rutaAbsoluta, formato, version: versionServida } = await resolverImagenFoja(fojaId, version);
  const pdfBuffer = formato.toLowerCase() === 'pdf'
    ? await fs.promises.readFile(rutaAbsoluta)
    : await imagenAPdfBuffer(rutaAbsoluta);
  // Se transcribe el documento COMPLETO, no su primera página.
  //
  // Antes se pedía una sola, y en el acervo eso dejaba fuera lo que más pesa:
  // las anotaciones marginales viven en la foja 2 —los propios listados del
  // proveedor avisan "faltó actualizar las anotaciones marginales de la foja
  // 2"— y ahí es donde se asientan gravámenes, cancelaciones y traspasos. Una
  // transcripción de la primera página puede hacer parecer libre un inmueble
  // que no lo está.
  const totalPaginas = (await PDFDocument.load(pdfBuffer)).getPageCount();
  const resultado = await extractTextFromPdf(pdfBuffer, totalPaginas);

  const texto = resultado.text.trim() || 'No se detectó texto legible en la imagen.';

  // Queda constancia de cuántas páginas se leyeron de cuántas tiene el
  // documento: si alguna vez se procesa de menos, se ve en el dato en vez de
  // pasar por una transcripción completa.
  const paginas = `${resultado.pages}/${totalPaginas}`;

  const [transcripcion] = await db('visor_transcripciones_foja')
    .insert({
      foja_id:             fojaId,
      version:             versionServida,
      texto_transcrito:    texto,
      origen:              'IA',
      modelo_ia:           `${resultado.provider} · ${paginas} págs`,
      creado_por:          usuarioId,
      fecha_actualizacion: new Date(),
    })
    .onConflict(['foja_id', 'version'])
    .merge({
      texto_transcrito:    texto,
      origen:              'IA',
      modelo_ia:           `${resultado.provider} · ${paginas} págs`,
      ultimo_editor_id:    null,
      fecha_actualizacion: new Date(),
    })
    .returning('*');

  return transcripcion;
}

export async function actualizarTranscripcion(
  fojaId: number,
  texto: string,
  usuarioId: number,
  version?: string,
): Promise<VisorTranscripcion> {
  const clave = await versionEfectiva(fojaId, version);
  const existente = await db('visor_transcripciones_foja')
    .where({ foja_id: fojaId, version: clave })
    .first();

  if (!existente) {
    const [creada] = await db('visor_transcripciones_foja')
      .insert({
        foja_id:             fojaId,
        version:             clave,
        texto_transcrito:    texto,
        origen:              'HUMANO',
        creado_por:          usuarioId,
        fecha_actualizacion: new Date(),
      })
      .returning('*');
    return creada;
  }

  const [actualizada] = await db('visor_transcripciones_foja')
    .where({ foja_id: fojaId, version: clave })
    .update({
      texto_transcrito:    texto,
      origen:              'HUMANO',
      ultimo_editor_id:    usuarioId,
      fecha_actualizacion: new Date(),
    })
    .returning('*');
  return actualizada;
}
