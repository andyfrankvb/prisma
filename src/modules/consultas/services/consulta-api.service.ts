/**
 * Service: Consulta Pública SIQROO
 * File: src/modules/consultas/services/consulta-api.service.ts
 *
 * Capa de negocio/persistencia de la API de consulta, desacoplada del
 * transporte HTTP: no conoce `Request`/`Response` — el controller
 * (consultas.controller.ts) es quien parsea y valida la entrada de Express,
 * y este servicio recibe DTOs ya tipados.
 *
 * Migrado desde SID (backend/app/Http/Controllers/APITurnos.php —
 * listarConsultas + crearConsulta).
 *
 * Nota de arquitectura — por qué esto consulta la BD y no una API HTTP:
 * SID y PRISMA corren sobre bases de datos separadas (`sid` y `prisma`); el
 * histórico ya se migró por completo (ver db/migrate-consultas-sid.mjs,
 * 73,753/73,753 filas) y las búsquedas nuevas las guarda directamente este
 * mismo servicio vía `POST /consultas` (que SIQROO ya puede llamar sin pasar
 * por SID). No hay ningún endpoint HTTP externo del que este módulo dependa
 * hoy — llamar de vuelta a la API de SID aquí sería reintroducir la
 * dependencia que la migración ya eliminó.
 */

import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import {
  Consulta, ConsultaListRequestDTO, ConsultaListResponseDTO,
  ConsultaCreateRequestDTO, ValorBusqueda,
} from '../dtos/consulta.dto';

const PER_PAGE_DEFAULT      = 20;
const CODIGO_ACCESO_TEMPORAL = '000';

// ── GET /consultas — listado paginado y filtrable ─────────────────
export async function listarConsultas(filtros: ConsultaListRequestDTO): Promise<ConsultaListResponseDTO> {
  let query = db('consulta_publica');

  if (filtros.codigo_acceso) {
    query = query.where('codigo_acceso', filtros.codigo_acceso);
  }
  if (filtros.nombre_completo) {
    query = query.whereRaw('LOWER(nombre_completo) LIKE ?', [`%${filtros.nombre_completo.toLowerCase()}%`]);
  }
  if (filtros.filtro_busqueda) {
    query = query.where('filtro_busqueda', filtros.filtro_busqueda);
  }
  if (filtros.oficina) {
    query = query.where('oficina', filtros.oficina);
  }
  if (filtros.busqueda) {
    query = query.whereRaw('LOWER(busqueda::text) LIKE ?', [`%${filtros.busqueda.toLowerCase()}%`]);
  }

  const page    = filtros.page ?? 1;
  const perPage = filtros.per_page ?? PER_PAGE_DEFAULT;

  const [{ total }] = await query.clone().count<{ total: string }[]>({ total: '*' });
  const totalNum = Number(total);
  const lastPage = Math.max(1, Math.ceil(totalNum / perPage));

  const filas = await query
    .clone()
    .orderBy('hora_busqueda', 'desc')
    .limit(perPage)
    .offset((page - 1) * perPage) as Consulta[];

  return {
    data: filas,
    meta: {
      current_page: page,
      per_page:     perPage,
      total:        totalNum,
      last_page:    lastPage,
      from:         totalNum === 0 ? null : (page - 1) * perPage + 1,
      to:           totalNum === 0 ? null : Math.min(page * perPage, totalNum),
    },
  };
}

/** Extrae un campo de texto del JSON de búsqueda, tolerando número/booleano — nunca `any`. */
function textoDesdeBusqueda(busqueda: Record<string, ValorBusqueda>, campo: string): string | null {
  const valor = busqueda[campo];
  return valor !== undefined && valor !== null ? String(valor) : null;
}

/**
 * Registra una consulta — replica la rama "temporal" de
 * `APITurnos::crearConsulta` (código de acceso "000"), hoy el 100% del
 * tráfico real de SID (73,753/73,753 filas).
 *
 * Pendiente: la rama que valida contra un `turno` real (código de acceso
 * distinto de "000", estado activo/usado) — depende del módulo de
 * turnos/kiosco, que todavía no se migra a PRISMA. Mientras tanto, un
 * codigo_acceso distinto de "000" se registra igual (como hace el legacy con
 * cualquier turno válido), pero sin la validación contra la tabla de turnos.
 */
export async function registrarConsulta(datos: ConsultaCreateRequestDTO): Promise<{ consulta: Consulta; esTemporal: boolean }> {
  const esTemporal = datos.codigo_acceso === CODIGO_ACCESO_TEMPORAL;

  const nombreCompleto = datos.nombre_completo?.trim() || (esTemporal ? 'USUARIO TEMPORAL' : '');
  if (!esTemporal && !nombreCompleto) {
    throw new AppError('nombre_completo es requerido para un código de acceso real', 400);
  }

  const tipoUsuario = datos.tipo_usuario ?? (esTemporal ? null : 'publico');

  const [consulta] = await db('consulta_publica')
    .insert({
      nombre_completo:  nombreCompleto,
      codigo_acceso:    datos.codigo_acceso,
      busqueda:         datos.busqueda,
      filtro_busqueda:  datos.filtro_busqueda ?? null,
      tipo_usuario:     tipoUsuario,
      oficina:          textoDesdeBusqueda(datos.busqueda, 'oficina'),
      folio:            textoDesdeBusqueda(datos.busqueda, 'folio'),
      estado_contador:  esTemporal ? 'activo' : null,
    })
    .returning('*') as Consulta[];

  return { consulta, esTemporal };
}
