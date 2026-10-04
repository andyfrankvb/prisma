/**
 * Component: FiltroCampanias
 * File: src/frontend/components/visor/FiltroCampanias.tsx
 *
 * Elegir de qué digitalizaciones ver resultados.
 *
 * El acervo se ha digitalizado varias veces y las campañas no se reemplazan: se
 * complementan. En un mismo tomo hay documentos que solo están en la primera
 * digitalización y otros que solo están en la nueva, así que filtrar no es un
 * capricho de pantalla — es la única forma de responder "¿qué trajo PEMR 2025
 * de este tomo?".
 *
 * Sin nada seleccionado se muestran todas, que es lo que casi siempre se
 * quiere; seleccionar es acotar.
 */
import React from 'react';
import { theme } from '../../theme';
import type { VisorCampania } from '../../types';

interface Props {
  campanias:     VisorCampania[];
  seleccionadas: string[];
  onCambiar:     (claves: string[]) => void;
}

export const FiltroCampanias: React.FC<Props> = ({ campanias, seleccionadas, onCambiar }) => {
  if (campanias.length === 0) return null;

  const alternar = (clave: string) => {
    onCambiar(seleccionadas.includes(clave)
      ? seleccionadas.filter((c) => c !== clave)
      : [...seleccionadas, clave]);
  };

  const estiloFicha = (activa: boolean, pendiente: boolean): React.CSSProperties => ({
    padding: '6px 13px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${activa ? theme.colors.primary : theme.colors.border}`,
    background: activa ? theme.colors.primary : theme.colors.white,
    color: activa ? theme.colors.white : (pendiente ? theme.colors.textSecondary : theme.colors.text),
    fontSize: '0.78rem',
    fontFamily: theme.font.family,
    fontWeight: activa ? 600 : 400,
    cursor: pendiente ? 'not-allowed' : 'pointer',
    opacity: pendiente ? 0.6 : 1,
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: theme.colors.textSecondary }}>
        Digitalizaciones
      </span>

      <button
        type="button"
        onClick={() => onCambiar([])}
        style={estiloFicha(seleccionadas.length === 0, false)}
      >
        Todas
      </button>

      {campanias.map((c) => {
        const pendiente = c.estado === 'pendiente';
        return (
          <button
            key={c.clave}
            type="button"
            disabled={pendiente}
            onClick={() => alternar(c.clave)}
            // Una campaña pendiente se muestra, apagada, en vez de ocultarse:
            // así se sabe que existe y que su acervo todavía no se carga, que
            // no es lo mismo que no tener documentos.
            title={pendiente ? `${c.nombre}: su acervo todavía no se carga` : c.descripcion ?? c.nombre}
            style={estiloFicha(seleccionadas.includes(c.clave), pendiente)}
          >
            {c.nombre}
          </button>
        );
      })}
    </div>
  );
};

export default FiltroCampanias;
