/**
 * DTOs: Consulta Pública SIQROO
 * File: src/modules/consultas/dtos/consulta.dto.ts
 *
 * Migrado desde SID (src/app/services/consultas.service.ts —
 * `Consulta`/`ConsultasResponse` — y backend/app/Http/Controllers/APITurnos.php
 * — listarConsultas + crearConsulta). Contratos de solicitud/respuesta de la
 * API de consulta, tipados estrictos (sin `any` ni `unknown`).
 *
 * Esquema limpio: no incluye `nombres`, `apellido`, `usuario`, `tramite` ni
 * `fecha_registro` del legacy — son columnas redundantes o no usadas por
 * ningún consumidor real (ver el comentario en la migración
 * infra/postgres/migrations/2026-09-18_consulta_publica.sql para el detalle
 * verificado contra los datos reales de SID).
 *
 * `oficina` es texto (no numérico) — así vive en la BD real de SID.
 */

/** Valor de un campo dentro del JSON de búsqueda (`busqueda`) — nunca `any`/`unknown`. */
export type ValorBusqueda = string | number | boolean | null;

/** Una fila del histórico — tal como vive en `consulta_publica`. */
export interface Consulta {
  id:              number;
  /** Id del registro en SID, cuando esta fila vino de la migración de datos. `null` si nació en PRISMA. */
  origen_id:       number | null;
  nombre_completo: string;
  codigo_acceso:   string;
  busqueda:        Record<string, ValorBusqueda>;
  filtro_busqueda: string | null;
  /** Categoría de quien consulta — "Consulta Pública", "Usuario RPPC: <rol>", etc. Abierto: SID ya emite valores fuera de su propio catálogo ("Filtro desconocido (N)"). */
  tipo_usuario:    string | null;
  oficina:         string | null;
  folio:           string | null;
  /** Estado del código de acceso al momento de la consulta: "activo" | "usado" (legacy, ligado a `turno`). */
  estado_contador: string | null;
  hora_busqueda:   string;
}

/** Solicitud de `GET /consultas` — todos los filtros son opcionales, igual que el legacy. */
export interface ConsultaListRequestDTO {
  codigo_acceso?:   string;
  filtro_busqueda?: string;
  nombre_completo?: string;
  busqueda?:        string;
  /** Código de oficina — texto, igual que la columna real (no es un id numérico). */
  oficina?:         string;
  page?:            number;
  per_page?:        number;
}

/** Alias retrocompatible — mismo contrato que `ConsultaListRequestDTO`. */
export type FiltrosConsulta = ConsultaListRequestDTO;

export interface ConsultasMeta {
  current_page: number;
  per_page:     number;
  total:        number;
  last_page:    number;
  from:         number | null;
  to:           number | null;
}

/** Respuesta de `GET /consultas` — paginada. */
export interface ConsultaListResponseDTO {
  data: Consulta[];
  meta: ConsultasMeta;
}

/** Alias retrocompatible — mismo contrato que `ConsultaListResponseDTO`. */
export type ConsultasResponse = ConsultaListResponseDTO;

/**
 * Solicitud de `POST /consultas` — la envía el kiosco de Consulta Pública
 * (SIQROO), sin sesión, igual que el legacy `crearConsulta`.
 *
 * Cubre solo la rama "temporal" (`codigo_acceso === '000'`), que hoy es el
 * 100% del tráfico real (73,753/73,753 filas en SID). La rama ligada a un
 * `turno` (código de acceso real, con estado activo/usado) queda pendiente
 * hasta que el módulo de turnos/kiosco se migre — ver nota en el servicio.
 */
export interface ConsultaCreateRequestDTO {
  codigo_acceso:    string;
  busqueda:         Record<string, ValorBusqueda>;
  nombre_completo?: string;
  filtro_busqueda?: string;
  tipo_usuario?:    string;
}

/** Alias retrocompatible — mismo contrato que `ConsultaCreateRequestDTO`. */
export type CrearConsultaPayload = ConsultaCreateRequestDTO;

export interface ConsultaCreateResponseDTO {
  data:    Consulta;
  message: string;
}

/** Alias retrocompatible — mismo contrato que `ConsultaCreateResponseDTO`. */
export type CrearConsultaResponse = ConsultaCreateResponseDTO;
