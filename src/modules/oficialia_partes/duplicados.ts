/**
 * Detección de oficios duplicados.
 *
 * El problema real: el número de oficio no tiene un formato único —cada
 * autoridad usa el suyo— y a veces se captura incompleto o con un carácter
 * equivocado (un 0 por una O, un dígito de más). Comparar cadena contra cadena
 * no alcanza.
 *
 * Se usan cuatro señales, siempre dentro de la MISMA dependencia solicitante:
 *
 *   1. Número normalizado igual  → es el mismo oficio. Bloquea.
 *   2. Huella del PDF igual      → es literalmente el mismo archivo. Bloquea.
 *   3. Misma secuencia de dígitos, o una o dos letras de diferencia → avisa.
 *   4. Mismo remitente y misma fecha del oficio → avisa.
 *
 * Lo que bloquea se decide en el controlador; aquí solo se detecta y se
 * clasifica. La comparación vive en la aplicación y no en la base para no
 * depender de extensiones (pg_trgm) que en producción quizá no se puedan instalar.
 */

import { createHash } from 'crypto';
import { db }         from '../../db';

/** Cuántos candidatos se traen como máximo para comparar en memoria. */
const MAX_CANDIDATOS = 400;

/** Diferencia máxima de caracteres para considerar dos números «parecidos». */
const DISTANCIA_MAX = 2;

/** Solo letras y dígitos, en mayúsculas. Debe coincidir con la columna generada. */
export function normalizarNumero(valor: unknown): string {
  return String(valor ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Solo los dígitos. Debe coincidir con la columna generada. */
export function soloDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/[^0-9]/g, '');
}

/**
 * Nombre de dependencia comparable: mayúsculas y sin acentos.
 * El mismo nombre aparece capturado con y sin acento («FISCALÍA» / «FISCALIA»),
 * y una comparación literal los tomaría como dependencias distintas.
 */
export function normalizarDependencia(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Huella del archivo, para reconocer el mismo PDF subido dos veces. */
export function hashArchivo(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Distancia de Levenshtein acotada: cuántas ediciones separan a `a` de `b`.
 * Corta en cuanto supera `tope`, que es lo único que interesa saber.
 */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  if (a === b) return 0;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minFila  = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(actual[j - 1] + 1, previa[j] + 1, previa[j - 1] + costo);
      actual.push(v);
      if (v < minFila) minFila = v;
    }
    // Si toda la fila ya excede el tope, no hay forma de bajar después.
    if (minFila > tope) return tope + 1;
    previa = actual;
  }
  return previa[b.length];
}

export type MotivoDuplicado =
  | 'NUMERO_IGUAL'
  | 'MISMO_ARCHIVO'
  | 'MISMOS_DIGITOS'
  | 'NUMERO_PARECIDO'
  | 'MISMO_REMITENTE_Y_FECHA';

export interface Coincidencia {
  id:                   number;
  folio:                string;
  numero_oficio_origen: string | null;
  remitente:            string | null;
  fecha_oficio:         string | null;
  fecha_registro:       string;
  estatus:              string;
  motivo:               MotivoDuplicado;
  /** Texto listo para mostrarle al oficial de partes. */
  explicacion:          string;
}

export interface ResultadoDuplicados {
  /** Es el mismo oficio: no se debe registrar otra vez. */
  bloqueantes: Coincidencia[];
  /** Se parece: el oficial revisa y decide. */
  advertencias: Coincidencia[];
}

interface Entrada {
  dependencia_origen?: string | null;
  numero_oficio_origen?: string | null;
  remitente?: string | null;
  fecha_oficio?: string | null;
  /** Huella del PDF, si ya se calculó. */
  archivo_hash?: string | null;
  /** Al editar, el propio oficio no cuenta como duplicado de sí mismo. */
  excluirId?: number | null;
}

const EXPLICACION: Record<MotivoDuplicado, string> = {
  NUMERO_IGUAL:            'Mismo número de oficio de esta dependencia',
  MISMO_ARCHIVO:           'El documento adjunto es exactamente el mismo archivo',
  MISMOS_DIGITOS:          'Mismos dígitos en el número, escrito de otra forma',
  NUMERO_PARECIDO:         'El número difiere en uno o dos caracteres',
  MISMO_REMITENTE_Y_FECHA: 'Mismo remitente y misma fecha del oficio',
};

const CAMPOS = [
  'id', 'folio', 'numero_oficio_origen', 'remitente',
  'fecha_oficio', 'fecha_registro', 'estatus',
  'numero_normalizado', 'digitos_oficio', 'archivo_hash',
];

function aCoincidencia(fila: any, motivo: MotivoDuplicado): Coincidencia {
  return {
    id:                   fila.id,
    folio:                fila.folio,
    numero_oficio_origen: fila.numero_oficio_origen,
    remitente:            fila.remitente,
    fecha_oficio:         fila.fecha_oficio,
    fecha_registro:       fila.fecha_registro,
    estatus:              fila.estatus,
    motivo,
    explicacion:          EXPLICACION[motivo],
  };
}

/**
 * Busca oficios ya capturados que puedan ser el mismo que se está registrando.
 *
 * Sin dependencia no se compara nada: el mismo consecutivo lo usan autoridades
 * distintas, y comparar contra todo el histórico solo produciría ruido.
 */
export async function buscarDuplicados(entrada: Entrada): Promise<ResultadoDuplicados> {
  const vacio: ResultadoDuplicados = { bloqueantes: [], advertencias: [] };

  const dependencia = normalizarDependencia(entrada.dependencia_origen);
  if (!dependencia) return vacio;

  const numero  = normalizarNumero(entrada.numero_oficio_origen);
  const digitos = soloDigitos(entrada.numero_oficio_origen);
  const hash    = entrada.archivo_hash ?? null;

  // Sin número ni archivo, lo único que queda es el contexto (remitente + fecha).
  const base = () => {
    const q = db('oficios').whereRaw(
      "translate(upper(dependencia_origen), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = ?", [dependencia],
    );
    if (entrada.excluirId) q.whereNot('id', entrada.excluirId);
    return q;
  };

  const encontrados = new Map<number, Coincidencia>();
  const agregar = (fila: any, motivo: MotivoDuplicado) => {
    if (!encontrados.has(fila.id)) encontrados.set(fila.id, aCoincidencia(fila, motivo));
  };

  // ── Bloqueantes ────────────────────────────────────────────
  const bloqueantes: Coincidencia[] = [];

  if (numero) {
    const iguales = await base().where('numero_normalizado', numero).select(CAMPOS);
    iguales.forEach((f: any) => bloqueantes.push(aCoincidencia(f, 'NUMERO_IGUAL')));
  }

  if (hash) {
    const mismoArchivo = await base().where('archivo_hash', hash).select(CAMPOS);
    mismoArchivo.forEach((f: any) => {
      if (!bloqueantes.some((b) => b.id === f.id)) {
        bloqueantes.push(aCoincidencia(f, 'MISMO_ARCHIVO'));
      }
    });
  }

  if (bloqueantes.length) return { bloqueantes, advertencias: [] };

  // ── Advertencias ───────────────────────────────────────────
  if (numero) {
    // Se acotan los candidatos por longitud parecida antes de comparar en memoria.
    const candidatos = await base()
      .whereNotNull('numero_oficio_origen')
      .andWhereRaw('length(numero_normalizado) BETWEEN ? AND ?',
        [numero.length - DISTANCIA_MAX, numero.length + DISTANCIA_MAX])
      .orderBy('fecha_registro', 'desc')
      .limit(MAX_CANDIDATOS)
      .select(CAMPOS);

    for (const f of candidatos as any[]) {
      if (digitos && f.digitos_oficio === digitos) { agregar(f, 'MISMOS_DIGITOS'); continue; }
      if (distancia(numero, f.numero_normalizado ?? '', DISTANCIA_MAX) <= DISTANCIA_MAX) {
        agregar(f, 'NUMERO_PARECIDO');
      }
    }

    // Los dígitos pueden coincidir aunque la longitud total sea muy distinta
    // (por ejemplo, si se omitió todo el prefijo).
    if (digitos) {
      const porDigitos = await base()
        .where('digitos_oficio', digitos)
        .limit(MAX_CANDIDATOS)
        .select(CAMPOS);
      porDigitos.forEach((f: any) => agregar(f, 'MISMOS_DIGITOS'));
    }
  }

  // Contexto: mismo remitente y misma fecha del oficio.
  const remitente = normalizarDependencia(entrada.remitente);
  const fecha     = String(entrada.fecha_oficio ?? '').trim();
  if (remitente && fecha) {
    const porContexto = await base()
      .whereRaw("translate(upper(remitente), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = ?", [remitente])
      .andWhere('fecha_oficio', fecha)
      .limit(MAX_CANDIDATOS)
      .select(CAMPOS);
    porContexto.forEach((f: any) => agregar(f, 'MISMO_REMITENTE_Y_FECHA'));
  }

  return { bloqueantes: [], advertencias: [...encontrados.values()] };
}
