/**
 * View: CargaDatos ("Carga de Datos (Reportes)")
 * File: src/frontend/views/CargaDatos.tsx
 *
 * Administra las 3 fuentes que alimentan "Conciliación de Ingresos":
 *  1. Reportes SATQ — subir el Excel que entrega SATQ (un archivo por
 *     ejercicio, una hoja por mes). Primero muestra una previsualización
 *     (cuánto es nuevo, cuánto ya existía) antes de confirmar — nunca se
 *     escribe nada sin que el usuario vea el resumen y confirme.
 *  2. Estimación SEFIPLAN — formulario de 12 meses, no vale la pena un
 *     parser de archivo para tan pocos números.
 *  3. Integración SIQROO — configurar la URL/API key para cuando esté lista
 *     la API; mientras tanto el botón "Sincronizar ahora" y el cron mensual
 *     simplemente reportan "no configurado", sin fallar.
 * + Bitácora de todo lo anterior, para trazabilidad.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  postCargaSatqIngresos, getCargaEstimacion, putCargaEstimacion,
  getIntegracionSiqroo, putIntegracionSiqroo, postSincronizarSiqroo, getCargaDatosLog,
} from '../api';
import type { ResumenCargaSatq, MesEstimacion, IntegracionSiqrooConfig, CargaDatosLogFila } from '../types';

const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const NUM    = new Intl.NumberFormat('es-MX');
const MES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type Tab = 'satq' | 'estimacion' | 'siqroo' | 'bitacora';

export const CargaDatos: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('satq');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'satq',       label: 'Reportes SATQ' },
    { id: 'estimacion', label: 'Estimación SEFIPLAN' },
    { id: 'siqroo',     label: 'Integración SIQROO' },
    { id: 'bitacora',   label: 'Bitácora' },
  ];

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
        <h2 style={{ margin: 0, color: theme.colors.primary, fontSize: '1.2rem', fontWeight: 800 }}>Carga de Datos (Reportes)</h2>
        <p style={{ margin: '2px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
          Las 3 fuentes que alimentan "Conciliación de Ingresos": SATQ, estimación SEFIPLAN e integración con SIQROO
        </p>
      </div>

      <div style={{ padding: isMobile ? '16px 12px 32px' : '24px 32px 40px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: '2px' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 700, fontFamily: theme.font.family,
                color: tab === t.id ? theme.colors.primary : theme.colors.textSecondary,
                borderBottom: tab === t.id ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'satq' && <TabSatq />}
        {tab === 'estimacion' && <TabEstimacion />}
        {tab === 'siqroo' && <TabSiqroo />}
        {tab === 'bitacora' && <TabBitacora />}
      </div>
    </div>
  );
};

// ── Tab: Reportes SATQ ──────────────────────────────────────────

const TabSatq: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResumenCargaSatq | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResumenCargaSatq | null>(null);

  const analizar = async () => {
    if (!file) return;
    setLoading(true); setError(null); setPreview(null); setResultado(null);
    try {
      const r = await postCargaSatqIngresos(file, true);
      setPreview(r.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async () => {
    if (!file) return;
    setConfirmando(true); setError(null);
    try {
      const r = await postCargaSatqIngresos(file, false);
      setResultado(r.data);
      setPreview(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '20px' }}>
        <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          Sube el Excel que entrega SATQ (un archivo por ejercicio, una hoja por mes, columnas Referencia / No_Operacion /
          Fecha_Contable / Municipio / id_Concepto / Concepto / Importe / Total_Referencia). Primero se muestra una
          previsualización — nada se guarda hasta que confirmes.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResultado(null); setError(null); }}
            style={{ fontSize: '0.82rem' }}
          />
          <button
            onClick={analizar}
            disabled={!file || loading}
            style={{
              background: theme.colors.primary, border: 'none', color: '#fff', padding: '9px 18px',
              borderRadius: '10px', cursor: !file || loading ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 700, opacity: !file || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Analizando…' : 'Analizar (previsualizar)'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {preview && (
        <div style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '12px' }}>
            Previsualización — nada se ha guardado todavía
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <MiniStat label="Filas en el archivo" value={NUM.format(preview.filas_total)} />
            <MiniStat label="Nuevas" value={NUM.format(preview.filas_nuevas)} color={theme.colors.alert.green} />
            <MiniStat label="Con cambios" value={NUM.format(preview.filas_actualizadas)} color={theme.colors.gold} />
            <MiniStat label="Sin cambio" value={NUM.format(preview.filas_sin_cambio)} color={theme.colors.textSecondary} />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>
            Rango de fechas: {preview.fecha_desde?.slice(0, 10) ?? '—'} a {preview.fecha_hasta?.slice(0, 10) ?? '—'} ·
            Hojas procesadas: {preview.hojas_procesadas.join(', ') || '—'}
            {preview.hojas_omitidas.length > 0 && <> · Hojas omitidas (sin las columnas esperadas): {preview.hojas_omitidas.join(', ')}</>}
          </p>
          <button
            onClick={confirmar}
            disabled={confirmando || (preview.filas_nuevas === 0 && preview.filas_actualizadas === 0)}
            style={{
              background: theme.colors.gold, border: 'none', color: '#fff', padding: '9px 18px',
              borderRadius: '10px', cursor: confirmando ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 700, opacity: confirmando ? 0.6 : 1,
            }}
          >
            {confirmando ? 'Guardando…' : `Confirmar y guardar (${NUM.format(preview.filas_nuevas + preview.filas_actualizadas)} cambio(s))`}
          </button>
          {preview.filas_nuevas === 0 && preview.filas_actualizadas === 0 && (
            <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: theme.colors.textSecondary, fontStyle: 'italic' }}>
              Este archivo ya está completamente reflejado — no hay nada que confirmar.
            </p>
          )}
        </div>
      )}

      {resultado && (
        <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: '6px' }}>
            ✓ Carga guardada
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textSecondary }}>
            {NUM.format(resultado.filas_nuevas)} fila(s) nueva(s), {NUM.format(resultado.filas_actualizadas)} actualizada(s) —
            los reportes ya reflejan estos datos.
          </p>
        </div>
      )}
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '12px 14px', border: `1px solid ${theme.colors.border}` }}>
    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: color ?? theme.colors.textPrimary }}>{value}</div>
    <div style={{ fontSize: '0.7rem', color: theme.colors.textSecondary, marginTop: '2px' }}>{label}</div>
  </div>
);

// ── Tab: Estimación SEFIPLAN ─────────────────────────────────────

const TabEstimacion: React.FC = () => {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [meses, setMeses] = useState<MesEstimacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLoading(true); setGuardadoOk(false);
    getCargaEstimacion(anio)
      .then((r) => { if (!cancelado) setMeses(r.data.meses); })
      .catch((err: any) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [anio]);

  const actualizarMes = (mes: number, campo: 'estimado' | 'reportado_excel', valor: string) => {
    setMeses((prev) => prev.map((m) => m.mes === mes ? { ...m, [campo]: valor === '' ? null : Number(valor) } : m));
    setGuardadoOk(false);
  };

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      await putCargaEstimacion(anio, meses);
      setGuardadoOk(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '130px', padding: '6px 8px', borderRadius: '6px', border: `1px solid ${theme.colors.border}`,
    fontSize: '0.82rem', fontFamily: theme.font.family, textAlign: 'right',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '20px' }}>
        <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          "Estimado" lo entrega SEFIPLAN (normalmente una vez al año). "Reportado (Excel)" es lo que RPP reporta mes a
          mes en su propio concentrado — llega en momentos distintos, por eso son dos campos separados por mes.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, fontWeight: 600 }}>Ejercicio:</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem' }}>
            {[anio - 1, anio, anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {loading ? <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Mes</th>
                  <th style={{ ...th, textAlign: 'right' }}>Estimado (SEFIPLAN)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Reportado (Excel RPP)</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes}>
                    <td style={td}>{MES_NOMBRE[m.mes - 1]}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" value={m.estimado ?? ''} onChange={(e) => actualizarMes(m.mes, 'estimado', e.target.value)} style={inputStyle} placeholder="—" />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input type="number" value={m.reportado_excel ?? ''} onChange={(e) => actualizarMes(m.mes, 'reportado_excel', e.target.value)} style={inputStyle} placeholder="—" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p style={{ color: theme.colors.alert.red, fontSize: '0.82rem', marginTop: '10px' }}>{error}</p>}
        {guardadoOk && <p style={{ color: theme.colors.alert.green, fontSize: '0.82rem', marginTop: '10px', fontWeight: 700 }}>✓ Guardado</p>}

        <button
          onClick={guardar}
          disabled={guardando || loading}
          style={{
            marginTop: '14px', background: theme.colors.primary, border: 'none', color: '#fff', padding: '9px 20px',
            borderRadius: '10px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 700,
            opacity: guardando ? 0.6 : 1,
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
};

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700,
  color: '#7A7570', textTransform: 'uppercase', letterSpacing: '0.03em',
  borderBottom: `1px solid ${theme.colors.border}`,
};
const td: React.CSSProperties = { padding: '6px 10px', fontSize: '0.82rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };

// ── Tab: Integración SIQROO ──────────────────────────────────────

const TabSiqroo: React.FC = () => {
  const [config, setConfig] = useState<IntegracionSiqrooConfig | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [activo, setActivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    getIntegracionSiqroo()
      .then((r) => {
        setConfig(r.data);
        setApiBaseUrl(r.data.api_base_url ?? '');
        setActivo(r.data.activo);
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(cargar, []);

  const guardar = async () => {
    setGuardando(true); setError(null); setMensaje(null);
    try {
      await putIntegracionSiqroo({ api_base_url: apiBaseUrl || undefined, api_key: apiKey || undefined, activo });
      setApiKey('');
      setMensaje('Configuración guardada.');
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const sincronizarAhora = async () => {
    setSincronizando(true); setError(null); setMensaje(null);
    try {
      const r = await postSincronizarSiqroo();
      setMensaje(r.data.detalle);
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSincronizando(false);
    }
  };

  if (loading) return <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p>;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`,
    fontSize: '0.85rem', fontFamily: theme.font.family,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '20px' }}>
        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          Mientras el equipo de SIQROO termina su API, esta configuración puede quedar vacía o inactiva sin ningún
          problema — el botón "Sincronizar ahora" y el proceso mensual automático simplemente reportan "no
          configurado" y no hacen nada. En cuanto tengas la URL y la API key reales, se activa solo.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>URL base de la API</label>
            <input type="text" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.siqroo.gob.mx/v1" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: theme.colors.textSecondary, marginBottom: '4px' }}>
              API key {config?.api_key_configurada && <span style={{ fontWeight: 400 }}>— guardada, termina en ****{config.api_key_ultimos4}</span>}
            </label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config?.api_key_configurada ? 'Dejar vacío para no cambiarla' : 'Pegar la API key'} style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: theme.colors.textPrimary, cursor: 'pointer' }}>
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activar sincronización automática mensual
          </label>
        </div>

        {error && <p style={{ color: theme.colors.alert.red, fontSize: '0.82rem', marginTop: '12px' }}>{error}</p>}
        {mensaje && <p style={{ color: theme.colors.primaryDark, fontSize: '0.82rem', marginTop: '12px' }}>{mensaje}</p>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button onClick={guardar} disabled={guardando} style={{
            background: theme.colors.primary, border: 'none', color: '#fff', padding: '9px 20px',
            borderRadius: '10px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 700,
            opacity: guardando ? 0.6 : 1,
          }}>
            {guardando ? 'Guardando…' : 'Guardar configuración'}
          </button>
          <button onClick={sincronizarAhora} disabled={sincronizando} style={{
            background: theme.colors.gold, border: 'none', color: '#fff', padding: '9px 20px',
            borderRadius: '10px', cursor: sincronizando ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 700,
            opacity: sincronizando ? 0.6 : 1,
          }}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '20px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.colors.primaryDark, marginBottom: '10px' }}>Estado</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <MiniStat label="Activa" value={config?.activo ? 'Sí' : 'No'} color={config?.activo ? theme.colors.alert.green : theme.colors.textSecondary} />
          <MiniStat label="Última sincronización" value={config?.ultima_sincronizacion ? new Date(config.ultima_sincronizacion).toLocaleString('es-MX') : 'Nunca'} />
          <MiniStat
            label="Último resultado"
            value={config?.ultimo_estado === 'exitoso' ? 'Exitoso' : config?.ultimo_estado === 'error' ? 'Error' : '—'}
            color={config?.ultimo_estado === 'exitoso' ? theme.colors.alert.green : config?.ultimo_estado === 'error' ? theme.colors.alert.red : undefined}
          />
        </div>
        {config?.ultimo_detalle && (
          <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary }}>{config.ultimo_detalle}</p>
        )}
      </div>
    </div>
  );
};

// ── Tab: Bitácora ────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  satq_ingresos: 'Reportes SATQ',
  estimacion_sefiplan: 'Estimación SEFIPLAN',
  sync_siqroo: 'Sincronización SIQROO',
};

const TabBitacora: React.FC = () => {
  const [filas, setFilas] = useState<CargaDatosLogFila[]>([]);
  const [tipo, setTipo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    getCargaDatosLog({ tipo: tipo || undefined, page, limit: LIMIT })
      .then((r) => { if (!cancelado) { setFilas(r.data); setTotal(r.meta.total); } })
      .catch(() => {})
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [tipo, page]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: `1px solid ${theme.colors.border}`, padding: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, fontWeight: 600 }}>Tipo:</span>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }} style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, fontSize: '0.85rem' }}>
          <option value="">Todos</option>
          <option value="satq_ingresos">Reportes SATQ</option>
          <option value="estimacion_sefiplan">Estimación SEFIPLAN</option>
          <option value="sync_siqroo">Sincronización SIQROO</option>
        </select>
      </div>

      {loading ? <p style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Cargando…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Usuario</th>
                <th style={th}>Archivo</th>
                <th style={{ ...th, textAlign: 'right' }}>Nuevas</th>
                <th style={{ ...th, textAlign: 'right' }}>Actualizadas</th>
                <th style={th}>Estado</th>
                <th style={th}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }}>Sin registros</td></tr>
              ) : filas.map((f) => (
                <tr key={f.id}>
                  <td style={td}>{new Date(f.creado_en).toLocaleString('es-MX')}</td>
                  <td style={td}>{TIPO_LABEL[f.tipo] ?? f.tipo}</td>
                  <td style={td}>{f.usuario_nombre ?? '—'}</td>
                  <td style={td}>{f.archivo_nombre ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.filas_nuevas !== null ? NUM.format(f.filas_nuevas) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.filas_actualizadas !== null ? NUM.format(f.filas_actualizadas) : '—'}</td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700,
                      backgroundColor: f.estado === 'exitoso' ? '#D1FAE5' : '#FEE2E2',
                      color: f.estado === 'exitoso' ? '#065F46' : '#991B1B',
                    }}>
                      {f.estado === 'exitoso' ? 'Exitoso' : 'Error'}
                    </span>
                  </td>
                  <td style={{ ...td, maxWidth: '260px' }} title={f.detalle ?? undefined}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.detalle ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem' }}>← Anterior</button>
          <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Pág. {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem' }}>Siguiente →</button>
        </div>
      )}
    </div>
  );
};
