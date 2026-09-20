/**
 * Service: Documento de foja — resolución de versión + marca de agua
 * File: src/modules/visor_documentos/services/imagen.service.ts
 *
 * A diferencia de VISAR (que reencodeaba todo a WebP para un visor de
 * imagen por tiles), esto sirve el documento como PDF real — igual que
 * SID (LibrosService.mostrarImagen + ngx-extended-pdf-viewer en el
 * frontend): el usuario interactúa con el PDF de verdad (zoom, texto
 * seleccionable, su propio visor nativo), no con una imagen rasterizada.
 *
 * Prioridad de resolución de versión:
 *   1. `version` explícita (query param).
 *   2. La versión que indique el dictamen jurídico de la foja, si existe.
 *   3. Cascada automática: V3_VALIDADA > V2022_FALTANTE > V2009.
 *   4. La primera imagen disponible, si ninguna de las anteriores calza.
 *
 * Marca de agua: texto diagonal repetido con email/IP/fecha-hora, dibujado
 * directo sobre cada página del PDF con `pdf-lib` (no se rasteriza nada)
 * para quien no es admin-equivalente (ver roles.service.ts). Cuando la
 * imagen de origen no es PDF (jpg/png/tiff — caso de datos de prueba
 * sembrados como raster) se embebe primero en un PDF de una sola página,
 * mismo patrón que ya usan transcripcion.service.ts y merge.service.ts.
 */
import fs   from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import { VERSIONES_DIGITALIZACION } from '../visor.types';
import type { VersionDigitalizacion, ImagenProcesadaResult } from '../visor.types';

const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');
const PRIORIDAD_FALLBACK: VersionDigitalizacion[] = ['V3_VALIDADA', 'V2022_FALTANTE', 'V2009'];

interface ImagenRow {
  id:           number;
  foja_id:      number;
  version:      VersionDigitalizacion;
  ruta_storage: string;
  formato:      string;
}

export interface ImagenFojaResuelta {
  rutaAbsoluta: string;
  formato:      string;
  version:      VersionDigitalizacion;
}

async function buscarImagen(fojaId: number, version?: VersionDigitalizacion): Promise<ImagenRow> {
  if (version) {
    const imagen = await db('visor_imagenes_foja').where({ foja_id: fojaId, version }).first();
    if (!imagen) throw new AppError(`No existe imagen para la foja ${fojaId} con versión ${version}`, 404);
    return imagen;
  }

  const dictamen = await db('visor_dictamenes_versiones_foja')
    .where({ foja_id: fojaId })
    .select('version_seleccionada')
    .first();

  if (dictamen) {
    const imagenDictaminada = await db('visor_imagenes_foja')
      .where({ foja_id: fojaId, version: dictamen.version_seleccionada })
      .first();
    if (imagenDictaminada) return imagenDictaminada;
  }

  const imagenes: ImagenRow[] = await db('visor_imagenes_foja').where({ foja_id: fojaId });
  if (!imagenes.length) throw new AppError(`No existen imágenes registradas para la foja ${fojaId}`, 404);

  for (const version_ of PRIORIDAD_FALLBACK) {
    const match = imagenes.find((img) => img.version === version_);
    if (match) return match;
  }
  return imagenes[0];
}

/** Resuelve `ruta_storage` (relativa, con o sin `/` inicial) a una ruta absoluta segura dentro de STORAGE_BASE. */
function rutaAbsolutaSegura(rutaStorage: string): string {
  const relativa = rutaStorage.startsWith('/') ? rutaStorage.slice(1) : rutaStorage;
  const absoluta = path.resolve(path.join(STORAGE_BASE, relativa));
  if (!absoluta.startsWith(path.resolve(STORAGE_BASE))) {
    throw new AppError('Ruta de imagen inválida', 500);
  }
  if (!fs.existsSync(absoluta)) {
    throw new AppError('Archivo de imagen no encontrado en el servidor', 404);
  }
  return absoluta;
}

/** Carga el documento de la foja como PDFDocument — si ya es PDF, tal cual; si es raster, embebido en un PDF de una página. */
async function cargarComoPdf(rutaAbsoluta: string, formato: string): Promise<PDFDocument> {
  if (formato.toLowerCase() === 'pdf') {
    return PDFDocument.load(await fs.promises.readFile(rutaAbsoluta));
  }

  const pngBuffer = await sharp(rutaAbsoluta).png().toBuffer();
  const metadata  = await sharp(rutaAbsoluta).metadata();
  const width  = metadata.width  || 1200;
  const height = metadata.height || 1600;

  const pdfDoc = await PDFDocument.create();
  const pngImage = await pdfDoc.embedPng(pngBuffer);
  const pagina = pdfDoc.addPage([width, height]);
  pagina.drawImage(pngImage, { x: 0, y: 0, width, height });
  return pdfDoc;
}

/** Dibuja el texto de marca de agua repetido en diagonal directo sobre cada página — sin rasterizar nada. */
async function agregarMarcaDeAgua(pdfDoc: PDFDocument, email: string, ip: string): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fechaHora = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Cancun',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const texto = `${email} - ${ip} - ${fechaHora} - PRISMA RPPC`;

  for (const pagina of pdfDoc.getPages()) {
    const { width, height } = pagina.getSize();
    const fontSize = Math.max(10, Math.floor(width / 45));
    const spacingY = fontSize * 5;
    const spacingX = texto.length * fontSize * 0.55;

    for (let y = -height; y < height * 2; y += spacingY) {
      for (let x = -width; x < width * 2; x += spacingX) {
        pagina.drawText(texto, {
          x, y, size: fontSize, font,
          color: rgb(0.5, 0.5, 0.5), opacity: 0.32,
          rotate: degrees(45),
        });
      }
    }
  }
}

export interface ObtenerImagenOptions {
  fojaId:        number;
  version?:      VersionDigitalizacion;
  sinMarcaDeAgua: boolean;
  usuarioEmail:  string;
  ipAddress:     string;
}

export async function obtenerImagenProcesada(opts: ObtenerImagenOptions): Promise<ImagenProcesadaResult> {
  const imagen = await buscarImagen(opts.fojaId, opts.version);
  const rutaAbsoluta = rutaAbsolutaSegura(imagen.ruta_storage);

  const pdfDoc = await cargarComoPdf(rutaAbsoluta, imagen.formato);
  if (!opts.sinMarcaDeAgua) {
    await agregarMarcaDeAgua(pdfDoc, opts.usuarioEmail, opts.ipAddress);
  }

  const buffer = Buffer.from(await pdfDoc.save());
  return { buffer, version_servida: imagen.version, content_type: 'application/pdf' };
}

/** Usado por transcripcion.service.ts y merge.service.ts: resuelve la imagen sin reencodear. */
export async function resolverImagenFoja(fojaId: number, version?: VersionDigitalizacion): Promise<ImagenFojaResuelta> {
  const imagen = await buscarImagen(fojaId, version);
  return {
    rutaAbsoluta: rutaAbsolutaSegura(imagen.ruta_storage),
    formato:      imagen.formato,
    version:      imagen.version,
  };
}

export function esVersionValida(valor: unknown): valor is VersionDigitalizacion {
  return typeof valor === 'string' && (VERSIONES_DIGITALIZACION as readonly string[]).includes(valor);
}
