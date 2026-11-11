/// <reference types="vite/client" />
import type { Delegacion, Detalle, Fila, Filtros, Pagina, Resultado } from '../modules/gestion/types';
import { crearTransporteCancelableGestion } from '../modules/gestion/controlBusquedaGestion';

export interface GestionApi {
  delegaciones(signal?: AbortSignal): Promise<Delegacion[]>;
  buscar(filtros: Filtros, signal?: AbortSignal): Promise<Resultado>;
  detalle(delegacion: string, id: string, signal?: AbortSignal): Promise<Detalle>;
  imagenes(delegacion: string, id: string, signal?: AbortSignal): Promise<Fila[]>;
  referencias(delegacion: string, criterio: string, pagina: number, limite: number, signal?: AbortSignal): Promise<Pagina<Fila>>;
  cancelarBusqueda?(signal: AbortSignal): Promise<void>;
}
export function crearGestionApi(pedir: typeof fetch = fetch): GestionApi {
  const transporte = crearTransporteCancelableGestion(pedir);
  const base = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '') + '/gestion';
  async function get<T>(ruta: string, parametros: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams(Object.entries(parametros).map(([k, v]) => [k, String(v)]));
    const token = localStorage.getItem('token');
    const response = await transporte.pedir(`${base}${ruta}?${query}`, { signal, headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      if (response.status === 401) {
        ['token', 'user', 'debe_cambiar_password'].forEach(k => localStorage.removeItem(k));
        window.location.href = '/login';
      }
      throw new Error(error?.message || 'No se pudo consultar Gestión. HTTP ' + response.status);
    }
    return response.json();
  }
  return {
    cancelarBusqueda: transporte.cancelarBusqueda,
    delegaciones: signal => get('/delegaciones', {}, signal),
    buscar: (filtros, signal) => get('/solicitudes', { ...filtros }, signal),
    detalle: (delegacion, id, signal) => get('/solicitudes/' + encodeURIComponent(id), { delegacion }, signal),
    imagenes: (delegacion, id, signal) => get('/solicitudes/' + encodeURIComponent(id) + '/imagenes', { delegacion }, signal),
    referencias: (delegacion, criterio, pagina, limite, signal) => get('/referencias', { delegacion, criterio, pagina, limite }, signal),
  };
}
export const gestionApi = crearGestionApi();
