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

export async function obtenerTranscripcion(fojaId: number): Promise<VisorTranscripcion | null> {
  const transcripcion = await db('visor_transcripciones_foja').where({ foja_id: fojaId }).first();
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

export async function generarTranscripcionIA(fojaId: number, usuarioId: number): Promise<VisorTranscripcion> {
  const foja = await db('visor_fojas').where({ id: fojaId }).first();
  if (!foja) throw new AppError('Foja no encontrada', 404);

  const { rutaAbsoluta, formato } = await resolverImagenFoja(fojaId);
  const pdfBuffer = formato.toLowerCase() === 'pdf'
    ? await fs.promises.readFile(rutaAbsoluta)
    : await imagenAPdfBuffer(rutaAbsoluta);
  const resultado = await extractTextFromPdf(pdfBuffer, 1);

  const texto = resultado.text.trim() || 'No se detectó texto legible en la imagen.';

  const [transcripcion] = await db('visor_transcripciones_foja')
    .insert({
      foja_id:             fojaId,
      texto_transcrito:    texto,
      origen:              'IA',
      modelo_ia:           resultado.provider,
      creado_por:          usuarioId,
      fecha_actualizacion: new Date(),
    })
    .onConflict('foja_id')
    .merge({
      texto_transcrito:    texto,
      origen:              'IA',
      modelo_ia:           resultado.provider,
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
): Promise<VisorTranscripcion> {
  const existente = await db('visor_transcripciones_foja').where({ foja_id: fojaId }).first();

  if (!existente) {
    const [creada] = await db('visor_transcripciones_foja')
      .insert({
        foja_id:             fojaId,
        texto_transcrito:    texto,
        origen:              'HUMANO',
        creado_por:          usuarioId,
        fecha_actualizacion: new Date(),
      })
      .returning('*');
    return creada;
  }

  const [actualizada] = await db('visor_transcripciones_foja')
    .where({ foja_id: fojaId })
    .update({
      texto_transcrito:    texto,
      origen:              'HUMANO',
      ultimo_editor_id:    usuarioId,
      fecha_actualizacion: new Date(),
    })
    .returning('*');
  return actualizada;
}
