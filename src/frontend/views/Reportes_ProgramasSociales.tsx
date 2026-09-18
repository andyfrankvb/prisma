/**
 * View: Reportes_ProgramasSociales ("Programas Sociales")
 * File: src/frontend/views/Reportes_ProgramasSociales.tsx
 *
 * Cruza dos universos que antes vivían separados: el dinero de SATQ (de qué
 * programa es cada peso, conciliado o no con RPP) y la productividad de RPP
 * (en qué delegación, cuándo entró, cuándo se firmó, cuánto rezago tiene ese
 * mismo trámite) — ver src/modules/programas-sociales/programas-sociales.controller.ts
 * para la fuente y el puente `programa_nci` que los conecta.
 *
 * Mismas reglas de fecha que Productividad por Delegación (ingresados por
 * fecha de ingreso, terminados por fecha de firma, pendiente es la foto de
 * ahora), más una tercera para el dinero: "recaudado" filtra por
 * `fecha_contable` (fecha del banco), independiente de cuándo entró o se
 * firmó el trámite. El filtro Certificación/Inscripción solo aplica al lado
 * RPP — el catálogo de conceptos de SATQ no clasifica por esa categoría.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import { Modal } from '../components/Modal';
import { EncabezadoImpresion } from '../components/EncabezadoImpresion';
import { BotonImprimirReporte } from '../components/BotonImprimirReporte';
import { SelectorPeriodo } from '../components/SelectorPeriodo';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  getProgramasSocialesCatalogo, getProgramasSocialesResumen, getProgramasSocialesBandeja,
  getProgramasSocialesTerminados, getProgramasSocialesDinero, getProgramasSocialesRezago,
  getProgramasSocialesDetalle, getProductividadDelegaciones,
} from '../api';
import type {
  ProgramaCatalogoFila, ResumenProgramasSociales, BandejaProgramaResumen, TerminadosProgramaResumen,
  DineroProgramaResumen, RezagoProgramaResumen, ProductividadMensualFila, DistribucionFila,
  SerieMensualMontoFila, DistribucionMontoFila, ProgramasDetalleFila,
} from '../types';

const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
const NUM  = new Intl.NumberFormat('es-MX');
const MXN  = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const ETIQUETA_ANTIGUEDAD: Record<string, string> = { '0-3': '0-3 meses', '3-6': '3-6 meses', '6-12': '6-12 meses', 'mas-1-anio': 'más de 1 año' };
const ETIQUETA_REZAGO: Record<string, string> = { mismo_mes: 'del mismo mes (flujo normal)', rezago: 'de rezago (entraron antes)' };
const ETIQUETA_CATEGORIA: Record<string, string> = { certificacion: 'certificaciones', inscripcion: 'inscripciones' };
const ETIQUETA_CONCILIACION: Record<string, string> = {
  'Conciliado': 'Conciliado', 'En trámite en RPP': 'En trámite en RPP', 'Cancelado en RPP': 'Cancelado en RPP', 'No ha ingresado a RPP': 'No ha ingresado a RPP',
};
const COLOR_CONCILIACION: Record<string, string> = {
  'Conciliado': theme.colors.alert.green, 'En trámite en RPP': theme.colors.grayMid,
  'Cancelado en RPP': theme.colors.alert.red, 'No ha ingresado a RPP': theme.colors.gold,
};

interface FiltroModalPrograma {
  titulo:      string;
  fuente:      'ingresos' | 'bandeja' | 'terminados' | 'dinero';
  programa?:   string;
  delegacion?: string;
  categoria?:  'certificacion' | 'inscripcion';
  antiguedad?: '0-3' | '3-6' | '6-12' | 'mas-1-anio';
  rezagoTipo?: 'mismo_mes' | 'rezago';
  estatusConciliacion?: string;
}

function bucketPorAnio(porMes: ProductividadMensualFila[]): DistribucionFila[] {
  const acc: Record<string, number> = {};
  porMes.forEach(({ anio, cantidad }) => {
    const clave = anio < 2022 ? 'Antes de 2022' : String(anio);
    acc[clave] = (acc[clave] ?? 0) + cantidad;
  });
  const anios = Object.keys(acc).filter((k) => k !== 'Antes de 2022').sort((a, b) => Number(b) - Number(a));
  const filas = anios.map((a) => ({ etiqueta: a, cantidad: acc[a] }));
  if (acc['Antes de 2022']) filas.push({ etiqueta: 'Antes de 2022', cantidad: acc['Antes de 2022'] });
  return filas;
}
function porMesFilas(porMes: ProductividadMensualFila[]): DistribucionFila[] {
  return porMes.map(({ anio, mes, cantidad }) => ({ etiqueta: `${MES_ABREV[mes - 1]}. ${anio}`, cantidad }));
}
function porMesMontoFilas(porMes: SerieMensualMontoFila[]): { etiqueta: string; monto: number }[] {
  return porMes.map(({ anio, mes, monto }) => ({ etiqueta: `${MES_ABREV[mes - 1]}. ${anio}`, monto }));
}

export const Reportes_ProgramasSociales: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [catalogo, setCatalogo]         = useState<ProgramaCatalogoFila[]>([]);
  const [programaFiltro, setProgramaFiltro] = useState('');
  const [delegacionFiltro, setDelegacionFiltro] = useState('');
  const [delegaciones, setDelegaciones] = useState<string[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<'' | 'certificacion' | 'inscripcion'>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const periodoActivo = !!(desde && hasta);

  const [resumen, setResumen]       = useState<ResumenProgramasSociales | null>(null);
  const [bandeja, setBandeja]       = useState<BandejaProgramaResumen | null>(null);
  const [terminados, setTerminados] = useState<TerminadosProgramaResumen | null>(null);
  const [dinero, setDinero]         = useState<DineroProgramaResumen | null>(null);
  const [rezago, setRezago]         = useState<RezagoProgramaResumen | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [modalDetalle, setModalDetalle] = useState<FiltroModalPrograma | null>(null);

  useEffect(() => {
    getProgramasSocialesCatalogo().then((r) => setCatalogo(r.data)).catch(() => {});
    getProductividadDelegaciones().then((r) => setDelegaciones(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    const params = {
      programa: programaFiltro || undefined, delegacion: delegacionFiltro || undefined,
      desde: desde || undefined, hasta: hasta || undefined, categoria: categoriaFiltro || undefined,
    };
    Promise.all([
      getProgramasSocialesResumen(params),
      getProgramasSocialesBandeja(params),
      getProgramasSocialesTerminados(params),
      getProgramasSocialesDinero(params),
      getProgramasSocialesRezago(params),
    ])
      .then(([r, b, t, d, rz]) => {
        if (cancelado) return;
        setResumen(r); setBandeja(b); setTerminados(t); setDinero(d); setRezago(rz);
      })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [programaFiltro, delegacionFiltro, categoriaFiltro, desde, hasta]);

  const limpiarFiltros = () => { setProgramaFiltro(''); setDelegacionFiltro(''); setCategoriaFiltro(''); setDesde(''); setHasta(''); };
  const hayFiltros = !!(programaFiltro || delegacionFiltro || categoriaFiltro || desde || hasta);

  const filas = resumen?.data ?? [];
  const totalIngresados = filas.reduce((s, d) => s + d.ingresados, 0);
  const totalTerminados = filas.reduce((s, d) => s + d.terminados, 0);
  const totalFirmadas   = filas.reduce((s, d) => s + d.firmadas, 0);
  const totalRechazadas = filas.reduce((s, d) => s + d.rechazadas, 0);
  const totalPendiente  = filas.reduce((s, d) => s + d.pendiente_total, 0);
  const pctFirmadas = totalTerminados > 0 ? Math.round((totalFirmadas / totalTerminados) * 1000) / 10 : 0;

  const filtrosImpresion = [
    programaFiltro ? `Programa: ${programaFiltro}` : 'Todos los programas',
    delegacionFiltro ? `Delegación: ${delegacionFiltro}` : 'Todas las delegaciones',
    categoriaFiltro === 'certificacion' ? 'Solo certificaciones' : categoriaFiltro === 'inscripcion' ? 'Solo inscripciones' : 'Certificaciones + inscripciones',
    periodoActivo ? `Periodo: ${desde} a ${hasta}` : 'Sin filtro de periodo (histórico completo)',
  ].join(' · ');

  const abrirModal = (f: FiltroModalPrograma) => setModalDetalle({ ...f, programa: f.programa ?? (programaFiltro || undefined), delegacion: f.delegacion ?? (delegacionFiltro || undefined) });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background }}>
      <div className="no-imprimir" style={{
        position: 'sticky', top: 0, zIndex: 10, backgroundColor: theme.colors.surface, borderBottom: `1px solid ${theme.colors.border}`,
        padding: isMobile ? '14px 12px' : '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
      }}>
        <div>
          <button onClick={() => navigate('/dashboard/reportes')} style={{ background: 'none', border: 'none', color: theme.colors.textSecondary, fontSize: '0.78rem', cursor: 'pointer', padding: 0, marginBottom: '4px' }}>
            ← Módulo de Reportes
          </button>
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Programas Sociales</h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            INFONAVIT/FOVISSSTE, INSUS, AGEPROO, SEDETUS y el resto — dinero y productividad en un solo lugar
          </p>
        </div>
        <BotonImprimirReporte />
      </div>

      <div className="reporte-imprimible" style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <EncabezadoImpresion titulo="Programas Sociales" subtitulo="Dinero (SATQ) y productividad (RPP) por programa" filtros={filtrosImpresion} />

        {/* ── Filtros ── */}
        <div className="no-imprimir" style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '6px' }}>Programa</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Chip label="Todos" active={!programaFiltro} onClick={() => setProgramaFiltro('')} />
              {catalogo.map((p) => (
                <Chip key={p.programa} label={p.programa} sub={NUM.format(p.tramites)} active={programaFiltro === p.programa} onClick={() => setProgramaFiltro(p.programa)} />
              ))}
              {catalogo.length === 0 && <span style={{ fontSize: '0.76rem', color: theme.colors.textSecondary }}>Cargando programas…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'end' }}>
            <div style={{ minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>Delegación</label>
              <select value={delegacionFiltro} onChange={(e) => setDelegacionFiltro(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family, width: '100%' }}>
                <option value="">Todas</option>
                {delegaciones.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>Certificación / Inscripción</label>
              <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value as any)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family, width: '100%' }}>
                <option value="">Todas</option>
                <option value="certificacion">Solo certificaciones</option>
                <option value="inscripcion">Solo inscripciones</option>
              </select>
            </div>
          </div>
          {categoriaFiltro && (
            <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary }}>
              El filtro de certificación/inscripción solo acota el lado de productividad (RPP) — el catálogo de conceptos de SATQ no clasifica el dinero por esa categoría, así que "Recaudado" y "Conciliación" siempre muestran el programa completo.
            </p>
          )}
          <div style={{ paddingTop: '10px', borderTop: `1px solid ${theme.colors.border}` }}>
            <SelectorPeriodo desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} onLimpiar={limpiarFiltros} mostrarLimpiar={hayFiltros} />
          </div>
        </div>
        <p style={{ margin: '-12px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
          "Ingresados" filtra por fecha de ingreso, "Terminados" por fecha de firma, "Recaudado" por fecha contable (del banco) — las tres pueden no coincidir para un mismo trámite. "Pendiente" es la foto de ahora mismo.
        </p>

        {error && <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>Error: {error}</div>}
        {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}

        {!loading && !error && resumen && (
          <>
            {/* ── KPIs productividad ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <KpiCard label="Ingresados" value={NUM.format(totalIngresados)} icon="subir" color={theme.colors.primary}
                onClick={() => abrirModal({ titulo: 'Ingresados', fuente: 'ingresos' })} />
              <KpiCard label="Terminados" value={NUM.format(totalTerminados)} icon="check" color={theme.colors.alert.green}
                sub={`${pctFirmadas}% firmadas · ${NUM.format(totalFirmadas)} firmadas / ${NUM.format(totalRechazadas)} rechazadas`}
                onClick={() => abrirModal({ titulo: 'Terminados', fuente: 'terminados' })} />
              <KpiCard label="Pendientes ahora" value={NUM.format(totalPendiente)} icon="reloj" color={theme.colors.gold}
                sub="foto actual — no cambia con el filtro de periodo"
                onClick={() => abrirModal({ titulo: 'Pendientes ahora', fuente: 'bandeja' })} />
              <KpiCard label="Días de atención (promedio)" value={terminados?.dias_atencion_promedio != null ? `${terminados.dias_atencion_promedio} días` : '—'} icon="historial" color={theme.colors.charcoal}
                onClick={() => abrirModal({ titulo: 'Terminados (días de atención)', fuente: 'terminados' })} />
            </div>

            {/* ── KPIs dinero ── */}
            {dinero && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <KpiCard label="Recaudado" value={MXN.format(dinero.recaudado)} icon="grafica" color={theme.colors.primaryDark}
                  sub="neto — fecha contable, no fecha de ingreso/firma"
                  onClick={() => abrirModal({ titulo: 'Recaudado', fuente: 'dinero' })} />
                <KpiCard label="Subsidio" value={MXN.format(dinero.subsidio)} icon="etiqueta" color={theme.colors.gold}
                  sub="lo que absorbe el programa, no el usuario"
                  onClick={() => abrirModal({ titulo: 'Subsidio', fuente: 'dinero' })} />
                <KpiCard label="% Conciliado con RPP" value={`${dinero.pct_conciliado}%`} icon="check" color={dinero.pct_conciliado < 50 ? theme.colors.alert.red : theme.colors.alert.green}
                  sub={`${NUM.format(dinero.total_lineas)} líneas de captura`}
                  onClick={() => abrirModal({ titulo: 'Conciliado con RPP', fuente: 'dinero', estatusConciliacion: 'Conciliado' })} />
              </div>
            )}

            {/* ── Avance por programa ── */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>Terminados vs. ingresados, por programa</div>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '18px 20px' }}>
                <AvanceBar filas={filas} />
              </div>
            </div>

            {/* ── Tabla detalle por programa ── */}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>Detalle por programa</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: theme.colors.background }}>
                      <th style={thStyle}>Programa</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Ingresados</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Terminados</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Rechazadas</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Días atención</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Pendientes</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Recaudado</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>% Conciliado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((d) => (
                      <tr key={d.programa} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{d.programa}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Ingresados — ${d.programa}`, fuente: 'ingresos', programa: d.programa })}>
                          {NUM.format(d.ingresados)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: theme.colors.alert.green, fontWeight: 700, cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Terminados — ${d.programa}`, fuente: 'terminados', programa: d.programa })}>
                          {NUM.format(d.terminados)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{NUM.format(d.rechazadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{d.dias_atencion_promedio ?? '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Pendientes ahora — ${d.programa}`, fuente: 'bandeja', programa: d.programa })}>
                          {NUM.format(d.pendiente_total)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Recaudado — ${d.programa}`, fuente: 'dinero', programa: d.programa })}>
                          {MXN.format(d.recaudado)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: d.pct_conciliado < 50 ? theme.colors.alert.red : theme.colors.textPrimary }}>{d.pct_conciliado}%</td>
                      </tr>
                    ))}
                  </tbody>
                  {filas.length > 1 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${theme.colors.border}`, backgroundColor: theme.colors.background }}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalIngresados)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: theme.colors.alert.green }}>{NUM.format(totalTerminados)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalRechazadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>—</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalPendiente)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{MXN.format(dinero?.recaudado ?? 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{dinero?.pct_conciliado ?? 0}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── Dinero: conciliación + serie mensual ── */}
            {dinero && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>Conciliación del dinero con RPP{programaFiltro ? ` — ${programaFiltro}` : ''}</span>
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{NUM.format(dinero.total_lineas)} líneas de captura{periodoActivo ? ' en el periodo filtrado (por fecha contable)' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 1fr) minmax(320px, 1.1fr)', gap: '16px' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '12px' }}>Por estatus — clic para ver el detalle</div>
                    <DistribucionBarClicable
                      filas={dinero.por_estatus_conciliacion.map((f) => ({
                        etiqueta: `${ETIQUETA_CONCILIACION[f.etiqueta] ?? f.etiqueta} — ${MXN.format(f.monto)}`,
                        cantidad: f.cantidad,
                        onClick: () => abrirModal({ titulo: `Dinero — ${f.etiqueta}`, fuente: 'dinero', estatusConciliacion: f.etiqueta }),
                      }))}
                      color={theme.colors.primary}
                    />
                  </div>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '12px' }}>Recaudación por mes (fecha contable)</div>
                    <DistribucionBarMonto filas={porMesMontoFilas(dinero.por_mes)} color={theme.colors.gold} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Bandeja pendiente detallada ── */}
            {bandeja && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>Bandeja pendiente detallada{programaFiltro ? ` — ${programaFiltro}` : ''}</span>
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{NUM.format(bandeja.total)} trámites activos ahora{periodoActivo ? ' — el desglose de abajo sí muestra solo el periodo filtrado' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  <PanelDistribucion titulo={periodoActivo ? 'Ingreso por mes (periodo filtrado)' : 'Antigüedad del rezago (año de ingreso)'} filas={periodoActivo ? porMesFilas(bandeja.por_mes) : bucketPorAnio(bandeja.por_mes)} color={theme.colors.primary} />
                  <PanelDistribucion titulo="Etapa actual" filas={bandeja.por_etapa} color={theme.colors.alert.green} />
                  <PanelDistribucion titulo="Tipo de acto" filas={bandeja.por_tipo.slice(0, 8)} color={theme.colors.gold} />
                  <PanelDistribucion titulo="Origen" filas={bandeja.por_origen} color={theme.colors.charcoal} />
                </div>
              </div>
            )}

            {/* ── Rezago ── */}
            {rezago && (() => {
              const masDeUnAnio = rezago.antiguedad.find((b) => b.bucket === 'Más de 1 año');
              const totalAntiguedad = rezago.antiguedad.reduce((s, b) => s + b.total, 0);
              const pctMasDeUnAnio = totalAntiguedad > 0 && masDeUnAnio ? Math.round((masDeUnAnio.total / totalAntiguedad) * 1000) / 10 : 0;
              const abrirModalAntiguedad = (clave: '0-3' | '3-6' | '6-12' | 'mas-1-anio') => abrirModal({ titulo: `Pendientes — ${ETIQUETA_ANTIGUEDAD[clave]}`, fuente: 'bandeja', antiguedad: clave });
              const abrirModalAvance = (rezagoTipo: 'mismo_mes' | 'rezago', categoria?: 'certificacion' | 'inscripcion') => abrirModal({
                titulo: `Terminados — ${ETIQUETA_REZAGO[rezagoTipo]}${categoria ? ` · ${ETIQUETA_CATEGORIA[categoria]}` : ''}`, fuente: 'terminados', rezagoTipo, categoria,
              });
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>Rezago{programaFiltro ? ` — ${programaFiltro}` : ''}</span>
                  </div>

                  {masDeUnAnio && masDeUnAnio.total > 0 && (
                    <div onClick={() => abrirModalAntiguedad('mas-1-anio')} style={{
                      backgroundColor: '#FEE2E2', border: `1px solid ${theme.colors.alert.red}`, borderRadius: '12px',
                      padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: '1.6rem' }}>⚠️</span>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991B1B' }}>{NUM.format(masDeUnAnio.total)} trámites con más de 1 año pendientes <span style={{ fontSize: '0.9rem' }}>🔍</span></div>
                        <div style={{ fontSize: '0.76rem', color: '#991B1B' }}>{pctMasDeUnAnio}% de todo lo pendiente · {NUM.format(masDeUnAnio.certificacion)} certificaciones + {NUM.format(masDeUnAnio.inscripcion)} inscripciones — el rezago más crítico</div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 1.1fr) minmax(300px, 1fr)', gap: '16px' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '4px' }}>Antigüedad de lo pendiente ahora</div>
                      <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginBottom: '12px' }}>Desde que entró cada trámite hasta hoy — clic en cualquier renglón para ver el detalle</div>
                      <PieChart
                        centerLabel={`${NUM.format(totalAntiguedad)}\npendientes`}
                        filas={[
                          { etiqueta: '0-3 meses',    cantidad: rezago.antiguedad.find((b) => b.bucket === '0-3 meses')?.total ?? 0,    color: theme.colors.alert.green, onClick: () => abrirModalAntiguedad('0-3') },
                          { etiqueta: '3-6 meses',    cantidad: rezago.antiguedad.find((b) => b.bucket === '3-6 meses')?.total ?? 0,    color: theme.colors.gold,        onClick: () => abrirModalAntiguedad('3-6') },
                          { etiqueta: '6-12 meses',   cantidad: rezago.antiguedad.find((b) => b.bucket === '6-12 meses')?.total ?? 0,   color: theme.colors.charcoal,    onClick: () => abrirModalAntiguedad('6-12') },
                          { etiqueta: 'Más de 1 año', cantidad: masDeUnAnio?.total ?? 0,                                                color: theme.colors.alert.red,   onClick: () => abrirModalAntiguedad('mas-1-anio') },
                        ]}
                      />
                      <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${theme.colors.border}` }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Certificación vs. inscripción, por antigüedad</div>
                        <AntiguedadRezagoBar filas={rezago.antiguedad} onClickBucket={abrirModalAntiguedad} />
                        <div style={{ display: 'flex', gap: '14px', marginTop: '12px', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', backgroundColor: theme.colors.primary, borderRadius: '2px', marginRight: '4px' }} />Certificación</span>
                          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', backgroundColor: theme.colors.gold, borderRadius: '2px', marginRight: '4px' }} />Inscripción</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '4px' }}>Avance de rezago{periodoActivo ? ' (periodo filtrado)' : ''}</div>
                      <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginBottom: '14px' }}>De lo terminado, cuánto entró el mismo mes (flujo normal) vs. cuánto era de meses anteriores — clic para ver el detalle</div>
                      <PieChart
                        centerLabel={`${NUM.format(rezago.avance.mismo_mes + rezago.avance.de_rezago)}\nterminados`}
                        filas={[
                          { etiqueta: 'Mismo mes (flujo normal)',   cantidad: rezago.avance.mismo_mes, color: theme.colors.alert.green, onClick: () => abrirModalAvance('mismo_mes') },
                          { etiqueta: 'De rezago (venía de antes)', cantidad: rezago.avance.de_rezago, color: theme.colors.primary,     onClick: () => abrirModalAvance('rezago') },
                        ]}
                      />
                      <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${theme.colors.border}` }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Por categoría</div>
                        <DistribucionBarClicable
                          filas={[
                            { etiqueta: 'Mismo mes · Certificación', cantidad: rezago.avance.mismo_mes_certificacion, onClick: () => abrirModalAvance('mismo_mes', 'certificacion') },
                            { etiqueta: 'Mismo mes · Inscripción',   cantidad: rezago.avance.mismo_mes_inscripcion,   onClick: () => abrirModalAvance('mismo_mes', 'inscripcion') },
                            { etiqueta: 'Rezago · Certificación',    cantidad: rezago.avance.de_rezago_certificacion, onClick: () => abrirModalAvance('rezago', 'certificacion') },
                            { etiqueta: 'Rezago · Inscripción',      cantidad: rezago.avance.de_rezago_inscripcion,   onClick: () => abrirModalAvance('rezago', 'inscripcion') },
                          ]}
                          color={theme.colors.charcoal}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Trabajo terminado detallado ── */}
            {terminados && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>Trabajo terminado detallado{programaFiltro ? ` — ${programaFiltro}` : ''}</span>
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{NUM.format(terminados.total)} solicitudes cerradas{periodoActivo ? ' en el periodo filtrado (por fecha de firma)' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  <PanelDistribucion titulo={periodoActivo ? 'Cierre por mes (periodo filtrado)' : 'Cierre por año'} filas={periodoActivo ? porMesFilas(terminados.por_mes) : bucketPorAnio(terminados.por_mes)} color={theme.colors.primary} />
                  <PanelDistribucion titulo="Estatus final" filas={terminados.por_estatus} color={theme.colors.alert.green} />
                  <PanelDistribucion titulo="Origen" filas={terminados.por_origen} color={theme.colors.charcoal} />
                  <PanelDistribucion titulo="Tipo de solicitud" filas={terminados.por_tipo_solicitud} color={theme.colors.gold} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ModalDetallePrograma filtro={modalDetalle} desde={desde} hasta={hasta} categoria={categoriaFiltro} onClose={() => setModalDetalle(null)} />
    </div>
  );
};

// ── Chip: selector de programa ──
const Chip: React.FC<{ label: string; sub?: string; active: boolean; onClick: () => void }> = ({ label, sub, active, onClick }) => (
  <button onClick={onClick} style={{
    padding: '6px 13px', borderRadius: '100px', border: `1.5px solid ${active ? theme.colors.primary : theme.colors.border}`,
    backgroundColor: active ? theme.colors.primary : '#fff', color: active ? '#fff' : theme.colors.textPrimary,
    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: theme.font.family, whiteSpace: 'nowrap',
  }}>
    {label}{sub && <span style={{ opacity: 0.75, marginLeft: '5px', fontWeight: 500 }}>({sub})</span>}
  </button>
);

// ── PanelDistribucion ──
const PanelDistribucion: React.FC<{ titulo: string; filas: DistribucionFila[]; color: string }> = ({ titulo, filas, color }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '12px' }}>{titulo}</div>
    <DistribucionBar filas={filas} color={color} />
  </div>
);

// ── DistribucionBar ──
const DistribucionBar: React.FC<{ filas: DistribucionFila[]; color: string }> = ({ filas, color }) => {
  if (filas.length === 0) return <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin datos con este filtro.</p>;
  const max = Math.max(...filas.map((f) => f.cantidad), 1);
  const total = filas.reduce((a, f) => a + f.cantidad, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {filas.map((f) => {
        const pct = Math.round((f.cantidad / max) * 100);
        const pctTotal = total > 0 ? Math.round((f.cantidad / total) * 1000) / 10 : 0;
        return (
          <div key={f.etiqueta}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.76rem', color: theme.colors.textPrimary }}>{f.etiqueta}</span>
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, flexShrink: 0 }}>{NUM.format(f.cantidad)} <span>({pctTotal}%)</span></span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '4px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── DistribucionBarMonto: igual que DistribucionBar pero con montos en pesos ──
const DistribucionBarMonto: React.FC<{ filas: { etiqueta: string; monto: number }[]; color: string }> = ({ filas, color }) => {
  if (filas.length === 0) return <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin datos con este filtro.</p>;
  const max = Math.max(...filas.map((f) => f.monto), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {filas.map((f) => {
        const pct = Math.round((f.monto / max) * 100);
        return (
          <div key={f.etiqueta}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.76rem', color: theme.colors.textPrimary }}>{f.etiqueta}</span>
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, flexShrink: 0 }}>{MXN.format(f.monto)}</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(pct, f.monto !== 0 ? 1 : 0)}%`, height: '100%', backgroundColor: color, borderRadius: '4px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── DistribucionBarClicable ──
const DistribucionBarClicable: React.FC<{ filas: (DistribucionFila & { onClick: () => void })[]; color: string }> = ({ filas, color }) => {
  if (filas.length === 0) return <p style={{ margin: 0, fontSize: '0.76rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin datos con este filtro.</p>;
  const max = Math.max(...filas.map((f) => f.cantidad), 1);
  const total = filas.reduce((a, f) => a + f.cantidad, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {filas.map((f) => {
        const pct = Math.round((f.cantidad / max) * 100);
        const pctTotal = total > 0 ? Math.round((f.cantidad / total) * 1000) / 10 : 0;
        return (
          <div key={f.etiqueta} onClick={f.onClick} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.76rem', color: theme.colors.textPrimary }}>{f.etiqueta}</span>
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, flexShrink: 0 }}>{NUM.format(f.cantidad)} ({pctTotal}%) <span style={{ fontSize: '0.66rem' }}>🔍</span></span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '4px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── AntiguedadRezagoBar ──
const BUCKET_LABEL_A_CLAVE: Record<string, '0-3' | '3-6' | '6-12' | 'mas-1-anio'> = { '0-3 meses': '0-3', '3-6 meses': '3-6', '6-12 meses': '6-12', 'Más de 1 año': 'mas-1-anio' };
const AntiguedadRezagoBar: React.FC<{ filas: RezagoProgramaResumen['antiguedad']; onClickBucket: (clave: '0-3' | '3-6' | '6-12' | 'mas-1-anio') => void }> = ({ filas, onClickBucket }) => {
  const max = Math.max(...filas.map((f) => f.total), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {filas.map((f) => {
        const esCritico = f.bucket === 'Más de 1 año';
        const anchoTotal = Math.max((f.total / max) * 100, f.total > 0 ? 2 : 0);
        const pctCert = f.total > 0 ? (f.certificacion / f.total) * 100 : 0;
        const pctInsc = f.total > 0 ? (f.inscripcion / f.total) * 100 : 0;
        return (
          <div key={f.bucket} onClick={() => onClickBucket(BUCKET_LABEL_A_CLAVE[f.bucket])} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: esCritico ? theme.colors.alert.red : theme.colors.textPrimary }}>{f.bucket}{esCritico && ' ⚠'}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>{NUM.format(f.total)} <span style={{ fontSize: '0.68rem' }}>🔍</span></span>
            </div>
            <div style={{ width: `${anchoTotal}%`, height: '14px', borderRadius: '7px', backgroundColor: '#E5E7EB', overflow: 'hidden', display: 'flex', border: esCritico ? `1px solid ${theme.colors.alert.red}` : undefined }}>
              <div style={{ width: `${pctCert}%`, backgroundColor: theme.colors.primary }} />
              <div style={{ width: `${pctInsc}%`, backgroundColor: theme.colors.gold }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── PieChart ──
interface PieSlice { etiqueta: string; cantidad: number; color: string; onClick?: () => void }
const PieChart: React.FC<{ filas: PieSlice[]; size?: number; centerLabel?: string }> = ({ filas, size = 140, centerLabel }) => {
  const total = filas.reduce((s, f) => s + f.cantidad, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let acumulado = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={size * 0.24} />
          {filas.map((f) => {
            if (total === 0 || f.cantidad === 0) return null;
            const dash = (f.cantidad / total) * circumference;
            const el = (
              <circle key={f.etiqueta} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={f.color} strokeWidth={size * 0.24}
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-acumulado} onClick={f.onClick} style={{ cursor: f.onClick ? 'pointer' : undefined }} />
            );
            acumulado += dash;
            return el;
          })}
        </svg>
        {centerLabel && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: theme.colors.textPrimary, textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.25, padding: '0 4px' }}>{centerLabel}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '160px' }}>
        {filas.map((f) => {
          const pct = total > 0 ? Math.round((f.cantidad / total) * 1000) / 10 : 0;
          return (
            <div key={f.etiqueta} onClick={f.onClick} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: f.onClick ? 'pointer' : undefined, fontSize: '0.76rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: f.color, flexShrink: 0 }} />
              <span style={{ color: theme.colors.textPrimary }}>{f.etiqueta}</span>
              <span style={{ color: theme.colors.textSecondary, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{NUM.format(f.cantidad)} ({pct}%){f.onClick && <span style={{ fontSize: '0.68rem', marginLeft: '3px' }}>🔍</span>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── KpiCard ──
const KpiCard: React.FC<{ label: string; value: string; icon: any; color: string; sub?: string; onClick?: () => void }> = ({ label, value, icon, color, sub, onClick }) => (
  <div onClick={onClick} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`, cursor: onClick ? 'pointer' : undefined }}>
    <div style={{ marginBottom: '8px' }}><Icono nombre={icon} size={22} color={color} /></div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.15 }}>{value}</div>
    <div style={{ fontSize: '0.76rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>{label}{onClick && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>🔍</span>}</div>
    {sub && <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginTop: '3px', lineHeight: 1.4 }}>{sub}</div>}
  </div>
);

// ── AvanceBar ──
const AvanceBar: React.FC<{ filas: ResumenProgramasSociales['data'] }> = ({ filas }) => {
  if (filas.length === 0) return <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin datos con este filtro.</p>;
  const max = Math.max(...filas.map((f) => Math.max(f.ingresados, f.terminados)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {filas.map((f) => {
        const anchoTotal = Math.max((Math.max(f.ingresados, f.terminados) / max) * 100, 2);
        const anchoTerminado = f.ingresados > 0 ? Math.min((f.terminados / f.ingresados) * 100, 100) : 0;
        const pct = f.ingresados > 0 ? Math.round((f.terminados / f.ingresados) * 1000) / 10 : 0;
        return (
          <div key={f.programa}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textPrimary }}>{f.programa}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>{NUM.format(f.terminados)} terminados de {NUM.format(f.ingresados)} ingresados · {pct}%</span>
            </div>
            <div style={{ width: `${anchoTotal}%`, height: '14px', borderRadius: '7px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${anchoTerminado}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: '7px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── ModalDetallePrograma: la "lupa" — fila por fila, paginado, con exportar a Excel ──
const DETALLE_LIMIT = 20;
const DETALLE_EXPORT_LIMIT = 10000;

const ModalDetallePrograma: React.FC<{ filtro: FiltroModalPrograma | null; desde: string; hasta: string; categoria: '' | 'certificacion' | 'inscripcion'; onClose: () => void }> = ({ filtro, desde, hasta, categoria, onClose }) => {
  const [filas, setFilas]     = useState<ProgramasDetalleFila[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ fetched: number; total: number } | null>(null);

  const categoriaEfectiva = filtro?.categoria ?? (categoria || undefined);
  const esDinero = filtro?.fuente === 'dinero';

  const parametrosBase = (limit: number, page: number) => ({
    fuente: filtro!.fuente,
    programa: filtro!.programa,
    delegacion: filtro!.delegacion,
    desde: (filtro!.fuente === 'bandeja') ? undefined : (desde || undefined),
    hasta: (filtro!.fuente === 'bandeja') ? undefined : (hasta || undefined),
    categoria: esDinero ? undefined : categoriaEfectiva,
    antiguedad: filtro!.antiguedad,
    rezago_tipo: filtro!.rezagoTipo,
    estatus_conciliacion: filtro!.estatusConciliacion,
    page, limit,
  });

  useEffect(() => { setPage(1); }, [filtro]);

  useEffect(() => {
    if (!filtro) return;
    let cancelado = false;
    setLoading(true);
    setError(null);
    getProgramasSocialesDetalle(parametrosBase(DETALLE_LIMIT, page))
      .then((r) => { if (!cancelado) { setFilas(r.data); setTotal(r.meta.total); } })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtro, desde, hasta, categoriaEfectiva, page]);

  const totalPages = Math.ceil(total / DETALLE_LIMIT);
  const th: React.CSSProperties = { textAlign: 'left', padding: '7px 9px', fontSize: '0.68rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${theme.colors.border}`, position: 'sticky', top: 0, backgroundColor: '#fff' };
  const td: React.CSSProperties = { padding: '7px 9px', fontSize: '0.78rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };
  const btnPag: React.CSSProperties = { padding: '6px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: theme.colors.textPrimary };
  const fecha = (v?: string | null) => v ? FECHA_CORTA.format(new Date(v)) : '—';

  const contextoTexto = [
    filtro?.programa && `programa ${filtro.programa}`,
    filtro?.antiguedad && `antigüedad ${ETIQUETA_ANTIGUEDAD[filtro.antiguedad]}`,
    filtro?.rezagoTipo && ETIQUETA_REZAGO[filtro.rezagoTipo],
    !esDinero && categoriaEfectiva && ETIQUETA_CATEGORIA[categoriaEfectiva],
    filtro?.estatusConciliacion && `estatus ${filtro.estatusConciliacion}`,
  ].filter(Boolean).join(' · ');

  const exportarExcel = async () => {
    if (!filtro) return;
    setExporting(true);
    setError(null);
    setExportProgress(null);
    try {
      // El backend acota cada página a DETALLE_EXPORT_LIMIT (10,000) por
      // consulta — se pagina hasta traer todo antes de armar el Excel, en
      // vez de exportar solo la primera página.
      let filasTotales: ProgramasDetalleFila[] = [];
      let totalRegistros = 0;
      let pagina = 1;
      while (true) {
        const pag = await getProgramasSocialesDetalle(parametrosBase(DETALLE_EXPORT_LIMIT, pagina));
        filasTotales = filasTotales.concat(pag.data);
        totalRegistros = pag.meta.total;
        setExportProgress({ fetched: filasTotales.length, total: totalRegistros });
        if (pag.data.length < DETALLE_EXPORT_LIMIT || filasTotales.length >= totalRegistros) break;
        pagina++;
      }
      const res = { data: filasTotales, meta: { total: totalRegistros, page: 1, limit: filasTotales.length } };

      const ExcelJS = (await import('exceljs')).default;
      const GUINDA = 'FFAB0A3D';
      const GRIS   = 'FF7A7570';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Detalle', { views: [{ showGridLines: false }] });

      const esBandeja = filtro.fuente === 'bandeja';
      const esTerminados = filtro.fuente === 'terminados';
      const headers = esDinero
        ? ['Referencia', 'No. operación', 'Fecha contable', 'Municipio', 'Delegación', 'Concepto', 'Importe', 'Subsidio', 'Estatus conciliación']
        : ['NCI', 'Fecha ingreso', ...(esTerminados ? ['Fecha firma'] : []), 'Delegación', 'Acto', ...(esBandeja ? ['Etapa', 'Días en bandeja'] : []), ...(esTerminados ? ['Estatus', 'Días atención'] : []), 'Solicitante / Notario', 'Origen'];
      ws.columns = headers.map(() => ({ width: 20 }));
      ws.getColumn(1).width = esDinero ? 22 : 24;

      ws.mergeCells(1, 1, 1, headers.length);
      const tCell = ws.getCell(1, 1);
      tCell.value = `DETALLE: ${filtro.titulo}`.toUpperCase();
      tCell.font  = { bold: true, size: 16, color: { argb: GUINDA } };

      const subCell = ws.getCell(2, 1);
      subCell.value = `Generado: ${new Date().toLocaleString('es-MX')}  ·  ${res.data.length} de ${res.meta.total} registro(s)${contextoTexto ? '  ·  ' + contextoTexto : ''}`;
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
        const vals = esDinero
          ? [f.referencia, f.no_operacion, fecha(f.fecha_contable), f.municipio, f.delegacion ?? '—', f.concepto, Number(f.importe ?? 0), f.es_subsidio ? 'Sí' : 'No', f.estatus_conciliacion]
          : [f.nci, fecha(f.fecha_ingreso), ...(esTerminados ? [fecha(f.fecha_firma)] : []), f.delegacion, f.des_acto ?? f.acto ?? '—', ...(esBandeja ? [f.etapa ?? '—', f.dias_en_bandeja ?? '—'] : []), ...(esTerminados ? [f.estatus ?? '—', f.dias_atencion ?? '—'] : []), f.solicitante ?? f.notario ?? '—', f.origen ?? '—'];
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
      a.download = `programas_sociales_${filtro.fuente}_${filtro.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('No se pudo exportar: ' + err.message);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const colSpan = esDinero ? 9 : (filtro?.fuente === 'terminados' ? 9 : filtro?.fuente === 'bandeja' ? 9 : 7);

  return (
    <Modal open={!!filtro} title={`Detalle: ${filtro?.titulo ?? ''}`} onClose={onClose} width={esDinero ? 1000 : filtro?.fuente === 'ingresos' ? 900 : 980}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          {total.toLocaleString('es-MX')} registro(s)
          {filtro?.fuente === 'bandeja' && !filtro.antiguedad && ' · foto actual, no filtrada por periodo'}
          {contextoTexto && ` · ${contextoTexto}`}
        </div>
        <button onClick={exportarExcel} disabled={exporting || total === 0} style={{
          background: theme.colors.gold, border: 'none', color: '#fff', padding: '7px 14px', borderRadius: '8px',
          cursor: exporting || total === 0 ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700, opacity: exporting || total === 0 ? 0.6 : 1,
        }}>
          {exporting ? (exportProgress ? `Exportando… ${exportProgress.fetched.toLocaleString('es-MX')} / ${exportProgress.total.toLocaleString('es-MX')}` : 'Exportando…') : '⬇ Exportar a Excel'}
        </button>
      </div>
      {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}
      {!loading && error && <p style={{ fontSize: '0.85rem', color: theme.colors.alert.red }}>Error: {error}</p>}
      {!loading && !error && filtro && (
        <>
          <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {esDinero ? (
                    <>
                      <th style={th}>Referencia</th><th style={th}>Fecha contable</th><th style={th}>Municipio</th><th style={th}>Delegación</th>
                      <th style={th}>Concepto</th><th style={th}>Importe</th><th style={th}>Estatus conciliación</th>
                    </>
                  ) : (
                    <>
                      <th style={th}>NCI</th><th style={th}>Fecha ingreso</th>
                      {filtro.fuente === 'terminados' && <th style={th}>Fecha firma</th>}
                      <th style={th}>Delegación</th><th style={th}>Acto</th>
                      {filtro.fuente === 'bandeja' && <th style={th}>Etapa</th>}
                      {filtro.fuente === 'bandeja' && <th style={th}>Días en bandeja</th>}
                      {filtro.fuente === 'terminados' && <th style={th}>Estatus</th>}
                      {filtro.fuente === 'terminados' && <th style={th}>Días atención</th>}
                      <th style={th}>{filtro.fuente === 'ingresos' ? 'Solicitante' : 'Notario / Solicitante'}</th>
                      <th style={th}>Origen</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={colSpan} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
                ) : esDinero ? filas.map((f) => (
                  <tr key={f.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{f.referencia}</td>
                    <td style={td}>{fecha(f.fecha_contable)}</td>
                    <td style={td}>{f.municipio}</td>
                    <td style={td}>{f.delegacion ?? '—'}</td>
                    <td style={{ ...td, maxWidth: '260px' }} title={f.concepto ?? ''}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.concepto ?? '—'}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: f.es_subsidio ? theme.colors.gold : theme.colors.textPrimary, fontWeight: f.es_subsidio ? 700 : 400 }}>{MXN.format(Number(f.importe ?? 0))}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: (COLOR_CONCILIACION[f.estatus_conciliacion ?? ''] ?? theme.colors.grayMid) + '22', color: COLOR_CONCILIACION[f.estatus_conciliacion ?? ''] ?? theme.colors.textPrimary }}>
                        {f.estatus_conciliacion ?? '—'}
                      </span>
                    </td>
                  </tr>
                )) : filas.map((f) => (
                  <tr key={f.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{f.nci}</td>
                    <td style={td}>{fecha(f.fecha_ingreso)}</td>
                    {filtro.fuente === 'terminados' && <td style={td}>{fecha(f.fecha_firma)}</td>}
                    <td style={td}>{f.delegacion}</td>
                    <td style={{ ...td, maxWidth: '200px' }} title={f.des_acto ?? f.acto ?? ''}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.des_acto ?? f.acto ?? '—'}</span>
                    </td>
                    {filtro.fuente === 'bandeja' && <td style={td}>{f.etapa ?? '—'}</td>}
                    {filtro.fuente === 'bandeja' && <td style={{ ...td, textAlign: 'right' }}>{f.dias_en_bandeja ?? '—'}</td>}
                    {filtro.fuente === 'terminados' && (
                      <td style={td}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700, backgroundColor: f.estatus === 'Solicitud firmada' ? '#D1FAE5' : '#FEE2E2', color: f.estatus === 'Solicitud firmada' ? '#065F46' : '#991B1B' }}>
                          {f.estatus ?? '—'}
                        </span>
                      </td>
                    )}
                    {filtro.fuente === 'terminados' && <td style={{ ...td, textAlign: 'right' }}>{f.dias_atencion ?? '—'}</td>}
                    <td style={{ ...td, maxWidth: '180px' }} title={f.solicitante ?? f.notario ?? ''}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.solicitante ?? f.notario ?? '—'}</span>
                    </td>
                    <td style={td}>{f.origen ?? '—'}</td>
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

// ── estilos ──
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' };
const tdStyle: React.CSSProperties = { padding: '9px 12px', color: theme.colors.textPrimary };
