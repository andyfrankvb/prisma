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
    const err = new Error(body?.message ?? `HTTP ${res.status}`) as Error & { detalles?: any; status?: number };
    // Algunos errores traen información para que la vista pueda actuar
    // (por ejemplo, la lista de oficios parecidos al detectar un duplicado).
    err.detalles = body?.detalles;
    err.status   = res.status;
    throw err;
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
  dirigido_a_id?: number;
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
  if (params?.dirigido_a_id) qs.set('dirigido_a_id', String(params.dirigido_a_id));

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

// ── Sub-unidades (dentro de una dependencia) ──
export async function getUnidadesInternas(dependenciaId: number) {
  const res = await fetch(`${BASE}/catalogos/dependencias/${dependenciaId}/unidades-internas`, { headers: authHeaders() });
  return handleResponse<{ data: CatalogoItem[] }>(res);
}

export async function crearUnidadInterna(dependenciaId: number, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/dependencias/${dependenciaId}/unidades-internas`, {
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

// ── Reorganizar la jerarquía del catálogo (SUPERADMIN) ──
/** Degrada una dependencia a sub-unidad de otra (sus sub-unidades se reasignan). */
export async function dependenciaASubunidad(id: number, dependencia_destino_id: number) {
  const res = await fetch(`${BASE}/catalogos/dependencias/${id}/convertir-en-subunidad`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ dependencia_destino_id }),
  });
  return handleResponse<{ message: string }>(res);
}

/** Promueve una sub-unidad a dependencia independiente. */
export async function subunidadADependencia(id: number) {
  const res = await fetch(`${BASE}/catalogos/unidades-internas/${id}/convertir-en-dependencia`, {
    method: 'POST', headers: authHeaders(),
  });
  return handleResponse<{ data: CatalogoItem; message: string }>(res);
}

/** Reasigna una sub-unidad a otra dependencia. */
export async function moverSubunidad(id: number, dependencia_destino_id: number) {
  const res = await fetch(`${BASE}/catalogos/unidades-internas/${id}/mover`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ dependencia_destino_id }),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Remitentes (personas) — catálogo GLOBAL independiente ──
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

// ── Catálogos: buscador global y permiso de depuración ──
/** Una coincidencia del buscador, con el lugar donde está capturada. */
export interface HallazgoCatalogo {
  tipo:      'DEPENDENCIA' | 'SUBUNIDAD' | 'REMITENTE' | 'CORREO';
  id:        number;
  nombre:    string;
  ubicacion: string;
}

/** Busca un nombre en los cuatro catálogos a la vez y dice dónde está cada uno. */
export async function buscarEnCatalogos(q: string) {
  const res = await fetch(`${BASE}/catalogos/buscar?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  return handleResponse<{ data: HallazgoCatalogo[]; mensaje?: string }>(res);
}

/** ¿El usuario puede editar, eliminar y reorganizar los catálogos? */
export async function getPermisosCatalogos() {
  const res = await fetch(`${BASE}/catalogos/permisos`, { headers: authHeaders() });
  return handleResponse<{ data: { puede_gestionar: boolean } }>(res);
}

// ── Correos de recepción — dos listas independientes ──
/** 'origen' = de quién llega el oficio; 'destino' = cuenta institucional que lo recibe. */
export type TipoCorreo = 'origen' | 'destino';

export async function getCorreos(tipo: TipoCorreo) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}`, { headers: authHeaders() });
  return handleResponse<{ data: CatalogoItem[] }>(res);
}

export async function crearCorreo(tipo: TipoCorreo, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function editarCorreo(tipo: TipoCorreo, id: number, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}/${id}`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

export async function eliminarCorreo(tipo: TipoCorreo, id: number) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
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
  /** Texto ya armado. Lo traen los movimientos de delegatorio. */
  detalle?:        string;
}

/** Historial de movimientos (auditoría de estados) de un oficio. */
export async function getHistorial(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/historial`, { headers: authHeaders() });
  return handleResponse<{ data: RegistroMovimiento[] }>(res);
}

/** Completa el número de control interno (NCI) pendiente de SIQROO. */
/** Un oficio ya capturado que se parece al que se está registrando. */
export interface PosibleDuplicado {
  id:                   number;
  folio:                string;
  numero_oficio_origen: string | null;
  remitente:            string | null;
  fecha_oficio:         string | null;
  fecha_registro:       string;
  estatus:              string;
  motivo:               string;
  explicacion:          string;
}

/** Consulta durante la captura: avisa antes de que el oficial llene todo lo demás. */
export async function verificarDuplicado(params: {
  dependencia_origen?: string;
  numero_oficio_origen?: string;
  remitente?: string;
  fecha_oficio?: string;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const res = await fetch(`${BASE}/oficios/verificar-duplicado?${qs}`, { headers: authHeaders() });
  return handleResponse<{ data: { bloqueantes: PosibleDuplicado[]; advertencias: PosibleDuplicado[] } }>(res);
}

/** Área a la que se puede turnar un oficio. */
export interface AreaTurno {
  id:      number;
  nombre:  string;
  tipo:    string;
  titular: string;
}

export async function getAreasTurno() {
  const res = await fetch(`${BASE}/oficios/areas-turno`, { headers: authHeaders() });
  return handleResponse<{ data: AreaTurno[] }>(res);
}

/** Manda el oficio completo a otra área; ahí reinicia su flujo. */
export async function turnarOficio(id: number, unidad_destino_id: number, motivo: string) {
  const res = await fetch(`${BASE}/oficios/${id}/turnar`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ unidad_destino_id, motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

/** Marca o desmarca un oficio como «de conocimiento» (lo cierra o lo regresa al flujo). */
export async function marcarDeConocimiento(id: number, marcar: boolean) {
  const res = await fetch(`${BASE}/oficios/${id}/de-conocimiento`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ de_conocimiento: marcar }),
  });
  return handleResponse<{ data: Oficio; message: string }>(res);
}

export async function actualizarSistemas(id: number, datos: {
  siqroo_aplica: boolean;  siqroo_control_interno?: string;
  siger_aplica:  boolean;  siger_control_interno?:  string;
}) {
  const res = await fetch(`${BASE}/oficios/${id}/sistemas`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(datos),
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

// ── Recursos públicos (los dos apartados de la pantalla de login) ────────────

export type TipoRecurso = 'enlace' | 'archivo';

/** Lo que ve el login: solo los recursos habilitados y con contenido. */
export interface RecursoPublico {
  slot:   1 | 2;
  titulo: string;
  tipo:   TipoRecurso;
  url:    string;
}

/** Configuración completa de un apartado (vista del SUPERADMIN). */
export interface RecursoConfig {
  titulo:       string;
  tipo:         TipoRecurso;
  habilitado:   boolean;
  url:          string;
  tieneArchivo: boolean;
  visible:      boolean;
}

/** Lectura pública: la usa la pantalla de login (sin sesión). */
export async function getRecursos() {
  const res = await fetch(`${BASE}/recursos`);
  return handleResponse<{ data: RecursoPublico[] }>(res);
}

/** URL directa del PDF de un apartado (para abrirlo en otra pestaña). */
export function urlArchivoRecurso(slot: number): string {
  return `${BASE}/recursos/${slot}/archivo`;
}

/** SUPERADMIN: configuración completa de ambos apartados. */
export async function getRecursosConfig() {
  const res = await fetch(`${BASE}/recursos/admin`, { headers: authHeaders() });
  return handleResponse<{ data: { recurso1: RecursoConfig; recurso2: RecursoConfig } }>(res);
}

/** SUPERADMIN: guarda habilitado, título, tipo y enlace de un apartado. */
export async function guardarRecurso(slot: number, p: {
  titulo: string; tipo: TipoRecurso; url: string; habilitado: boolean;
}) {
  const res = await fetch(`${BASE}/recursos/${slot}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(p),
  });
  return handleResponse<{ message: string }>(res);
}

/** SUPERADMIN: sube o reemplaza el PDF de un apartado. */
export async function subirArchivoRecurso(slot: number, file: File) {
  const fd = new FormData();
  fd.append('archivo', file);
  const res = await fetch(`${BASE}/recursos/${slot}/archivo`, {
    method: 'POST', headers: authHeaders(), body: fd,
  });
  return handleResponse<{ message: string; data: { archivo: string } }>(res);
}

/** SUPERADMIN: retira el PDF de un apartado. */
export async function quitarArchivoRecurso(slot: number) {
  const res = await fetch(`${BASE}/recursos/${slot}/archivo`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Delegatorios: la DG turna parte de un oficio a otra área ─────────────────

export type EstadoDelegatorio = 'PENDIENTE' | 'ASIGNADO' | 'EN_REVISION' | 'CONTESTADO';

export interface Delegatorio {
  id:              number;
  estado:          EstadoDelegatorio;
  descripcion:     string;
  documento_url:   string | null;
  observacion:     string | null;
  creado_en:       string;
  respondido_en:   string | null;
  unidad_destino_id: number;
  area:            string;
  solicitado_por:  string | null;
  asignado_a:      string | null;
  respondido_por:  string | null;
}

/** Delegatorios de un oficio — alimenta la sección «Documentos del flujo». */
export async function getDelegatorios(oficioId: number) {
  const res = await fetch(`${BASE}/oficios/${oficioId}/delegatorios`, { headers: authHeaders() });
  return handleResponse<{ data: Delegatorio[]; meta: { pendientes: number } }>(res);
}

/** Áreas a las que se puede delegar (delegaciones y direcciones; la DG no). */
export async function getAreasDestino() {
  const res = await fetch(`${BASE}/delegatorios/areas-destino`, { headers: authHeaders() });
  return handleResponse<{ data: { id: number; nombre: string; tipo: string }[] }>(res);
}

/** Detona el delegatorio hacia una o varias áreas. */
export async function crearDelegatorios(oficioId: number, descripcion: string, unidades: number[]) {
  const res = await fetch(`${BASE}/oficios/${oficioId}/delegatorios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ descripcion, unidades }),
  });
  return handleResponse<{ message: string }>(res);
}

/** Lo que le toca al usuario: como encargado del área destino o como asignado. */
export async function getBandejaDelegatorios() {
  const res = await fetch(`${BASE}/delegatorios/bandeja`, { headers: authHeaders() });
  return handleResponse<{ data: (Delegatorio & {
    oficio_id: number; folio: string; remitente: string;
    dependencia_origen: string; descripcion_solicitud: string;
  })[] }>(res);
}

/** El encargado del área destino lo turna a alguien de su propia área. */
export async function asignarDelegatorio(id: number, usuario_id: number) {
  const res = await fetch(`${BASE}/delegatorios/${id}/asignar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ usuario_id }),
  });
  return handleResponse<{ message: string }>(res);
}

/** Sube el documento y la justificación, y lo manda al encargado del área. */
export async function responderDelegatorio(id: number, observacion: string, file: File | null) {
  const fd = new FormData();
  fd.append('observacion', observacion);
  if (file) fd.append('documento', file);
  const res = await fetch(`${BASE}/delegatorios/${id}/responder`, {
    method: 'POST', headers: authHeaders(), body: fd,
  });
  return handleResponse<{ message: string }>(res);
}

/** Reconsideración: devuelve el delegatorio para que se corrija. */
export async function devolverDelegatorio(id: number, comentario: string) {
  const res = await fetch(`${BASE}/delegatorios/${id}/devolver`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ comentario }),
  });
  return handleResponse<{ message: string }>(res);
}

/** El encargado del área destino envía la respuesta a quien lo detonó. */
export async function aprobarDelegatorio(id: number) {
  const res = await fetch(`${BASE}/delegatorios/${id}/aprobar`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

/** Historial de idas y vueltas del delegatorio. */
export async function getHistorialDelegatorio(id: number) {
  const res = await fetch(`${BASE}/delegatorios/${id}/historial`, { headers: authHeaders() });
  return handleResponse<{ data: { id: number; comentario: string; estado_previo: string; creado_en: string; usuario: string }[] }>(res);
}
