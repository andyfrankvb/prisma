export const DELEGACIONES_GESTION = [
  { id: 'chetumal', nombre: 'Chetumal' }, { id: 'cancun', nombre: 'Cancún' },
  { id: 'playa', nombre: 'Playa del Carmen' }, { id: 'cozumel', nombre: 'Cozumel' },
] as const;
export type DelegacionGestion = typeof DELEGACIONES_GESTION[number]['id'];
export interface ClaveGestion { d: DelegacionGestion; p: string; f: string; h: string; o: string | null; }
export type FilaGestion = Record<string, string | null>;
export interface ActoGestion extends FilaGestion {
  consec: string; acto: string; acto_descripcion: string; estatus: string;
  analista: string | null; calificador: string | null;
}
export interface SolicitudGestion extends FilaGestion {
  id: string; prelacion: string; fecha: string; hora: string; seccion_descripcion: string;
  actos_resumen: string; estatus_resumen: string; movimientos: string; folios: string;
}
export interface DetalleGestion { solicitud: SolicitudGestion; actos: ActoGestion[]; }
export interface PaginaGestion<T> { filas: T[]; total: number; pagina: number; limite: number; }
export interface BusquedaGestion { exactos: PaginaGestion<SolicitudGestion>; sugeridos?: PaginaGestion<SolicitudGestion>; }
export interface ConsultaGestion {
  delegacion: DelegacionGestion; tipo: 'prelacion' | 'folio' | 'escritura'; criterio: string;
  pagina: number; pagina_sugeridos: number; limite: number; orden: string; direccion: 'asc' | 'desc';
}
