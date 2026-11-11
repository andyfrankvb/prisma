/// <reference types="vite/client" />
import { crearTransporteCancelableAcervo } from '../modules/acervo/controlBusquedaAcervo';
import type {
  AcervoBusqueda, AcervoDelegacion, AcervoEstado, AcervoFolioDetalle,
  AntecedenteFiltros, AntecedenteResultado, InmuebleFiltros, InmuebleResultado,
} from '../modules/acervo/types';

interface ErrorHttpAcervo { message?: string; }

export interface AcervoApi {
  cancelarBusqueda?(signal: AbortSignal): Promise<void>;
  estado(signal?: AbortSignal): Promise<AcervoEstado>;
  delegaciones(signal?: AbortSignal): Promise<AcervoDelegacion[]>;
  antecedentes(filtros: AntecedenteFiltros, signal?: AbortSignal): Promise<AcervoBusqueda<AntecedenteResultado>>;
  inmuebles(filtros: InmuebleFiltros, signal?: AbortSignal): Promise<AcervoBusqueda<InmuebleResultado>>;
  detalle(folioId: string, delegacionId: number, signal?: AbortSignal): Promise<AcervoFolioDetalle>;
}

/** Mismo token, base y manejo de 401 que el cliente de PRISMA. */
export function crearAcervoApi(pedir: typeof fetch = fetch): AcervoApi {
  const control = crearTransporteCancelableAcervo(pedir);
  pedir = control.pedir;
  const base = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '') + '/acervo';

  async function obtener<T>(ruta: string, signal?: AbortSignal): Promise<T> {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = token ? { Authorization: 'Bearer ' + token } : {};
    const respuesta = await pedir(base + ruta, { headers, signal });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => null) as ErrorHttpAcervo | null;
      if (respuesta.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('debe_cambiar_password');
        window.location.href = '/login';
      }
      throw new Error(cuerpo?.message ?? 'No se pudo consultar Acervo (HTTP ' + respuesta.status + ').');
    }
    return respuesta.json() as Promise<T>;
  }

  function consulta(filtros: AntecedenteFiltros | InmuebleFiltros): string {
    const parametros = new URLSearchParams();
    for (const [campo, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== '') parametros.set(campo, String(valor));
    }
    return '?' + parametros.toString();
  }

  return {
    cancelarBusqueda: control.cancelarBusqueda,
    estado: (signal) => obtener<AcervoEstado>('/estado', signal),
    delegaciones: (signal) => obtener<AcervoDelegacion[]>('/delegaciones', signal),
    antecedentes: (filtros, signal) => obtener<AcervoBusqueda<AntecedenteResultado>>('/antecedentes' + consulta(filtros), signal),
    inmuebles: (filtros, signal) => obtener<AcervoBusqueda<InmuebleResultado>>('/inmuebles' + consulta(filtros), signal),
    detalle: (folioId, delegacionId, signal) => obtener<AcervoFolioDetalle>(
      '/folios/' + encodeURIComponent(folioId) + '?delegacion_id=' + delegacionId, signal,
    ),
  };
}

export const acervoApi = crearAcervoApi();
