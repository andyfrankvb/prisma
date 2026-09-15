/**
 * View: Reportes_FRE ("FRE — Folio Registral Electrónico")
 * File: src/frontend/views/Reportes_FRE.tsx
 *
 * Reporte ejecutivo (Alta Dirección): universo total de folios del Registro
 * Público de la Propiedad y Comercio, por año, tipo de folio y oficina
 * registral. A diferencia de "Conciliación de Ingresos" no hay una tabla de
 * detalle filtrable en la pantalla principal — es deliberadamente resumido,
 * solo KPIs y gráficas. El detalle fila por fila existe como drill-down (🔍)
 * desde las tarjetas de tipo y desde "Folios sin año confiable", para poder
 * inspeccionar casos puntuales sin convertir la pantalla en una tabla.
 *
 * Nota de datos: "Testamentos" no tiene fecha de creación confiable en la
 * fuente (es un artefacto de carga masiva, no la fecha real) — su año viene
 * del folio mismo. "Bien Mueble" casi no tiene folios nuevos desde 2011: el
 * 89% de su historia es una digitalización puntual de 2010, no una serie
 * activa. Ambas notas se muestran en pantalla, no se ocultan.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import { Modal } from '../components/Modal';
import { EncabezadoImpresion } from '../components/EncabezadoImpresion';
import { BotonImprimirReporte } from '../components/BotonImprimirReporte';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { getFreResumen, getFreTipos, getFreOficinas, getFreDetalle } from '../api';
import type { ResumenFre, FreDetalleFila } from '../types';

const NUM = new Intl.NumberFormat('es-MX');
const OFICINA_COLORS = [theme.colors.primary, theme.colors.gold, theme.colors.charcoal, theme.colors.primaryLight, theme.colors.goldLight];
const TIPO_COLORS: Record<string, string> = {
  'Inmobiliario':   theme.colors.primary,
  'Persona Moral':  theme.colors.gold,
  'Testamentos':    theme.colors.charcoal,
  'Bien Mueble':    theme.colors.grayMid,
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>{text}</p>
);

interface FiltroModalFre {
  titulo:      string;
  tipo_folio?: string;
  oficina?:    string;
  sin_anio?:   boolean;
}

export const Reportes_FRE: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [anioDesde, setAnioDesde] = useState<string>('');
  const [anioHasta, setAnioHasta] = useState<string>('');
  const [tipoFolio, setTipoFolio] = useState('');
  const [oficina, setOficina]     = useState('');

  const [tipos, setTipos]         = useState<string[]>([]);
  const [oficinas, setOficinas]   = useState<string[]>([]);

  const [resumen, setResumen]     = useState<ResumenFre | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [modalDetalle, setModalDetalle] = useState<FiltroModalFre | null>(null);

  useEffect(() => {
    getFreTipos().then((r) => setTipos(r.data)).catch(() => {});
    getFreOficinas().then((r) => setOficinas(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getFreResumen({
      anio_desde: anioDesde ? Number(anioDesde) : undefined,
      anio_hasta: anioHasta ? Number(anioHasta) : undefined,
      tipo_folio: tipoFolio || undefined,
      oficina:    oficina || undefined,
    })
      .then((r) => { if (!cancelado) setResumen(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [anioDesde, anioHasta, tipoFolio, oficina]);

  const hayFiltros = !!(anioDesde || anioHasta || tipoFolio || oficina);
  const limpiarFiltros = () => { setAnioDesde(''); setAnioHasta(''); setTipoFolio(''); setOficina(''); };

  // ── Resumen de filtros para el encabezado impreso (el panel de filtros no se imprime) ──
  const filtrosImpresion = [
    anioDesde && `Año desde: ${anioDesde}`,
    anioHasta && `Año hasta: ${anioHasta}`,
    tipoFolio && `Tipo de folio: ${tipoFolio}`,
    oficina && `Oficina: ${oficina}`,
  ].filter(Boolean).join(' · ') || 'Histórico completo, sin filtros';

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`,
    fontSize: '0.85rem', fontFamily: theme.font.family, width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background }}>
      <div className="no-imprimir" style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.border}`,
        padding: isMobile ? '14px 12px' : '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
      }}>
        <div>
          <button onClick={() => navigate('/dashboard/reportes')} style={{ background: 'none', border: 'none', color: theme.colors.textSecondary, fontSize: '0.78rem', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
            ← Módulo de Reportes
          </button>
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>FRE — Folio Registral Electrónico</h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Universo total de folios por año, tipo y oficina registral
          </p>
        </div>
        <BotonImprimirReporte />
      </div>

      <div className="reporte-imprimible" style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <EncabezadoImpresion
          titulo="FRE — Folio Registral Electrónico"
          subtitulo="Universo total de folios por año, tipo y oficina registral"
          filtros={filtrosImpresion}
        />

        {/* ── Filtros (no se imprimen: su resumen ya va en el encabezado del PDF) ── */}
        <div className="no-imprimir" style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'end',
        }}>
          <div style={{ minWidth: '110px' }}>
            <label style={labelStyle}>Año desde</label>
            <input type="number" placeholder="Todos" value={anioDesde} onChange={(e) => setAnioDesde(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ minWidth: '110px' }}>
            <label style={labelStyle}>Año hasta</label>
            <input type="number" placeholder="Todos" value={anioHasta} onChange={(e) => setAnioHasta(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ minWidth: '180px', flex: 1 }}>
            <label style={labelStyle}>Tipo de folio</label>
            <select value={tipoFolio} onChange={(e) => setTipoFolio(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '180px', flex: 1 }}>
            <label style={labelStyle}>Oficina registral</label>
            <select value={oficina} onChange={(e) => setOficina(e.target.value)} style={inputStyle}>
              <option value="">Todas</option>
              {oficinas.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {hayFiltros && (
            <button onClick={limpiarFiltros} style={{
              background: 'none', border: `1px solid ${theme.colors.border}`, borderRadius: '8px',
              padding: '8px 14px', fontSize: '0.8rem', color: theme.colors.textSecondary, cursor: 'pointer',
            }}>
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
        {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
        {!loading && !error && resumen && (
          <>
            {/* ── KPIs ─────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <KpiCard label="Total de folios (filtro actual)" value={NUM.format(resumen.total_folios)} icon="documento" color={theme.colors.primary} />
              {resumen.comparativo_anio_anterior && (
                <KpiCard
                  label={`Folios ${resumen.comparativo_anio_anterior.anio}`}
                  value={NUM.format(resumen.comparativo_anio_anterior.cantidad)}
                  icon="grafica"
                  color={
                    resumen.comparativo_anio_anterior.pct_variacion === null ? theme.colors.charcoal
                    : resumen.comparativo_anio_anterior.pct_variacion >= 0 ? theme.colors.alert.green : theme.colors.alert.red
                  }
                  sub={
                    resumen.comparativo_anio_anterior.pct_variacion === null
                      ? `sin datos de ${resumen.comparativo_anio_anterior.anio_anterior} para comparar`
                      : `${resumen.comparativo_anio_anterior.pct_variacion >= 0 ? '▲' : '▼'} ${Math.abs(resumen.comparativo_anio_anterior.pct_variacion)}% vs. ${resumen.comparativo_anio_anterior.anio_anterior} (${NUM.format(resumen.comparativo_anio_anterior.cantidad_anio_anterior ?? 0)}) — año en curso, no comparable 1 a 1 contra un año completo`
                  }
                />
              )}
              <KpiCard label="Oficinas registrales activas" value={resumen.oficinas_activas} icon="edificio" color={theme.colors.charcoal} />
              {resumen.folios_sin_anio > 0 && (
                <KpiCard
                  label="Folios sin año confiable"
                  value={NUM.format(resumen.folios_sin_anio)}
                  icon="alerta"
                  color={theme.colors.grayMid}
                  sub="excluidos de la tendencia anual"
                  onClick={() => setModalDetalle({
                    titulo: 'Folios sin año confiable',
                    tipo_folio: tipoFolio || undefined,
                    oficina: oficina || undefined,
                    sin_anio: true,
                  })}
                />
              )}
            </div>

            {/* ── Por tipo de folio (tarjetas, no donut: Inmobiliario domina 98%) ── */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Folios por tipo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {resumen.por_tipo.map((t) => (
                  <div
                    key={t.tipo_folio}
                    onClick={() => setModalDetalle({
                      titulo: t.tipo_folio,
                      tipo_folio: t.tipo_folio,
                      oficina: oficina || undefined,
                    })}
                    style={{
                      backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${theme.colors.border}`,
                      borderLeft: `4px solid ${TIPO_COLORS[t.tipo_folio] ?? theme.colors.primary}`, padding: '16px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: theme.colors.textPrimary }}>{NUM.format(t.cantidad)}</div>
                    <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
                      {t.tipo_folio} · {t.pct}% <span style={{ fontSize: '0.7rem' }}>🔍</span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.68rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                Inmobiliario concentra ~98% del universo — por eso se muestra como tarjetas y no como pastel, que se vería casi monocromático.
              </p>
            </div>

            {/* ── Por oficina + Tendencia anual ──────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Folios por oficina registral
                </div>
                <OficinaBar filas={resumen.por_oficina} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Tendencia anual (histórico completo{tipoFolio ? ` — ${tipoFolio}` : ''}{oficina ? ` — ${oficina}` : ''})
                </div>
                <TendenciaChart filas={resumen.tendencia_anual} />
              </div>
            </div>

            {/* ── Cruce oficina x tipo ─────────────────────── */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Oficina × tipo de folio
              </div>
              <CruceTabla filas={resumen.cruce_oficina_tipo} tipos={resumen.por_tipo.map((t) => t.tipo_folio)} />
            </div>

            <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic', lineHeight: 1.6 }}>
              "Testamentos" no trae fecha de creación confiable en la fuente (miles de filas comparten el mismo timestamp de
              una carga masiva) — su año se toma del propio folio. "Bien Mueble" casi no tiene folios nuevos desde 2011: el
              89% de su historia es una digitalización puntual de 2010, no una serie activa — su línea de tendencia se ve
              como un solo pico, no como crecimiento real.
            </p>
          </>
        )}
      </div>

      <ModalDetalleFre filtro={modalDetalle} onClose={() => setModalDetalle(null)} />
    </div>
  );
};

// ── KpiCard (mismo patrón responsive que el resto del sistema) ──

function fontSizeParaValor(value: string): string {
  const len = value.length;
  if (len <= 9)  return '1.7rem';
  if (len <= 12) return '1.35rem';
  return '1.05rem';
}

const KpiCard: React.FC<{ label: string; value: number | string; icon: any; color: string; sub?: string; onClick?: () => void }> = ({ label, value, icon, color, sub, onClick }) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: '#fff', borderRadius: '10px', padding: '18px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
      cursor: onClick ? 'pointer' : undefined,
    }}
  >
    <div style={{ marginBottom: '8px' }}><Icono nombre={icon} size={22} color={color} /></div>
    <div style={{ fontSize: fontSizeParaValor(String(value)), fontWeight: 800, color, lineHeight: 1.15 }} title={String(value)}>
      {value}
    </div>
    <div style={{ fontSize: '0.76rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>
      {label}{onClick && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>🔍</span>}
    </div>
    {sub && <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginTop: '3px', lineHeight: 1.4 }}>{sub}</div>}
  </div>
);

// ── OficinaBar ────────────────────────────────────────────────

const OficinaBar: React.FC<{ filas: ResumenFre['por_oficina'] }> = ({ filas }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos con estos filtros" />;
  const max = Math.max(...filas.map((f) => f.cantidad), 1);
  return (
    <div>
      {filas.map((f, i) => {
        const pct = Math.round((f.cantidad / max) * 100);
        return (
          <div key={f.oficina} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.78rem', color: theme.colors.textPrimary }}>{f.oficina}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {NUM.format(f.cantidad)} <span style={{ color: theme.colors.textSecondary }}>({f.pct}%)</span>
              </span>
            </div>
            <div style={{ height: '10px', borderRadius: '5px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: OFICINA_COLORS[i % OFICINA_COLORS.length], borderRadius: '5px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── TendenciaChart (SVG puro: folios por año) ───────────────────

const TendenciaChart: React.FC<{ filas: ResumenFre['tendencia_anual'] }> = ({ filas }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos con estos filtros" />;
  const W = 720; const H = 220; const PAD = { top: 12, right: 10, bottom: 28, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...filas.map((f) => f.cantidad), 1);
  const barW = Math.max(2, (chartW / filas.length) * 0.7);
  const step = chartW / filas.length;
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  // Mostrar solo algunas etiquetas de año si hay muchas, para no amontonarlas
  const mostrarEtiqueta = (i: number) => filas.length <= 20 || i % Math.ceil(filas.length / 20) === 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: '560px' }}>
        {yTicks.map((t) => {
          const y = PAD.top + chartH - (t / maxVal) * chartH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={theme.colors.border} strokeDasharray="3 3" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="8" fill={theme.colors.textSecondary}>
                {t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}
              </text>
            </g>
          );
        })}
        {filas.map((f, i) => {
          const h = (f.cantidad / maxVal) * chartH;
          const x = PAD.left + i * step + (step - barW) / 2;
          return (
            <g key={f.anio}>
              <rect x={x} y={PAD.top + chartH - h} width={barW} height={h} fill={theme.colors.gold} rx="1">
                <title>{`${f.anio}: ${NUM.format(f.cantidad)} folios`}</title>
              </rect>
              {mostrarEtiqueta(i) && (
                <text x={x + barW / 2} y={H - PAD.bottom + 12} textAnchor="middle" fontSize="7.5" fill={theme.colors.textSecondary}>
                  {f.anio}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── CruceTabla ───────────────────────────────────────────────

const CruceTabla: React.FC<{ filas: ResumenFre['cruce_oficina_tipo']; tipos: string[] }> = ({ filas, tipos }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos con estos filtros" />;

  const oficinasSet = Array.from(new Set(filas.map((f) => f.oficina)));
  const matriz = new Map<string, Map<string, number>>();
  for (const f of filas) {
    if (!matriz.has(f.oficina)) matriz.set(f.oficina, new Map());
    matriz.get(f.oficina)!.set(f.tipo_folio, f.cantidad);
  }
  const totalPorTipo = new Map<string, number>();
  const totalPorOficina = new Map<string, number>();
  let granTotal = 0;
  for (const f of filas) {
    totalPorTipo.set(f.tipo_folio, (totalPorTipo.get(f.tipo_folio) ?? 0) + f.cantidad);
    totalPorOficina.set(f.oficina, (totalPorOficina.get(f.oficina) ?? 0) + f.cantidad);
    granTotal += f.cantidad;
  }

  const th: React.CSSProperties = {
    textAlign: 'right', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: `1px solid ${theme.colors.border}`,
  };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: '0.8rem', color: theme.colors.textPrimary, textAlign: 'right', borderBottom: `1px solid ${theme.colors.border}` };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Oficina registral</th>
            {tipos.map((t) => <th key={t} style={th}>{t}</th>)}
            <th style={{ ...th, fontWeight: 900 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {oficinasSet.map((of) => (
            <tr key={of}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{of}</td>
              {tipos.map((t) => <td key={t} style={td}>{NUM.format(matriz.get(of)?.get(t) ?? 0)}</td>)}
              <td style={{ ...td, fontWeight: 800 }}>{NUM.format(totalPorOficina.get(of) ?? 0)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 900 }}>Total general</td>
            {tipos.map((t) => <td key={t} style={{ ...td, fontWeight: 900 }}>{NUM.format(totalPorTipo.get(t) ?? 0)}</td>)}
            <td style={{ ...td, fontWeight: 900 }}>{NUM.format(granTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ── ModalDetalleFre — detalle fila por fila (ej. los folios sin año) ──

const DETALLE_MODAL_LIMIT  = 20;
const DETALLE_EXPORT_LIMIT = 10000;
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ModalDetalleFre: React.FC<{ filtro: FiltroModalFre | null; onClose: () => void }> = ({ filtro, onClose }) => {
  const [filas, setFilas]     = useState<FreDetalleFila[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setPage(1); }, [filtro]);

  useEffect(() => {
    if (!filtro) return;
    let cancelado = false;
    setLoading(true);
    setError(null);
    getFreDetalle({
      page, limit: DETALLE_MODAL_LIMIT,
      tipo_folio: filtro.tipo_folio,
      oficina: filtro.oficina,
      sin_anio: filtro.sin_anio,
    })
      .then((r) => { if (!cancelado) { setFilas(r.data); setTotal(r.meta.total); } })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtro, page]);

  const exportarExcel = async () => {
    if (!filtro) return;
    setExporting(true);
    setError(null);
    try {
      const res = await getFreDetalle({
        page: 1, limit: DETALLE_EXPORT_LIMIT,
        tipo_folio: filtro.tipo_folio,
        oficina: filtro.oficina,
        sin_anio: filtro.sin_anio,
      });

      const ExcelJS = (await import('exceljs')).default;
      const GUINDA = 'FFAB0A3D';
      const GRIS   = 'FF7A7570';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Detalle FRE', { views: [{ showGridLines: false }] });
      ws.columns = [
        { width: 26 }, { width: 18 }, { width: 20 }, { width: 10 }, { width: 20 }, { width: 40 },
      ];

      const headers = ['Folio (FRE)', 'Tipo de folio', 'Oficina', 'Año', 'Fecha (fuente)', 'Razón social'];

      ws.mergeCells(1, 1, 1, headers.length);
      const tCell = ws.getCell(1, 1);
      tCell.value = `DETALLE FRE: ${filtro.titulo}`.toUpperCase();
      tCell.font  = { bold: true, size: 16, color: { argb: GUINDA } };

      const subCell = ws.getCell(2, 1);
      subCell.value = `Generado: ${new Date().toLocaleString('es-MX')}  ·  ${res.data.length} de ${res.meta.total} registro(s)`;
      subCell.font  = { size: 9, color: { argb: GRIS } };

      const filaHead = 4;
      const hr = ws.getRow(filaHead);
      headers.forEach((h, i) => {
        const c = hr.getCell(i + 1);
        c.value = h;
        c.font  = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: GUINDA } };
        c.alignment = { vertical: 'middle', wrapText: true };
      });

      res.data.forEach((f, i) => {
        const row = ws.getRow(filaHead + 1 + i);
        const vals = [
          f.fre, f.tipo_folio, f.oficina, f.anio ?? '—',
          f.fecha ? FECHA_CORTA.format(new Date(f.fecha)) : '—',
          f.razon_social ?? '—',
        ];
        vals.forEach((val, ci) => {
          const c = row.getCell(ci + 1);
          c.value = val as any;
          c.font  = { size: 9 };
          c.alignment = { vertical: 'top', wrapText: true };
          c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        });
      });

      const buf  = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `detalle_fre_${(filtro.titulo || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('No se pudo exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / DETALLE_MODAL_LIMIT);
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '7px 9px', fontSize: '0.68rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: `1px solid ${theme.colors.border}`, position: 'sticky', top: 0, backgroundColor: '#fff',
  };
  const td: React.CSSProperties = { padding: '7px 9px', fontSize: '0.78rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };
  const btnPag: React.CSSProperties = { padding: '6px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: theme.colors.textPrimary };

  return (
    <Modal open={!!filtro} title={`Detalle: ${filtro?.titulo ?? ''}`} onClose={onClose} width={880}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          {total.toLocaleString('es-MX')} registro(s)
          {filtro?.sin_anio && ' · sin año confiable en la fuente'}
        </div>
        <button
          onClick={exportarExcel}
          disabled={exporting || total === 0}
          style={{
            background: theme.colors.gold, border: 'none', color: '#fff', padding: '7px 14px',
            borderRadius: '8px', cursor: exporting || total === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem', fontWeight: 700, opacity: exporting || total === 0 ? 0.6 : 1,
          }}
        >
          {exporting ? 'Exportando…' : '⬇ Exportar a Excel'}
        </button>
      </div>
      {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
      {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
      {!loading && !error && (
        <>
          <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Folio (FRE)</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Oficina</th>
                  <th style={th}>Año</th>
                  <th style={th}>Fecha (fuente)</th>
                  <th style={th}>Razón social</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
                ) : filas.map((f) => (
                  <tr key={f.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{f.fre}</td>
                    <td style={td}>{f.tipo_folio}</td>
                    <td style={td}>{f.oficina}</td>
                    <td style={{ ...td, color: f.anio ? theme.colors.textPrimary : theme.colors.alert.red, fontWeight: f.anio ? 400 : 700 }}>
                      {f.anio ?? 'Sin año'}
                    </td>
                    <td style={td}>{f.fecha ? FECHA_CORTA.format(new Date(f.fecha)) : <span style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>vacío en la fuente</span>}</td>
                    <td style={{ ...td, maxWidth: '220px' }} title={f.razon_social ?? undefined}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.razon_social ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnPag}>← Anterior</button>
              <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnPag}>Siguiente →</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};
