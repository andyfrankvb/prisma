/**
 * View: Reportes_SATQ ("Reporte Conciliación de Ingresos")
 * File: src/frontend/views/Reportes_SATQ.tsx
 *
 * Perfil Administrador: mismo resumen ejecutivo que ve Dirección
 * (<SeccionIngresosSatq desde={desde} hasta={hasta} />) arriba, y debajo el detalle filtrable fila por
 * fila (fecha, municipio, concepto, conciliación con RPP) con exportación a
 * Excel.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { SearchableSelect, SelectOption } from '../components/SearchableSelect';
import { SeccionIngresosSatq } from '../components/SeccionIngresosSatq';
import { SeccionDiagnosticoConciliacion } from '../components/SeccionDiagnosticoConciliacion';
import { SeccionEstimacionRecaudacion } from '../components/SeccionEstimacionRecaudacion';
import { SelectorPeriodo, rangoDeMesInicial } from '../components/SelectorPeriodo';
import { EncabezadoImpresion } from '../components/EncabezadoImpresion';
import { BotonImprimirReporte } from '../components/BotonImprimirReporte';
import { getSatqDetalle, descargarSatqExcel, getSatqConceptos, getSatqMunicipios, getSatqDelegaciones, getSatqProgramas, getSatqTiposActo } from '../api';
import type { SatqDetalleFila } from '../types';

const LIMIT = 25;

const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const FECHA  = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const Reportes_SATQ: React.FC = () => {
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();

  const inicial = rangoDeMesInicial();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [municipio, setMunicipio] = useState('');
  const [idConcepto, setIdConcepto] = useState('');
  const [programa, setPrograma] = useState('');
  const [tipoActo, setTipoActo] = useState('');
  const [delegacion, setDelegacion] = useState('');
  const [conciliado, setConciliado] = useState<'' | 'true' | 'false'>('');

  const [municipios, setMunicipios] = useState<SelectOption[]>([]);
  const [conceptos, setConceptos]   = useState<SelectOption[]>([]);
  const [programas, setProgramas]   = useState<SelectOption[]>([]);
  const [tiposActo, setTiposActo]   = useState<SelectOption[]>([]);
  const [delegaciones, setDelegaciones] = useState<SelectOption[]>([]);

  const [filas, setFilas]   = useState<SatqDetalleFila[]>([]);
  const [total, setTotal]   = useState(0);
  const [sumaImporte, setSumaImporte] = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mostrarDiagnostico, setMostrarDiagnostico] = useState(false);
  const [mostrarEstimacion, setMostrarEstimacion] = useState(true);

  // Catálogos, una sola vez
  useEffect(() => {
    getSatqMunicipios().then((r) => setMunicipios(r.data.map((m) => ({ value: m, label: m })))).catch(() => {});
    getSatqConceptos().then((r) => setConceptos(
      r.data.map((c) => ({ value: String(c.id_concepto), label: `${c.id_concepto} — ${c.concepto}` })),
    )).catch(() => {});
    getSatqProgramas().then((r) => setProgramas(r.data.map((p) => ({ value: p, label: p })))).catch(() => {});
    getSatqTiposActo().then((r) => setTiposActo(r.data.map((t) => ({ value: t, label: t })))).catch(() => {});
    getSatqDelegaciones().then((r) => setDelegaciones(r.data.map((d) => ({ value: d, label: d })))).catch(() => {});
  }, []);

  // Al cambiar cualquier filtro, regresar a la página 1
  useEffect(() => { setPage(1); }, [desde, hasta, municipio, idConcepto, programa, tipoActo, delegacion, conciliado]);

  const fetchFilas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSatqDetalle({
        desde, hasta, page, limit: LIMIT,
        municipio: municipio || undefined,
        id_concepto: idConcepto ? Number(idConcepto) : undefined,
        programa: programa || undefined,
        tipo_acto: tipoActo || undefined,
        delegacion: delegacion || undefined,
        conciliado: conciliado || undefined,
      });
      setFilas(res.data);
      setTotal(res.meta.total);
      setSumaImporte(res.meta.suma_importe);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, municipio, idConcepto, programa, tipoActo, delegacion, conciliado, page]);

  useEffect(() => { fetchFilas(); }, [fetchFilas]);

  const totalPages = Math.ceil(total / LIMIT);

  const limpiarFiltros = () => {
    const def = rangoDeMesInicial();
    setDesde(def.desde); setHasta(def.hasta);
    setMunicipio(''); setIdConcepto(''); setPrograma(''); setTipoActo(''); setDelegacion(''); setConciliado('');
  };
  const hayFiltros = !!(municipio || idConcepto || programa || tipoActo || delegacion || conciliado || desde !== inicial.desde || hasta !== inicial.hasta);

  // ── Resumen de filtros para el encabezado impreso (los paneles de filtro no se imprimen) ──
  const filtrosImpresion = [
    `Periodo ${desde} a ${hasta}`,
    municipio && `Municipio: ${municipio}`,
    idConcepto && `Concepto: ${conceptos.find((c) => c.value === idConcepto)?.label ?? idConcepto}`,
    programa && `Programa: ${programa}`,
    tipoActo && `Tipo de acto: ${tipoActo}`,
    delegacion && `Delegación: ${delegacion}`,
    conciliado && (conciliado === 'true' ? 'Solo conciliados' : 'Solo sin conciliar'),
  ].filter(Boolean).join(' · ');

  // Al imprimir, las secciones colapsables se abren primero para que el PDF
  // salga completo sin depender de cómo esté la pantalla en ese momento.
  const handleImprimir = () => {
    setMostrarEstimacion(true);
    setMostrarDiagnostico(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  // ── Exportar a Excel — respeta los filtros activos, sin tope de filas (lo arma el servidor) ──
  const exportarExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      await descargarSatqExcel({
        desde, hasta,
        municipio: municipio || undefined,
        id_concepto: idConcepto ? Number(idConcepto) : undefined,
        programa: programa || undefined,
        tipo_acto: tipoActo || undefined,
        delegacion: delegacion || undefined,
        conciliado: conciliado || undefined,
      });
    } catch (err: any) {
      setError('No se pudo exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.colors.background }}>
      {/* ── Barra superior ─────────────────────────────────── */}
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
          <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Reporte Conciliación de Ingresos</h2>
          <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
            Detalle de ingresos y conciliación con RPP/SIQROO
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <BotonImprimirReporte onClick={handleImprimir} />
          <button
            onClick={exportarExcel}
            disabled={exporting || total === 0}
            style={{
              background: theme.colors.gold, border: 'none', color: '#fff', padding: '9px 16px',
              borderRadius: '10px', cursor: exporting || total === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 700, opacity: exporting || total === 0 ? 0.6 : 1,
            }}
          >
            {exporting ? 'Generando Excel…' : '⬇ Exportar a Excel (completo)'}
          </button>
        </div>
      </div>

      <div className="reporte-imprimible" style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1400px', margin: '0 auto' }}>

        <EncabezadoImpresion
          titulo="Reporte Conciliación de Ingresos"
          subtitulo="Detalle de ingresos y conciliación con RPP/SIQROO"
          filtros={filtrosImpresion}
        />

        {/* ── Filtro único de periodo: rige TODAS las secciones de abajo ── */}
        <div className="no-imprimir" style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '16px 20px', marginBottom: '20px',
        }}>
          <SelectorPeriodo
            desde={desde} hasta={hasta}
            onChange={(d, h) => { setDesde(d); setHasta(h); }}
            onLimpiar={limpiarFiltros}
            mostrarLimpiar={hayFiltros}
          />
          <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: theme.colors.textSecondary }}>
            Este periodo aplica a todo el reporte: resumen, estimación vs recaudación, diagnóstico y detalle.
          </p>
        </div>

        {/* ── Resumen ejecutivo (mismo componente que ve Dirección) ── */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '20px', marginBottom: '20px',
        }}>
          <SeccionIngresosSatq desde={desde} hasta={hasta} />
        </div>

        {/* ── Estimación vs Recaudación (colapsable) ─────────── */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          marginBottom: '20px', overflow: 'hidden',
        }}>
          <button
            onClick={() => setMostrarEstimacion((m) => !m)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                📊 Estimación vs Recaudación
              </div>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
                Lo que estimó Ingresos vs. lo reportado por RPP vs. nuestra base — por mes, con los decrementos marcados
              </div>
            </div>
            <span style={{ fontSize: '1.1rem', color: theme.colors.textSecondary, transition: 'transform 0.2s', transform: mostrarEstimacion ? 'rotate(180deg)' : 'none' }}>⌄</span>
          </button>
          {mostrarEstimacion && (
            <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px' }}>
              <SeccionEstimacionRecaudacion desde={desde} hasta={hasta} />
            </div>
          )}
        </div>

        {/* ── Diagnóstico de conciliación (colapsable) ───────── */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          marginBottom: '20px', overflow: 'hidden',
        }}>
          <button
            onClick={() => setMostrarDiagnostico((m) => !m)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primaryDark }}>
                🔍 Diagnóstico de conciliación con RPP
              </div>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
                Investiga el % sin match por día y por concepto — rezago de RPP vs. hueco real
              </div>
            </div>
            <span style={{ fontSize: '1.1rem', color: theme.colors.textSecondary, transition: 'transform 0.2s', transform: mostrarDiagnostico ? 'rotate(180deg)' : 'none' }}>⌄</span>
          </button>
          {mostrarDiagnostico && (
            <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px' }}>
              <SeccionDiagnosticoConciliacion desde={desde} hasta={hasta} />
            </div>
          )}
        </div>

        {/* ── Filtros (no se imprimen: su resumen ya va en el encabezado del PDF) ── */}
        <div className="no-imprimir" style={{
          backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`,
          padding: '16px 20px', marginBottom: '20px',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end',
          }}>
          <div>
            <label style={labelStyle}>Municipio</label>
            <SearchableSelect value={municipio} options={municipios} onChange={setMunicipio} placeholder="Todos" />
          </div>
          <div>
            <label style={labelStyle}>Concepto</label>
            <SearchableSelect value={idConcepto} options={conceptos} onChange={setIdConcepto} placeholder="Todos" />
          </div>
          <div>
            <label style={labelStyle}>Programa</label>
            <SearchableSelect value={programa} options={programas} onChange={setPrograma} placeholder="Todos" />
          </div>
          <div>
            <label style={labelStyle}>Tipo de acto</label>
            <SearchableSelect value={tipoActo} options={tiposActo} onChange={setTipoActo} placeholder="Todos" />
          </div>
          <div>
            <label style={labelStyle}>Delegación (RPP)</label>
            <SearchableSelect value={delegacion} options={delegaciones} onChange={setDelegacion} placeholder="Todas" />
          </div>
          <div>
            <label style={labelStyle}>Conciliación con RPP</label>
            <select value={conciliado} onChange={(e) => setConciliado(e.target.value as any)} style={inputStyle}>
              <option value="">Todos</option>
              <option value="true">Solo conciliados (Entrega en RPP)</option>
              <option value="false">Solo sin conciliar (en trámite o no ingresado)</option>
            </select>
          </div>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* ── Suma total del filtro activo (no solo la página visible) ── */}
        <div style={{
          backgroundColor: theme.colors.primaryDark, borderRadius: '14px', padding: '16px 20px',
          marginBottom: '16px', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff' }}>
            {MONEDA.format(sumaImporte)}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)' }}>
            suma de {total.toLocaleString('es-MX')} registro(s) con estos filtros
          </span>
        </div>

        {/* ── Tabla — se imprime solo la página visible; el listado completo ya se exporta a Excel ── */}
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.colors.border}`, fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark }}>
            {total.toLocaleString('es-MX')} registro(s)
            {totalPages > 1 && (
              <span className="solo-impresion" style={{ fontSize: '0.72rem', fontWeight: 500, color: theme.colors.textSecondary, marginTop: '2px' }}>
                Mostrando página {page} de {totalPages} — usa "Exportar a Excel" para el listado completo
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: theme.colors.background }}>
                  {['Fecha', 'Referencia', 'Municipio', 'Concepto', 'Programa', 'Tipo de acto', 'Importe', 'Estatus en RPP', 'Delegación'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: theme.colors.textSecondary }}>Cargando…</td></tr>
                ) : filas.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: theme.colors.textSecondary }}>Sin resultados con estos filtros.</td></tr>
                ) : filas.map((f) => {
                  const estatusColor = f.estatus_conciliacion === 'Conciliado'
                    ? { bg: '#D1FAE5', fg: '#065F46' }
                    : f.estatus_conciliacion === 'En trámite en RPP'
                    ? { bg: '#FEF3C7', fg: '#92400E' }
                    : f.estatus_conciliacion === 'Cancelado en RPP'
                    ? { bg: '#E5E7EB', fg: '#374151' }
                    : { bg: '#FEE2E2', fg: '#991B1B' };
                  return (
                  <tr key={f.id} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                    <td style={tdStyle}>{FECHA.format(new Date(f.fecha_contable))}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem' }}>{f.referencia}</td>
                    <td style={tdStyle}>{f.municipio}</td>
                    <td style={{ ...tdStyle, maxWidth: '300px' }} title={f.concepto}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.concepto}</span>
                    </td>
                    <td style={tdStyle}>{f.programa}</td>
                    <td style={tdStyle}>{f.tipo_acto}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: Number(f.importe) < 0 ? theme.colors.alert.red : theme.colors.textPrimary }}>
                      {MONEDA.format(Number(f.importe))}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                        backgroundColor: estatusColor.bg, color: estatusColor.fg,
                      }}>
                        {f.estatus_conciliacion}
                      </span>
                    </td>
                    <td style={tdStyle}>{f.delegacion ?? '—'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="no-imprimir" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '14px' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>← Anterior</button>
              <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>Siguiente →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── estilos ──────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, marginBottom: '4px' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '0.85rem', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', fontFamily: theme.font.family };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' };
const tdStyle: React.CSSProperties = { padding: '9px 14px', color: theme.colors.textPrimary };
const btnSecondary: React.CSSProperties = { padding: '7px 14px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: theme.colors.textPrimary };
