/**
 * Componente: SeccionDiagnosticoConciliacion
 * File: src/frontend/components/SeccionDiagnosticoConciliacion.tsx
 *
 * Investiga el % de referencias SIN match en RPP dentro de un periodo:
 *  - Por día: si el % sube fuerte en los últimos días del rango, es señal de
 *    rezago de registro en RPP (aún no alcanza a reflejar los pagos más
 *    recientes), no necesariamente un hueco real.
 *  - Por concepto: qué tipos de trámite tienen una tasa de no-match fuera de
 *    lo normal, y cuánto dinero representa cada uno.
 *
 * Autocontenido: trae su propio selector de periodo, independiente del de
 * arriba (resumen ejecutivo) y del de la tabla de detalle — para poder
 * investigar un mes distinto sin perder los otros filtros.
 */

import React, { useState, useEffect } from 'react';
import { theme } from '../theme';
import { SelectorPeriodo, rangoDeMesInicial } from './SelectorPeriodo';
import { getSatqDiagnosticoConciliacion } from '../api';
import type { DiagnosticoConciliacionSatq, DiagnosticoDiaSatq, DiagnosticoConceptoSatq } from '../types';

const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>{text}</p>
);

function colorPorPct(pct: number): string {
  if (pct >= 30) return theme.colors.alert.red;
  if (pct >= 15) return theme.colors.gold;
  return theme.colors.alert.green;
}

export const SeccionDiagnosticoConciliacion: React.FC = () => {
  const inicial = rangoDeMesInicial();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [datos, setDatos] = useState<DiagnosticoConciliacionSatq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getSatqDiagnosticoConciliacion({ desde, hasta })
      .then((r) => { if (!cancelado) setDatos(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [desde, hasta]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="no-imprimir">
        <SelectorPeriodo
          desde={desde} hasta={hasta}
          onChange={(d, h) => { setDesde(d); setHasta(h); }}
          onLimpiar={() => { const def = rangoDeMesInicial(); setDesde(def.desde); setHasta(def.hasta); }}
          mostrarLimpiar={desde !== inicial.desde || hasta !== inicial.hasta}
        />
      </div>
      <p className="solo-impresion" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: theme.colors.primaryDark }}>
        Periodo del diagnóstico: {desde} a {hasta}
      </p>

      {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
      {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
      {!loading && !error && datos && (
        <>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '4px' }}>
              % sin match por día
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              Si sube fuerte en los últimos días del rango, probablemente es rezago de registro en RPP (aún no
              alcanza a reflejar los pagos más recientes) — no un hueco real. Un % alto y estable a lo largo de todo
              el periodo sí vale la pena investigar.
            </p>
            <DiaBarChart dias={datos.por_dia} />
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '4px' }}>
              Conceptos con más impacto en el no-match
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              Ordenado por monto sin match (mayor impacto primero), solo conceptos con al menos 20 filas en el
              periodo. Un % muy por encima del resto puede señalar un tipo de trámite con problema de integración.
            </p>
            <ConceptoTabla filas={datos.por_concepto} />
          </div>
        </>
      )}
    </div>
  );
};

// ── DiaBarChart (SVG puro) ──────────────────────────────────────

const DiaBarChart: React.FC<{ dias: DiagnosticoDiaSatq[] }> = ({ dias }) => {
  if (dias.length === 0) return <EmptyState text="Sin datos en el período" />;

  const W = 720; const H = 190; const PAD = { top: 10, right: 10, bottom: 34, left: 34 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxPct = Math.max(...dias.map((d) => d.pct_sin_match), 10);
  const barGap = 2;
  const barW = Math.max(2, chartW / dias.length - barGap);

  // Mostrar día del mes solo en algunos ticks para no saturar
  const step = Math.max(1, Math.ceil(dias.length / 10));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: '480px' }}>
        {[0, 25, 50, 75, 100].filter((t) => t <= maxPct + 10).map((t) => {
          const y = PAD.top + chartH - (t / (maxPct * 1.1)) * chartH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={theme.colors.border} strokeDasharray="3 3" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="8" fill={theme.colors.textSecondary}>{t}%</text>
            </g>
          );
        })}
        {dias.map((d, i) => {
          const x = PAD.left + i * (chartW / dias.length);
          const h = (d.pct_sin_match / (maxPct * 1.1)) * chartH;
          const y = PAD.top + chartH - h;
          const dia = Number(d.fecha.slice(8, 10));
          return (
            <g key={d.fecha}>
              <rect x={x} y={y} width={barW} height={Math.max(1, h)} fill={colorPorPct(d.pct_sin_match)} rx="1.5">
                <title>{`${d.fecha}: ${d.pct_sin_match}% sin match (${d.sin_match} de ${d.total})`}</title>
              </rect>
              {i % step === 0 && (
                <text x={x + barW / 2} y={H - PAD.bottom + 12} textAnchor="middle" fontSize="8" fill={theme.colors.textSecondary}>
                  {dia}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── ConceptoTabla ─────────────────────────────────────────────

const ConceptoTabla: React.FC<{ filas: DiagnosticoConceptoSatq[] }> = ({ filas }) => {
  if (filas.length === 0) return <EmptyState text="Sin conceptos con volumen suficiente en el período" />;

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: `1px solid ${theme.colors.border}`,
  };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: '0.8rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Concepto</th>
            <th style={{ ...th, textAlign: 'right' }}>Filas</th>
            <th style={{ ...th, textAlign: 'right' }}>Sin match</th>
            <th style={{ ...th, textAlign: 'right' }}>% sin match</th>
            <th style={{ ...th, textAlign: 'right' }}>Monto sin match</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id_concepto ?? f.concepto}>
              <td style={{ ...td, maxWidth: '340px' }} title={f.concepto}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.concepto}</span>
              </td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>{f.total.toLocaleString('es-MX')}</td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>{f.sin_match.toLocaleString('es-MX')}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colorPorPct(f.pct_sin_match) }}>{f.pct_sin_match}%</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{MONEDA.format(f.monto_sin_match)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
