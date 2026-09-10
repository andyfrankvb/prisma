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
  return handleResponse<{
    token: string;
    user: import('./types').AuthUser;
    debe_cambiar_password?: boolean;
  }>(res);
}

/**
 * Cambia la contraseña de quien está en sesión.
 *
 * Al terminar, el token deja de valer —el servidor invalida todo lo firmado antes
 * del cambio—, así que quien llame a esto tiene que cerrar la sesión y mandar a
 * iniciar de nuevo. No es un efecto secundario: es lo que expulsa a cualquier otra
 * sesión que siguiera abierta con la contraseña anterior.
 */
export async function cambiarMiPassword(password_actual: string, password_nueva: string) {
  const res = await fetch(`${BASE}/usuarios/mi-password`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ password_actual, password_nueva }),
  });
  return handleResponse<{ message: string }>(res);
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
  /** Solo los oficios que esperan una acción del usuario. */
  mi_bandeja?: boolean;
  /** Solo los que llegaron a esta área desde otra, por turno. */
  de_otras_areas?: boolean;
  /** Id de la persona que lo tiene en bandeja ahora. */
  en_bandeja_de?: number;
  /** Situación del oficio, aparte del estatus: turnado, de conocimiento, etc. */
  situacion?: string;
  /** Columna por la que ordena la lista, y en qué sentido. */
  orden?: string;
  dir?:   'asc' | 'desc';
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
  if (params?.mi_bandeja)    qs.set('mi_bandeja', 'true');
  if (params?.de_otras_areas) qs.set('de_otras_areas', 'true');
  if (params?.en_bandeja_de) qs.set('en_bandeja_de', String(params.en_bandeja_de));
  if (params?.situacion)     qs.set('situacion', params.situacion);
  if (params?.orden)         { qs.set('orden', params.orden); qs.set('dir', params.dir ?? 'desc'); }

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

/** Un correo de la lista personal. `heredado` = venía del catálogo viejo y no tiene dueño. */
export interface CorreoItem extends CatalogoItem { heredado?: boolean }

export async function getCorreos(tipo: TipoCorreo) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}`, { headers: authHeaders() });
  return handleResponse<{ data: CorreoItem[] }>(res);
}

/** Un correo dado de alta, con su dueño. Solo lo devuelve el listado del SuperAdmin. */
export interface CorreoRegistrado {
  id:              number;
  tipo:            'ORIGEN' | 'DESTINO';
  correo:          string;
  usuario_id:      number | null;
  usuario_nombre:  string | null;
  unidad_nombre:   string | null;
}

/**
 * Todos los correos dados de alta y de quién es cada uno. Solo SUPERADMIN.
 *
 * El resto del módulo es privado por diseño —cada quien ve la suya y nadie más—,
 * y eso deja al administrador sin forma de saber si la función se está usando.
 * Esto responde eso y nada más: es de solo lectura.
 */
export async function getCorreosRegistrados() {
  const res = await fetch(`${BASE}/catalogos/correos-registrados`, { headers: authHeaders() });
  return handleResponse<{ data: CorreoRegistrado[] }>(res);
}

export async function crearCorreo(tipo: TipoCorreo, nombre: string) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nombre }),
  });
  return handleResponse<{ data: CatalogoItem }>(res);
}

/**
 * Reclamar un correo heredado —de los que venían del catálogo anterior y no
 * tienen dueño—. Usarlo al registrar también lo reclama solo; esto es para el
 * que ya no se va a volver a teclear.
 */
export async function adoptarCorreo(tipo: TipoCorreo, id: number) {
  const res = await fetch(`${BASE}/catalogos/correos/${tipo}/${id}/es-mio`, {
    method:  'PATCH',
    headers: authHeaders(),
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

/** Quién puede tener un oficio en bandeja, para el filtro de monitoreo. */
export interface Responsable {
  id:     number;
  nombre: string;
  cargo?: string | null;
  area?:  string | null;
}

export async function getResponsables() {
  const res = await fetch(`${BASE}/oficios/responsables`, { headers: authHeaders() });
  return handleResponse<{ data: Responsable[] }>(res);
}

/** Área a la que se puede turnar un oficio. */
/** Manda el oficio completo a otra área; ahí reinicia su flujo. */
/**
 * Manda el oficio a firma de la Directora General. No cambia de área: el oficio
 * sigue siendo del que lo trabajó, solo que lo cierra la Dirección General.
 */
export async function mandarAPaseFirma(id: number, motivo?: string) {
  const res = await fetch(`${BASE}/oficios/${id}/pase-firma`, {
    method:  'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ motivo: motivo ?? '' }),
  });
  return handleResponse<{ message: string }>(res);
}

/** La Dirección General lo regresa al área en vez de firmarlo. */
export async function devolverPaseFirma(id: number, motivo: string) {
  const res = await fetch(`${BASE}/oficios/${id}/pase-firma/devolver`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

/**
 * Turna el oficio a otra área. Dos razones opuestas:
 *   · COMPETENCIA — el asunto no le toca a esta área.
 *   · INFORMACION — sí le tocaba, ya hizo su parte y manda lo trabajado.
 * El envío de información va con el documento, por eso el formulario multipart.
 */
export async function turnarOficio(
  id: number,
  unidad_destino_id: number,
  motivo: string,
  tipo: 'COMPETENCIA' | 'INFORMACION' = 'COMPETENCIA',
  documento?: File | null,
  /** Deja constancia de que el envío fue una resolución. */
  resolucion = false,
) {
  const fd = new FormData();
  fd.append('unidad_destino_id', String(unidad_destino_id));
  fd.append('motivo', motivo);
  fd.append('tipo', tipo);
  if (resolucion) fd.append('resolucion', 'true');
  if (documento) fd.append('documento', documento);

  const res = await fetch(`${BASE}/oficios/${id}/turnar`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    fd,
  });
  return handleResponse<{ message: string }>(res);
}

/** El área regresa el oficio a quien se lo turnó, por no ser de su competencia. */
/**
 * El área recibe formalmente un oficio que le turnaron.
 *
 * No mueve el flujo —el oficio sigue esperando que lo asignen—; cierra la
 * posibilidad de regresarlo y deja constancia de quién lo tomó.
 */
export async function aceptarTurno(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/turnar/aceptar`, {
    method:  'PATCH',
    headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function devolverTurno(id: number, motivo: string) {
  const res = await fetch(`${BASE}/oficios/${id}/turnar/devolver`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

/** El área regresa un delegatorio a quien lo detonó, por no ser de su competencia. */
export async function rechazarDelegatorio(id: number, motivo: string) {
  const res = await fetch(`${BASE}/delegatorios/${id}/rechazar`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

/**
 * Inicia la búsqueda de testamentos: marca el oficio, fija los plazos y devuelve
 * cuántos días hábiles tienen las delegaciones para contestar.
 */
/** Campos de captura que el área puede corregir. Debe coincidir con el servidor. */
export interface CorreccionOficio {
  remitente?:             string;
  dependencia_origen?:    string;
  unidad_interna?:        string | null;
  numero_oficio_origen?:  string | null;
  fecha_oficio?:          string | null;
  descripcion_solicitud?: string;
  correo_origen?:         string | null;
}

/**
 * Corrige los datos que capturó la oficialía. Solo se mandan los campos que se
 * tocaron: el servidor ignora los ausentes en vez de vaciarlos.
 */
export async function corregirDatosOficio(id: number, datos: CorreccionOficio) {
  const res = await fetch(`${BASE}/oficios/${id}/datos`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(datos),
  });
  return handleResponse<{ message: string; data: { cambios: number } }>(res);
}

export async function marcarTestamento(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/testamento`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ testamento: true }),
  });
  return handleResponse<{ message: string; data: {
    testamento_vence_delegaciones: string;
    testamento_vence_encargado: string;
  } }>(res);
}

export async function quitarTestamento(id: number) {
  const res = await fetch(`${BASE}/oficios/${id}/testamento`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ testamento: false }),
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
  fre_incorporado?: boolean;
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

/**
 * Candidatos a asignar/reasignar: los analistas designados en el área **del
 * oficio**, con el módulo de oficios habilitado.
 *
 * Hay que mandar el oficio. Sin él, el servidor responde con los del área de
 * quien pregunta, que es lo correcto solo cuando ambas coinciden — en la bandeja
 * de delegatorios, por ejemplo, donde el reparto es dentro de la propia área.
 * Para asignar un oficio manda siempre su id: un encargado puede dirigir un área
 * distinta a la suya, y ahí las dos listas no son la misma.
 */
export async function getCandidatosAsignacion(oficioId?: number): Promise<Abogado[]> {
  const qs = oficioId ? `?oficio_id=${oficioId}` : '';
  const res = await fetch(`${BASE}/oficios/candidatos-asignacion${qs}`, {
    headers: authHeaders(),
  });
  return handleResponse<{ data: Abogado[] }>(res).then((r) => r.data);
}

/**
 * A quién se puede dirigir un oficio al registrarlo. El servidor acota la lista
 * según el área de quien pregunta: desde una delegación, solo su propio titular
 * y la Dirección General.
 */
export async function getDestinatarios(): Promise<Abogado[]> {
  const res = await fetch(`${BASE}/oficios/destinatarios`, { headers: authHeaders() });
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
  /** La contraseña actual la puso un tercero y el usuario aún no la ha cambiado. */
  password_debe_cambiar?: boolean;
  /** Cuándo se fijó la contraseña actual; con la bandera arriba, desde cuándo espera. */
  password_cambiada_en?:  string | null;
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
  /** Clave del módulo que debe tener habilitado. */
  modulo?:    string;
}) {
  const qs = new URLSearchParams();
  if (params?.page)       qs.set('page',       String(params.page));
  if (params?.limit)      qs.set('limit',      String(params.limit));
  if (params?.rol)        qs.set('rol',        params.rol);
  if (params?.oficina_id) qs.set('oficina_id', String(params.oficina_id));
  if (params?.modulo)     qs.set('modulo',     params.modulo);
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
  return handleResponse<{ data: UsuarioAdmin; aviso?: string | null; message: string }>(res);
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
  return handleResponse<{ data: UsuarioAdmin; aviso?: string | null; message: string }>(res);
}

export async function adminToggleActivo(id: number) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}/toggle-activo`, {
    method:  'PATCH',
    headers: authHeaders(),
  });
  return handleResponse<{ message: string; activo: boolean }>(res);
}

/**
 * Genera una contraseña temporal para alguien que perdió la suya.
 *
 * Ya no se manda ninguna contraseña: la elige el servidor y la devuelve EN CLARO
 * una sola vez, porque la base guarda solo el hash y después no hay forma de
 * volver a consultarla. Quien la reciba tiene que anotarla antes de cerrar.
 */
export async function adminResetPassword(id: number) {
  const res = await fetch(`${BASE}/admin/usuarios/${id}/reset-password`, {
    method:  'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  });
  return handleResponse<{ data: { password_temporal: string; usuario: string }; message: string }>(res);
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

export type EstadoDelegatorio =
  | 'PENDIENTE' | 'ASIGNADO' | 'EN_REVISION' | 'CONTESTADO'
  /** El área destino la regresó por no ser de su competencia. */
  | 'RECHAZADO'
  /** Quien la pidió la cerró: ya no la necesita, o le pidió a la que no era. */
  | 'CANCELADO';

export interface Delegatorio {
  /** Plazo del área, cuando lo tiene (búsqueda de testamentos). */
  fecha_vencimiento?:   string | null;
  dias_transcurridos?:  number;
  dias_restantes?:      number | null;
  vencido?:             boolean;
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

export interface AreaDestino {
  id:     number;
  nombre: string;
  tipo:   'DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION';
  /** Titular al que quedaría dirigido. Nulo si el área no tiene ninguno activo. */
  titular_id:     number | null;
  titular_nombre: string | null;
}

/**
 * Las áreas a las que puede dirigirse este oficio, según dónde vive hoy.
 *
 * Es la única lista: la usan las tres opciones de «Turnar a otra área». Antes
 * había tres distintas que no coincidían entre sí, y una de ellas se recortaba
 * según quién preguntaba en vez de según dónde estaba el oficio.
 */
export async function getAreasDestino(oficioId: number) {
  const res = await fetch(`${BASE}/delegatorios/areas-destino?oficio_id=${oficioId}`, { headers: authHeaders() });
  return handleResponse<{ data: AreaDestino[] }>(res);
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

/**
 * Quien pidió cierra su propia solicitud, con motivo.
 *
 * Mientras una solicitud siga abierta, el oficio de quien la pidió no puede
 * recibir visto bueno ni firma. Sin esto, destrabarlo dependía de que el área
 * destino se acordara de contestar.
 */
export async function cancelarSolicitud(id: number, motivo: string) {
  const res = await fetch(`${BASE}/delegatorios/${id}/cancelar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ motivo }),
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

// ── Control de Correspondencia ───────────────────────────────────────────────
//
// Las rutas de `/publico/` NO llevan `authHeaders()`: son las que abre el QR desde
// la cámara del teléfono y no piden sesión. Mandarles un token que quizá esté
// vencido solo serviría para que fallaran.

const CORR = `${BASE}/correspondencia`;

export type EstadoPaquete = 'ABIERTO' | 'EN_TRANSITO' | 'ENTREGADO' | 'CANCELADO';

export interface Paquete {
  id:                   number;
  folio:                string;
  estado:               EstadoPaquete;
  destinatario_id:      number;
  destinatario_nombre:  string;
  destinatario_unidad:  string | null;
  creado_por_nombre:    string | null;
  unidad_origen_nombre: string | null;
  /** Quién lo trae ahora. Sale del último movimiento, no de una columna. */
  custodio_nombre:      string | null;
  custodio_id:          number | null;
  cuantos_oficios:      number;
  observaciones:        string | null;
  creado_en:            string;
  cerrado_en:           string | null;
  entregado_en:         string | null;
  /** Solo llega en la vista «para mí» y en el detalle si eres el destinatario. */
  codigo_recepcion?:    string | null;
  token?:               string;
}

/**
 * Un renglón del contenido. Es UNA de dos cosas, nunca las dos:
 *   · un oficio de PRISMA  → trae `id`, `folio`, `remitente`…
 *   · algo descrito a mano → trae solo `descripcion`
 */
export interface OficioEnPaquete {
  contenido_id: number;
  descripcion: string | null;
  id: number | null; folio: string | null; remitente: string | null;
  dependencia_origen: string | null; numero_oficio_origen: string | null; estatus: string | null;
}

export interface MovimientoPaquete {
  id: number;
  tipo: 'CREADO' | 'CERRADO' | 'TRASLADO' | 'ENTREGADO' | 'CANCELADO';
  quien: string | null;
  /** true cuando la persona no está en el sistema y solo dejó su nombre. */
  declarado: boolean;
  unidad: string | null;
  nota: string | null;
  registrado_en: string;
}

export type VistaPaquetes = 'armando' | 'traigo' | 'para_mi' | 'todos';

export async function getPaquetes(vista: VistaPaquetes) {
  const res = await fetch(`${CORR}/paquetes?vista=${vista}`, { headers: authHeaders() });
  return handleResponse<{ data: Paquete[] }>(res);
}

export async function getPaquete(id: number) {
  const res = await fetch(`${CORR}/paquetes/${id}`, { headers: authHeaders() });
  return handleResponse<{ data: Paquete & { oficios: OficioEnPaquete[]; recorrido: MovimientoPaquete[] } }>(res);
}

export async function getDestinatariosPaquete() {
  const res = await fetch(`${CORR}/paquetes/destinatarios`, { headers: authHeaders() });
  return handleResponse<{ data: { id: number; nombre: string; unidad: string | null }[] }>(res);
}

export async function crearPaquete(destinatario_id: number, observaciones?: string) {
  const res = await fetch(`${CORR}/paquetes`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinatario_id, observaciones }),
  });
  return handleResponse<{ data: { id: number; folio: string; token: string }; message: string }>(res);
}

/** Un oficio del sistema, o algo descrito a mano. Uno u otro, nunca los dos. */
export async function agregarAPaquete(
  paqueteId: number, que: { oficio_id?: number; descripcion?: string },
) {
  const res = await fetch(`${CORR}/paquetes/${paqueteId}/oficios`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(que),
  });
  return handleResponse<{ message: string }>(res);
}

/** Se quita por el id del RENGLÓN: el contenido libre no tiene oficio. */
export async function quitarDePaquete(paqueteId: number, contenidoId: number) {
  const res = await fetch(`${CORR}/paquetes/${paqueteId}/contenido/${contenidoId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

/**
 * Buscador propio del módulo. No usa el de oficios porque aquel responde «¿te toca
 * trabajar este expediente?», y quien arma paquetes puede no tener ninguno.
 */
export async function buscarOficiosParaPaquete(q: string) {
  const res = await fetch(`${CORR}/paquetes/buscar-oficios?q=${encodeURIComponent(q)}`,
                          { headers: authHeaders() });
  return handleResponse<{ data: {
    id: number; folio: string; numero_oficio_origen: string | null;
    remitente: string; dependencia_origen: string | null;
    fecha_oficio: string | null; descripcion_solicitud: string | null;
    estatus: string; fecha_registro: string;
    dirigido_a_nombre: string | null;
  }[] }>(res);
}

export async function cerrarPaquete(paqueteId: number) {
  const res = await fetch(`${CORR}/paquetes/${paqueteId}/cerrar`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return handleResponse<{ data: { folio: string; token: string; codigo: string; url_qr: string }; message: string }>(res);
}

export async function cancelarPaquete(paqueteId: number, motivo: string) {
  const res = await fetch(`${CORR}/paquetes/${paqueteId}/cancelar`, {
    method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Lo público: lo que abre el QR ────────────────────────────────────────────

export interface PaqueteEscaneado {
  id: number; folio: string; estado: EstadoPaquete;
  destinatario_id: number; destinatario_nombre: string; destinatario_unidad: string | null;
  custodio_nombre: string | null; custodio_id: number | null;
  cuantos_oficios: number; creado_en: string; cerrado_en: string | null;
  oficios: { folio: string; remitente: string; dependencia_origen: string | null }[];
  recorrido: { tipo: string; quien: string | null; registrado_en: string }[];
}

export async function rastrearPaquete(token: string) {
  const res = await fetch(`${CORR}/publico/${token}`);
  return handleResponse<{ data: PaqueteEscaneado }>(res);
}

export async function personasParaEscaneo() {
  const res = await fetch(`${CORR}/publico/personas`);
  return handleResponse<{ data: { id: number; nombre: string; unidad: string | null }[] }>(res);
}

export async function registrarTrasladoPaquete(
  token: string, quien: { usuario_id?: number; nombre_declarado?: string },
) {
  const res = await fetch(`${CORR}/publico/${token}/traslado`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quien),
  });
  return handleResponse<{ message: string }>(res);
}

export async function registrarEntregaPaquete(token: string, codigo: string) {
  const res = await fetch(`${CORR}/publico/${token}/entrega`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Eventos: quitar trabajo del tablero ──────────────────────────────────────

/**
 * Borra una actividad. El servidor solo lo permite si nadie la tocó; en cuanto
 * tiene avances, comentarios o ya arrancó, responde 409 pidiendo cancelarla.
 */
export async function borrarTareaEvento(eventoId: number, tareaId: number) {
  const res = await fetch(`${BASE}/eventos/${eventoId}/tareas/${tareaId}`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  return handleResponse<{ message: string }>(res);
}

/** Cancela una actividad. El motivo es obligatorio: sin él el servidor responde 422. */
export async function cancelarTareaEvento(eventoId: number, tareaId: number, motivo: string) {
  const res = await fetch(`${BASE}/eventos/${eventoId}/tareas/${tareaId}/cancelar`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo }),
  });
  return handleResponse<{ message: string }>(res);
}

/** Borra un evento. Solo su creador, y solo si no tiene actividades dentro. */
export async function borrarEvento(eventoId: number) {
  const res = await fetch(`${BASE}/eventos/${eventoId}`, {
    method: 'DELETE', headers: { ...authHeaders() },
  });
  return handleResponse<{ message: string }>(res);
}
