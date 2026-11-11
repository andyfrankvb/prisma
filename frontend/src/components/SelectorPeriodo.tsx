/**
 * Componente: SelectorPeriodo
 * File: src/frontend/components/SelectorPeriodo.tsx
 *
 * Rango de fechas (desde/hasta) libre, con atajos para mes/trimestre/año —
 * para poder sacar reportes y comparativas por cualquiera de esas unidades
 * sin escribir fechas a mano. Usado por SeccionIngresosSatq y Reportes_SATQ.
 */

import React from 'react';
import { theme } from '../theme';

interface Props {
  desde:    string;
  hasta:    string;
  onChange: (desde: string, hasta: string) => void;
  /** Botón "Limpiar" al final de los atajos. Si se omite, no se muestra. */
  onLimpiar?: () => void;
  /** Si es false, el botón "Limpiar" no se muestra aunque venga onLimpiar (ej. nada que limpiar). */
  mostrarLimpiar?: boolean;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const primerDiaMes    = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const ultimoDiaMes    = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

function rangoMesActual()     { const h = new Date(); return { desde: iso(primerDiaMes(h)), hasta: iso(ultimoDiaMes(h)) }; }
function rangoMesAnterior()   { const h = new Date(); const m = new Date(h.getFullYear(), h.getMonth() - 1, 1); return { desde: iso(primerDiaMes(m)), hasta: iso(ultimoDiaMes(m)) }; }
function rangoTrimestreActual() {
  const h = new Date();
  const inicioTrimestre = Math.floor(h.getMonth() / 3) * 3;
  const desde = new Date(h.getFullYear(), inicioTrimestre, 1);
  const hasta = new Date(h.getFullYear(), inicioTrimestre + 3, 0);
  return { desde: iso(desde), hasta: iso(hasta) };
}
function rangoAnioActual()    { const h = new Date(); return { desde: `${h.getFullYear()}-01-01`, hasta: `${h.getFullYear()}-12-31` }; }
function rangoAnioAnterior()  { const h = new Date(); const y = h.getFullYear() - 1; return { desde: `${y}-01-01`, hasta: `${y}-12-31` }; }

const PRESETS: { label: string; rango: () => { desde: string; hasta: string } }[] = [
  { label: 'Este mes',       rango: rangoMesActual },
  { label: 'Mes anterior',   rango: rangoMesAnterior },
  { label: 'Este trimestre', rango: rangoTrimestreActual },
  { label: 'Este año',       rango: rangoAnioActual },
  { label: 'Año anterior',   rango: rangoAnioAnterior },
];

export function rangoDeMesInicial(): { desde: string; hasta: string } {
  return rangoMesActual();
}

export const SelectorPeriodo: React.FC<Props> = ({ desde, hasta, onChange, onLimpiar, mostrarLimpiar = true }) => {
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: '8px',
    border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family,
  };
  const btnStyle = (activo: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
    border: `1px solid ${theme.colors.primary}`, cursor: 'pointer',
    backgroundColor: activo ? theme.colors.primary : '#fff',
    color: activo ? '#fff' : theme.colors.primary,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, fontWeight: 600 }}>Periodo:</span>
      <input type="date" value={desde} max={hasta} onChange={(e) => onChange(e.target.value, hasta)} style={inputStyle} />
      <span style={{ color: theme.colors.textSecondary, fontSize: '0.8rem' }}>a</span>
      <input type="date" value={hasta} min={desde} onChange={(e) => onChange(desde, e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const r = p.rango();
          const activo = r.desde === desde && r.hasta === hasta;
          return (
            <button key={p.label} type="button" onClick={() => onChange(r.desde, r.hasta)} style={btnStyle(activo)}>
              {p.label}
            </button>
          );
        })}
        {onLimpiar && mostrarLimpiar && (
          <button
            type="button"
            onClick={onLimpiar}
            style={{
              padding: '5px 11px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
              border: `1px solid ${theme.colors.border}`, cursor: 'pointer',
              backgroundColor: '#fff', color: theme.colors.textSecondary,
            }}
          >
            ✕ Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
};
