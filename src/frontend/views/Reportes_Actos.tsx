/**
 * View: Reportes_Actos ("Universo de Actos Registrales")
 * File: src/frontend/views/Reportes_Actos.tsx
 *
 * Reporte ejecutivo (Alta Dirección): todos los actos (trámites) registrados
 * en la historia del RPPC — Inmobiliario, Persona Moral, Testamentos y Bienes
 * Muebles. Un ACTO no es un folio (ver Reportes_FRE): un folio es el
 * expediente, un acto es cada trámite que le pasa a lo largo de su vida
 * (primera inscripción, gravamen, cancelación de gravamen...). Mismo criterio
 * "resumido y visual" que Conciliación de Ingresos y FRE.
 *
 * Nota de datos — "Acervo registral": 1,265,441 de los 5,499,192 actos (23%)
 * traen `fecha_registro = 1900-01-01` (el placeholder de "sin fecha
 * capturada" del sistema origen). Se confirmó con Dirección que esto no es un
 * dato roto: son actos de ACERVO REGISTRAL —trámites históricos que se fueron
 * cargando/migrando poco a poco al sistema— igual que cualquier otro acto con
 * año menor a 2004. Por eso el reporte los muestra como su propia categoría
 * (KPI y filtro propios) en vez de esconderlos, y la tendencia anual solo
 * grafica 2004 en adelante para no meter un pico falso de 1.2M actos en 1900.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import { Modal } from '../components/Modal';
import { SelectOption } from '../components/SearchableSelect';
import { MultiSearchableSelect } from '../components/MultiSearchableSelect';
import { EncabezadoImpresion } from '../components/EncabezadoImpresion';
import { BotonImprimirReporte } from '../components/BotonImprimirReporte';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { getActosResumen, getActosCatalogo, getActosTipos, getActosOficinas, getActosEstatus, getActosDetalle } from '../api';
import type { ResumenActos, ActoCatalogoFila, ActoDetalleFila } from '../types';

const NUM = new Intl.NumberFormat('es-MX');
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
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

interface FiltroModalActos {
  titulo:        string;
  tipo_tramite?: string;
  acto?:         string;
  oficina?:      string;
  estatus_acto?: string;
  es_acervo?:    boolean;
}

export const Reportes_Actos: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [anioDesde, setAnioDesde]   = useState('');
  const [anioHasta, setAnioHasta]   = useState('');
  const [mesDesde, setMesDesde]     = useState('');
  const [mesHasta, setMesHasta]     = useState('');
  const [tipoTramite, setTipoTramite] = useState('');
  const [actos, setActos]           = useState<string[]>([]);
  const [oficina, setOficina]       = useState('');
  const [estatusActo, setEstatusActo] = useState('');
  const [esAcervo, setEsAcervo]     = useState<'' | 'true' | 'false'>('');

  const [tipos, setTipos]         = useState<string[]>([]);
  const [catalogo, setCatalogo]   = useState<ActoCatalogoFila[]>([]);
  const [oficinas, setOficinas]   = useState<string[]>([]);
  const [estatusList, setEstatusList] = useState<string[]>([]);

  const [resumen, setResumen]     = useState<ResumenActos | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [modalDetalle, setModalDetalle] = useState<FiltroModalActos | null>(null);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);

  useEffect(() => {
    getActosTipos().then((r) => setTipos(r.data)).catch(() => {});
    getActosCatalogo().then((r) => setCatalogo(r.data)).catch(() => {});
    getActosOficinas().then((r) => setOficinas(r.data)).catch(() => {});
    getActosEstatus().then((r) => setEstatusList(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getActosResumen({
      anio_desde:   anioDesde ? Number(anioDesde) : undefined,
      anio_hasta:   anioHasta ? Number(anioHasta) : undefined,
      mes_desde:    mesDesde ? Number(mesDesde) : undefined,
      mes_hasta:    mesHasta ? Number(mesHasta) : undefined,
      tipo_tramite: tipoTramite || undefined,
      acto:         actos.length ? actos.join(',') : undefined,
      oficina:      oficina || undefined,
      estatus_acto: estatusActo || undefined,
      es_acervo:    esAcervo === '' ? undefined : esAcervo === 'true',
    })
      .then((r) => { if (!cancelado) setResumen(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [anioDesde, anioHasta, mesDesde, mesHasta, tipoTramite, actos, oficina, estatusActo, esAcervo]);

  const hayFiltros = !!(anioDesde || anioHasta || mesDesde || mesHasta || tipoTramite || actos.length || oficina || estatusActo || esAcervo);
  const limpiarFiltros = () => {
    setAnioDesde(''); setAnioHasta(''); setMesDesde(''); setMesHasta('');
    setTipoTramite(''); setActos([]); setOficina(''); setEstatusActo(''); setEsAcervo('');
  };

  const actoOptions: SelectOption[] = catalogo.map((c) => ({ value: c.acto, label: `${c.acto} — ${c.des_acto}` }));

  const filtrosBase = { tipo_tramite: tipoTramite || undefined, acto: actos.length ? actos.join(',') : undefined, oficina: oficina || undefined, estatus_acto: estatusActo || undefined };

  // Con muchos actos elegidos, listarlos todos desbordaría el encabezado impreso — a partir de 4 se resume el conteo.
  const actosTextoImpresion = actos.length === 0 ? ''
    : actos.length <= 3 ? `Actos: ${actos.map((a) => actoOptions.find((o) => o.value === a)?.label ?? a).join(', ')}`
    : `Actos: ${actos.length} seleccionados (${actos.join(', ')})`;

  const mesTextoImpresion = mesDesde && mesHasta && mesDesde === mesHasta
    ? `Mes: ${MESES[Number(mesDesde) - 1]}`
    : [
        mesDesde && `Mes desde: ${MESES[Number(mesDesde) - 1]}`,
        mesHasta && `Mes hasta: ${MESES[Number(mesHasta) - 1]}`,
      ].filter(Boolean).join(' · ');

  const filtrosImpresion = [
    anioDesde && `Año desde: ${anioDesde}`,
    anioHasta && `Año hasta: ${anioHasta}`,
    mesTextoImpresion,
    tipoTramite && `Tipo de trámite: ${tipoTramite}`,
    actosTextoImpresion,
    oficina && `Oficina: ${oficina}`,
    estatusActo && `Estatus: ${estatusActo}`,
    esAcervo && (esAcervo === 'true' ? 'Solo acervo registral' : 'Solo registro en tiempo real'),
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
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Universo de Actos Registrales</h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Todos los actos del RPPC por tipo, oficina, estatus y fecha de registro
          </p>
        </div>
        <BotonImprimirReporte />
      </div>

      <div className="reporte-imprimible" style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <EncabezadoImpresion
          titulo="Universo de Actos Registrales"
          subtitulo="Todos los actos del RPPC por tipo, oficina, estatus y fecha de registro"
          filtros={filtrosImpresion}
        />

        {/* ── Filtros (no se imprimen) ──────────────────────── */}
        <div className="no-imprimir" style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'end',
        }}>
          <div style={{ minWidth: '100px' }}>
            <label style={labelStyle}>Año desde</label>
            <input type="number" placeholder="Todos" value={anioDesde} onChange={(e) => setAnioDesde(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ minWidth: '100px' }}>
            <label style={labelStyle}>Año hasta</label>
            <input type="number" placeholder="Todos" value={anioHasta} onChange={(e) => setAnioHasta(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ minWidth: '140px' }}>
            <label style={labelStyle}>Mes desde</label>
            <select value={mesDesde} onChange={(e) => setMesDesde(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '140px' }}>
            <label style={labelStyle}>Mes hasta</label>
            <select value={mesHasta} onChange={(e) => setMesHasta(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '160px' }}>
            <label style={labelStyle}>Tipo de trámite</label>
            <select value={tipoTramite} onChange={(e) => setTipoTramite(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '260px', flex: 1.4 }}>
            <label style={labelStyle}>Acto (código o descripción) — puedes elegir varios</label>
            <MultiSearchableSelect values={actos} options={actoOptions} onChange={setActos} placeholder="Todos" />
          </div>
          <div style={{ minWidth: '160px' }}>
            <label style={labelStyle}>Oficina registral</label>
            <select value={oficina} onChange={(e) => setOficina(e.target.value)} style={inputStyle}>
              <option value="">Todas</option>
              {oficinas.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '160px' }}>
            <label style={labelStyle}>Estatus del acto</label>
            <select value={estatusActo} onChange={(e) => setEstatusActo(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              {estatusList.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '180px' }}>
            <label style={labelStyle}>Acervo registral</label>
            <select value={esAcervo} onChange={(e) => setEsAcervo(e.target.value as any)} style={inputStyle}>
              <option value="">Todos</option>
              <option value="false">Solo registro en tiempo real (2004+)</option>
              <option value="true">Solo acervo registral (&lt; 2004)</option>
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
              <KpiCard label="Total de actos (filtro actual)" value={NUM.format(resumen.total_actos)} icon="documento" color={theme.colors.primary} />
              {resumen.comparativo_anio_anterior && (
                <KpiCard
                  label={`Actos ${resumen.comparativo_anio_anterior.anio}`}
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
              {resumen.actos_acervo > 0 && (
                <KpiCard
                  label="Actos de acervo registral"
                  value={NUM.format(resumen.actos_acervo)}
                  icon="alerta"
                  color={theme.colors.grayMid}
                  sub={`${resumen.pct_acervo}% del total · trámites históricos migrados poco a poco (año < 2004) · excluidos de la tendencia anual`}
                  onClick={() => setModalDetalle({ titulo: 'Actos de acervo registral', ...filtrosBase, es_acervo: true })}
                />
              )}
            </div>

            {/* ── Por tipo de trámite ─────────────────────── */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Actos por tipo de trámite
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {resumen.por_tipo.map((t) => (
                  <div
                    key={t.tipo_tramite}
                    onClick={() => setModalDetalle({ titulo: t.tipo_tramite, ...filtrosBase, tipo_tramite: t.tipo_tramite })}
                    style={{
                      backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${theme.colors.border}`,
                      borderLeft: `4px solid ${TIPO_COLORS[t.tipo_tramite] ?? theme.colors.primary}`, padding: '16px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: theme.colors.textPrimary }}>{NUM.format(t.cantidad)}</div>
                    <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
                      {t.tipo_tramite} · {t.pct}% <span style={{ fontSize: '0.7rem' }}>🔍</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Top actos + Por oficina ─────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 1.2fr) minmax(280px, 1fr)', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Actos más frecuentes (top {resumen.top_actos.length} de {catalogo.length} códigos)
                </div>
                <RankingActos filas={resumen.top_actos} onDrill={(a) => setModalDetalle({ titulo: `${a.acto} — ${a.des_acto}`, ...filtrosBase, acto: a.acto })} />
                <button
                  onClick={() => setMostrarCatalogo((m) => !m)}
                  style={{ marginTop: '10px', background: 'none', border: 'none', color: theme.colors.primary, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  {mostrarCatalogo ? '▲ Ocultar catálogo completo' : `▼ Ver catálogo completo (${catalogo.length} códigos)`}
                </button>
                {mostrarCatalogo && <CatalogoTabla filas={catalogo} onDrill={(a) => setModalDetalle({ titulo: `${a.acto} — ${a.des_acto}`, ...filtrosBase, acto: a.acto })} />}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Actos por oficina registral
                </div>
                <OficinaBar filas={resumen.por_oficina} />
              </div>
            </div>

            {/* ── Por estatus + Tendencia anual ───────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 1fr) minmax(420px, 1.4fr)', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Actos por estatus
                </div>
                <OficinaBar filas={resumen.por_estatus.map((e) => ({ oficina: e.estatus_acto, cantidad: e.cantidad, pct: e.pct }))} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                  Tendencia anual 2004–2026 (no incluye acervo registral{tipoTramite ? ` — ${tipoTramite}` : ''})
                </div>
                <TendenciaChart filas={resumen.tendencia_anual} />
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic', lineHeight: 1.6 }}>
              "Acervo registral" son los actos con año de registro anterior a 2004: trámites históricos que se fueron
              cargando/migrando poco a poco al sistema, cuya fecha de captura no refleja cuándo ocurrió el acto realmente
              (incluye el 23% del universo cuya fecha llegó vacía y se guardó como 1900-01-01 en la fuente). No son datos
              rotos — se muestran como su propia categoría, pero se excluyen de la gráfica de tendencia para no distorsionarla.
            </p>
          </>
        )}
      </div>

      <ModalDetalleActos filtro={modalDetalle} onClose={() => setModalDetalle(null)} />
    </div>
  );
};

// ── KpiCard (mismo patrón que el resto del sistema) ──

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

// ── OficinaBar (reutilizada para oficina y para estatus: mismo shape) ──

const OficinaBar: React.FC<{ filas: { oficina: string; cantidad: number; pct: number }[] }> = ({ filas }) => {
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

// ── RankingActos — top N con lupa por fila ──

const RankingActos: React.FC<{ filas: ResumenActos['top_actos']; onDrill: (a: { acto: string; des_acto: string }) => void }> = ({ filas, onDrill }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos con estos filtros" />;
  const max = Math.max(...filas.map((f) => f.cantidad), 1);
  return (
    <div>
      {filas.map((f) => {
        const pct = Math.round((f.cantidad / max) * 100);
        return (
          <div key={f.acto} onClick={() => onDrill(f)} style={{ marginBottom: '10px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.78rem', color: theme.colors.textPrimary }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: theme.colors.primary }}>{f.acto}</span> {f.des_acto}
              </span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {NUM.format(f.cantidad)} ({f.pct}%) <span style={{ fontSize: '0.68rem' }}>🔍</span>
              </span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.colors.gold, borderRadius: '4px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── CatalogoTabla — catálogo completo de códigos de acto ──

const CatalogoTabla: React.FC<{ filas: ActoCatalogoFila[]; onDrill: (a: ActoCatalogoFila) => void }> = ({ filas, onDrill }) => {
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', borderBottom: `1px solid ${theme.colors.border}` };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '0.76rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };
  return (
    <div style={{ marginTop: '10px', maxHeight: '360px', overflowY: 'auto', border: `1px solid ${theme.colors.border}`, borderRadius: '8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, position: 'sticky', top: 0, backgroundColor: '#fff' }}>Código</th>
            <th style={{ ...th, position: 'sticky', top: 0, backgroundColor: '#fff' }}>Descripción</th>
            <th style={{ ...th, position: 'sticky', top: 0, backgroundColor: '#fff' }}>Tipo</th>
            <th style={{ ...th, position: 'sticky', top: 0, backgroundColor: '#fff', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.acto} onClick={() => onDrill(f)} style={{ cursor: 'pointer' }}>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: theme.colors.primary }}>{f.acto}</td>
              <td style={td}>{f.des_acto}</td>
              <td style={td}>{f.tipo_tramite}</td>
              <td style={{ ...td, textAlign: 'right' }}>{NUM.format(f.cantidad)} <span style={{ fontSize: '0.65rem' }}>🔍</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── TendenciaChart (SVG puro) ───────────────────

const TendenciaChart: React.FC<{ filas: ResumenActos['tendencia_anual'] }> = ({ filas }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos con estos filtros" />;
  const W = 720; const H = 220; const PAD = { top: 12, right: 10, bottom: 28, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...filas.map((f) => f.cantidad), 1);
  const barW = Math.max(2, (chartW / filas.length) * 0.7);
  const step = chartW / filas.length;
  const yTicks = [0, Math.round(maxVal / 2), maxVal];
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
                <title>{`${f.anio}: ${NUM.format(f.cantidad)} actos`}</title>
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

// ── ModalDetalleActos — detalle fila por fila ──

const DETALLE_MODAL_LIMIT  = 20;
const DETALLE_EXPORT_LIMIT = 10000;
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ModalDetalleActos: React.FC<{ filtro: FiltroModalActos | null; onClose: () => void }> = ({ filtro, onClose }) => {
  const [filas, setFilas]     = useState<ActoDetalleFila[]>([]);
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
    getActosDetalle({
      page, limit: DETALLE_MODAL_LIMIT,
      tipo_tramite: filtro.tipo_tramite,
      acto: filtro.acto,
      oficina: filtro.oficina,
      estatus_acto: filtro.estatus_acto,
      es_acervo: filtro.es_acervo,
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
      const res = await getActosDetalle({
        page: 1, limit: DETALLE_EXPORT_LIMIT,
        tipo_tramite: filtro.tipo_tramite,
        acto: filtro.acto,
        oficina: filtro.oficina,
        estatus_acto: filtro.estatus_acto,
        es_acervo: filtro.es_acervo,
      });

      const ExcelJS = (await import('exceljs')).default;
      const GUINDA = 'FFAB0A3D';
      const GRIS   = 'FF7A7570';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Detalle Actos', { views: [{ showGridLines: false }] });
      ws.columns = [
        { width: 12 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 8 }, { width: 12 }, { width: 20 }, { width: 22 },
      ];

      const headers = ['Acto', 'Descripción', 'Tipo de trámite', 'Fecha de registro', 'Año', 'Acervo', 'Oficina', 'Estatus del acto'];

      ws.mergeCells(1, 1, 1, headers.length);
      const tCell = ws.getCell(1, 1);
      tCell.value = `DETALLE ACTOS: ${filtro.titulo}`.toUpperCase();
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
          f.acto, f.des_acto, f.tipo_tramite,
          f.fecha_registro ? FECHA_CORTA.format(new Date(f.fecha_registro)) : '—',
          f.anio ?? '—',
          f.es_acervo ? 'Sí' : 'No',
          f.oficina, f.estatus_acto ?? '—',
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
      a.download = `detalle_actos_${(filtro.titulo || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xlsx`;
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
    <Modal open={!!filtro} title={`Detalle: ${filtro?.titulo ?? ''}`} onClose={onClose} width={960}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          {total.toLocaleString('es-MX')} registro(s)
          {filtro?.es_acervo && ' · acervo registral (año < 2004)'}
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
                  <th style={th}>Acto</th>
                  <th style={th}>Descripción</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Fecha de registro</th>
                  <th style={th}>Año</th>
                  <th style={th}>Oficina</th>
                  <th style={th}>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
                ) : filas.map((f) => (
                  <tr key={f.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: theme.colors.primary }}>{f.acto}</td>
                    <td style={{ ...td, maxWidth: '220px' }} title={f.des_acto}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.des_acto}</span>
                    </td>
                    <td style={td}>{f.tipo_tramite}</td>
                    <td style={td}>
                      {f.es_acervo
                        ? <span style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>acervo registral</span>
                        : (f.fecha_registro ? FECHA_CORTA.format(new Date(f.fecha_registro)) : '—')}
                    </td>
                    <td style={{ ...td, color: f.es_acervo ? theme.colors.textSecondary : theme.colors.textPrimary, fontStyle: f.es_acervo ? 'italic' : 'normal' }}>
                      {f.es_acervo ? '< 2004' : (f.anio ?? '—')}
                    </td>
                    <td style={td}>{f.oficina}</td>
                    <td style={td}>{f.estatus_acto ?? '—'}</td>
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
