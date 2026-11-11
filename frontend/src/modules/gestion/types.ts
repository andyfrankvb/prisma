export interface Delegacion { id: string; nombre: string; disponible: boolean; }
export type Fila = Record<string, string | null>;
export interface Solicitud extends Fila { id: string; prelacion: string; fecha: string; hora: string; }
export interface Pagina<T> { filas: T[]; total: number; pagina: number; limite: number; }
export interface Resultado { exactos: Pagina<Solicitud>; sugeridos?: Pagina<Solicitud>; }
export interface Detalle { solicitud: Solicitud; actos: Fila[]; }
export type Tab = 'estatus' | 'solicitudes' | 'referencias' | 'imagen';
export interface Filtros {
  delegacion: string; tipo: string; criterio: string; pagina: number; pagina_sugeridos: number;
  limite: number; orden: string; direccion: string;
}
