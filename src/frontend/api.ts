/**
 * API client: Oficialía de Partes
 * File: src/frontend/api.ts
 */

import type {
  Oficio,
  Abogado,
  PaginatedResponse,
} from './types';
import type { Compresion } from './utils/compresion';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Sesión expirada o token inválido → limpiar y redirigir al login
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  return handleResponse<{ token: string; user: import('./types').AuthUser }>(res);
}

// ── Oficios ──────────────────────────────────────────────────────────────────

export async function getOficios(params?: {
  page?:    number;
  limit?:   number;
  estatus?: string;
  desde?:   string;
  hasta?:   string;
  search?:  string;
  siqroo_pendiente?: boolean;
  pendiente_firma?:  boolean;
  termino?: string;
}): Promise<PaginatedResponse<Oficio>> {
  const qs = new URLSearchParams();
  if (params?.page)    qs.set('page',    String(params.page));
  if (params?.limit)   qs.set('limit',   String(params.limit));
  if (params?.estatus) qs.set('estatus', params.estatus);
  if (params?.desde)   qs.set('desde',   params.desde);
  if (params?.hasta)   qs.set('hasta',   params.hasta);
  if (params?.search)  qs.set('search',  params.search);
  if (params?.siqroo_pendiente) qs.set('siqroo_pendiente', 'true');
  if (params?.pendiente_firma)  qs.set('pendiente_firma', 'true');
  if (params?.termino) qs.set('termino', params.termino);

  const res = await fetch(`${BASE}/oficios?${qs}`, {
    headers: authHeaders(),
  });
  return handleResponse<PaginatedResponse<Oficio>>(res);
}

export async function analizarPdf(file: File) {
  const fd = new FormData();
  fd.append('pdf', file);
  const res = await fetch(`${BASE}/oficios/analizar-pdf`, {
    method:  'POST',
    headers: authHeaders(),
    body:    fd,
  });
  return handleResponse<{ data: {
    remitente?:          string;
    dependencia_origen?: string;
    descripcion?:        string;
    tiene_termino?:      boolean;
    fecha_vencimiento?:  string | null;
    texto_completo?:     string;
    confianza:           'alta' | 'media' | 'baja';
    ocr_provider?:       string;
  }}>(res);
}

export async function createOficio(formData: FormData) {
  const res = await fetch(`${BASE}/oficios`, {
    method:  'POST',
    headers: authHeaders(),
    body:    formData,
  });
  return handleResponse<{ data: Oficio; compresion?: Compresion | null }>(res);
}

export async function reasignarOficio(
  id: number,
  body: { abogado_id: number; motivo?: string },
) {
  const res = await fetch(`${BASE}/oficios/${id}/reasignar`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return handleResponse<{ message: string }>(res);
}

export async function asignarOficio(
  id: number,
  body: { abogado_id: number; observaciones?: string },
) {
  const res = await fetch(`${BASE}/oficios/${id}/asignar`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return handleResponse<{ message: string }>(res);
}

export async function subirProyecto(id: number, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/oficios/${id}/subir-proyecto`, {
    method:  'POST',
    headers: authHeaders(),
    body:    fd,
  });
  return handleResponse<{ message: string; compresion?: Compresion | null }>(res);
}

export async function aprobarVobo(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/vobo`, {
    method:  'PATCH',
    headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function reconsiderarOficio(id: number, comentario: string) {
  const res = await fetch(`${BASE}/oficios/${id}/reconsiderar`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ comentario }),
  });
  return handleResponse<{ message: string }>(res);
}

export interface ComentarioReconsideracion {
  id:                number;
  comentario:        string;
  fecha:             string;
  version:           number;
  resuelto:          boolean;
  encargado_nombre:  string;
}

export async function getComentarios(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/comentarios`, {
    headers: authHeaders(),
  });
  return handleResponse<{ data: ComentarioReconsideracion[] }>(res);
}

// ── Catálogos: dependencias y remitentes ──────────────────────
export interface CatalogoItem { id: number; nombre: string; }

export async function getDependencias() {
  const res = await fetch(`${BASE}/catalogos/dependencias`, { headers: authHeaders() });
  return handleResponse<{ data: CatalogoItem[] }>(res);
}

export async function crearDependencia(nombre: string) {
  const res = await fetch(`${BASE}/catalogos/dependencias`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

// ── Remitentes (personas) — catálogo independiente ──
export async function getRemitentes() {
  const res = await fetch(`${BASE}/catalogos/remitentes`, { headers: authHeaders() });
  return handleResponse<{ data: CatalogoItem[] }>(res);
}

export async function crearRemitente(nombre: string) {
  const res = await fetch(`${BASE}/catalogos/remitentes`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

// ── Unidades internas — catálogo independiente ──
export async function getUnidadesInternas() {
  const res = await fetch(`${BASE}/catalogos/unidades-internas`, { headers: authHeaders() });
  return handleResponse<{ data: CatalogoItem[] }>(res);
}

export async function crearUnidadInterna(nombre: string) {
  const res = await fetch(`${BASE}/catalogos/unidades-internas`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function editarUnidadInterna(id: number, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/unidades-internas/${id}`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function eliminarUnidadInterna(id: number) {
  const res = await fetch(`${BASE}/catalogos/unidades-internas/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function editarDependencia(id: number, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/dependencias/${id}`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function editarRemitente(id: number, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/remitentes/${id}`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function eliminarDependencia(id: number) {
  const res = await fetch(`${BASE}/catalogos/dependencias/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function eliminarRemitente(id: number) {
  const res = await fetch(`${BASE}/catalogos/remitentes/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export interface OficioDocumento {
  id:                number;
  tipo:              string;
  archivo_url:       string;
  nombre_original:   string | null;
  subido_en:         string;
  subido_por_nombre: string | null;
}

export async function getOficioDocumentos(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/documentos`, {
    headers: authHeaders(),
  });
  return handleResponse<{ data: OficioDocumento[] }>(res);
}

export interface RegistroMovimiento {
  id:              number;
  estado_anterior: string | null;
  estado_nuevo:    string;
  fecha_cambio:    string;
  usuario_nombre:  string;
}

/** Historial de movimientos (auditoría de estados) de un oficio. */
export async function getHistorial(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/historial`, { headers: authHeaders() });
  return handleResponse<{ data: RegistroMovimiento[] }>(res);
}

/** Completa el número de control interno (NCI) pendiente de SIQROO. */
export async function completarSiqroo(id: number, control?: string) {
  const fd = new FormData();
  if (control && control.trim()) fd.append('control_interno', control.trim());
  const res = await fetch(`${BASE}/oficios/${id}/siqroo`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    fd,
  });
  return handleResponse<{ data: Oficio; message: string }>(res);
}

export async function finalizarOficio(id: number, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/oficios/${id}/finalizar`, {
    method:  'POST',
    headers: authHeaders(),
    body:    fd,
  });
  return handleResponse<{ message: string; compresion?: Compresion | null }>(res);
}

// ── Usuarios / Abogados ───────────────────────────────────────────────────────

export async function getAbogados(): Promise<Abogado[]> {
  const res = await fetch(`${BASE}/usuarios?rol=JURIDICO`, {
    headers: authHeaders(),
  });
  return handleResponse<Abogado[]>(res).then((r: any) => r.data ?? r);
}

/** Candidatos a asignar/reasignar: usuarios de la unidad del encargado con el módulo de oficios */
export async function getCandidatosAsignacion(): Promise<Abogado[]> {
  const res = await fetch(`${BASE}/oficios/candidatos-asignacion`, {
    headers: authHeaders(),
  });
  return handleResponse<{ data: Abogado[] }>(res).then((r) => r.data);
}

export async function getUsuarios(params?: { rol?: string; search?: string }): Promise<Abogado[]> {
  const qs = new URLSearchParams();
  if (params?.rol)    qs.set('rol',    params.rol);
  if (params?.search) qs.set('search', params.search);
  const res = await fetch(`${BASE}/usuarios?${qs}`, { headers: authHeaders() });
  return handleResponse<{ data: Abogado[] }>(res).then((r) => r.data);
}

// ── Notificaciones ────────────────────────────────────────────────────────────

export interface NotificacionAPI {
  id:         number;
  type:       string;
  title:      string;
  body:       string;
  oficio_id:  number;
  folio:      string;
  read:       boolean;
  created_at: string;
}

export async function getNotificaciones(params?: { unread?: boolean; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.unread) qs.set('unread', 'true');
  if (params?.limit)  qs.set('limit',  String(params.limit));
  const res = await fetch(`${BASE}/notificaciones?${qs}`, { headers: authHeaders() });
  return handleResponse<{ data: NotificacionAPI[]; unread_count: number }>(res);
}

export async function marcarNotificacionLeida(id: number) {
  const res = await fetch(`${BASE}/notificaciones/${id}/read`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function marcarTodasLeidas() {
  const res = await fetch(`${BASE}/notificaciones/read-all`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Admin — CRUD Usuarios ─────────────────────────────────────────────────────

export interface UsuarioAdmin {
  id:             number;
  nombre:         string;
  email:          string;
  rol:            import('./types').RolUsuario;
  activo:         boolean;
  oficina_id:     number;   // alias de unidad_id en el JWT
  unidad_id:      number;   // campo real devuelto por /admin/usuarios
  oficina_nombre: string;
}

export interface OficinaAdmin {
  id:     number;
  nombre: string;
  activo: boolean;
}

export async function adminListarUsuarios(params?: {
  page?:      number;
  limit?:     number;
  rol?:       string;
  oficina_id?: number;
  activo?:    boolean;
  search?:    string;
}) {
  const qs = new URLSearchParams();
  if (params?.page)       qs.set('page',       String(params.page));
  if (params?.limit)      qs.set('limit',      String(params.limit));
  if (params?.rol)        qs.set('rol',        params.rol);
  if (params?.oficina_id) qs.set('oficina_id', String(params.oficina_id));
  if (params?.activo !== undefined) qs.set('activo', String(params.activo));
  if (params?.search)     qs.set('search',     params.search);

  const res = await fetch(`${BASE}/admin/usuarios?${qs}`, { headers: authHeaders() });
  return handleResponse<{ data: UsuarioAdmin[]; meta: { total: number; page: number; limit: number } }>(res);
}

export async function adminObtenerUsuario(id: number) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}`, { headers: authHeaders() });
  return handleResponse<{ data: UsuarioAdmin }>(res);
}

export async function adminCrearUsuario(body: {
  nombre:     string;
  email:      string;
  password:   string;
  rol:        string;
  oficina_id: number;
}) {
  const res = await fetch(`${BASE}/admin/usuarios`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return handleResponse<{ data: UsuarioAdmin; message: string }>(res);
}

export async function adminEditarUsuario(
  id: number,
  body: Partial<{ nombre: string; email: string; rol: string; oficina_id: number }>,
) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return handleResponse<{ data: UsuarioAdmin; message: string }>(res);
}

export async function adminToggleActivo(id: number) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}/toggle-activo`, {
    method:  'PATCH',
    headers: authHeaders(),
  });
  return handleResponse<{ message: string; activo: boolean }>(res);
}

export async function adminResetPassword(id: number, nueva_password: string) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}/reset-password`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nueva_password }),
  });
  return handleResponse<{ message: string }>(res);
}

export async function adminListarOficinas() {
  const res = await fetch(`${BASE}/admin/oficinas`, { headers: authHeaders() });
  return handleResponse<{ data: OficinaAdmin[] }>(res);
}
