/**
 * Service: Fusión de rango de páginas a un solo PDF
 * File: src/modules/visor_documentos/services/merge.service.ts
 *
 * Rescatado de SID (`LibrosService.mergeRangoPdf` / `libros/merge-range`),
 * sin equivalente en VISAR. Cada foja del rango se resuelve con la misma
 * cascada de versión que el visor (resolverImagenFoja, sin marca de agua —
 * el archivo descargado es para trámite interno, no para pantalla).
 *
 * Cuando la foja ya es un PDF (caso normal: fojas migradas de SID/VISAR),
 * su página se copia directamente con `pdfDoc.embedPdf()` — sin rasterizar,
 * mejor calidad y más rápido. Solo las imágenes raster (jpg/png/tiff) se
 * convierten a página vía `sharp` + `embedPng`.
 */
import fs from 'fs';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import { resolverImagenFoja } from './imagen.service';

const MAX_PAGINAS_MERGE = 200;

export async function mergeRangoPdf(tomoId: number, desde: number, hasta: number): Promise<Buffer> {
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde) {
    throw new AppError('Rango de páginas inválido', 422);
  }
  if (hasta - desde + 1 > MAX_PAGINAS_MERGE) {
    throw new AppError(`El rango no puede exceder ${MAX_PAGINAS_MERGE} páginas`, 422);
  }

  const tomo = await db('visor_tomos').where({ id: tomoId }).first();
  if (!tomo) throw new AppError('Tomo no encontrado', 404);

  const fojas = await db('visor_fojas')
    .where({ tomo_id: tomoId })
    .andWhere('orden_secuencial', '>=', desde)
    .andWhere('orden_secuencial', '<=', hasta)
    .orderBy('orden_secuencial', 'asc');

  if (!fojas.length) {
    throw new AppError('No hay fojas en el rango solicitado', 404);
  }

  const pdfDoc = await PDFDocument.create();

  for (const foja of fojas) {
    const { rutaAbsoluta, formato } = await resolverImagenFoja(foja.id);

    if (formato.toLowerCase() === 'pdf') {
      const pdfBytes = await fs.promises.readFile(rutaAbsoluta);
      const pdfOrigen = await PDFDocument.load(pdfBytes);
      const [paginaCopiada] = await pdfDoc.copyPages(pdfOrigen, [0]);
      pdfDoc.addPage(paginaCopiada);
      continue;
    }

    const pngBuffer = await sharp(rutaAbsoluta).png().toBuffer();
    const metadata  = await sharp(rutaAbsoluta).metadata();
    const width  = metadata.width  || 1200;
    const height = metadata.height || 1600;

    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const pagina = pdfDoc.addPage([width, height]);
    pagina.drawImage(pngImage, { x: 0, y: 0, width, height });
  }

  return Buffer.from(await pdfDoc.save());
}
