/**
 * View: Dashboard_Director
 * File: src/frontend/views/Dashboard_Director.tsx
 *
 * Secciones:
 *  1. KPI Cards       — totales, vencidos, urgentes, promedio resolución
 *  2. Donut de estatus — distribución visual por estatus
 *  3. Barra de tendencia — oficios registrados vs finalizados (30 días)
 *  4. Tabla de carga por abogado
 *  5. Panel de alertas — vencidos y próximos a vencer
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth }      from '../context/AuthContext';
import { StatusBadge }  from '../components/StatusBadge';
import { TerminoTimer } from '../components/TerminoTimer';
import { theme }        from '../theme';
import type { EstatusOficio } from '../types';
import { SeccionSupervision } from './SeccionSupervision';
import { useIsMobile } from '../hooks/useIsMobile';

// ── API calls ─────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────

interface DelegacionAvance {
  delegacion:  string;
  tipo:        string;
  total:       number;
  finalizados: number;
  pendientes:  number;
  pct:         number;
}

interface Metricas {
  total_general:              number;
  por_estatus:                Record<string, number>;
  por_delegacion:             DelegacionAvance[];
  antiguedad_critica:         { folio: string; delegacion: string | null; dias: number } | null;
  vencidos:                   number;
  urgentes_24h:               number;
  finalizados_mes:            number;
  promedio_dias_resolucion:   number | null;
}

interface CargaAbogado {
  id:          number;
  nombre:      string;
  email:       string;
  total:       number;
  por_estatus: Record<string, number>;
}

interface OficioAlerta {
  id:               number;
  folio:            string;
  remitente:        string;
  dependencia_origen: string;
  fecha_vencimiento: string;
  estatus:          string;
  dias_vencido?:    number;
  dias_restantes?:  number;
  abogado_nombre:   string | null;
}

interface TendenciaPunto { fecha: string; total: number; }

// ── Component ─────────────────────────────────────────────────

// ── CollapsibleCard — sección minimizable, recuerda su estado ──

const CollapsibleCard: React.FC<{
  id:          string;
  title:       string;
  icon:        string;
  defaultOpen?: boolean;
  action?:     React.ReactNode;
  accent?:     string;
  children:    React.ReactNode;
}> = ({ id, title, icon, defaultOpen = true, action, accent = theme.colors.primary, children }) => {
  const storageKey = `dir_panel_open_${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? defaultOpen : saved === '1';
  });

  const toggle = () => {
    setOpen((o) => {
      localStorage.setItem(storageKey, o ? '0' : '1');
      return !o;
    });
  };

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius:    '16px',
      border:          `1px solid ${theme.colors.border}`,
      boxShadow:       open ? '0 4px 16px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.05)',
      overflow:        'hidden',
      transition:      'box-shadow 0.2s',
    }}>
      {/* Header clickable */}
      <div
        onClick={toggle}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             '12px',
          padding:         '16px 20px',
          cursor:          'pointer',
          userSelect:      'none',
          borderBottom:    open ? `1px solid ${theme.colors.border}` : 'none',
        }}
      >
        <span style={{
          width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
          backgroundColor: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem',
        }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: theme.colors.primaryDark, flex: 1 }}>{title}</h3>
        {open && action && (
          <span onClick={(e) => e.stopPropagation()}>{action}</span>
        )}
        <span style={{
          fontSize: '1.1rem', color: theme.colors.textSecondary, flexShrink: 0,
          transition: 'transform 0.25s', transform: open ? 'rotate(180deg)' : 'none',
        }}>⌄</span>
      </div>

      {/* Body */}
      {open && <div style={{ padding: '20px' }}>{children}</div>}
    </div>
  );
};

export const Dashboard_Director: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [metricas,  setMetricas]  = useState<Metricas | null>(null);
  const [carga,     setCarga]     = useState<CargaAbogado[]>([]);
  const [alertas,   setAlertas]   = useState<{ vencidos: OficioAlerta[]; proximos: OficioAlerta[] }>({ vencidos: [], proximos: [] });
  const [tendencia, setTendencia] = useState<{ registrados: TendenciaPunto[]; finalizados: TendenciaPunto[] }>({ registrados: [], finalizados: [] });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [diasTendencia, setDiasTendencia] = useState(30);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, c, v, t] = await Promise.all([
        apiFetch<{ data: Metricas }>('/director/metricas'),
        apiFetch<{ data: CargaAbogado[] }>('/director/carga-abogados'),
        apiFetch<{ data: { vencidos: OficioAlerta[]; proximos: OficioAlerta[] } }>('/director/vencimientos'),
        apiFetch<{ data: { registrados: TendenciaPunto[]; finalizados: TendenciaPunto[] } }>(`/director/tendencia?dias=${diasTendencia}`),
      ]);
      setMetricas(m.data);
      setCarga(c.data);
      setAlertas(v.data);
      setTendencia(t.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [diasTendencia]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background }}>

      {/* ── Barra superior sticky ─────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.border}`,
        padding: isMobile ? '14px 12px' : '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>
            Panel de Dirección
          </h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Vista general del sistema
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={fetchAll}
            style={{ background: theme.colors.primary, border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {loading && <LoadingScreen />}
      {!loading && error && <ErrorScreen message={error} onRetry={fetchAll} />}
      {!loading && !error && metricas && (
        <MetricasContent
          metricas={metricas}
          carga={carga}
          alertas={alertas}
          tendencia={tendencia}
          diasTendencia={diasTendencia}
          setDiasTendencia={setDiasTendencia}
        />
      )}
    </div>
  );
};

// ── MetricasContent ───────────────────────────────────────────

// ── Resumen ejecutivo — inspirado en el reporte gráfico a Dirección General ──
const ResumenEjecutivo: React.FC<{ metricas: Metricas; isMobile: boolean }> = ({ metricas, isMobile }) => {
  const total       = metricas.total_general;
  const finalizados = metricas.por_estatus['FINALIZADO'] ?? 0;
  const avance      = total > 0 ? Math.round((finalizados / total) * 100) : 0;
  const pendientes  = total - finalizados;
  const recibidos   = metricas.por_estatus['RECIBIDO'] ?? 0;
  const pctGestion  = total > 0 ? Math.round(((total - recibidos) / total) * 100) : 0;

  const dels = [...(metricas.por_delegacion ?? [])].sort((a, b) => b.pct - a.pct);
  const peor = dels.length ? dels[dels.length - 1] : null;
  const ant  = metricas.antiguedad_critica;

  // Paleta de la lámina: guinda, dorado, gris, magenta (por delegación); tonos de apoyo para el resto.
  const APOYO = ['#2B0A14', '#5A5A5A', '#8C6D1F', '#B0143C'];
  const colorArea = (nombre: string, i: number) => {
    const n = (nombre ?? '').toUpperCase();
    if (n.includes('BENITO'))                        return '#6E1030';
    if (n.includes('PLAYA'))                         return '#9A8A2E';
    if (n.includes('COZUMEL'))                       return '#7C7C7C';
    if (n.includes('OTHON') || n.includes('BLANCO')) return '#D6197D';
    return APOYO[i % APOYO.length];
  };

  const card: React.CSSProperties = {
    backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
    borderRadius: '14px', boxShadow: theme.shadow.sm, padding: '18px 20px',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '230px 1fr 240px', gap: '16px', alignItems: 'stretch' }}>

      {/* Columna 1: donut de avance + tarjeta "% en gestión" (separadas) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: theme.colors.primaryDark, textAlign: 'center' }}>Avance global de oficios</div>
          <div style={{ width: 150, height: 150, borderRadius: '50%', background: `conic-gradient(${theme.colors.primary} ${avance * 3.6}deg, #E5E7EB 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 112, height: 112, borderRadius: '50%', backgroundColor: theme.colors.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '2.1rem', fontWeight: 900, color: theme.colors.primary, lineHeight: 1 }}>{avance}%</div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: theme.colors.textSecondary }}>FINALIZADOS</div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>{finalizados} de {total} finalizados</div>
        </div>
        <div style={{ ...card, padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.9rem', fontWeight: 900, color: theme.colors.gold, lineHeight: 1 }}>{pctGestion}%</div>
          <div style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, marginTop: '3px' }}>en gestión (fuera de «Recibido»)</div>
        </div>
      </div>

      {/* Columna 2: barras por delegación + leyenda de colores */}
      <div style={card}>
        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: theme.colors.primaryDark, marginBottom: '2px' }}>Avance por delegación / área</div>
        <div style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, marginBottom: '12px' }}>% de oficios finalizados sobre el total dirigido a cada área</div>
        {dels.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, margin: 0 }}>Sin datos.</p>
        ) : dels.map((d, i) => {
          const c = colorArea(d.delegacion, i);
          return (
          <div key={d.delegacion} style={{ marginBottom: '9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.8rem', color: theme.colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.delegacion}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {d.finalizados}/{d.total} · <strong style={{ color: c, fontSize: '0.82rem' }}>{d.pct}%</strong>
              </span>
            </div>
            <div style={{ height: '10px', borderRadius: '6px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${d.pct}%`, height: '100%', backgroundColor: c, borderRadius: '6px' }} />
            </div>
          </div>
          );
        })}
        {dels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '14px', paddingTop: '10px', borderTop: `1px solid ${theme.colors.border}` }}>
            {dels.map((d, i) => (
              <span key={d.delegacion} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: colorArea(d.delegacion, i), flexShrink: 0 }} />
                {d.delegacion}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Columna 3: focos críticos + antigüedad + acción sugerida */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: theme.colors.primaryDark, marginBottom: '10px' }}>Focos críticos</div>
          {[
            { lbl: 'Pendientes', val: pendientes, col: theme.colors.charcoal },
            { lbl: 'Vencidos', val: metricas.vencidos, col: theme.colors.alert.red },
            { lbl: 'Urgentes (24h)', val: metricas.urgentes_24h, col: theme.colors.gold },
          ].map((f) => (
            <div key={f.lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${theme.colors.border}` }}>
              <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>{f.lbl}</span>
              <strong style={{ fontSize: '1.05rem', color: f.col }}>{f.val}</strong>
            </div>
          ))}
        </div>
        {ant && (
          <div style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: theme.colors.primaryDark, marginBottom: '4px' }}>Antigüedad crítica</div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary, lineHeight: 1.4 }}>
              El pendiente más antiguo lleva <strong style={{ color: theme.colors.alert.red }}>{ant.dias} día{ant.dias === 1 ? '' : 's'}</strong>: <strong>{ant.folio}</strong>{ant.delegacion ? ` · ${ant.delegacion}` : ''}.
            </p>
          </div>
        )}
        {peor && (
          <div style={{ ...card, padding: '14px 16px', backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400E', marginBottom: '4px' }}>Acción sugerida</div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#78350F', lineHeight: 1.4 }}>
              <strong>{peor.delegacion}</strong> tiene el menor avance ({peor.pct}%). Priorizar su seguimiento.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface MetricasContentProps {
  metricas:         Metricas;
  carga:            CargaAbogado[];
  alertas:          { vencidos: OficioAlerta[]; proximos: OficioAlerta[] };
  tendencia:        { registrados: TendenciaPunto[]; finalizados: TendenciaPunto[] };
  diasTendencia:    number;
  setDiasTendencia: (d: number) => void;
}

const MetricasContent: React.FC<MetricasContentProps> = ({
  metricas, carga, alertas, tendencia, diasTendencia, setDiasTendencia,
}) => {
  const isMobile = useIsMobile();
  const totalAlertas = alertas.vencidos.length + alertas.proximos.length;

  return (
    <div style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Resumen ejecutivo (avance global + por delegación) ─ */}
      <ResumenEjecutivo metricas={metricas} isMobile={isMobile} />

      {/* ── KPI Cards (siempre visibles) ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <KpiCard label="Total Oficios" value={metricas.total_general} icon="📋" color={theme.colors.primary} />
        <KpiCard label="Vencidos" value={metricas.vencidos} icon="🚨"
          color={metricas.vencidos > 0 ? theme.colors.alert.red : theme.colors.alert.green} alert={metricas.vencidos > 0} />
        <KpiCard label="Urgentes (24h)" value={metricas.urgentes_24h} icon="⚠️"
          color={metricas.urgentes_24h > 0 ? theme.colors.alert.yellow : theme.colors.alert.green} alert={metricas.urgentes_24h > 0} />
        <KpiCard label="Finalizados (mes)" value={metricas.finalizados_mes} icon="✅" color={theme.colors.alert.green} />
        <KpiCard label="Promedio resolución"
          value={metricas.promedio_dias_resolucion !== null ? `${metricas.promedio_dias_resolucion}d` : '—'} icon="⏱" color={theme.colors.primaryLight} />
      </div>

      {/* ── Distribución por estatus ─────────────────────── */}
      <CollapsibleCard id="distribucion" title="Distribución por Estatus" icon="🍩" accent={theme.colors.primary}>
        <DonutChart data={metricas.por_estatus} total={metricas.total_general} />
      </CollapsibleCard>

      {/* ── Tendencia ────────────────────────────────────── */}
      <CollapsibleCard
        id="tendencia" title="Tendencia de Oficios" icon="📈" accent="#2563EB"
        action={
          <div style={{ display: 'flex', gap: '6px' }}>
            {[7, 30, 60].map((d) => (
              <button
                key={d}
                onClick={() => setDiasTendencia(d)}
                style={{
                  padding: '4px 12px', borderRadius: '20px',
                  border: `1px solid ${theme.colors.primary}`,
                  backgroundColor: diasTendencia === d ? theme.colors.primary : '#fff',
                  color: diasTendencia === d ? '#fff' : theme.colors.primary,
                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      >
        <BarChart registrados={tendencia.registrados} finalizados={tendencia.finalizados} dias={diasTendencia} />
      </CollapsibleCard>

      {/* ── Carga por abogado + Alertas (2 columnas) ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px', alignItems: 'start' }}>
        <CollapsibleCard id="carga" title={`Carga por Abogado · ${carga.length} activos`} icon="⚖️" accent="#7C3AED">
          {carga.length === 0 ? (
            <EmptyState text="Sin asignaciones activas" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {carga.map((a) => <AbogadoRow key={a.id} abogado={a} />)}
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard id="alertas" title={`Alertas de Vencimiento${totalAlertas > 0 ? ` · ${totalAlertas}` : ''}`} icon="🔔"
          accent={totalAlertas > 0 ? theme.colors.alert.red : theme.colors.alert.green}>
          {totalAlertas === 0 ? (
            <EmptyState text="Sin alertas activas 🎉" color={theme.colors.alert.green} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {alertas.vencidos.map((o) => <AlertaRow key={o.id} oficio={o} tipo="vencido" />)}
              {alertas.proximos.map((o) => <AlertaRow key={o.id} oficio={o} tipo="proximo" />)}
            </div>
          )}
        </CollapsibleCard>
      </div>

      {/* ── Supervisión de módulos (colapsado por defecto) ─ */}
      <CollapsibleCard id="supervision" title="Supervisión de Módulos" icon="🔍" accent="#0891B2" defaultOpen={false}>
        <SeccionSupervision embedded />
      </CollapsibleCard>

    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

// ── KpiCard ───────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  icon:  string;
  color: string;
  alert?: boolean;
}> = ({ label, value, icon, color, alert }) => (
  <div style={{
    backgroundColor: '#fff',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    borderLeft: `4px solid ${color}`,
    position: 'relative',
    overflow: 'hidden',
  }}>
    {alert && (
      <span style={{
        position: 'absolute', top: 8, right: 10,
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 0 3px ${color}33`,
      }} />
    )}
    <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>{icon}</div>
    <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>{label}</div>
  </div>
);

// ── Card wrapper ──────────────────────────────────────────────

const Card: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
    <div style={{
      padding: '14px 20px',
      borderBottom: `1px solid ${theme.colors.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primary }}>{title}</h3>
      {action}
    </div>
    <div style={{ padding: '16px 20px' }}>{children}</div>
  </div>
);

// ── DonutChart (SVG puro, sin librerías) ──────────────────────

const ESTATUS_ORDER: EstatusOficio[] = ['RECIBIDO', 'ASIGNADO', 'EN_REVISION', 'VOBO_APROBADO', 'FINALIZADO'];

const DonutChart: React.FC<{ data: Record<string, number>; total: number }> = ({ data, total }) => {
  const SIZE   = 160;
  const RADIUS = 60;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2;
  const STROKE = 28;

  if (total === 0) return <EmptyState text="Sin datos" />;

  // Build arc segments
  let cumAngle = -90; // start at top
  const segments: { path: string; color: string; label: string; value: number }[] = [];

  for (const key of ESTATUS_ORDER) {
    const value = data[key] ?? 0;
    if (value === 0) continue;
    const pct   = value / total;
    const angle = pct * 360;
    const cfg   = theme.estatus[key as EstatusOficio];

    const startRad = (cumAngle * Math.PI) / 180;
    const endRad   = ((cumAngle + angle) * Math.PI) / 180;

    const x1 = CX + RADIUS * Math.cos(startRad);
    const y1 = CY + RADIUS * Math.sin(startRad);
    const x2 = CX + RADIUS * Math.cos(endRad);
    const y2 = CY + RADIUS * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
    segments.push({ path, color: cfg.text, label: cfg.label, value });
    cumAngle += angle;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      {/* SVG donut */}
      <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
        {/* Background circle */}
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={theme.colors.border} strokeWidth={STROKE} />
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        ))}
        {/* Center label */}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="800" fill={theme.colors.primary}>{total}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fill={theme.colors.textSecondary}>total</text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {ESTATUS_ORDER.map((key) => {
          const value = data[key] ?? 0;
          const cfg   = theme.estatus[key as EstatusOficio];
          const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cfg.text, flexShrink: 0 }} />
              <span style={{ flex: 1, color: theme.colors.textSecondary }}>{cfg.label}</span>
              <span style={{ fontWeight: 700, color: theme.colors.textPrimary }}>{value}</span>
              <span style={{ color: theme.colors.textSecondary, minWidth: '32px', textAlign: 'right' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── BarChart (SVG puro) ───────────────────────────────────────

const BarChart: React.FC<{
  registrados: TendenciaPunto[];
  finalizados: TendenciaPunto[];
  dias: number;
}> = ({ registrados, finalizados, dias }) => {
  const W = 520; const H = 180; const PAD = { top: 16, right: 16, bottom: 40, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  // Build a unified date range
  const today = new Date();
  const dates: string[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const regMap = new Map(registrados.map((r) => [r.fecha, r.total]));
  const finMap = new Map(finalizados.map((r) => [r.fecha, r.total]));

  const regValues = dates.map((d) => regMap.get(d) ?? 0);
  const finValues = dates.map((d) => finMap.get(d) ?? 0);
  const maxVal    = Math.max(...regValues, ...finValues, 1);

  const xStep = chartW / Math.max(dates.length - 1, 1);

  const toPoint = (values: number[]) =>
    values.map((v, i) => `${PAD.left + i * xStep},${PAD.top + chartH - (v / maxVal) * chartH}`).join(' ');

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  // X-axis labels — show only first, middle, last
  const xLabels = [0, Math.floor(dates.length / 2), dates.length - 1];

  if (dates.length === 0) return <EmptyState text="Sin datos en el período" />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = PAD.top + chartH - (tick / maxVal) * chartH;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={theme.colors.border} strokeDasharray="4 3" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill={theme.colors.textSecondary}>{tick}</text>
            </g>
          );
        })}

        {/* Registrados area */}
        <polyline
          points={toPoint(regValues)}
          fill="none"
          stroke={theme.colors.primary}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Finalizados area */}
        <polyline
          points={toPoint(finValues)}
          fill="none"
          stroke={theme.colors.alert.green}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {/* X-axis labels */}
        {xLabels.map((i) => (
          <text key={i} x={PAD.left + i * xStep} y={H - 8} textAnchor="middle" fontSize="9" fill={theme.colors.textSecondary}>
            {dates[i]?.slice(5)}
          </text>
        ))}

        {/* Legend */}
        <rect x={PAD.left} y={H - PAD.bottom + 18} width={8} height={8} fill={theme.colors.primary} rx="2" />
        <text x={PAD.left + 12} y={H - PAD.bottom + 26} fontSize="9" fill={theme.colors.textSecondary}>Registrados</text>
        <line x1={PAD.left + 80} y1={H - PAD.bottom + 22} x2={PAD.left + 92} y2={H - PAD.bottom + 22} stroke={theme.colors.alert.green} strokeWidth="2" strokeDasharray="4 2" />
        <text x={PAD.left + 96} y={H - PAD.bottom + 26} fontSize="9" fill={theme.colors.textSecondary}>Finalizados</text>
      </svg>
    </div>
  );
};

// ── AbogadoRow ────────────────────────────────────────────────

const AbogadoRow: React.FC<{ abogado: CargaAbogado }> = ({ abogado }) => {
  const MAX_DISPLAY = 8;
  const pct = Math.min(100, (abogado.total / MAX_DISPLAY) * 100);

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${theme.colors.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: theme.colors.textPrimary }}>{abogado.nombre}</span>
          <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginLeft: '8px' }}>{abogado.email}</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: theme.colors.primary }}>{abogado.total}</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: '6px', backgroundColor: theme.colors.border, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: pct > 75 ? theme.colors.alert.red : pct > 50 ? theme.colors.alert.yellow : theme.colors.primary,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Estatus pills */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
        {Object.entries(abogado.por_estatus).map(([est, cnt]) => (
          <span key={est} style={{ fontSize: '0.7rem' }}>
            <StatusBadge estatus={est as EstatusOficio} />
            <span style={{ marginLeft: '3px', fontWeight: 700, color: theme.colors.textSecondary }}>{cnt}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ── AlertaRow ─────────────────────────────────────────────────

const AlertaRow: React.FC<{ oficio: OficioAlerta; tipo: 'vencido' | 'proximo' }> = ({ oficio, tipo }) => {
  const isVencido = tipo === 'vencido';
  const borderColor = isVencido ? theme.colors.alert.red : theme.colors.alert.yellow;
  const bgColor     = isVencido ? '#FEF2F2' : '#FFFBEB';

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: '8px',
      backgroundColor: bgColor,
      borderLeft: `3px solid ${borderColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: theme.colors.primary }}>{oficio.folio}</span>
          <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginLeft: '8px' }}>{oficio.dependencia_origen}</span>
        </div>
        <StatusBadge estatus={oficio.estatus as EstatusOficio} />
      </div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
        <span>
          {isVencido
            ? <span style={{ color: theme.colors.alert.red, fontWeight: 700 }}>Vencido hace {oficio.dias_vencido}d</span>
            : <span style={{ color: theme.colors.alert.yellow, fontWeight: 700 }}>Vence en {oficio.dias_restantes}d</span>
          }
        </span>
        {oficio.abogado_nombre && <span>👤 {oficio.abogado_nombre}</span>}
        <span>📅 {oficio.fecha_vencimiento}</span>
      </div>
    </div>
  );
};

// ── BandejaRevision ───────────────────────────────────────────

import type { EstadoTarea, RegistroHistorial } from '../types';

const ESTADO_CFG_BANDEJA: Partial<Record<EstadoTarea, { bg: string; text: string; label: string }>> = {
  EN_REVISION:    { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión'    },
  EN_REVISION_DG: { bg: '#EDE9FE', text: '#5B21B6', label: 'En Revisión DG' },
  DEVUELTO:       { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto'       },
  DEVUELTO_DG:    { bg: '#FFEDD5', text: '#9A3412', label: 'Devuelto por DG' },
  COMPLETADA:     { bg: '#D1FAE5', text: '#065F46', label: 'Completada'     },
};

interface TareaRevision {
  id:                  number;
  evento_id:           number;
  evento_titulo:       string;
  titulo:              string;
  descripcion:         string | null;
  asignado_a_id:       number;
  asignado_a_nombre:   string;
  estado:              EstadoTarea;
  fecha_programada:    string;
  fecha_actualizacion: string;
}

function authHeadersBandeja(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetchBandeja<T>(path: string, options?: RequestInit): Promise<T> {
  const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeadersBandeja(),
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const BandejaRevision: React.FC = () => {
  const [tareas,   setTareas]   = useState<TareaRevision[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [filtro,   setFiltro]   = useState<'todas' | 'en_revision' | 'devueltas'>('todas');

  const fetchTareas = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Obtener todos los eventos del director y sus tareas
      const eventosRes = await apiFetchBandeja<{ data: any[] }>('/eventos');
      const eventos = eventosRes.data.filter((e: any) => e.estado === 'ABIERTO');

      const todasTareas: TareaRevision[] = [];
      await Promise.all(
        eventos.map(async (ev: any) => {
          try {
            const detRes = await apiFetchBandeja<{ data: any }>(`/eventos/${ev.id}`);
            const tareasFiltradas = (detRes.data.tareas ?? []).filter(
              (t: any) => ['EN_REVISION', 'EN_REVISION_DG', 'DEVUELTO'].includes(t.estado),
            );
            tareasFiltradas.forEach((t: any) => {
              todasTareas.push({ ...t, evento_titulo: ev.titulo });
            });
          } catch { /* ignorar errores individuales */ }
        }),
      );

      // Ordenar: EN_REVISION primero, luego DEVUELTO, luego EN_REVISION_DG
      const orden: Record<string, number> = { EN_REVISION: 0, DEVUELTO: 1, EN_REVISION_DG: 2 };
      todasTareas.sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9));
      setTareas(todasTareas);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTareas(); }, [fetchTareas]);

  const tareasFiltradas = tareas.filter((t) => {
    if (filtro === 'en_revision') return t.estado === 'EN_REVISION';
    if (filtro === 'devueltas')   return t.estado === 'DEVUELTO';
    return true;
  });

  const countRevision = tareas.filter((t) => t.estado === 'EN_REVISION').length;
  const countDevueltas = tareas.filter((t) => t.estado === 'DEVUELTO').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1000px', margin: '0 auto', fontFamily: theme.font.family }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.primaryDark, fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Bandeja de Revisión
          </h2>
          <p style={{ margin: '3px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Tareas enviadas por tu equipo que requieren tu atención
          </p>
        </div>
        <button
          onClick={fetchTareas}
          disabled={loading}
          style={{ padding: '8px 16px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: theme.font.family }}
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Contadores */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'todas',       label: 'Todas',          count: tareas.length,   bg: '#F3F4F6', text: '#374151' },
          { key: 'en_revision', label: 'Para revisar',   count: countRevision,   bg: '#FEF3C7', text: '#92400E' },
          { key: 'devueltas',   label: 'Devueltas',      count: countDevueltas,  bg: '#FEE2E2', text: '#991B1B' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFiltro(tab.key as any)}
            style={{
              padding:         '8px 16px',
              borderRadius:    '20px',
              border:          filtro === tab.key ? `2px solid ${tab.text}` : `1px solid ${theme.colors.border}`,
              backgroundColor: filtro === tab.key ? tab.bg : '#fff',
              color:           filtro === tab.key ? tab.text : theme.colors.textSecondary,
              fontSize:        '0.8rem',
              fontWeight:      filtro === tab.key ? 700 : 500,
              cursor:          'pointer',
              fontFamily:      theme.font.family,
              display:         'flex',
              alignItems:      'center',
              gap:             '6px',
            }}
          >
            {tab.label}
            <span style={{ backgroundColor: filtro === tab.key ? tab.text : theme.colors.border, color: filtro === tab.key ? '#fff' : theme.colors.textSecondary, borderRadius: '10px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 600 }}>Cargando bandeja…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px', marginBottom: '16px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Lista */}
      {!loading && !error && (
        tareasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: theme.colors.textSecondary }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✅</div>
            <p style={{ margin: 0 }}>
              {filtro === 'todas' ? 'No hay tareas pendientes de revisión.' : 'No hay tareas en esta categoría.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tareasFiltradas.map((tarea) => (
              <BandejaTareaCard key={tarea.id} tarea={tarea} onRefresh={fetchTareas} />
            ))}
          </div>
        )
      )}
    </div>
  );
};

// ── BandejaTareaCard ──────────────────────────────────────────

const BandejaTareaCard: React.FC<{ tarea: TareaRevision; onRefresh: () => void }> = ({ tarea, onRefresh }) => {
  const cfg = ESTADO_CFG_BANDEJA[tarea.estado] ?? { bg: '#F3F4F6', text: '#374151', label: tarea.estado };

  const [aprobando,          setAprobando]          = useState(false);
  const [aprobarError,       setAprobarError]       = useState<string | null>(null);
  const [showDevolverModal,  setShowDevolverModal]  = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [comentarioDev,      setComentarioDev]      = useState('');
  const [enviandoDev,        setEnviandoDev]        = useState(false);
  const [errorDev,           setErrorDev]           = useState<string | null>(null);

  // ── N2: acciones de la Directora General ─────────────────────
  const [finalizando,        setFinalizando]        = useState(false);
  const [finalizarError,     setFinalizarError]     = useState<string | null>(null);
  const [showDevolverDG,     setShowDevolverDG]     = useState(false);
  const [comentarioDG,       setComentarioDG]       = useState('');
  const [enviandoDevolDG,    setEnviandoDevolDG]    = useState(false);
  const [errorDevolDG,       setErrorDevolDG]       = useState<string | null>(null);

  // N1: encargado aprueba EN_REVISION → EN_REVISION_DG
  const handleAprobar = async () => {
    setAprobando(true); setAprobarError(null);
    try {
      await apiFetchBandeja(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar`, { method: 'PATCH' });
      onRefresh();
    } catch (err: any) { setAprobarError(err.message); }
    finally { setAprobando(false); }
  };

  // N1: encargado devuelve EN_REVISION → DEVUELTO
  const handleDevolver = async () => {
    if (!comentarioDev.trim()) return;
    setEnviandoDev(true); setErrorDev(null);
    try {
      await apiFetchBandeja(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/devolver`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentarioDev.trim() }),
      });
      setShowDevolverModal(false);
      setComentarioDev('');
      onRefresh();
    } catch (err: any) { setErrorDev(err.message); }
    finally { setEnviandoDev(false); }
  };

  // N2: DG finaliza EN_REVISION_DG → FINALIZADO
  const handleFinalizar = async () => {
    setFinalizando(true); setFinalizarError(null);
    try {
      await apiFetchBandeja(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/aprobar-dg`, { method: 'PATCH' });
      onRefresh();
    } catch (err: any) { setFinalizarError(err.message); }
    finally { setFinalizando(false); }
  };

  // N2: DG devuelve EN_REVISION_DG → DEVUELTO
  const handleDevolverDG = async () => {
    if (!comentarioDG.trim()) return;
    setEnviandoDevolDG(true); setErrorDevolDG(null);
    try {
      await apiFetchBandeja(`/eventos/${tarea.evento_id}/tareas/${tarea.id}/devolver-dg`, {
        method: 'PATCH',
        body: JSON.stringify({ comentario: comentarioDG.trim() }),
      });
      setShowDevolverDG(false);
      setComentarioDG('');
      onRefresh();
    } catch (err: any) { setErrorDevolDG(err.message); }
    finally { setEnviandoDevolDG(false); }
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* Fila principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', flexWrap: 'wrap' }}>

        {/* Indicador de estado lateral */}
        <div style={{ width: '4px', alignSelf: 'stretch', backgroundColor: cfg.text, borderRadius: '2px', flexShrink: 0 }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: theme.colors.textPrimary }}>{tarea.titulo}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
            📅 {tarea.evento_titulo} &nbsp;·&nbsp; 👤 {tarea.asignado_a_nombre}
          </p>
          {tarea.descripcion && (
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>{tarea.descripcion}</p>
          )}
        </div>

        {/* Badge estado */}
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {cfg.label}
        </span>

        {/* Fecha */}
        <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
          📅 {tarea.fecha_programada}
        </span>

        {/* EN_REVISION = nivel 1 (director de área). La DG NO actúa aquí,
            solo ve el estado. Sus acciones son únicamente en EN_REVISION_DG. */}
        {tarea.estado === 'EN_REVISION' && (
          <span style={{ fontSize: '0.75rem', color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', padding: '5px 10px', fontWeight: 600, flexShrink: 0 }}>
            🔍 En revisión por el director de área
          </span>
        )}

        {/* Acciones N2: DG finaliza o devuelve desde EN_REVISION_DG */}
        {tarea.estado === 'EN_REVISION_DG' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={handleFinalizar}
              disabled={finalizando}
              style={{ padding: '6px 14px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: finalizando ? 'not-allowed' : 'pointer', opacity: finalizando ? 0.6 : 1, fontFamily: theme.font.family }}
            >
              {finalizando ? '…' : '✓ Finalizar'}
            </button>
            <button
              onClick={() => { setShowDevolverDG(true); setComentarioDG(''); setErrorDevolDG(null); }}
              disabled={finalizando}
              style={{ padding: '6px 14px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family }}
            >
              ↩ Devolver
            </button>
          </div>
        )}

        {/* Botón Abrir */}
        <button
          onClick={() => setShowHistorialModal(true)}
          style={{ padding: '6px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: theme.font.family, flexShrink: 0 }}
        >
          Abrir
        </button>
      </div>

      {/* Errores inline */}
      {aprobarError   && <div style={{ padding: '6px 16px', backgroundColor: '#FEE2E2', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {aprobarError}</div>}
      {finalizarError && <div style={{ padding: '6px 16px', backgroundColor: '#FEE2E2', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {finalizarError}</div>}

      {/* Modal devolver */}
      {showDevolverModal && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDevolverModal(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>↩ Devolver tarea</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: theme.colors.textPrimary }}>
              Motivo de devolución <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={comentarioDev}
              onChange={(e) => setComentarioDev(e.target.value)}
              rows={4}
              placeholder="Describe qué debe corregirse o completarse…"
              disabled={enviandoDev}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical', marginBottom: '14px' }}
            />
            {errorDev && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {errorDev}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDevolverModal(false)} disabled={enviandoDev} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleDevolver} disabled={enviandoDev || !comentarioDev.trim()} style={{ padding: '8px 18px', backgroundColor: '#F59E0B', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (enviandoDev || !comentarioDev.trim()) ? 'not-allowed' : 'pointer', opacity: (enviandoDev || !comentarioDev.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {enviandoDev ? 'Devolviendo…' : '↩ Devolver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal devolver N2 (DG) */}
      {showDevolverDG && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDevolverDG(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '460px', fontFamily: theme.font.family }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>↩ Devolver con observaciones</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: theme.colors.textSecondary }}>{tarea.titulo}</p>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: theme.colors.textPrimary }}>
              Observaciones <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <textarea
              value={comentarioDG}
              onChange={(e) => setComentarioDG(e.target.value)}
              rows={4}
              placeholder="Indica qué debe corregirse o completarse…"
              disabled={enviandoDevolDG}
              style={{ width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical' as const, marginBottom: '14px' }}
            />
            {errorDevolDG && <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.alert.red }}>⚠ {errorDevolDG}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDevolverDG(false)} disabled={enviandoDevolDG} style={{ padding: '8px 18px', backgroundColor: '#fff', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: '7px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family }}>Cancelar</button>
              <button onClick={handleDevolverDG} disabled={enviandoDevolDG || !comentarioDG.trim()} style={{ padding: '8px 18px', backgroundColor: '#F59E0B', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '0.85rem', fontWeight: 700, cursor: (enviandoDevolDG || !comentarioDG.trim()) ? 'not-allowed' : 'pointer', opacity: (enviandoDevolDG || !comentarioDG.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}>
                {enviandoDevolDG ? 'Devolviendo…' : '↩ Devolver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal historial */}
      {showHistorialModal && (
        <HistorialBandejaModal
          eventoId={tarea.evento_id}
          tareaId={tarea.id}
          tareaTitulo={tarea.titulo}
          onClose={() => setShowHistorialModal(false)}
        />
      )}
    </div>
  );
};

// ── HistorialBandejaModal ─────────────────────────────────────

const TIPO_CFG: Record<string, { bg: string; text: string; label: string }> = {
  AVANCE:        { bg: '#DBEAFE', text: '#1E40AF', label: 'Avance'       },
  DEVOLUCION:    { bg: '#FEF3C7', text: '#92400E', label: 'Devolución'   },
  APROBACION_N1: { bg: '#D1FAE5', text: '#065F46', label: 'Aprobado N1'  },
  APROBACION_N2: { bg: '#EDE9FE', text: '#5B21B6', label: 'Aprobado DG'  },
};

const HistorialBandejaModal: React.FC<{
  eventoId:    number;
  tareaId:     number;
  tareaTitulo: string;
  onClose:     () => void;
}> = ({ eventoId, tareaId, tareaTitulo, onClose }) => {
  const [registros, setRegistros] = useState<RegistroHistorial[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    apiFetchBandeja<{ data: RegistroHistorial[] }>(`/eventos/${eventoId}/tareas/${tareaId}/historial`)
      .then(({ data }) => setRegistros(data))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [eventoId, tareaId]);

  function formatFechaH(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', width: '100%', maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: theme.font.family }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>📋 Historial de Revisiones</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: theme.colors.textSecondary }}>×</button>
        </div>
        <p style={{ margin: '10px 24px 0', fontSize: '0.82rem', color: theme.colors.textSecondary }}>
          Tarea: <strong style={{ color: theme.colors.textPrimary }}>{tareaTitulo}</strong>
        </p>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 20px' }}>
          {loading && <p style={{ textAlign: 'center', color: theme.colors.textSecondary }}>⏳ Cargando…</p>}
          {!loading && error && <p style={{ color: theme.colors.alert.red }}>⚠ {error}</p>}
          {!loading && !error && registros.length === 0 && <p style={{ textAlign: 'center', color: theme.colors.textSecondary }}>Sin historial aún.</p>}
          {!loading && !error && registros.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {registros.map((r) => {
                const tipoCfg = TIPO_CFG[r.tipo] ?? { bg: '#F3F4F6', text: '#374151', label: r.tipo };
                return (
                  <div key={r.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: tipoCfg.bg, color: tipoCfg.text, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>
                      {tipoCfg.label}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: theme.colors.textPrimary }}>{r.autor_nombre}</span>
                        <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{formatFechaH(r.creado_en)}</span>
                      </div>
                      {r.contenido && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.5 }}>{r.contenido}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '12px 24px 20px', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────

const LoadingScreen: React.FC = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
    <div style={{ textAlign: 'center', color: theme.colors.textSecondary }}>
      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
      <p style={{ margin: 0, fontWeight: 600 }}>Cargando métricas…</p>
    </div>
  </div>
);

const ErrorScreen: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
    <div style={{ textAlign: 'center', maxWidth: '360px' }}>
      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
      <p style={{ color: theme.colors.alert.red, fontWeight: 600, marginBottom: '16px' }}>{message}</p>
      <button onClick={onRetry} style={{ padding: '10px 24px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 700 }}>
        Reintentar
      </button>
    </div>
  </div>
);

const EmptyState: React.FC<{ text: string; color?: string }> = ({ text, color = theme.colors.textSecondary }) => (
  <p style={{ textAlign: 'center', color, fontSize: '0.85rem', padding: '24px 0', margin: 0 }}>{text}</p>
);
