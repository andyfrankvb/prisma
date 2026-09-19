/**
 * View: Reportes_Productividad ("Productividad por Delegación")
 * File: src/frontend/views/Reportes_Productividad.tsx
 *
 * Los 3 pilares que Dirección pidió — cuánto entra, cuánto se trabaja y
 * cuánto queda pendiente, por delegación — ahora contra datos reales:
 * `productividad_ingresos` / `productividad_bandeja` / `productividad_terminados`
 * (ver src/modules/productividad/productividad.controller.ts para la fuente
 * y el porqué de cada semántica de fecha).
 *
 * "Pendiente" es una FOTO al corte de la última carga — no varía con el
 * filtro de periodo (no tendría sentido "cuánto había pendiente en marzo",
 * solo tenemos el corte de ahora). "Ingresados" filtra por fecha de ingreso;
 * "Terminados" filtra por fecha de firma (cuándo se cerró el trámite, no
 * cuándo entró) — así el filtro de periodo responde "cuánto se trabajó en
 * este periodo", no "cuánto de lo que entró en este periodo ya se cerró".
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
import { getProductividadResumen, getProductividadBandeja, getProductividadTerminados, getProductividadDelegaciones, getProductividadDetalle, getProductividadRezago } from '../api';
import type { ResumenProductividad, BandejaResumen, TerminadosResumen, ProductividadMensualFila, DistribucionFila, ProductividadDetalleFila, RezagoResumen } from '../types';

const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

interface FiltroModalProductividad {
  titulo:      string;
  fuente:      'ingresos' | 'bandeja' | 'terminados';
  delegacion?: string;
  categoria?:  'certificacion' | 'inscripcion';       // si no viene, usa el filtro global de la pantalla
  antiguedad?: '0-3' | '3-6' | '6-12' | 'mas-1-anio';  // solo bandeja
  rezagoTipo?: 'mismo_mes' | 'rezago';                 // solo terminados
}

const NUM = new Intl.NumberFormat('es-MX');
const MES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const DELEGACION_COLORS: Record<string, string> = {
  'Benito Juárez':    theme.colors.primary,
  'Playa del Carmen': theme.colors.gold,
  'Othón P Blanco':   theme.colors.charcoal,
  'Cozumel':          theme.colors.primaryLight,
};

/** Sin filtro de periodo: agrupa por año para no listar 60+ meses (todo antes de 2022 junto, como acervo). */
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

/** Con filtro de periodo activo: un mes por barra. */
function porMesFilas(porMes: ProductividadMensualFila[]): DistribucionFila[] {
  return porMes.map(({ anio, mes, cantidad }) => ({ etiqueta: `${MES_ABREV[mes - 1]}. ${anio}`, cantidad }));
}

export const Reportes_Productividad: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [delegacionFiltro, setDelegacionFiltro] = useState('');
  const [delegaciones, setDelegaciones] = useState<string[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<'' | 'certificacion' | 'inscripcion'>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const periodoActivo = !!(desde && hasta);

  const [resumen, setResumen]       = useState<ResumenProductividad | null>(null);
  const [bandeja, setBandeja]       = useState<BandejaResumen | null>(null);
  const [terminados, setTerminados] = useState<TerminadosResumen | null>(null);
  const [rezago, setRezago]         = useState<RezagoResumen | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [modalDetalle, setModalDetalle] = useState<FiltroModalProductividad | null>(null);

  useEffect(() => {
    getProductividadDelegaciones().then((r) => setDelegaciones(r.data)).catch(() => {});
  }, []);

  // Al cambiar delegación y periodo casi juntos (ej. elegir delegación y luego un
  // atajo de periodo) se disparan dos cargas seguidas; sin este guard, la respuesta
  // de la carga vieja (sin el filtro nuevo) puede llegar después y pisar la buena.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    const params = { delegacion: delegacionFiltro || undefined, desde: desde || undefined, hasta: hasta || undefined, categoria: categoriaFiltro || undefined };
    Promise.all([
      getProductividadResumen(params),
      getProductividadBandeja(params),
      getProductividadTerminados(params),
      getProductividadRezago(params),
    ])
      .then(([r, b, t, rz]) => {
        if (cancelado) return;
        setResumen(r);
        setBandeja(b);
        setTerminados(t);
        setRezago(rz);
      })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [delegacionFiltro, categoriaFiltro, desde, hasta]);

  const limpiarFiltros = () => { setDelegacionFiltro(''); setCategoriaFiltro(''); setDesde(''); setHasta(''); };
  const hayFiltros = !!(delegacionFiltro || categoriaFiltro || desde || hasta);

  const filas = resumen?.data ?? [];
  const totalIngresados  = filas.reduce((s, d) => s + d.ingresados, 0);
  const totalTerminados  = filas.reduce((s, d) => s + d.terminados, 0);
  const totalFirmadas    = filas.reduce((s, d) => s + d.firmadas, 0);
  const totalRechazadas  = filas.reduce((s, d) => s + d.rechazadas, 0);
  const totalPendiente   = filas.reduce((s, d) => s + d.pendiente_total, 0);
  const pctFirmadas = totalTerminados > 0 ? Math.round((totalFirmadas / totalTerminados) * 1000) / 10 : 0;

  const filtrosImpresion = [
    delegacionFiltro ? `Delegación: ${delegacionFiltro}` : 'Todas las delegaciones',
    categoriaFiltro === 'certificacion' ? 'Solo certificaciones' : categoriaFiltro === 'inscripcion' ? 'Solo inscripciones' : 'Certificaciones + inscripciones',
    periodoActivo ? `Periodo: ${desde} a ${hasta}` : 'Sin filtro de periodo (histórico completo)',
  ].join(' · ');

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
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Productividad por Delegación</h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Cuánto entra, cuánto se trabaja y cuánto queda pendiente, por delegación
          </p>
        </div>
        <BotonImprimirReporte />
      </div>

      <div className="reporte-imprimible" style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <EncabezadoImpresion
          titulo="Productividad por Delegación"
          subtitulo="Cuánto entra, cuánto se trabaja y cuánto queda pendiente, por delegación"
          filtros={filtrosImpresion}
        />

        {/* ── Filtros (no se imprime: su resumen ya va en el encabezado del PDF) ── */}
        <div className="no-imprimir" style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'end' }}>
            <div style={{ minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>
                Delegación
              </label>
              <select
                value={delegacionFiltro}
                onChange={(e) => setDelegacionFiltro(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family, width: '100%' }}
              >
                <option value="">Todas</option>
                {delegaciones.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>
                Certificación / Inscripción
              </label>
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value as any)}
                style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontFamily: theme.font.family, width: '100%' }}
              >
                <option value="">Todas</option>
                <option value="certificacion">Solo certificaciones</option>
                <option value="inscripcion">Solo inscripciones</option>
              </select>
            </div>
          </div>
          {categoriaFiltro && (
            <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary }}>
              Certificaciones (certificados, constancias, copias, historial) suelen resolverse en pocos días; inscripciones
              (traslativos, gravámenes, avisos...) modifican el registro y llevan más tiempo — mezclarlas distorsiona el
              promedio de días de atención.
            </p>
          )}
          <div style={{ paddingTop: '10px', borderTop: `1px solid ${theme.colors.border}` }}>
            <SelectorPeriodo desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} onLimpiar={limpiarFiltros} mostrarLimpiar={hayFiltros} />
          </div>
        </div>
        <p style={{ margin: '-12px 0 0', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
          El periodo filtra "Ingresados" por fecha de ingreso y "Terminados" por fecha de firma (cuándo se cerró, no cuándo entró). "Pendiente" es la foto de ahora mismo y no cambia con el periodo.
        </p>

        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
            Error: {error}
          </div>
        )}
        {loading && <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>}

        {!loading && !error && resumen && (
          <>
            {/* ── KPIs ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <KpiCard label="Ingresados" value={NUM.format(totalIngresados)} icon="subir" color={theme.colors.primary}
                onClick={() => setModalDetalle({ titulo: 'Ingresados', fuente: 'ingresos', delegacion: delegacionFiltro || undefined })} />
              <KpiCard label="Terminados" value={NUM.format(totalTerminados)} icon="check" color={theme.colors.alert.green}
                sub={`${pctFirmadas}% firmadas · ${NUM.format(totalFirmadas)} firmadas / ${NUM.format(totalRechazadas)} rechazadas`}
                onClick={() => setModalDetalle({ titulo: 'Terminados', fuente: 'terminados', delegacion: delegacionFiltro || undefined })} />
              <KpiCard label="Pendientes ahora" value={NUM.format(totalPendiente)} icon="reloj" color={theme.colors.gold}
                sub="foto actual — no cambia con el filtro de periodo"
                onClick={() => setModalDetalle({ titulo: 'Pendientes ahora', fuente: 'bandeja', delegacion: delegacionFiltro || undefined })} />
              <KpiCard label="Días de atención (promedio)" value={terminados?.dias_atencion_promedio != null ? `${terminados.dias_atencion_promedio} días` : '—'} icon="historial" color={theme.colors.charcoal}
                onClick={() => setModalDetalle({ titulo: 'Terminados (días de atención)', fuente: 'terminados', delegacion: delegacionFiltro || undefined })} />
            </div>

            {/* ── Avance por delegación ── */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>
                Terminados vs. ingresados, por delegación
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '18px 20px' }}>
                <AvanceBar filas={filas} />
              </div>
            </div>

            {/* ── Tabla detalle por delegación ── */}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                Detalle por delegación
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: theme.colors.background }}>
                      <th style={thStyle}>Delegación</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Ingresados</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Terminados</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Firmadas</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Rechazadas</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Días atención</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Pendientes ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((d) => (
                      <tr key={d.delegacion} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>
                          <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', backgroundColor: DELEGACION_COLORS[d.delegacion] ?? theme.colors.grayMid, marginRight: '7px' }} />
                          {d.delegacion}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Ingresados — ${d.delegacion}`, fuente: 'ingresos', delegacion: d.delegacion })}>
                          {NUM.format(d.ingresados)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: theme.colors.alert.green, fontWeight: 700, cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Terminados — ${d.delegacion}`, fuente: 'terminados', delegacion: d.delegacion })}>
                          {NUM.format(d.terminados)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{NUM.format(d.firmadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{NUM.format(d.rechazadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{d.dias_atencion_promedio ?? '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, cursor: 'pointer' }} onClick={() => setModalDetalle({ titulo: `Pendientes ahora — ${d.delegacion}`, fuente: 'bandeja', delegacion: d.delegacion })}>
                          {NUM.format(d.pendiente_total)} <span style={{ fontSize: '0.7rem' }}>🔍</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filas.length > 1 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${theme.colors.border}`, backgroundColor: theme.colors.background }}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalIngresados)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: theme.colors.alert.green }}>{NUM.format(totalTerminados)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalFirmadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalRechazadas)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>—</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{NUM.format(totalPendiente)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── Bandeja pendiente detallada ── */}
            {bandeja && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                    Bandeja pendiente detallada{delegacionFiltro ? ` — ${delegacionFiltro}` : ''}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                    {NUM.format(bandeja.total)} trámites activos ahora{periodoActivo ? ' — el desglose de abajo sí muestra solo el periodo filtrado' : ''}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  <PanelDistribucion titulo={periodoActivo ? 'Ingreso por mes (periodo filtrado)' : 'Antigüedad del rezago (año de ingreso)'} filas={periodoActivo ? porMesFilas(bandeja.por_mes) : bucketPorAnio(bandeja.por_mes)} color={theme.colors.primary} />
                  <PanelDistribucion titulo="Etapa actual" filas={bandeja.por_etapa} color={theme.colors.alert.green} />
                  <PanelDistribucion titulo="Tipo de acto" filas={bandeja.por_tipo.slice(0, 8)} color={theme.colors.gold} />
                  <PanelDistribucion titulo="Origen" filas={bandeja.por_origen} color={theme.colors.charcoal} />
                </div>
              </div>
            )}

            {/* ── Rezago: antigüedad de lo pendiente + avance del periodo ── */}
            {rezago && (() => {
              const masDeUnAnio = rezago.antiguedad.find((b) => b.bucket === 'Más de 1 año');
              const totalAntiguedad = rezago.antiguedad.reduce((s, b) => s + b.total, 0);
              const pctMasDeUnAnio = totalAntiguedad > 0 && masDeUnAnio ? Math.round((masDeUnAnio.total / totalAntiguedad) * 1000) / 10 : 0;
              const abrirModalAntiguedad = (clave: '0-3' | '3-6' | '6-12' | 'mas-1-anio') => setModalDetalle({
                titulo: `Pendientes — ${ETIQUETA_ANTIGUEDAD[clave]}`, fuente: 'bandeja', delegacion: delegacionFiltro || undefined, antiguedad: clave,
              });
              const abrirModalAvance = (rezagoTipo: 'mismo_mes' | 'rezago', categoria?: 'certificacion' | 'inscripcion') => setModalDetalle({
                titulo: `Terminados — ${ETIQUETA_REZAGO[rezagoTipo]}${categoria ? ` · ${ETIQUETA_CATEGORIA[categoria]}` : ''}`,
                fuente: 'terminados', delegacion: delegacionFiltro || undefined, rezagoTipo, categoria,
              });
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                      Rezago{delegacionFiltro ? ` — ${delegacionFiltro}` : ''}
                    </span>
                  </div>

                  {masDeUnAnio && masDeUnAnio.total > 0 && (
                    <div
                      onClick={() => abrirModalAntiguedad('mas-1-anio')}
                      style={{
                        backgroundColor: '#FEE2E2', border: `1px solid ${theme.colors.alert.red}`, borderRadius: '12px',
                        padding: '14px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px',
                        cursor: 'pointer', flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: '1.6rem' }}>⚠️</span>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#991B1B' }}>
                          {NUM.format(masDeUnAnio.total)} trámites con más de 1 año pendientes <span style={{ fontSize: '0.9rem' }}>🔍</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#991B1B' }}>
                          {pctMasDeUnAnio}% de todo lo pendiente · {NUM.format(masDeUnAnio.certificacion)} certificaciones + {NUM.format(masDeUnAnio.inscripcion)} inscripciones — el rezago más crítico
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 1.1fr) minmax(300px, 1fr)', gap: '16px' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '4px' }}>
                        Antigüedad de lo pendiente ahora
                      </div>
                      <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginBottom: '12px' }}>
                        Desde que entró cada trámite hasta hoy — clic en cualquier renglón para ver el detalle
                      </div>
                      <PieChart
                        centerLabel={`${NUM.format(totalAntiguedad)}\npendientes`}
                        filas={[
                          { etiqueta: '0-3 meses',     cantidad: rezago.antiguedad.find((b) => b.bucket === '0-3 meses')?.total ?? 0,     color: theme.colors.alert.green, onClick: () => abrirModalAntiguedad('0-3') },
                          { etiqueta: '3-6 meses',     cantidad: rezago.antiguedad.find((b) => b.bucket === '3-6 meses')?.total ?? 0,     color: theme.colors.gold,        onClick: () => abrirModalAntiguedad('3-6') },
                          { etiqueta: '6-12 meses',    cantidad: rezago.antiguedad.find((b) => b.bucket === '6-12 meses')?.total ?? 0,    color: theme.colors.charcoal,    onClick: () => abrirModalAntiguedad('6-12') },
                          { etiqueta: 'Más de 1 año',  cantidad: masDeUnAnio?.total ?? 0,                                                 color: theme.colors.alert.red,   onClick: () => abrirModalAntiguedad('mas-1-anio') },
                        ]}
                      />
                      <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${theme.colors.border}` }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Certificación vs. inscripción, por antigüedad
                        </div>
                        <AntiguedadRezagoBar filas={rezago.antiguedad} onClickBucket={abrirModalAntiguedad} />
                        <div style={{ display: 'flex', gap: '14px', marginTop: '12px', fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', backgroundColor: theme.colors.primary, borderRadius: '2px', marginRight: '4px' }} />Certificación</span>
                          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', backgroundColor: theme.colors.gold, borderRadius: '2px', marginRight: '4px' }} />Inscripción</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '4px' }}>
                        Avance de rezago{periodoActivo ? ' (periodo filtrado)' : ''}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginBottom: '14px' }}>
                        De lo terminado, cuánto entró el mismo mes (flujo normal) vs. cuánto era de meses anteriores — clic para ver el detalle
                      </div>
                      <PieChart
                        centerLabel={`${NUM.format(rezago.avance.mismo_mes + rezago.avance.de_rezago)}\nterminados`}
                        filas={[
                          { etiqueta: 'Mismo mes (flujo normal)', cantidad: rezago.avance.mismo_mes, color: theme.colors.alert.green, onClick: () => abrirModalAvance('mismo_mes') },
                          { etiqueta: 'De rezago (venía de antes)', cantidad: rezago.avance.de_rezago, color: theme.colors.primary,     onClick: () => abrirModalAvance('rezago') },
                        ]}
                      />
                      <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${theme.colors.border}` }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Por categoría
                        </div>
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
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                    Trabajo terminado detallado{delegacionFiltro ? ` — ${delegacionFiltro}` : ''}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                    {NUM.format(terminados.total)} solicitudes cerradas{periodoActivo ? ' en el periodo filtrado (por fecha de firma)' : ''}
                  </span>
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

      <ModalDetalleProductividad filtro={modalDetalle} desde={desde} hasta={hasta} categoria={categoriaFiltro} onClose={() => setModalDetalle(null)} />
    </div>
  );
};

// ── PanelDistribucion: tarjeta con un DistribucionBar adentro ──
const PanelDistribucion: React.FC<{ titulo: string; filas: DistribucionFila[]; color: string }> = ({ titulo, filas, color }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '16px 18px' }}>
    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '12px' }}>{titulo}</div>
    <DistribucionBar filas={filas} color={color} />
  </div>
);

// ── DistribucionBar: barras horizontales genéricas etiqueta/cantidad ──
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
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {NUM.format(f.cantidad)} <span>({pctTotal}%)</span>
              </span>
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

// ── DistribucionBarClicable: igual que DistribucionBar, pero cada renglón abre su propia lupa ──
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
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {NUM.format(f.cantidad)} ({pctTotal}%) <span style={{ fontSize: '0.66rem' }}>🔍</span>
              </span>
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

// ── AntiguedadRezagoBar: barra apilada certificación/inscripción por bucket de antigüedad ──
const BUCKET_LABEL_A_CLAVE: Record<string, '0-3' | '3-6' | '6-12' | 'mas-1-anio'> = {
  '0-3 meses': '0-3', '3-6 meses': '3-6', '6-12 meses': '6-12', 'Más de 1 año': 'mas-1-anio',
};

const AntiguedadRezagoBar: React.FC<{ filas: RezagoResumen['antiguedad']; onClickBucket: (clave: '0-3' | '3-6' | '6-12' | 'mas-1-anio') => void }> = ({ filas, onClickBucket }) => {
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
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: esCritico ? theme.colors.alert.red : theme.colors.textPrimary }}>
                {f.bucket}{esCritico && ' ⚠'}
              </span>
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

// ── PieChart: donut clickeable con leyenda — reutilizado por antigüedad y avance de rezago ──
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
              <circle
                key={f.etiqueta} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={f.color} strokeWidth={size * 0.24}
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-acumulado}
                onClick={f.onClick} style={{ cursor: f.onClick ? 'pointer' : undefined }}
              />
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
              <span style={{ color: theme.colors.textSecondary, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {NUM.format(f.cantidad)} ({pct}%){f.onClick && <span style={{ fontSize: '0.68rem', marginLeft: '3px' }}>🔍</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── KpiCard (mismo patrón que el resto del módulo) ──
const KpiCard: React.FC<{ label: string; value: string; icon: any; color: string; sub?: string; onClick?: () => void }> = ({ label, value, icon, color, sub, onClick }) => (
  <div
    onClick={onClick}
    style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`, cursor: onClick ? 'pointer' : undefined }}
  >
    <div style={{ marginBottom: '8px' }}><Icono nombre={icon} size={22} color={color} /></div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.15 }}>{value}</div>
    <div style={{ fontSize: '0.76rem', color: theme.colors.textSecondary, marginTop: '4px', fontWeight: 500 }}>
      {label}{onClick && <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>🔍</span>}
    </div>
    {sub && <div style={{ fontSize: '0.68rem', color: theme.colors.textSecondary, marginTop: '3px', lineHeight: 1.4 }}>{sub}</div>}
  </div>
);

// ── ModalDetalleProductividad: la "lupa" — fila por fila, paginado, con exportar a Excel ──
const DETALLE_LIMIT = 20;
const DETALLE_EXPORT_LIMIT = 10000;

const ETIQUETA_ANTIGUEDAD: Record<string, string> = { '0-3': '0-3 meses', '3-6': '3-6 meses', '6-12': '6-12 meses', 'mas-1-anio': 'más de 1 año' };
const ETIQUETA_REZAGO: Record<string, string> = { mismo_mes: 'del mismo mes (flujo normal)', rezago: 'de rezago (entraron antes)' };
const ETIQUETA_CATEGORIA: Record<string, string> = { certificacion: 'certificaciones', inscripcion: 'inscripciones' };

const ModalDetalleProductividad: React.FC<{ filtro: FiltroModalProductividad | null; desde: string; hasta: string; categoria: '' | 'certificacion' | 'inscripcion'; onClose: () => void }> = ({ filtro, desde, hasta, categoria, onClose }) => {
  const [filas, setFilas]     = useState<ProductividadDetalleFila[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ fetched: number; total: number } | null>(null);

  const categoriaEfectiva = filtro?.categoria ?? (categoria || undefined);

  const parametrosBase = (limit: number, page: number) => ({
    fuente: filtro!.fuente,
    delegacion: filtro!.delegacion,
    desde: filtro!.fuente === 'bandeja' ? undefined : (desde || undefined),
    hasta: filtro!.fuente === 'bandeja' ? undefined : (hasta || undefined),
    categoria: categoriaEfectiva,
    antiguedad: filtro!.antiguedad,
    rezago_tipo: filtro!.rezagoTipo,
    page, limit,
  });

  useEffect(() => { setPage(1); }, [filtro]);

  useEffect(() => {
    if (!filtro) return;
    let cancelado = false;
    setLoading(true);
    setError(null);
    getProductividadDetalle(parametrosBase(DETALLE_LIMIT, page))
      .then((r) => { if (!cancelado) { setFilas(r.data); setTotal(r.meta.total); } })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtro, desde, hasta, categoriaEfectiva, page]);

  const totalPages = Math.ceil(total / DETALLE_LIMIT);
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '7px 9px', fontSize: '0.68rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: `1px solid ${theme.colors.border}`, position: 'sticky', top: 0, backgroundColor: '#fff',
  };
  const td: React.CSSProperties = { padding: '7px 9px', fontSize: '0.78rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };
  const btnPag: React.CSSProperties = { padding: '6px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: theme.colors.textPrimary };
  const fecha = (v?: string | null) => v ? FECHA_CORTA.format(new Date(v)) : '—';

  const contextoTexto = [
    filtro?.antiguedad && `antigüedad ${ETIQUETA_ANTIGUEDAD[filtro.antiguedad]}`,
    filtro?.rezagoTipo && ETIQUETA_REZAGO[filtro.rezagoTipo],
    categoriaEfectiva && ETIQUETA_CATEGORIA[categoriaEfectiva],
  ].filter(Boolean).join(' · ');

  const exportarExcel = async () => {
    if (!filtro) return;
    setExporting(true);
    setError(null);
    setExportProgress(null);
    try {
      // El backend acota cada página a DETALLE_EXPORT_LIMIT (10,000) por
      // consulta — varios universos (Pendientes, Ingresados, Terminados)
      // superan eso, así que se pagina hasta traer todo antes de armar el
      // Excel, en vez de exportar solo la primera página.
      let filasTotales: ProductividadDetalleFila[] = [];
      let totalRegistros = 0;
      let pagina = 1;
      while (true) {
        const pag = await getProductividadDetalle(parametrosBase(DETALLE_EXPORT_LIMIT, pagina));
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
      const headers = [
        'NCI', 'Fecha ingreso',
        ...(esTerminados ? ['Fecha firma'] : []),
        'Delegación', 'Acto',
        ...(esBandeja ? ['Etapa', 'Días en bandeja'] : []),
        ...(esTerminados ? ['Estatus', 'Días atención'] : []),
        'Solicitante / Notario', 'Origen',
      ];
      ws.columns = headers.map(() => ({ width: 20 }));
      ws.getColumn(1).width = 24;

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
        const vals = [
          f.nci, fecha(f.fecha_ingreso),
          ...(esTerminados ? [fecha(f.fecha_firma)] : []),
          f.delegacion, f.des_acto ?? f.acto ?? '—',
          ...(esBandeja ? [f.etapa ?? '—', f.dias_en_bandeja ?? '—'] : []),
          ...(esTerminados ? [f.estatus ?? '—', f.dias_atencion ?? '—'] : []),
          f.solicitante ?? f.notario ?? '—', f.origen ?? '—',
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
      a.download = `productividad_${filtro.fuente}_${filtro.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('No se pudo exportar: ' + err.message);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <Modal open={!!filtro} title={`Detalle: ${filtro?.titulo ?? ''}`} onClose={onClose} width={filtro?.fuente === 'ingresos' ? 900 : 980}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          {total.toLocaleString('es-MX')} registro(s)
          {filtro?.fuente === 'bandeja' && !filtro.antiguedad && ' · foto actual, no filtrada por periodo'}
          {contextoTexto && ` · ${contextoTexto}`}
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
                  <th style={th}>NCI</th>
                  <th style={th}>Fecha ingreso</th>
                  {filtro.fuente === 'terminados' && <th style={th}>Fecha firma</th>}
                  <th style={th}>Delegación</th>
                  <th style={th}>Acto</th>
                  {filtro.fuente === 'bandeja' && <th style={th}>Etapa</th>}
                  {filtro.fuente === 'bandeja' && <th style={th}>Días en bandeja</th>}
                  {filtro.fuente === 'terminados' && <th style={th}>Estatus</th>}
                  {filtro.fuente === 'terminados' && <th style={th}>Días atención</th>}
                  <th style={th}>{filtro.fuente === 'ingresos' ? 'Solicitante' : 'Notario / Solicitante'}</th>
                  <th style={th}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
                ) : filas.map((f) => (
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
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                          backgroundColor: f.estatus === 'Solicitud firmada' ? '#D1FAE5' : '#FEE2E2',
                          color: f.estatus === 'Solicitud firmada' ? '#065F46' : '#991B1B',
                        }}>
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

// ── AvanceBar: terminados (relleno) vs. ingresados (barra completa), por delegación ──
const AvanceBar: React.FC<{ filas: ResumenProductividad['data'] }> = ({ filas }) => {
  if (filas.length === 0) return <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>Sin datos con este filtro.</p>;
  const max = Math.max(...filas.map((f) => Math.max(f.ingresados, f.terminados)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {filas.map((f) => {
        const anchoTotal = Math.max((Math.max(f.ingresados, f.terminados) / max) * 100, 2);
        const anchoTerminado = f.ingresados > 0 ? Math.min((f.terminados / f.ingresados) * 100, 100) : 0;
        const pct = f.ingresados > 0 ? Math.round((f.terminados / f.ingresados) * 1000) / 10 : 0;
        return (
          <div key={f.delegacion}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textPrimary }}>{f.delegacion}</span>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, flexShrink: 0 }}>
                {NUM.format(f.terminados)} terminados de {NUM.format(f.ingresados)} ingresados · {pct}%
              </span>
            </div>
            <div style={{ width: `${anchoTotal}%`, height: '14px', borderRadius: '7px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <div style={{ width: `${anchoTerminado}%`, height: '100%', backgroundColor: DELEGACION_COLORS[f.delegacion] ?? theme.colors.grayMid, borderRadius: '7px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── estilos ──
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: '0.7rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' };
const tdStyle: React.CSSProperties = { padding: '9px 12px', color: theme.colors.textPrimary };
