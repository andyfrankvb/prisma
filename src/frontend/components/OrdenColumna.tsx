/**
 * OrdenColumna — encabezado de tabla que ordena al hacer clic.
 *
 * Las flechitas ↑↓ son las mismas que ya usan en SIQROO, para que no haya que
 * aprender otra cosa: apagadas cuando la columna no manda el orden, y con la que
 * corresponde encendida cuando sí.
 *
 * El orden se resuelve en el servidor, no aquí. La lista viene paginada y
 * reacomodar solo lo que está cargado daría un orden falso: el primero de la
 * pantalla no sería el primero de verdad.
 */
import React from 'react';
import { theme } from '../theme';

export type Sentido = 'asc' | 'desc';
export interface OrdenLista { columna: string; sentido: Sentido }

export const OrdenColumna: React.FC<{
  texto:   string;
  /** Clave que entiende el servidor: folio, ingreso, termino, estatus, bandeja, sistemas. */
  columna: string;
  orden:   OrdenLista | null;
  onOrden: (o: OrdenLista) => void;
}> = ({ texto, columna, orden, onOrden }) => {
  const activa  = orden?.columna === columna;
  const sentido = activa ? orden!.sentido : null;

  return (
    <button
      type="button"
      // Primer clic: descendente —lo más reciente o lo más avanzado primero, que
      // es lo que se suele buscar—. El segundo lo invierte.
      onClick={() => onOrden({
        columna,
        sentido: activa && sentido === 'desc' ? 'asc' : 'desc',
      })}
      title={`Ordenar por ${texto.toLowerCase()}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
        font: 'inherit', color: activa ? theme.colors.primary : 'inherit',
        letterSpacing: 'inherit', textTransform: 'inherit' as any,
      }}
    >
      {texto}
      {/* Las dos flechas siempre visibles, como en SIQROO: se enciende la que
          manda y la otra queda tenue, para que se vea que se puede invertir. */}
      <span style={{ fontSize: '0.82rem', lineHeight: 1, letterSpacing: '-0.06em', fontWeight: 400 }}>
        <span style={{ opacity: sentido === 'asc'  ? 1 : 0.3 }}>↑</span>
        <span style={{ opacity: sentido === 'desc' ? 1 : 0.3 }}>↓</span>
      </span>
    </button>
  );
};
