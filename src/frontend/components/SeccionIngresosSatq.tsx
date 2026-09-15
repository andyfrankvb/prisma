/**
 * Componente: SeccionIngresosSatq
 * File: src/frontend/components/SeccionIngresosSatq.tsx
 *
 * Resumen ejecutivo de ingresos SATQ y conciliación con RPP/SIQROO: filtra por
 * mes, muestra KPIs (incluye comparativo interanual y alerta de conciliación
 * baja), un donut de top-conceptos y un ranking por municipio.
 *
 * Autocontenido (fetch propio) para poder embeberse en más de un lugar:
 *  - Dashboard_Director.tsx (perfil Alta Dirección, dentro del tablero)
 *  - Reportes_SATQ.tsx      (perfil Administrador, "Reporte de Ingresos")
 */

import React, { useState, useEffect } from 'react';
import { Icono } from './Icono';
import type { NombreIcono } from './Icono';
import { theme } from '../theme';
import { getSatqResumen, getSatqComparativoAnual, getSatqDetalle } from '../api';
import { SelectorPeriodo, rangoDeMesInicial } from './SelectorPeriodo';
import { Modal } from './Modal';
import type { ResumenSatq, ConceptoResumenSatq, MunicipioResumenSatq, DelegacionResumenSatq, DesgloseCategoriaSatq, ComparativoAnualSatq, SatqDetalleFila } from '../types';

const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const CONCEPTO_COLORS = [
  theme.colors.primary, theme.colors.gold, theme.colors.charcoal,
  theme.colors.primaryLight, theme.colors.goldLight, '#6E1030', '#7C7C7C', '#B0ABA1',
];

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "jul 2025" si es un mes completo; "01 jul – 30 sep 2025" si es un rango más amplio. */
function formatRangoCorto(desde: string, hasta: string): string {
  const d = new Date(desde + 'T00:00:00');
  const h = new Date(hasta + 'T00:00:00');
  const mismoMes = d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth();
  if (mismoMes) return `${MES_CORTO[d.getMonth()]} ${d.getFullYear()}`;
  const mismoAnio = d.getFullYear() === h.getFullYear();
  const fD = `${String(d.getDate()).padStart(2, '0')} ${MES_CORTO[d.getMonth()]}`;
  const fH = `${String(h.getDate()).padStart(2, '0')} ${MES_CORTO[h.getMonth()]}`;
  return mismoAnio ? `${fD} – ${fH} ${h.getFullYear()}` : `${fD} ${d.getFullYear()} – ${fH} ${h.getFullYear()}`;
}

/** Texto compacto ("▲ 12%" / "▼ 5%") con color — para tablas y barras. */
function varianzaTexto(pct: number | null): { texto: string; color: string } {
  if (pct === null) return { texto: '—', color: theme.colors.textSecondary };
  if (pct === 0)    return { texto: 'Igual', color: theme.colors.textSecondary };
  if (pct > 0)      return { texto: `▲ ${pct}%`, color: theme.colors.alert.green };
  return { texto: `▼ ${Math.abs(pct)}%`, color: theme.colors.alert.red };
}

// ── EmptyState local (mismo estilo del resto del sistema) ──────

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>{text}</p>
);

// ── KpiCard local ────────────────────────────────────────────

// Cifras de 7+ dígitos (montos en millones) no caben a 1.8rem en una tarjeta
// angosta y se veían cortadas — el tamaño de letra ahora se ajusta al largo
// del texto en vez de ser fijo.
function fontSizeParaValor(value: string): string {
  const len = value.length;
  if (len <= 9)  return '1.8rem';
  if (len <= 12) return '1.4rem';
  if (len <= 16) return '1.15rem';
  return '0.95rem';
}

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  icon:  NombreIcono;
  color: string;
  alert?: boolean;
  onClick?: () => void;
}> = ({ label, value, icon, color, alert, onClick }) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: '#fff', borderRadius: '10px', padding: '20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
      position: 'relative', cursor: onClick ? 'pointer' : undefined,
    }}
  >
    {alert && (
      <span style={{
        position: 'absolute', top: 8, right: 10, width: 8, height: 8, borderRadius: '50%',
        backgroundColor: color, boxShadow: `0 0 0 3px ${color}33`,
      }} />
    )}
    <div style={{ marginBottom: '8px' }}><Icono nombre={icon} size={24} color={color} /></div>
    <div
      style={{
        fontSize: fontSizeParaValor(String(value)), fontWeight: 800, color, lineHeight: 1.15,
        overflowWrap: 'break-word', wordBreak: 'break-word',
      }}
      title={String(value)}
    >
      {value}
    </div>
    <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>
      {label}{onClick && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>🔍</span>}
    </div>
  </div>
);

// ── GranTotalPanel: recaudado + subsidiado = valor total del trabajo de RPP ──

const StatBlock: React.FC<{ label: string; value: string; color: string; big?: boolean; onClick?: () => void }> = ({ label, value, color, big, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '150px', cursor: onClick ? 'pointer' : undefined }}>
    <span style={{ fontSize: big ? '1.55rem' : '1.2rem', fontWeight: 800, color, lineHeight: 1.15, wordBreak: 'break-word' }}>{value}</span>
    <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, fontWeight: 600 }}>
      {label}{onClick && <span style={{ marginLeft: '4px', fontSize: '0.68rem' }}>🔍</span>}
    </span>
  </div>
);

// ── ConciliacionPanel: en qué estatus de RPP está cada referencia de SATQ ──

const ConciliacionPanel: React.FC<{ resumen: ResumenSatq; onVerCategoria: (estatus: string, titulo: string) => void }> = ({ resumen, onVerCategoria }) => {
  const c = resumen.conciliacion;
  const total = c.conciliado + c.en_tramite_rpp + c.cancelado_rpp + c.no_ingresado_rpp;
  if (total === 0) return null;

  const segmentos = [
    { estatus: 'Conciliado', titulo: 'Referencias conciliadas (Entrega en RPP)', label: 'Conciliado (Entrega en RPP)', cantidad: c.conciliado, pct: c.pct_conciliado, monto: c.monto_conciliado, color: theme.colors.alert.green },
    { estatus: 'En trámite en RPP', titulo: 'Referencias en trámite en RPP (sin calificar/entregar)', label: 'En trámite en RPP', cantidad: c.en_tramite_rpp, pct: c.pct_en_tramite_rpp, monto: c.monto_en_tramite_rpp, color: theme.colors.alert.yellow },
    { estatus: 'Cancelado en RPP', titulo: 'Referencias canceladas en RPP', label: 'Cancelado en RPP', cantidad: c.cancelado_rpp, pct: c.pct_cancelado_rpp, monto: c.monto_cancelado_rpp, color: theme.colors.grayMid },
    { estatus: 'No ha ingresado a RPP', titulo: 'Referencias que aún no ingresan a RPP', label: 'No ha ingresado a RPP', cantidad: c.no_ingresado_rpp, pct: c.pct_no_ingresado_rpp, monto: c.monto_no_ingresado_rpp, color: theme.colors.alert.red },
  ];

  return (
    <div style={{
      backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '14px',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: theme.colors.primaryDark }}>
        Conciliación con RPP: en qué estatus está cada referencia de SATQ
      </div>

      <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', backgroundColor: '#F1F0EE' }}>
        {segmentos.filter((s) => s.cantidad > 0).map((s) => (
          <div key={s.estatus} title={`${s.label}: ${s.pct}%`} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        {segmentos.map((s) => (
          <div
            key={s.estatus}
            onClick={s.cantidad > 0 ? () => onVerCategoria(s.estatus, s.titulo) : undefined}
            style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: s.cantidad > 0 ? 'pointer' : undefined }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: theme.colors.textPrimary }}>{s.pct}%</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textSecondary }}>{MONEDA.format(s.monto)}</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>
              {s.label} — {s.cantidad.toLocaleString('es-MX')}{s.cantidad > 0 && <span style={{ marginLeft: '4px', fontSize: '0.68rem' }}>🔍</span>}
            </span>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: '0.74rem', color: theme.colors.textSecondary, lineHeight: 1.55 }}>
        Solo "Conciliado" cuenta para el KPI principal de conciliación: es una referencia de SATQ cuya línea de captura
        ya llegó a estatus <strong>Entrega</strong> en RPP. "En trámite en RPP" ya existe en el sistema de RPP pero
        sigue en proceso (análisis, calificación, firma, etc. — sin importar la etapa exacta), así que aún no cuenta
        como conciliado. "No ha ingresado a RPP" es la brecha real: SATQ registró el cobro pero RPP todavía no tiene
        ningún registro de esa línea de captura.
      </p>

      <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textPrimary, lineHeight: 1.55, fontWeight: 600 }}>
        De {MONEDA.format(resumen.ingreso_total)} que reporta SATQ en el periodo, {MONEDA.format(c.monto_conciliado)} ({c.pct_conciliado}%)
        ya está confirmado en RPPC (Entrega). El faltante de {MONEDA.format(resumen.monto_no_conciliado)} ({(100 - c.pct_conciliado).toFixed(1)}%)
        se explica así: {MONEDA.format(c.monto_en_tramite_rpp)} ({c.pct_en_tramite_rpp}%) sigue en trámite en RPP, y{' '}
        {MONEDA.format(c.monto_no_ingresado_rpp)} ({c.pct_no_ingresado_rpp}%) todavía no ha ingresado a RPP.
      </p>
    </div>
  );
};

const GranTotalPanel: React.FC<{ resumen: ResumenSatq; onVerSubsidios: () => void }> = ({ resumen, onVerSubsidios }) => {
  // Suma de las dos cifras que se muestran (no resumen.ingreso_bruto): así la
  // ecuación que ve el usuario siempre cuadra exacto. resumen.ingreso_bruto
  // usa signo de importe para clasificar, monto_subsidios usa texto del
  // concepto — casi siempre coinciden pero no son idénticos en unas cuantas
  // filas, y esa brecha no debe aparecer en un apartado pensado para ser
  // una suma simple y verificable a ojo.
  const granTotal = resumen.ingreso_total + resumen.monto_subsidios;
  const pctSubsidiado = granTotal > 0 ? Math.round((resumen.monto_subsidios / granTotal) * 1000) / 10 : 0;
  return (
    <div style={{
      backgroundColor: '#FDF6E8', border: `1px solid ${theme.colors.goldLight}`, borderRadius: '14px',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: theme.colors.primaryDark }}>
        Gran total: valor del trabajo realizado por RPP
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <StatBlock label="Recaudado (lo que reporta SATQ)" value={MONEDA.format(resumen.ingreso_total)} color={theme.colors.primary} />
        <span style={{ fontSize: '1.3rem', color: theme.colors.textSecondary, fontWeight: 700 }}>+</span>
        <StatBlock
          label="Subsidiado (trámites de RPP sin cobro)"
          value={MONEDA.format(resumen.monto_subsidios)}
          color={theme.colors.gold}
          onClick={onVerSubsidios}
        />
        <span style={{ fontSize: '1.3rem', color: theme.colors.textSecondary, fontWeight: 700 }}>=</span>
        <StatBlock label="Gran total (trabajo realizado, cobrado o no)" value={MONEDA.format(granTotal)} color={theme.colors.charcoal} big />
      </div>
      <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary, lineHeight: 1.55 }}>
        RPP firmó <strong>{resumen.tramites_rpp.toLocaleString('es-MX')} trámites</strong> en el periodo, de los cuales{' '}
        <strong>{resumen.tramites_subsidiados.toLocaleString('es-MX')}</strong> ({pctSubsidiado}% del gran total en monto) tuvieron subsidio
        del gobierno: el trámite se realizó igual — es trabajo real de RPP — pero ese monto no llegó a Tesorería. "Ingreso del periodo" (lo
        que reporta SATQ como recaudado) solo muestra la parte cobrada; el <strong>gran total</strong> es lo que RPP habría facturado si
        ningún trámite tuviera subsidio, y por eso es la cifra que mejor refleja el volumen real de trabajo realizado.
      </p>
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────

/** Qué filtro aplicar al abrir el modal de detalle, y cómo titularlo. */
interface FiltroModalDetalle {
  titulo:      string;
  programa?:   string;
  subsidio?:   boolean;
  conciliado?: boolean;
  estatus_conciliacion?: string;
  delegacion?: string;
}

export const SeccionIngresosSatq: React.FC = () => {
  const inicial = rangoDeMesInicial();
  const [desde, setDesde]     = useState<string>(inicial.desde);
  const [hasta, setHasta]     = useState<string>(inicial.hasta);
  const [resumen, setResumen] = useState<ResumenSatq | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [comparativoAnual, setComparativoAnual] = useState<ComparativoAnualSatq[]>([]);
  const [modalDetalle, setModalDetalle]         = useState<FiltroModalDetalle | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    getSatqResumen({ desde, hasta })
      .then((r) => { if (!cancelado) setResumen(r.data); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [desde, hasta]);

  // Comparativo por año: cubre todos los años con datos, no depende del periodo elegido.
  useEffect(() => {
    getSatqComparativoAnual().then((r) => setComparativoAnual(r.data)).catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="no-imprimir">
        <SelectorPeriodo
          desde={desde} hasta={hasta}
          onChange={(d, h) => { setDesde(d); setHasta(h); }}
          onLimpiar={() => { const def = rangoDeMesInicial(); setDesde(def.desde); setHasta(def.hasta); }}
          mostrarLimpiar={desde !== rangoDeMesInicial().desde || hasta !== rangoDeMesInicial().hasta}
        />
      </div>
      <p className="solo-impresion" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: theme.colors.primaryDark }}>
        Periodo del resumen ejecutivo: {desde} a {hasta}
      </p>

      {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
      {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
      {!loading && !error && resumen && (() => {
        const pctAnt        = resumen.comparativo_anio_anterior.pct_variacion;
        const montoAnterior = resumen.comparativo_anio_anterior.ingreso_total;
        const diferenciaAnt = resumen.ingreso_total - montoAnterior;
        const rangoAnt      = formatRangoCorto(resumen.comparativo_anio_anterior.periodo.desde, resumen.comparativo_anio_anterior.periodo.hasta);
        const colorAnt = pctAnt === null ? theme.colors.textSecondary : pctAnt > 0 ? theme.colors.alert.green : pctAnt < 0 ? theme.colors.alert.red : theme.colors.textSecondary;
        // El valor grande ahora es el monto — "a cuánto equivale" el % — con el
        // signo y la flecha; el % y la referencia quedan en la etiqueta chica.
        const valorAnt = pctAnt === null ? '—' : `${diferenciaAnt >= 0 ? '▲' : '▼'} ${MONEDA.format(Math.abs(diferenciaAnt))}`;
        const etiquetaAnt = pctAnt === null
          ? `Sin datos en ${rangoAnt} para comparar`
          : `${Math.abs(pctAnt)}% ${pctAnt > 0 ? 'más' : pctAnt < 0 ? 'menos' : 'igual'} que ${rangoAnt} (${MONEDA.format(montoAnterior)})`;

        return (
        <>
          {/* Alerta de conciliación baja */}
          {resumen.alerta_conciliacion && (
            <div style={{
              backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '12px',
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <Icono nombre="alerta" size={18} color="#92400E" />
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#78350F', lineHeight: 1.4 }}>
                <strong>Conciliación baja:</strong> al comparar la sábana de SATQ contra el histórico de RPPC, solo el{' '}
                {resumen.pct_conciliado}% de las referencias de este periodo llegaron a estatus Entrega en RPP{' '}
                ({MONEDA.format(resumen.monto_no_conciliado)} sin conciliar). Parte de esa brecha es normal — trámites
                aún en trámite en RPP — revisa el desglose de abajo ("Conciliación con RPP") para ver cuánto es
                rezago y cuánto realmente no ha ingresado.
              </p>
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <KpiCard label="Ingreso del periodo (reportado por SATQ)" value={MONEDA.format(resumen.ingreso_total)} icon="grafica" color={theme.colors.primary} />
            <KpiCard
              label="Confirmado en RPPC (Entrega)"
              value={MONEDA.format(resumen.conciliacion.monto_conciliado)}
              icon="checkCirculo"
              color={theme.colors.alert.green}
              onClick={() => setModalDetalle({ titulo: 'Referencias conciliadas (Entrega en RPP)', estatus_conciliacion: 'Conciliado' })}
            />
            <KpiCard label={etiquetaAnt} value={valorAnt} icon="tendenciaBaja" color={colorAnt} />
            <KpiCard label="Trámites RPP firmados" value={resumen.tramites_rpp} icon="documento" color={theme.colors.charcoal} />
            <KpiCard
              label="Monto subsidiado"
              value={MONEDA.format(resumen.monto_subsidios)}
              icon="etiqueta"
              color={theme.colors.gold}
              onClick={() => setModalDetalle({ titulo: 'Subsidios del periodo', subsidio: true })}
            />
            <KpiCard
              label="Trámites con subsidio"
              value={resumen.tramites_subsidiados}
              icon="etiqueta"
              color={theme.colors.gold}
              onClick={() => setModalDetalle({ titulo: 'Subsidios del periodo', subsidio: true })}
            />
            <KpiCard label="% de subsidio sobre el total cobrado (antes de descontar subsidios)" value={`${resumen.pct_subsidios}%`} icon="grafica" color={theme.colors.goldLight} />
            <KpiCard
              label="% que concilia: sábana SATQ vs. histórico RPPC"
              value={`${resumen.pct_conciliado}%`}
              icon="checkCirculo"
              color={resumen.pct_conciliado >= 70 ? theme.colors.alert.green : theme.colors.alert.yellow}
              alert={resumen.pct_conciliado < 70}
              onClick={() => setModalDetalle({ titulo: 'Referencias conciliadas (Entrega en RPP)', estatus_conciliacion: 'Conciliado' })}
            />
          </div>

          <ConciliacionPanel
            resumen={resumen}
            onVerCategoria={(estatus, titulo) => setModalDetalle({ titulo, estatus_conciliacion: estatus })}
          />

          <GranTotalPanel resumen={resumen} onVerSubsidios={() => setModalDetalle({ titulo: 'Subsidios del periodo', subsidio: true })} />

          <div style={{
            backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
            padding: '10px 14px', fontSize: '0.74rem', color: theme.colors.textSecondary, lineHeight: 1.6,
          }}>
            <strong style={{ color: theme.colors.textPrimary }}>Bruto</strong>, <strong style={{ color: theme.colors.textPrimary }}>subsidio</strong> y{' '}
            <strong style={{ color: theme.colors.textPrimary }}>neto</strong>: <strong>bruto</strong> es todo lo que se cobra en el periodo, antes de
            aplicar cualquier descuento. <strong>Subsidio</strong> es la parte de ese cobro que el gobierno condona — el trámite se registra,
            pero ese monto no se recibe en caja. <strong>Neto</strong> = bruto − subsidio, es decir lo que realmente ingresa a la Tesorería.
            El "% de subsidio" se calcula sobre el bruto (no sobre el neto) porque es la base completa antes del descuento.
          </div>
          <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
            "% que concilia" compara la sábana de SATQ contra el histórico interno de RPPC/SIQROO: de todas las líneas
            de captura de SATQ del periodo, este % ya llegó a estatus <strong>Entrega</strong> del lado de RPPC — las que
            solo están en trámite (sin llegar a Entrega) NO cuentan aquí, ver el desglose "Conciliación con RPP" arriba.
            Es una señal de conciliación de existencia, no una igualación exacta de montos (una misma línea de captura
            puede reutilizarse para varios trámites a lo largo del tiempo) — haz clic en la tarjeta (🔍) para ver el
            detalle fila por fila de cuáles sí concilian. El comparativo interanual
            usa {resumen.comparativo_anio_anterior.periodo.desde} a {resumen.comparativo_anio_anterior.periodo.hasta}{' '}
            ({MONEDA.format(resumen.comparativo_anio_anterior.ingreso_total)}).
            "Trámites con subsidio" cuenta trámites de RPP distintos con match en alguna línea de captura del lado
            del subsidio — haz clic en cualquiera de las dos tarjetas de subsidio para ver el detalle fila por fila.
          </p>

          {/* Donut de conceptos + ranking por municipio + ranking por delegación */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Ingreso por concepto
              </div>
              <SatqConceptosDonut conceptos={resumen.top_conceptos} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Ingreso por municipio
              </div>
              <SatqMunicipiosBar municipios={resumen.por_municipio} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Ingreso por delegación (RPP)
              </div>
              <SatqDelegacionesBar
                delegaciones={resumen.por_delegacion}
                onClickDelegacion={(delegacion) => setModalDetalle({
                  titulo: delegacion === 'Sin delegación (no en RPP)' ? 'Referencias sin delegación (no en RPP)' : `Delegación: ${delegacion}`,
                  delegacion: delegacion === 'Sin delegación (no en RPP)' ? undefined : delegacion,
                  estatus_conciliacion: delegacion === 'Sin delegación (no en RPP)' ? 'No ha ingresado a RPP' : undefined,
                })}
              />
            </div>
          </div>

          {/* Ingreso por programa — cargo bruto, subsidio y neto */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
              Ingreso por programa
            </div>
            <SatqDesgloseTabla
              filas={resumen.por_programa}
              onClickCategoria={(categoria) => setModalDetalle({ titulo: categoria, programa: categoria })}
            />
            <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
              Programas como SEDETUS, Vivienda para el Bienestar, AGEPROO e INSUS son mayormente o totalmente
              subsidiados: el neto no refleja su volumen real de trámites, solo lo que efectivamente se recauda.
              "Trámites RPP" es cuántos trámites distintos de RPP tienen coincidencia con esas líneas de captura
              (mismo criterio de existencia que "% que concilia" arriba, no una igualación exacta) — un mismo
              trámite puede contar en cargo y en subsidio si tuvo ambos. Haz clic en una categoría para ver el
              detalle fila por fila.
            </p>
          </div>
        </>
        );
      })()}

      {/* Comparativo por año — no depende del mes elegido arriba */}
      {comparativoAnual.length > 0 && (
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
            Comparativo por año
          </div>
          <SatqComparativoAnualTabla filas={comparativoAnual} />
          <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
            2024 solo tiene datos de RPP (trámites) — el histórico de ingresos/subsidios de SATQ para ese año aún no
            está cargado. Cuando se cargue, este comparativo lo va a reflejar solo. Los años en curso son parciales
            (ver el rango de fechas real bajo cada columna), no comparables directamente contra un año completo.
          </p>
        </div>
      )}

      <ModalDetalleSatq
        filtro={modalDetalle}
        desde={desde}
        hasta={hasta}
        onClose={() => setModalDetalle(null)}
      />
    </div>
  );
};

// ── SatqConceptosDonut (SVG puro, genérico) ────────────────────

const SatqConceptosDonut: React.FC<{ conceptos: ConceptoResumenSatq[] }> = ({ conceptos }) => {
  const SIZE = 150; const RADIUS = 56; const CX = SIZE / 2; const CY = SIZE / 2; const STROKE = 26;
  const total = conceptos.reduce((acc, c) => acc + c.monto, 0);

  if (total <= 0 || conceptos.length === 0) return <EmptyState text="Sin datos en el período" />;

  let cumAngle = -90;
  const segments = conceptos.map((c, i) => {
    const pct   = c.monto / total;
    const angle = pct * 360;
    const color = CONCEPTO_COLORS[i % CONCEPTO_COLORS.length];
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad   = ((cumAngle + angle) * Math.PI) / 180;
    const x1 = CX + RADIUS * Math.cos(startRad);
    const y1 = CY + RADIUS * Math.sin(startRad);
    const x2 = CX + RADIUS * Math.cos(endRad);
    const y2 = CY + RADIUS * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    const path = `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
    cumAngle += angle;
    return { path, color, label: c.concepto, monto: c.monto, cantidad: c.cantidad };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={theme.colors.border} strokeWidth={STROKE} />
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill="none" stroke={s.color} strokeWidth={STROKE} strokeLinecap="butt" />
        ))}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={theme.colors.primary}>
          {MONEDA.format(total)}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="9" fill={theme.colors.textSecondary}>
          bruto
          <title>Total cobrado en el periodo, antes de descontar subsidios</title>
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' }}>
        {segments.map((s, i) => {
          const pct = total > 0 ? Math.round((s.monto / total) * 100) : 0;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.label}>
                {s.label}
              </span>
              <span style={{ color: theme.colors.textSecondary, flexShrink: 0 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── SatqDelegacionesBar (barras horizontales, sin comparativo interanual) ──

const SatqDelegacionesBar: React.FC<{ delegaciones: DelegacionResumenSatq[]; onClickDelegacion: (delegacion: string) => void }> = ({ delegaciones, onClickDelegacion }) => {
  if (delegaciones.length === 0) return <EmptyState text="Sin datos en el período" />;
  const max = Math.max(...delegaciones.map((d) => d.monto), 1);

  return (
    <div>
      {delegaciones.map((d, i) => {
        const pct = max > 0 ? Math.round((d.monto / max) * 100) : 0;
        const sinDelegacion = d.delegacion === 'Sin delegación (no en RPP)';
        const color = sinDelegacion ? theme.colors.grayMid : CONCEPTO_COLORS[i % CONCEPTO_COLORS.length];
        return (
          <div key={d.delegacion} onClick={() => onClickDelegacion(d.delegacion)} style={{ marginBottom: '12px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.78rem', color: sinDelegacion ? theme.colors.textSecondary : theme.colors.textPrimary, fontStyle: sinDelegacion ? 'italic' : 'normal' }}>
                {d.delegacion}
              </span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {MONEDA.format(d.monto)} <span style={{ color: theme.colors.textSecondary }}>({d.cantidad.toLocaleString('es-MX')})</span>
              </span>
            </div>
            <div style={{ height: '9px', borderRadius: '5px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '5px' }} />
            </div>
          </div>
        );
      })}
      <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
        La delegación viene del cruce con RPP, no de SATQ — por eso "Sin delegación" agrupa lo que aún no está en RPP.
      </p>
    </div>
  );
};

// ── SatqMunicipiosBar (barras horizontales) ─────────────────────

const SatqMunicipiosBar: React.FC<{ municipios: MunicipioResumenSatq[] }> = ({ municipios }) => {
  if (municipios.length === 0) return <EmptyState text="Sin datos en el período" />;
  // Mismo eje para la barra actual y la del año anterior, para que se puedan comparar a simple vista.
  const max = Math.max(...municipios.map((m) => m.monto), ...municipios.map((m) => m.monto_anio_anterior ?? 0), 1);

  return (
    <div>
      {municipios.map((m, i) => {
        const pct    = max > 0 ? Math.round((m.monto / max) * 100) : 0;
        const pctAnt = m.monto_anio_anterior !== null && max > 0 ? Math.round((m.monto_anio_anterior / max) * 100) : null;
        const esOtros = m.municipio.startsWith('Otros municipios');
        const color  = esOtros ? theme.colors.grayMid : CONCEPTO_COLORS[i % CONCEPTO_COLORS.length];
        const v = varianzaTexto(m.pct_variacion_anio_anterior);
        return (
          <div key={m.municipio} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.78rem', color: esOtros ? theme.colors.textSecondary : theme.colors.textPrimary, fontStyle: esOtros ? 'italic' : 'normal' }}>{m.municipio}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {MONEDA.format(m.monto)} <span style={{ color: v.color, fontWeight: 700 }}>{v.texto}</span>
              </span>
            </div>
            <div style={{ height: '9px', borderRadius: '5px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '5px' }} />
            </div>
            {pctAnt !== null && (
              <>
                <div style={{ height: '6px', borderRadius: '4px', backgroundColor: '#F1F0EE', overflow: 'hidden', marginTop: '3px' }}>
                  <div style={{ width: `${pctAnt}%`, height: '100%', backgroundColor: color, opacity: 0.35, borderRadius: '4px' }} />
                </div>
                <div style={{ fontSize: '0.65rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
                  Año anterior: {MONEDA.format(m.monto_anio_anterior as number)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── SatqDesgloseTabla (bruto / subsidio / neto por categoría) ──

const SatqDesgloseTabla: React.FC<{ filas: DesgloseCategoriaSatq[]; onClickCategoria?: (categoria: string) => void }> = ({ filas, onClickCategoria }) => {
  if (filas.length === 0) return <EmptyState text="Sin datos en el período" />;

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
            <th style={th}>{onClickCategoria ? 'Categoría (clic para detalle)' : 'Categoría'}</th>
            <th style={{ ...th, textAlign: 'right' }} title="Total cobrado antes de descontar subsidios">Total cobrado</th>
            <th style={{ ...th, textAlign: 'right' }}>Trámites RPP<br />(cargo)</th>
            <th style={{ ...th, textAlign: 'right' }} title="Parte del total cobrado que se condona — no se recibe en caja">Subsidio</th>
            <th style={{ ...th, textAlign: 'right' }}>Trámites RPP<br />(subsidio)</th>
            <th style={{ ...th, textAlign: 'right' }} title="Total cobrado menos subsidio — lo que realmente se recauda">Neto (lo recaudado)</th>
            <th style={{ ...th, textAlign: 'right' }}>% subsidiado</th>
            <th style={{ ...th, textAlign: 'right' }}>vs. año anterior</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const v = varianzaTexto(f.pct_variacion_anio_anterior);
            return (
            <tr
              key={f.categoria}
              onClick={onClickCategoria ? () => onClickCategoria(f.categoria) : undefined}
              style={onClickCategoria ? { cursor: 'pointer' } : undefined}
              onMouseEnter={onClickCategoria ? (e) => { e.currentTarget.style.backgroundColor = theme.colors.background; } : undefined}
              onMouseLeave={onClickCategoria ? (e) => { e.currentTarget.style.backgroundColor = 'transparent'; } : undefined}
            >
              <td style={{ ...td, color: onClickCategoria ? theme.colors.primary : theme.colors.textPrimary, fontWeight: onClickCategoria ? 700 : 400 }}>
                {f.categoria}{onClickCategoria && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>🔍</span>}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>{MONEDA.format(f.cargo_bruto)}</td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>{f.tramites_rpp_cargo.toLocaleString('es-MX')}</td>
              <td style={{ ...td, textAlign: 'right', color: f.subsidio < 0 ? theme.colors.gold : undefined }}>
                {f.subsidio !== 0 ? MONEDA.format(f.subsidio) : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', color: theme.colors.textSecondary }}>{f.tramites_rpp_subsidio.toLocaleString('es-MX')}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{MONEDA.format(f.neto)}</td>
              <td style={{
                ...td, textAlign: 'right',
                color: f.pct_subsidiado >= 90 ? theme.colors.alert.red : f.pct_subsidiado >= 50 ? theme.colors.gold : theme.colors.textSecondary,
                fontWeight: f.pct_subsidiado >= 50 ? 700 : 400,
              }}>
                {f.pct_subsidiado}%
              </td>
              <td style={{ ...td, textAlign: 'right', color: v.color, fontWeight: 700 }}>
                {v.texto}
                {f.neto_anio_anterior !== null && (
                  <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, fontWeight: 400 }}>{MONEDA.format(f.neto_anio_anterior)}</div>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── SatqComparativoAnualTabla ───────────────────────────────────

const SatqComparativoAnualTabla: React.FC<{ filas: ComparativoAnualSatq[] }> = ({ filas }) => {
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: `1px solid ${theme.colors.border}`,
  };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: '0.8rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}`, verticalAlign: 'top' };
  const rango = (r: { desde: string; hasta: string } | null) =>
    r ? <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginTop: '2px' }}>{r.desde} a {r.hasta}</div> : null;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Año</th>
            <th style={{ ...th, textAlign: 'right' }} title="Total cobrado antes de descontar subsidios">Cargo bruto (SATQ)</th>
            <th style={{ ...th, textAlign: 'right' }} title="Parte del cargo bruto que se condona — no se recibe en caja">Subsidio (SATQ)</th>
            <th style={{ ...th, textAlign: 'right' }} title="Cargo bruto menos subsidio — lo que realmente se recauda">Ingreso neto</th>
            <th style={{ ...th, textAlign: 'right' }}>Trámites RPP</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.anio}>
              <td style={{ ...td, fontWeight: 800, fontSize: '0.9rem' }}>{f.anio}</td>
              {f.tiene_datos_satq ? (
                <>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {MONEDA.format(f.cargo_bruto ?? 0)}
                    {rango(f.rango_satq)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: theme.colors.gold }}>
                    {MONEDA.format(f.subsidio ?? 0)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                    {MONEDA.format(f.ingreso_neto ?? 0)}
                  </td>
                </>
              ) : (
                <td colSpan={3} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                  Sin datos de SATQ cargados para este año
                </td>
              )}
              <td style={{ ...td, textAlign: 'right' }}>
                {f.tramites_rpp.toLocaleString('es-MX')}
                {rango(f.rango_rpp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── ModalDetalleProgramaSatq — detalle fila por fila al hacer clic en una categoría ──

const DETALLE_MODAL_LIMIT = 20;
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

const DETALLE_EXPORT_LIMIT = 10000;

const ModalDetalleSatq: React.FC<{
  filtro: FiltroModalDetalle | null;
  desde:  string;
  hasta:  string;
  onClose: () => void;
}> = ({ filtro, desde, hasta, onClose }) => {
  const [filas, setFilas]     = useState<SatqDetalleFila[]>([]);
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
    getSatqDetalle({
      desde, hasta, page, limit: DETALLE_MODAL_LIMIT,
      programa: filtro.programa,
      subsidio: filtro.subsidio !== undefined ? String(filtro.subsidio) as 'true' | 'false' : undefined,
      conciliado: filtro.conciliado !== undefined ? String(filtro.conciliado) as 'true' | 'false' : undefined,
      estatus_conciliacion: filtro.estatus_conciliacion,
      delegacion: filtro.delegacion,
    })
      .then((r) => { if (!cancelado) { setFilas(r.data); setTotal(r.meta.total); } })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtro, desde, hasta, page]);

  const exportarExcel = async () => {
    if (!filtro) return;
    setExporting(true);
    setError(null);
    try {
      const res = await getSatqDetalle({
        desde, hasta, page: 1, limit: DETALLE_EXPORT_LIMIT,
        programa: filtro.programa,
        subsidio: filtro.subsidio !== undefined ? String(filtro.subsidio) as 'true' | 'false' : undefined,
        conciliado: filtro.conciliado !== undefined ? String(filtro.conciliado) as 'true' | 'false' : undefined,
        estatus_conciliacion: filtro.estatus_conciliacion,
        delegacion: filtro.delegacion,
      });

      const ExcelJS = (await import('exceljs')).default;
      const GUINDA = 'FFAB0A3D';
      const GRIS   = 'FF7A7570';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Detalle', { views: [{ showGridLines: false }] });
      ws.columns = [
        { width: 12 }, { width: 20 }, { width: 18 }, { width: 45 }, { width: 20 }, { width: 26 }, { width: 14 }, { width: 22 }, { width: 18 },
      ];

      const headers = ['Fecha', 'Referencia', 'Municipio', 'Concepto', 'Programa', 'Tipo de Acto', 'Importe', 'Estatus en RPP', 'Delegación'];

      ws.mergeCells(1, 1, 1, headers.length);
      const tCell = ws.getCell(1, 1);
      tCell.value = `DETALLE: ${filtro.titulo}`.toUpperCase();
      tCell.font  = { bold: true, size: 16, color: { argb: GUINDA } };

      const subCell = ws.getCell(2, 1);
      subCell.value = `Periodo: ${desde} a ${hasta}  ·  Generado: ${new Date().toLocaleString('es-MX')}  ·  ${res.data.length} de ${res.meta.total} registro(s)`;
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
          FECHA_CORTA.format(new Date(f.fecha_contable)),
          f.referencia, f.municipio, f.concepto, f.programa, f.tipo_acto,
          Number(f.importe), f.estatus_conciliacion, f.delegacion ?? '—',
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
      a.download = `detalle_satq_${(filtro.titulo || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${desde}_${hasta}.xlsx`;
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
          Periodo {desde} a {hasta} · {total.toLocaleString('es-MX')} registro(s)
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
                  <th style={th}>Fecha</th>
                  <th style={th}>Referencia</th>
                  <th style={th}>Municipio</th>
                  <th style={th}>Concepto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Importe</th>
                  <th style={th}>Estatus en RPP</th>
                  <th style={th}>Delegación</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
                ) : filas.map((f) => {
                  const estatusColor = f.estatus_conciliacion === 'Conciliado'
                    ? { bg: '#D1FAE5', fg: '#065F46' }
                    : f.estatus_conciliacion === 'En trámite en RPP'
                    ? { bg: '#FEF3C7', fg: '#92400E' }
                    : f.estatus_conciliacion === 'Cancelado en RPP'
                    ? { bg: '#E5E7EB', fg: '#374151' }
                    : { bg: '#FEE2E2', fg: '#991B1B' };
                  return (
                  <tr key={f.id}>
                    <td style={td}>{FECHA_CORTA.format(new Date(f.fecha_contable))}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{f.referencia}</td>
                    <td style={td}>{f.municipio}</td>
                    <td style={{ ...td, maxWidth: '260px' }} title={f.concepto}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.concepto}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: Number(f.importe) < 0 ? theme.colors.alert.red : theme.colors.textPrimary }}>
                      {MONEDA.format(Number(f.importe))}
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: '9px', fontSize: '0.68rem', fontWeight: 700,
                        backgroundColor: estatusColor.bg, color: estatusColor.fg,
                      }}>
                        {f.estatus_conciliacion}
                      </span>
                    </td>
                    <td style={td}>{f.delegacion ?? '—'}</td>
                  </tr>
                  );
                })}
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
