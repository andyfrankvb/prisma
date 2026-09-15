/**
 * View: SeleccionReporte ("Módulo de Reportes")
 * File: src/frontend/views/SeleccionReporte.tsx
 *
 * Landing del módulo de reportes: Alta Dirección elige qué reporte ver.
 * Cada reporte es una tarjeta — visual, resumida, sin filtros ni tablas en
 * esta pantalla. Hoy solo existe "Conciliación de Ingresos"; el siguiente
 * será FRE (Folio Registral Electrónico), y de ahí en adelante se agregan
 * tarjetas aquí, sin tocar la navegación de los reportes ya existentes.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import type { NombreIcono } from '../components/Icono';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';

interface ReporteCfg {
  clave:       string;
  ruta:        string;
  titulo:      string;
  descripcion: string;
  icon:        NombreIcono;
  color:       string;
  disponible:  boolean;
}

const REPORTES: ReporteCfg[] = [
  {
    clave:       'conciliacion_ingresos',
    ruta:        '/dashboard/reportes/conciliacion-ingresos',
    titulo:      'Conciliación de Ingresos',
    descripcion: 'Ingresos SATQ, subsidios y conciliación con RPP/SIQROO — por periodo, programa, municipio y delegación.',
    icon:        'grafica',
    color:       theme.colors.gold,
    disponible:  true,
  },
  {
    clave:       'fre',
    ruta:        '/dashboard/reportes/fre',
    titulo:      'FRE — Folio Registral Electrónico',
    descripcion: 'Universo de folios por año, tipo y oficina registral.',
    icon:        'documento',
    color:       theme.colors.primaryDark,
    disponible:  true,
  },
];

export const SeleccionReporte: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.border}`,
        padding: isMobile ? '14px 12px' : '16px 32px',
      }}>
        <button onClick={() => navigate('/seleccionar-modulo')} style={{ background: 'none', border: 'none', color: theme.colors.textSecondary, fontSize: '0.78rem', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
          ← Módulos
        </button>
        <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Módulo de Reportes</h2>
        <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
          Reportes ejecutivos para Alta Dirección — visuales y resumidos
        </p>
      </div>

      <div style={{ padding: isMobile ? '20px 12px 32px' : '32px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {REPORTES.map((r) => (
            <button
              key={r.clave}
              onClick={() => r.disponible && navigate(r.ruta)}
              disabled={!r.disponible}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px',
                padding: '22px', backgroundColor: '#fff', border: `2px solid ${theme.colors.border}`,
                borderRadius: theme.radius.md, cursor: r.disponible ? 'pointer' : 'default',
                textAlign: 'left', fontFamily: theme.font.family, transition: 'all 0.15s ease',
                opacity: r.disponible ? 1 : 0.55, position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (r.disponible) {
                  e.currentTarget.style.borderColor = r.color;
                  e.currentTarget.style.boxShadow = theme.shadow.sm;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.colors.border;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {!r.disponible && (
                <span style={{
                  position: 'absolute', top: '14px', right: '14px', fontSize: '0.65rem', fontWeight: 700,
                  color: theme.colors.textSecondary, backgroundColor: theme.colors.background,
                  padding: '3px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.03em',
                }}>
                  Próximamente
                </span>
              )}
              <div style={{
                width: '48px', height: '48px', borderRadius: '10px', backgroundColor: `${r.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icono nombre={r.icon} size={24} color={r.color} />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: theme.colors.textPrimary }}>{r.titulo}</p>
                <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}>{r.descripcion}</p>
              </div>
              {r.disponible && (
                <span style={{ color: r.color, fontSize: '0.85rem', fontWeight: 700 }}>Ver reporte →</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
