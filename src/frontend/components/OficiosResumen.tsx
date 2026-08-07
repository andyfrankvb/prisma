/**
 * Tarjeta grande de resumen de oficios. Muestra UN solo número que cambia según
 * el estatus seleccionado en los filtros:
 *   - Sin estatus ("Todos")  → Total de oficios.
 *   - Con un estatus elegido  → conteo de ese estatus (con su color e ícono).
 *
 * Reemplaza a la fila de 7 tarjetas. Compartido por Oficial, Gestión y Jurídico.
 */
import React from 'react';
import { theme } from '../theme';
import { ESTATUS_META, TOTAL_META } from './oficiosEstatus';

export const OficiosResumen: React.FC<{ conteos: Record<string, number>; estatus: string }> = ({ conteos, estatus }) => {
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  const meta  = ESTATUS_META.find((m) => m.value === estatus);

  const label = meta ? meta.label : TOTAL_META.label;
  const count = meta ? (conteos[estatus] ?? 0) : total;
  const color = meta ? meta.color : TOTAL_META.color;
  const icon  = meta ? meta.icon  : TOTAL_META.icon;

  return (
    <div style={{
      borderRadius: '14px', padding: '14px 18px',
      width: '100%', height: '100%', boxSizing: 'border-box',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      boxShadow: theme.shadow.sm, fontFamily: theme.font.family,
    }}>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.92 }}>{label}</div>
        <div style={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1.05 }}>{count}</div>
        <div style={{ fontSize: '0.7rem', opacity: 0.88 }}>
          {meta ? 'con este estatus' : 'en total'}
        </div>
      </div>
      <span style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
    </div>
  );
};
