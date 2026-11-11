/**
 * View: VigilanciaConsultas ("/consultas/vigilancia")
 * File: src/frontend/views/VigilanciaConsultas.tsx
 *
 * Administración del Catálogo de Vigilancia sobre Consulta Pública SIQROO:
 * alta/edición/activación de sujetos vigilados, y el historial de alertas
 * que el matching automático (backend) va detectando.
 *
 * Reconstruida con el `theme` y los componentes base de PRISMA (`Modal`,
 * `Icono`) — mismo patrón visual que Consultas.tsx y Maquinas.tsx (toolbar
 * con degradado guinda, tabla con encabezado guinda, badges de estado) en vez
 * de un panel de administración genérico. Sin Bootstrap, jQuery, DataTables
 * ni SweetAlert.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import { useDialogo } from '../context/DialogoContext';
import {
  getSujetosVigilados, crearSujetoVigilado, editarSujetoVigilado, cambiarEstadoSujetoVigilado,
  getAlertasConsulta, marcarAlertaLeida,
} from '../api';
import type {
  SujetoVigilado, TipoSujetoVigilado, CrearSujetoVigiladoPayload,
  AlertaConsultaConDetalle,
} from '../types';

const TIPOS: TipoSujetoVigilado[] = ['PERSONA', 'EMPRESA'];

type FiltroActivo = '' | 'true' | 'false';
type FiltroLeido  = '' | 'true' | 'false';

const FORM_VACIO: CrearSujetoVigiladoPayload = { nombre_razon_social: '', tipo: 'PERSONA' };

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

// ── estilos — mismo patrón que Maquinas.tsx / Consultas.tsx ───────

const panel: React.CSSProperties = {
  background:   theme.colors.surface,
  borderRadius: theme.radius.lg,
  boxShadow:    theme.shadow.md,
  border:       `1px solid ${theme.colors.border}`,
  overflow:     'hidden',
};

const toolbar: React.CSSProperties = {
  background:   `linear-gradient(180deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 140%)`,
  borderRadius: theme.radius.lg,
  padding:      '14px 16px',
  marginBottom: '16px',
  boxShadow:    theme.shadow.md,
  display:      'flex',
  flexWrap:     'wrap',
  alignItems:   'flex-end',
  gap:          '12px',
};

const campoToolbar = (etiqueta: string, children: React.ReactNode, minWidth = '160px') => (
  <div style={{ minWidth, flex: '1 1 auto' }}>
    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: '4px' }}>
      {etiqueta}
    </label>
    {children}
  </div>
);

const inputSobreGuinda: React.CSSProperties = {
  border:       '1px solid rgba(255,255,255,0.35)',
  borderRadius: theme.radius.sm,
  padding:      '8px 10px',
  fontSize:     '0.85rem',
  fontFamily:   theme.font.family,
  color:        theme.colors.white,
  background:   'rgba(255,255,255,0.1)',
  width:        '100%',
  boxSizing:    'border-box',
};

const input: React.CSSProperties = {
  border:       `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding:      '8px 10px',
  fontSize:     '0.85rem',
  fontFamily:   theme.font.family,
  color:        theme.colors.textPrimary,
  width:        '100%',
  boxSizing:    'border-box',
};

const btnPrimario: React.CSSProperties = {
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '6px',
  padding:      '9px 16px',
  borderRadius: theme.radius.sm,
  border:       'none',
  background:   theme.colors.primary,
  color:        theme.colors.white,
  fontWeight:   700,
  fontSize:     '0.85rem',
  fontFamily:   theme.font.family,
  cursor:       'pointer',
};

const btnIcono = (color: string): React.CSSProperties => ({
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  width:          30,
  height:         30,
  borderRadius:   theme.radius.sm,
  border:         `1px solid ${color}33`,
  background:     `${color}14`,
  color,
  cursor:         'pointer',
});

const th: React.CSSProperties = {
  textAlign:     'left',
  padding:       '10px 14px',
  fontSize:      '0.72rem',
  fontWeight:    700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color:         theme.colors.white,
  whiteSpace:    'nowrap',
};

const td: React.CSSProperties = {
  padding:      '10px 14px',
  fontSize:     '0.85rem',
  color:        theme.colors.textPrimary,
  borderBottom: `1px solid ${theme.colors.border}`,
};

const label: React.CSSProperties = {
  display:      'block',
  fontSize:     '0.78rem',
  fontWeight:   700,
  color:        theme.colors.textPrimary,
  marginBottom: '4px',
};

const campo = (etiqueta: string, children: React.ReactNode) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={label}>{etiqueta}</label>
    {children}
  </div>
);

const badgePill = (bg: string, color: string): React.CSSProperties => ({
  display:       'inline-flex',
  alignItems:    'center',
  padding:       '3px 10px',
  borderRadius:  '20px',
  fontSize:      '0.7rem',
  fontWeight:    700,
  fontFamily:    theme.font.family,
  letterSpacing: '0.02em',
  backgroundColor: bg,
  color,
  border:        `1px solid ${color}22`,
});

const badgeTipo = (tipo: TipoSujetoVigilado): React.CSSProperties =>
  tipo === 'PERSONA' ? badgePill('#DBEAFE', '#1E40AF') : badgePill('#FEF3C7', '#92400E');

const badgeActivo = (activo: boolean): React.CSSProperties =>
  activo ? badgePill('#D1FAE5', '#065F46') : badgePill('#EDE9E4', theme.colors.textSecondary);

const badgeLeido = (leido: boolean): React.CSSProperties =>
  leido ? badgePill('#EDE9E4', theme.colors.textSecondary) : badgePill('#FDE8EF', theme.colors.primary);

const seccionHeader: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  justifyContent: 'space-between',
  flexWrap:     'wrap',
  gap:          '10px',
  marginBottom: '10px',
};

// ── vista ────────────────────────────────────────────────────────

export const VigilanciaConsultas: React.FC = () => {
  const navigate = useNavigate();
  const dialogo  = useDialogo();

  // ── Catálogo de sujetos vigilados ──────────────────────────────
  const [sujetos,   setSujetos]   = useState<SujetoVigilado[]>([]);
  const [cargandoSujetos, setCargandoSujetos] = useState(true);
  const [errorSujetos, setErrorSujetos] = useState<string | null>(null);

  const [busquedaSujeto, setBusquedaSujeto] = useState('');
  const [filtroTipo,     setFiltroTipo]     = useState<TipoSujetoVigilado | ''>('');
  const [filtroActivo,   setFiltroActivo]   = useState<FiltroActivo>('');

  const [modalForma, setModalForma] = useState(false);
  const [editando,   setEditando]   = useState<SujetoVigilado | null>(null);
  const [form,       setForm]       = useState<CrearSujetoVigiladoPayload>(FORM_VACIO);
  const [guardando,  setGuardando]  = useState(false);

  const cargarSujetos = useCallback(() => {
    setCargandoSujetos(true);
    getSujetosVigilados({
      search: busquedaSujeto.trim() || undefined,
      tipo:   filtroTipo || undefined,
      activo: filtroActivo === '' ? undefined : filtroActivo === 'true',
    })
      .then((r) => { setSujetos(r.data); setErrorSujetos(null); })
      .catch((e: Error) => setErrorSujetos(e.message))
      .finally(() => setCargandoSujetos(false));
  }, [busquedaSujeto, filtroTipo, filtroActivo]);

  useEffect(() => {
    const timer = setTimeout(cargarSujetos, 300);
    return () => clearTimeout(timer);
  }, [cargarSujetos]);

  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setModalForma(true); };
  const abrirEditar = (s: SujetoVigilado) => {
    setEditando(s);
    setForm({ nombre_razon_social: s.nombre_razon_social, tipo: s.tipo });
    setModalForma(true);
  };

  const guardarSujeto = async () => {
    if (!form.nombre_razon_social.trim()) { setErrorSujetos('El nombre/razón social es requerido.'); return; }
    setGuardando(true);
    try {
      if (editando) {
        await editarSujetoVigilado(editando.id, form);
        await dialogo.avisar({ mensaje: 'Sujeto vigilado actualizado.' });
      } else {
        await crearSujetoVigilado(form);
        await dialogo.avisar({ mensaje: 'Sujeto vigilado creado.' });
      }
      setModalForma(false);
      cargarSujetos();
    } catch (e) {
      setErrorSujetos((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (s: SujetoVigilado) => {
    const ok = await dialogo.confirmar({
      titulo:    s.activo ? 'Desactivar sujeto' : 'Activar sujeto',
      mensaje:   `"${s.nombre_razon_social}" — ${s.activo ? 'dejará de generar alertas nuevas.' : 'volverá a generar alertas al coincidir con una búsqueda.'}`,
      confirmar: s.activo ? 'Sí, desactivar' : 'Sí, activar',
      peligro:   s.activo,
    });
    if (!ok) return;
    try {
      await cambiarEstadoSujetoVigilado(s.id, !s.activo);
      cargarSujetos();
    } catch (e) {
      setErrorSujetos((e as Error).message);
    }
  };

  // ── Alertas detectadas ──────────────────────────────────────────
  const [alertas,  setAlertas]  = useState<AlertaConsultaConDetalle[]>([]);
  const [cargandoAlertas, setCargandoAlertas] = useState(true);
  const [errorAlertas, setErrorAlertas] = useState<string | null>(null);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sujetoFiltroId, setSujetoFiltroId] = useState<string>('');
  const [filtroLeido, setFiltroLeido] = useState<FiltroLeido>('');
  const [paginaAlertas, setPaginaAlertas] = useState(1);
  const [totalAlertas, setTotalAlertas] = useState(0);
  const [lastPageAlertas, setLastPageAlertas] = useState(1);

  const cargarAlertas = useCallback(() => {
    setCargandoAlertas(true);
    getAlertasConsulta({
      desde:              desde || undefined,
      hasta:              hasta || undefined,
      sujeto_vigilado_id: sujetoFiltroId ? Number(sujetoFiltroId) : undefined,
      leido:              filtroLeido === '' ? undefined : filtroLeido === 'true',
      page:               paginaAlertas,
      per_page:           20,
    })
      .then((r) => {
        setAlertas(r.data);
        setTotalAlertas(r.meta.total);
        setLastPageAlertas(r.meta.last_page);
        setErrorAlertas(null);
      })
      .catch((e: Error) => setErrorAlertas(e.message))
      .finally(() => setCargandoAlertas(false));
  }, [desde, hasta, sujetoFiltroId, filtroLeido, paginaAlertas]);

  useEffect(() => { cargarAlertas(); }, [cargarAlertas]);

  const marcarLeida = async (a: AlertaConsultaConDetalle, leido: boolean) => {
    try {
      await marcarAlertaLeida(a.id, leido);
      cargarAlertas();
    } catch (e) {
      setErrorAlertas((e as Error).message);
    }
  };

  const noLeidas = useMemo(() => alertas.filter((a) => !a.leido).length, [alertas]);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: theme.font.family }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => navigate('/consultas')}
          style={{ background: 'none', border: 'none', color: theme.colors.textSecondary, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '6px', fontFamily: theme.font.family }}
        >
          ← Histórico de Consultas
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: theme.colors.primaryDark, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icono nombre="candado" size={22} color={theme.colors.primary} /> Catálogo de Vigilancia
          </h1>
          <button style={btnPrimario} onClick={abrirNuevo}>
            <Icono nombre="mas" size={16} /> Nuevo sujeto
          </button>
        </div>
        <p style={{ margin: '4px 0 0', color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
          Sujetos de interés y alertas detectadas en Consulta Pública SIQROO.
        </p>
      </div>

      {/* ── Catálogo ──────────────────────────────────────────── */}
      <div style={seccionHeader}>
        <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: theme.colors.textPrimary }}>Sujetos vigilados</h2>
      </div>

      <div style={toolbar}>
        {campoToolbar('Buscar', (
          <input
            style={inputSobreGuinda}
            value={busquedaSujeto}
            onChange={(e) => setBusquedaSujeto(e.target.value)}
            placeholder="Nombre o razón social…"
          />
        ), '220px')}
        {campoToolbar('Tipo', (
          <select style={inputSobreGuinda} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoSujetoVigilado | '')}>
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t === 'PERSONA' ? 'Persona' : 'Empresa'}</option>)}
          </select>
        ), '140px')}
        {campoToolbar('Estado', (
          <select style={inputSobreGuinda} value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value as FiltroActivo)}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        ), '140px')}
      </div>

      {errorSujetos && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => setErrorSujetos(null)}>
          {errorSujetos} <span style={{ opacity: 0.7 }}>(clic para cerrar)</span>
        </div>
      )}

      <div style={{ ...panel, marginBottom: '28px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.primary }}>
                <th style={th}>Nombre / Razón social</th>
                <th style={th}>Tipo</th>
                <th style={th}>Estado</th>
                <th style={th}>Creado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoSujetos ? (
                <tr><td style={td} colSpan={5}>Cargando…</td></tr>
              ) : sujetos.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={5}>Sin sujetos en el catálogo.</td></tr>
              ) : (
                sujetos.map((s) => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{s.nombre_razon_social}</td>
                    <td style={td}><span style={badgeTipo(s.tipo)}>{s.tipo === 'PERSONA' ? 'Persona' : 'Empresa'}</span></td>
                    <td style={td}><span style={badgeActivo(s.activo)}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td style={{ ...td, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>{fmtFecha(s.fecha_creacion)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button style={btnIcono(theme.colors.gold)} title="Editar" onClick={() => abrirEditar(s)}>
                          <Icono nombre="editar" size={15} />
                        </button>
                        <button
                          style={btnIcono(s.activo ? theme.colors.alert.red : theme.colors.alert.green)}
                          title={s.activo ? 'Desactivar' : 'Activar'}
                          onClick={() => alternarActivo(s)}
                        >
                          <Icono nombre={s.activo ? 'tache' : 'check'} size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Alertas detectadas ────────────────────────────────── */}
      <div style={seccionHeader}>
        <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: theme.colors.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="alerta" size={16} color={theme.colors.primary} />
          Alertas Detectadas
          {noLeidas > 0 && <span style={badgePill(theme.colors.primary, theme.colors.white)}>{noLeidas} sin leer</span>}
        </h2>
        <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>{totalAlertas} alerta{totalAlertas === 1 ? '' : 's'} en total</span>
      </div>

      <div style={toolbar}>
        {campoToolbar('Desde', (
          <input type="date" style={inputSobreGuinda} value={desde} onChange={(e) => { setDesde(e.target.value); setPaginaAlertas(1); }} />
        ), '150px')}
        {campoToolbar('Hasta', (
          <input type="date" style={inputSobreGuinda} value={hasta} onChange={(e) => { setHasta(e.target.value); setPaginaAlertas(1); }} />
        ), '150px')}
        {campoToolbar('Sujeto', (
          <select style={inputSobreGuinda} value={sujetoFiltroId} onChange={(e) => { setSujetoFiltroId(e.target.value); setPaginaAlertas(1); }}>
            <option value="">Todos</option>
            {sujetos.map((s) => <option key={s.id} value={s.id}>{s.nombre_razon_social}</option>)}
          </select>
        ), '200px')}
        {campoToolbar('Estado', (
          <select style={inputSobreGuinda} value={filtroLeido} onChange={(e) => { setFiltroLeido(e.target.value as FiltroLeido); setPaginaAlertas(1); }}>
            <option value="">Todas</option>
            <option value="false">No leídas</option>
            <option value="true">Leídas</option>
          </select>
        ), '140px')}
      </div>

      {errorAlertas && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => setErrorAlertas(null)}>
          {errorAlertas} <span style={{ opacity: 0.7 }}>(clic para cerrar)</span>
        </div>
      )}

      <div style={panel}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.primary }}>
                <th style={th}>Fecha</th>
                <th style={th}>Sujeto</th>
                <th style={th}>Consulta</th>
                <th style={th}>Código</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargandoAlertas ? (
                <tr><td style={td} colSpan={6}>Cargando…</td></tr>
              ) : alertas.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={6}>Sin alertas para los filtros seleccionados.</td></tr>
              ) : (
                alertas.map((a) => (
                  <tr key={a.id} style={a.leido ? undefined : { backgroundColor: '#FDE8EF55' }}>
                    <td style={{ ...td, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>{fmtFecha(a.fecha_alerta)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{a.sujeto_nombre_razon_social}</td>
                    <td style={td}>{a.consulta_nombre_completo}</td>
                    <td style={td}><span style={badgePill(theme.colors.background, theme.colors.textSecondary)}>{a.consulta_codigo_acceso}</span></td>
                    <td style={td}><span style={badgeLeido(a.leido)}>{a.leido ? 'Leída' : 'No leída'}</span></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={() => marcarLeida(a, !a.leido)}
                        style={{ ...btnIcono(theme.colors.charcoal), width: 'auto', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, fontFamily: theme.font.family }}
                      >
                        {a.leido ? 'Marcar no leída' : 'Marcar leída'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '10px 14px', fontSize: '0.78rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}` }}>
          <span>Página {paginaAlertas} de {lastPageAlertas}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              disabled={paginaAlertas === 1}
              onClick={() => setPaginaAlertas((p) => p - 1)}
              style={{ ...btnIcono(theme.colors.primary), width: 'auto', padding: '0 12px', fontSize: '0.75rem', fontWeight: 700, fontFamily: theme.font.family, opacity: paginaAlertas === 1 ? 0.4 : 1 }}
            >
              Anterior
            </button>
            <button
              disabled={paginaAlertas === lastPageAlertas}
              onClick={() => setPaginaAlertas((p) => p + 1)}
              style={{ ...btnIcono(theme.colors.primary), width: 'auto', padding: '0 12px', fontSize: '0.75rem', fontWeight: 700, fontFamily: theme.font.family, opacity: paginaAlertas === lastPageAlertas ? 0.4 : 1 }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal: alta / edición de sujeto vigilado ────────────── */}
      <Modal open={modalForma} title={editando ? 'Editar sujeto vigilado' : 'Nuevo sujeto vigilado'} onClose={() => setModalForma(false)} width={440}>
        {campo('Nombre / Razón social *', (
          <input
            style={input}
            value={form.nombre_razon_social}
            maxLength={255}
            onChange={(e) => setForm((f) => ({ ...f, nombre_razon_social: e.target.value }))}
          />
        ))}
        {campo('Tipo *', (
          <select
            style={input}
            value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoSujetoVigilado }))}
          >
            {TIPOS.map((t) => <option key={t} value={t}>{t === 'PERSONA' ? 'Persona' : 'Empresa'}</option>)}
          </select>
        ))}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button
            style={{ ...btnPrimario, background: theme.colors.charcoal }}
            onClick={() => setModalForma(false)}
            type="button"
          >
            Cancelar
          </button>
          <button
            style={{ ...btnPrimario, opacity: guardando ? 0.7 : 1 }}
            onClick={guardarSujeto}
            disabled={guardando}
            type="button"
          >
            {guardando ? 'Guardando…' : editando ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default VigilanciaConsultas;
