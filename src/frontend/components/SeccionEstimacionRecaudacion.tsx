/**
 * Componente: SeccionEstimacionRecaudacion
 * File: src/frontend/components/SeccionEstimacionRecaudacion.tsx
 *
 * Compara, mes a mes, lo que estimó el departamento de Ingresos contra lo
 * reportado por RPP (Excel "RPPC- Recaudación vs Estimación") y contra lo que
 * ya tenemos cargado en satq_ingresos. Las dos últimas casi nunca coinciden
 * exacto (distinto corte/exportación) — se muestran ambas, no se elige una.
 *
 * Marca en rojo los meses donde la BD recaudó menos de lo estimado
 * (decremento) para poder saltar al detalle de ese mes en el resto del
 * "Reporte de Ingresos" (cambiando el periodo de arriba a ese mes).
 */

import React, { useState, useEffect } from 'react';
import { theme } from '../theme';
import { getSatqEstimacionVsRecaudacion, getSatqProyeccionAnual } from '../api';
import type { EstimacionMesSatq, ProyeccionAnualSatq } from '../types';

const MONEDA  = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES_CORTO   = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>{text}</p>
);

export const SeccionEstimacionRecaudacion: React.FC = () => {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [meses, setMeses] = useState<EstimacionMesSatq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getSatqEstimacionVsRecaudacion(anio)
      .then((r) => { if (!cancelado) setMeses(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [anio]);

  const decrementos = meses.filter((m) => m.es_decremento);
  const decrementosPorSubsidio = decrementos.filter((m) =>
    m.diferencia_gran_total_vs_estimado !== null && m.diferencia_gran_total_vs_estimado >= 0,
  );
  const decrementosReales = decrementos.filter((m) =>
    m.diferencia_gran_total_vs_estimado !== null && m.diferencia_gran_total_vs_estimado < 0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="no-imprimir" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, fontWeight: 600 }}>Ejercicio:</span>
        <select
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family }}
        >
          {[anio - 1, anio, anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <p className="solo-impresion" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: theme.colors.primaryDark }}>
        Ejercicio: {anio}
      </p>

      {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
      {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
      {!loading && !error && meses.length === 0 && <EmptyState text={`Sin estimación cargada para ${anio}`} />}
      {!loading && !error && meses.length > 0 && (
        <>
          {decrementos.length > 0 && (
            <div style={{
              backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '12px',
              padding: '12px 16px', fontSize: '0.8rem', color: '#78350F', lineHeight: 1.5,
            }}>
              <strong>{decrementos.length} mes{decrementos.length === 1 ? '' : 'es'} con decremento</strong> (recaudado en nuestra
              BD por debajo de lo estimado): {decrementos.map((m) => MES_NOMBRE[m.mes - 1]).join(', ')}.
              {decrementosPorSubsidio.length > 0 && (
                <> De esos, en <strong>{decrementosPorSubsidio.length}</strong> ({decrementosPorSubsidio.map((m) => MES_NOMBRE[m.mes - 1]).join(', ')}) el{' '}
                <strong>gran total (recaudado + subsidiado) sí alcanza o supera la estimación</strong> — el decremento no es menos
                trabajo de RPP, es más subsidio otorgado ese mes.</>
              )}
              {decrementosReales.length > 0 && (
                <> En <strong>{decrementosReales.length}</strong> ({decrementosReales.map((m) => MES_NOMBRE[m.mes - 1]).join(', ')}) el decremento
                es real: ni siquiera sumando los subsidios se alcanza la estimación.</>
              )}
              {' '}Para ver el detalle de cada uno, cambia el "Periodo" de arriba a ese mes — las tablas de programa,
              concepto y municipio con comparativo interanual ya te dicen qué cayó.
            </div>
          )}

          <EstimacionBarChart meses={meses} />
          <EstimacionTabla meses={meses} />

          <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
            "Reportado (Excel)" es la cifra que RPP reportó en el concentrado de Ingresos; "Recaudado (BD)" es la
            suma en vivo de lo que tenemos cargado en el sistema. Casi nunca coinciden exacto — vienen de cortes
            distintos — por eso se muestra la brecha entre ambos en vez de ocultarla. "Gran total (+ subsidios)" es
            Recaudado (BD) más lo subsidiado ese mes — el trabajo real de RPP, se haya cobrado o no — para separar
            un decremento por menos trabajo de uno por más subsidio otorgado.
          </p>

          <SeccionProyeccionAnual anio={anio} />
        </>
      )}
    </div>
  );
};

// ── SeccionProyeccionAnual: cómo podría cerrar el año ─────────

const ProyeccionCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <div style={{
    backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '12px',
    padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px', flex: 1,
  }}>
    <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
    <span style={{ fontSize: '1.3rem', fontWeight: 700, color: color ?? theme.colors.textPrimary }}>{value}</span>
    {sub && <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary }}>{sub}</span>}
  </div>
);

const EscenarioCard: React.FC<{ titulo: string; descripcion: string; escenario: ProyeccionAnualSatq['escenario_meta']; metaAnual: number }> = ({ titulo, descripcion, escenario, metaAnual }) => {
  const favorable = escenario.diferencia_vs_meta_anual >= 0;
  return (
    <div style={{
      backgroundColor: favorable ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${favorable ? '#BBF7D0' : '#FECACA'}`,
      borderRadius: '12px', padding: '14px 18px', flex: 1, minWidth: '260px',
    }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.textPrimary }}>{titulo}</div>
      <p style={{ margin: '4px 0 10px', fontSize: '0.72rem', color: theme.colors.textSecondary, lineHeight: 1.4 }}>{descripcion}</p>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: theme.colors.textPrimary }}>{MONEDA.format(escenario.total_anual)}</div>
      <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginBottom: '6px' }}>cierre estimado del año</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: favorable ? theme.colors.alert.green : theme.colors.alert.red }}>
        {favorable ? '▲' : '▼'} {MONEDA.format(Math.abs(escenario.diferencia_vs_meta_anual))} ({favorable ? '+' : ''}{escenario.pct_vs_meta_anual}%) vs. meta anual ({MONEDA.format(metaAnual)})
      </div>
    </div>
  );
};

const SeccionProyeccionAnual: React.FC<{ anio: number }> = ({ anio }) => {
  const [proyeccion, setProyeccion] = useState<ProyeccionAnualSatq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getSatqProyeccionAnual(anio)
      .then((r) => { if (!cancelado) setProyeccion(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [anio]);

  if (loading) return <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando proyección…</p>;
  if (error) return <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>;
  if (!proyeccion) return null;
  if (proyeccion.meses_restantes === 0) {
    return <EmptyState text="El año ya cerró — no hay meses restantes que proyectar." />;
  }

  const deficitFavorable = proyeccion.deficit_acumulado >= 0;
  const necesitaMasQueEstimado = proyeccion.pct_necesario_sobre_estimado_restante > 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '14px',
      borderTop: `2px dashed ${theme.colors.border}`, paddingTop: '16px', marginTop: '4px',
    }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: theme.colors.textPrimary }}>
          Proyección de cierre de año {proyeccion.anio}
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}>
          Con base en el acumulado de los {proyeccion.meses_con_datos} meses con datos y la estimación de Ingresos
          para los {proyeccion.meses_restantes} meses que faltan, así podría cerrar el año.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <ProyeccionCard
          label="Recaudado acumulado"
          value={MONEDA.format(proyeccion.recaudado_acumulado)}
          sub={`vs. estimado a la fecha: ${MONEDA.format(proyeccion.estimado_transcurrido)}`}
        />
        <ProyeccionCard
          label="Déficit acumulado"
          value={`${deficitFavorable ? '+' : '-'}${MONEDA.format(Math.abs(proyeccion.deficit_acumulado))}`}
          color={deficitFavorable ? theme.colors.alert.green : theme.colors.alert.red}
          sub={`variación promedio mensual: ${proyeccion.pct_variacion_promedio >= 0 ? '+' : ''}${proyeccion.pct_variacion_promedio}%`}
        />
        <ProyeccionCard
          label="Meta anual (estimación Ingresos)"
          value={MONEDA.format(proyeccion.estimado_total_anual)}
          sub={`restan ${MONEDA.format(proyeccion.estimado_restante)} por estimar en los meses que faltan`}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <EscenarioCard
          titulo="Escenario 1 — cumplen su propia meta"
          descripcion="Si los meses que faltan recaudan exactamente lo que Ingresos ya les estimó (100%), sin recuperar el decremento acumulado ni caer más."
          escenario={proyeccion.escenario_meta}
          metaAnual={proyeccion.estimado_total_anual}
        />
        <EscenarioCard
          titulo="Escenario 2 — continúa la tendencia actual"
          descripcion={`Si los meses que faltan repiten la variación promedio observada hasta ahora (${proyeccion.pct_variacion_promedio >= 0 ? '+' : ''}${proyeccion.pct_variacion_promedio}% vs. su estimado) — ${proyeccion.pct_variacion_promedio < 0 ? 'el decremento se profundiza' : 'el decremento se recupera'}.`}
          escenario={proyeccion.escenario_tendencia}
          metaAnual={proyeccion.estimado_total_anual}
        />
      </div>

      <div style={{
        backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '12px',
        padding: '12px 16px', fontSize: '0.8rem', color: '#78350F', lineHeight: 1.5,
      }}>
        Para cerrar el año exactamente en la meta de {MONEDA.format(proyeccion.estimado_total_anual)}, los{' '}
        {proyeccion.meses_restantes} meses que faltan necesitarían recaudar {MONEDA.format(proyeccion.monto_necesario_resto_anio)}
        {necesitaMasQueEstimado
          ? <> — un {proyeccion.pct_necesario_sobre_estimado_restante}% <strong>por arriba</strong> de lo que Ingresos ya tenía estimado para ellos.</>
          : <> — un {Math.abs(proyeccion.pct_necesario_sobre_estimado_restante)}% por debajo de lo estimado, es decir la meta ya está prácticamente cubierta con lo que se espera.</>}
      </div>

      <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
        Esta proyección es una extrapolación simple y transparente en su método (promedio de variación % mensual observada),
        no un modelo estadístico riguroso. Sirve para dimensionar el reto de los meses que faltan, no como pronóstico exacto.
      </p>
    </div>
  );
};

// ── EstimacionBarChart (SVG puro: Estimado vs Recaudado BD por mes) ──

const EstimacionBarChart: React.FC<{ meses: EstimacionMesSatq[] }> = ({ meses }) => {
  const W = 760; const H = 220; const PAD = { top: 12, right: 10, bottom: 28, left: 46 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(
    ...meses.map((m) => m.estimado),
    ...meses.map((m) => m.recaudado_bd ?? 0),
    ...meses.map((m) => m.gran_total ?? 0),
    1,
  );
  const grupoW = chartW / meses.length;
  const barW = grupoW * 0.24;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: '620px' }}>
        {yTicks.map((t) => {
          const y = PAD.top + chartH - (t / maxVal) * chartH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={theme.colors.border} strokeDasharray="3 3" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="8" fill={theme.colors.textSecondary}>
                {(t / 1_000_000).toFixed(0)}M
              </text>
            </g>
          );
        })}
        {meses.map((m, i) => {
          const xGrupo = PAD.left + i * grupoW;
          const hEst = (m.estimado / maxVal) * chartH;
          const hReal = m.recaudado_bd !== null ? (m.recaudado_bd / maxVal) * chartH : 0;
          const hGranTotal = m.gran_total !== null ? (m.gran_total / maxVal) * chartH : 0;
          const colorReal = m.es_decremento ? theme.colors.alert.red : theme.colors.alert.green;
          const esDecrementoGranTotal = m.diferencia_gran_total_vs_estimado !== null && m.diferencia_gran_total_vs_estimado < 0;
          const colorGranTotal = esDecrementoGranTotal ? theme.colors.alert.red : theme.colors.gold;
          return (
            <g key={m.mes}>
              <rect x={xGrupo + grupoW * 0.06} y={PAD.top + chartH - hEst} width={barW} height={hEst} fill={theme.colors.grayMid} rx="1.5">
                <title>{`${MES_NOMBRE[m.mes - 1]}: estimado ${MONEDA.format(m.estimado)}`}</title>
              </rect>
              {m.recaudado_bd !== null && (
                <rect x={xGrupo + grupoW * 0.38} y={PAD.top + chartH - hReal} width={barW} height={hReal} fill={colorReal} rx="1.5">
                  <title>{`${MES_NOMBRE[m.mes - 1]}: recaudado (BD) ${MONEDA.format(m.recaudado_bd)}`}</title>
                </rect>
              )}
              {m.gran_total !== null && (
                <rect x={xGrupo + grupoW * 0.70} y={PAD.top + chartH - hGranTotal} width={barW} height={hGranTotal} fill={colorGranTotal} rx="1.5">
                  <title>{`${MES_NOMBRE[m.mes - 1]}: gran total (recaudado + subsidiado) ${MONEDA.format(m.gran_total)}`}</title>
                </rect>
              )}
              <text x={xGrupo + grupoW / 2} y={H - PAD.bottom + 12} textAnchor="middle" fontSize="8" fill={theme.colors.textSecondary}>
                {MES_CORTO[m.mes - 1]}
              </text>
            </g>
          );
        })}
        {/* Leyenda */}
        <rect x={PAD.left} y={2} width={8} height={8} fill={theme.colors.grayMid} rx="2" />
        <text x={PAD.left + 12} y={9} fontSize="8" fill={theme.colors.textSecondary}>Estimado</text>
        <rect x={PAD.left + 68} y={2} width={8} height={8} fill={theme.colors.alert.green} rx="2" />
        <text x={PAD.left + 80} y={9} fontSize="8" fill={theme.colors.textSecondary}>Recaudado (BD)</text>
        <rect x={PAD.left + 170} y={2} width={8} height={8} fill={theme.colors.gold} rx="2" />
        <text x={PAD.left + 182} y={9} fontSize="8" fill={theme.colors.textSecondary}>Gran total (+ subsidios)</text>
        <rect x={PAD.left + 300} y={2} width={8} height={8} fill={theme.colors.alert.red} rx="2" />
        <text x={PAD.left + 312} y={9} fontSize="8" fill={theme.colors.textSecondary}>Decremento vs. estimado</text>
      </svg>
    </div>
  );
};

// ── EstimacionTabla ──────────────────────────────────────────

const EstimacionTabla: React.FC<{ meses: EstimacionMesSatq[] }> = ({ meses }) => {
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
            <th style={th}>Mes</th>
            <th style={{ ...th, textAlign: 'right' }}>Estimado</th>
            <th style={{ ...th, textAlign: 'right' }}>Reportado (Excel)</th>
            <th style={{ ...th, textAlign: 'right' }}>Recaudado (BD)</th>
            <th style={{ ...th, textAlign: 'right' }}>BD vs. Estimado</th>
            <th style={{ ...th, textAlign: 'right' }} title="Recaudado (BD) + subsidios del mes — el trabajo real de RPP, cobrado o no">Gran total (+ subsidios)</th>
            <th style={{ ...th, textAlign: 'right' }}>Gran total vs. Estimado</th>
            <th style={{ ...th, textAlign: 'right' }}>BD vs. Excel</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => {
            const esDecrementoGranTotal = m.diferencia_gran_total_vs_estimado !== null && m.diferencia_gran_total_vs_estimado < 0;
            const decrementoExplicadoPorSubsidio = m.es_decremento && !esDecrementoGranTotal;
            return (
            <tr key={m.mes} style={m.es_decremento ? { backgroundColor: '#FEF2F2' } : undefined}>
              <td style={{ ...td, fontWeight: m.es_decremento ? 700 : 400 }}>{MES_NOMBRE[m.mes - 1]}</td>
              <td style={{ ...td, textAlign: 'right' }}>{MONEDA.format(m.estimado)}</td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>
                {m.reportado_excel !== null ? MONEDA.format(m.reportado_excel) : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                {m.recaudado_bd !== null ? MONEDA.format(m.recaudado_bd) : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: m.diferencia_bd_vs_estimado === null ? theme.colors.textSecondary : m.es_decremento ? theme.colors.alert.red : theme.colors.alert.green }}>
                {m.diferencia_bd_vs_estimado === null ? '—' : `${m.diferencia_bd_vs_estimado >= 0 ? '▲' : '▼'} ${MONEDA.format(Math.abs(m.diferencia_bd_vs_estimado))} (${m.pct_diferencia_bd_vs_estimado! >= 0 ? '+' : ''}${m.pct_diferencia_bd_vs_estimado}%)`}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: theme.colors.gold }}>
                {m.gran_total !== null ? MONEDA.format(m.gran_total) : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: m.diferencia_gran_total_vs_estimado === null ? theme.colors.textSecondary : esDecrementoGranTotal ? theme.colors.alert.red : theme.colors.alert.green }}>
                {m.diferencia_gran_total_vs_estimado === null ? '—' : (
                  <>
                    {m.diferencia_gran_total_vs_estimado >= 0 ? '▲' : '▼'} {MONEDA.format(Math.abs(m.diferencia_gran_total_vs_estimado))} ({m.pct_diferencia_gran_total_vs_estimado! >= 0 ? '+' : ''}{m.pct_diferencia_gran_total_vs_estimado}%)
                    {decrementoExplicadoPorSubsidio && (
                      <div style={{ fontSize: '0.65rem', fontWeight: 400, color: theme.colors.textSecondary, marginTop: '2px' }}>
                        (el decremento de BD es por subsidio)
                      </div>
                    )}
                  </>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>
                {m.diferencia_bd_vs_excel === null ? '—' : MONEDA.format(m.diferencia_bd_vs_excel)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
