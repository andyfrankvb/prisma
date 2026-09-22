/**
 * API client: Visor de Documentos
 * File: src/frontend/services/visorApi.ts
 *
 * Se separa del `api.ts` general a propósito: este módulo tiene una
 * superficie inusualmente grande (tomos, fojas, imágenes, dictámenes,
 * transcripciones, merge de rango) y agregarla al único `api.ts` de 1900+
 * líneas lo haría todavía más difícil de navegar.
 */
import type {
  VisorDelegacion, VisorSeccion, VisorTomo, VisorFoja, VisorFojaDetalle,
  VersionDigitalizacion, VisorDictamenVersion, VisorTranscripcion, VisorInscripcion,
  VisorLibroResumen, VisorInscripcionConTomo,
} from '../types';

const BASE = (import.meta.env.VITE_API_URL ?? '/api/v1') + '/visor-documentos';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function handleBlobResponse(res: Response): Promise<Blob> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

export async function getDelegaciones(): Promise<VisorDelegacion[]> {
  const res = await fetch(`${BASE}/catalogos/delegaciones`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorDelegacion[] }>(res);
  return body.data;
}

export async function getSecciones(): Promise<VisorSeccion[]> {
  const res = await fetch(`${BASE}/catalogos/secciones`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorSeccion[] }>(res);
  return body.data;
}

// ── Tomos / fojas ─────────────────────────────────────────────────────────────

export async function getTomos(delegacionId: number, seccionId: number): Promise<VisorTomo[]> {
  const qs = new URLSearchParams({ delegacion_id: String(delegacionId), seccion_id: String(seccionId) });
  const res = await fetch(`${BASE}/tomos?${qs}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorTomo[] }>(res);
  return body.data;
}

export async function buscarTomo(delegacionId: number, seccionId: number, numeroRomano: string): Promise<VisorTomo> {
  const qs = new URLSearchParams({
    delegacion_id: String(delegacionId),
    seccion_id:    String(seccionId),
    numero_romano: numeroRomano,
  });
  const res = await fetch(`${BASE}/tomos/buscar?${qs}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorTomo }>(res);
  return body.data;
}

/** Tabla "Libros Disponibles" — un renglón por tomo con fojas/inscripciones ya contadas. */
export async function getLibros(delegacionId: number, seccionId?: number, tomo?: string): Promise<VisorLibroResumen[]> {
  const qs = new URLSearchParams({ delegacion_id: String(delegacionId) });
  if (seccionId) qs.set('seccion_id', String(seccionId));
  if (tomo?.trim()) qs.set('tomo', tomo.trim());
  const res = await fetch(`${BASE}/libros?${qs}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorLibroResumen[] }>(res);
  return body.data;
}

export async function getFojasDeTomo(tomoId: number): Promise<VisorFoja[]> {
  const res = await fetch(`${BASE}/tomos/${tomoId}/fojas`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorFoja[] }>(res);
  return body.data;
}

export async function getFoja(fojaId: number): Promise<VisorFojaDetalle> {
  const res = await fetch(`${BASE}/fojas/${fojaId}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorFojaDetalle }>(res);
  return body.data;
}

/** Descarga el documento como PDF (con o sin marca de agua según el rol) para mostrarlo en el visor. */
export async function getImagenFojaBlob(fojaId: number, version?: VersionDigitalizacion): Promise<Blob> {
  const qs = version ? `?${new URLSearchParams({ version })}` : '';
  const res = await fetch(`${BASE}/fojas/${fojaId}/imagen${qs}`, { headers: authHeaders() });
  return handleBlobResponse(res);
}

export async function mergeRangoPdf(tomoId: number, desde: number, hasta: number): Promise<Blob> {
  const res = await fetch(`${BASE}/tomos/${tomoId}/merge-rango`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ desde, hasta }),
  });
  return handleBlobResponse(res);
}

// ── Inscripciones (modo de navegación paralelo al de tomo/página) ───────────

export async function buscarInscripcion(tomoId: number, numero: number): Promise<VisorInscripcion> {
  const res = await fetch(`${BASE}/tomos/${tomoId}/inscripciones/buscar?numero=${numero}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorInscripcion }>(res);
  return body.data;
}

export interface FiltrosBusquedaInscripciones {
  delegacionId: number;
  seccionId?:   number;
  tomo?:        string;
  /** Un número ("0001") o un rango ("0001_0010") — mismo formato que SID. */
  inscripcion?: string;
  limit?:       number;
}

/** Búsqueda amplia (tabla "Inscripciones Disponibles") — no requiere tomo preseleccionado. */
export async function buscarInscripciones(filtros: FiltrosBusquedaInscripciones): Promise<VisorInscripcionConTomo[]> {
  const qs = new URLSearchParams({ delegacion_id: String(filtros.delegacionId) });
  if (filtros.seccionId) qs.set('seccion_id', String(filtros.seccionId));
  if (filtros.tomo?.trim()) qs.set('tomo', filtros.tomo.trim());
  if (filtros.inscripcion?.trim()) qs.set('inscripcion', filtros.inscripcion.trim());
  if (filtros.limit) qs.set('limit', String(filtros.limit));
  const res = await fetch(`${BASE}/inscripciones/buscar?${qs}`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorInscripcionConTomo[] }>(res);
  return body.data;
}

// ── Curaduría (dictamen de versión) ──────────────────────────────────────────

export async function getDictamen(fojaId: number): Promise<VisorDictamenVersion | null> {
  const res = await fetch(`${BASE}/fojas/${fojaId}/dictamen`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorDictamenVersion | null }>(res);
  return body.data;
}

export async function guardarDictamen(
  fojaId: number,
  payload: { version_seleccionada: VersionDigitalizacion; justificacion_juridica: string },
): Promise<VisorDictamenVersion> {
  const res = await fetch(`${BASE}/fojas/${fojaId}/dictamen`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const body = await handleResponse<{ data: VisorDictamenVersion }>(res);
  return body.data;
}

// ── Transcripción ─────────────────────────────────────────────────────────────

export async function getTranscripcion(fojaId: number): Promise<VisorTranscripcion | null> {
  const res = await fetch(`${BASE}/fojas/${fojaId}/transcripcion`, { headers: authHeaders() });
  const body = await handleResponse<{ data: VisorTranscripcion | null }>(res);
  return body.data;
}

export async function generarTranscripcionIA(fojaId: number): Promise<VisorTranscripcion> {
  const res = await fetch(`${BASE}/fojas/${fojaId}/transcripcion`, {
    method:  'POST',
    headers: authHeaders(),
  });
  const body = await handleResponse<{ data: VisorTranscripcion }>(res);
  return body.data;
}

export async function actualizarTranscripcion(fojaId: number, texto: string): Promise<VisorTranscripcion> {
  const res = await fetch(`${BASE}/fojas/${fojaId}/transcripcion`, {
    method:  'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ texto_transcrito: texto }),
  });
  const body = await handleResponse<{ data: VisorTranscripcion }>(res);
  return body.data;
}
