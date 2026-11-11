import React from 'react';
import type { DireccionOrden } from './types';

/** Flechas y barras de los tres estados del control del sistema de referencia. */
export function IconoOrdenAcervo({ direccion }: { direccion?: DireccionOrden }) {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.35" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
    {direccion === undefined
      ? <><path d="M5 16V4M2.5 6.5 5 4l2.5 2.5M14 4v12m-2.5-2.5L14 16l2.5-2.5" /></>
      : direccion === 'asc'
        ? <><path d="M5 16V4M2.5 6.5 5 4l2.5 2.5M10 5h1M10 8h3M10 11h5M10 14h7" /></>
        : <><path d="M5 4v12m-2.5-2.5L5 16l2.5-2.5M10 5h1M10 8h3M10 11h5M10 14h7" /></>}
  </svg>;
}
