/**
 * View: Maquinas
 * File: src/frontend/views/Maquinas.tsx
 *
 * Migrado desde SID (src/app/views/pages/maquina/maquina.component.ts).
 * Catálogo operativo de máquinas por oficina registral: alta, edición, baja
 * y consulta de disponibilidad. Mismo contrato de datos que el legacy
 * (numero_maquina, oficina, libre), reconstruido con el theme y los
 * componentes base de PRISMA — sin Bootstrap, jQuery, DataTables ni SweetAlert.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icono } from '../components/Icono';
import { Modal } from '../components/Modal';
import { theme } from '../theme';
import { useDialogo } from '../context/DialogoContext';
import { getMaquinas, crearMaquina, editarMaquina, eliminarMaquina } from '../api';
import type { Maquina, MaquinaPayload } from '../types';

// Mismo catálogo de oficinas que el legacy (maquina.component.ts) — texto
// libre en la BD, pero capturado desde una lista cerrada para evitar
// variantes de escritura de la misma oficina.
const OFICINAS = ['Othón P. Blanco', 'Benito Juárez', 'Playa del Carmen', 'Cozumel'];

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

type EstadoFiltro = '' | 'Disponible' | 'Ocupada';

const FORM_VACIO: MaquinaPayload = { numero_maquina: '', oficina: '', libre: true };

// ── estilos ──────────────────────────────────────────────────────

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
  alignItems:   'center',
  gap:          '10px',
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

const inputSobreGuinda: React.CSSProperties = {
  ...input,
  background: 'rgba(255,255,255,0.1)',
  borderColor: 'rgba(255,255,255,0.35)',
  color:      theme.colors.white,
};

const filtroBtn = (activo: boolean): React.CSSProperties => ({
  display:      'inline-flex',
  alignItems:   'center',
  gap:          '6px',
  padding:      '7px 12px',
  borderRadius: '999px',
  fontSize:     '0.78rem',
  fontWeight:   600,
  fontFamily:   theme.font.family,
  cursor:       'pointer',
  border:       `1px solid ${activo ? theme.colors.white : 'rgba(255,255,255,0.35)'}`,
  background:   activo ? theme.colors.white : 'rgba(255,255,255,0.08)',
  color:        activo ? theme.colors.primary : theme.colors.white,
  whiteSpace:   'nowrap',
});

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
  display:         'inline-flex',
  alignItems:      'center',
  justifyContent:  'center',
  width:            30,
  height:           30,
  borderRadius:    theme.radius.sm,
  border:          `1px solid ${color}33`,
  background:      `${color}14`,
  color,
  cursor:          'pointer',
});

const th: React.CSSProperties = {
  textAlign:    'left',
  padding:      '10px 14px',
  fontSize:     '0.72rem',
  fontWeight:   700,
  letterSpacing:'0.04em',
  textTransform:'uppercase',
  color:        theme.colors.white,
  whiteSpace:   'nowrap',
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

const badgeEstado = (libre: boolean): React.CSSProperties => ({
  display:         'inline-flex',
  alignItems:      'center',
  padding:         '3px 10px',
  borderRadius:    '20px',
  fontSize:        '0.7rem',
  fontWeight:      700,
  fontFamily:      theme.font.family,
  letterSpacing:   '0.05em',
  textTransform:   'uppercase',
  backgroundColor: libre ? '#D1FAE5' : '#FEE2E2',
  color:           libre ? '#065F46' : '#991B1B',
  border:          `1px solid ${libre ? '#065F46' : '#991B1B'}22`,
});

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

// ── vista ────────────────────────────────────────────────────────

export const Maquinas: React.FC = () => {
  const dialogo = useDialogo();

  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [busqueda,     setBusqueda]     = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('');
  const [pagina,       setPagina]       = useState(1);
  const [tamPagina,    setTamPagina]    = useState(10);

  const [modalForma, setModalForma] = useState(false);
  const [editando,   setEditando]   = useState<Maquina | null>(null);
  const [form,        setForm]      = useState<MaquinaPayload>(FORM_VACIO);
  const [guardando,   setGuardando] = useState(false);

  const [detalle, setDetalle] = useState<Maquina | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    getMaquinas()
      .then((r) => { setMaquinas(r.data); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    let filas = maquinas;
    if (term) {
      filas = filas.filter((m) =>
        m.numero_maquina.toLowerCase().includes(term) ||
        m.oficina.toLowerCase().includes(term) ||
        String(m.id_maquina).includes(term),
      );
    }
    if (estadoFiltro) {
      filas = filas.filter((m) => (estadoFiltro === 'Disponible' ? m.libre : !m.libre));
    }
    return filas;
  }, [maquinas, busqueda, estadoFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const paginadas = filtradas.slice((paginaActual - 1) * tamPagina, paginaActual * tamPagina);

  const cambiarBusqueda = (v: string) => { setBusqueda(v); setPagina(1); };
  const cambiarFiltro    = (v: EstadoFiltro) => { setEstadoFiltro(v); setPagina(1); };
  const cambiarTamPagina = (v: number) => { setTamPagina(v); setPagina(1); };

  const abrirNueva = () => { setEditando(null); setForm(FORM_VACIO); setModalForma(true); };
  const abrirEditar = (m: Maquina) => {
    setEditando(m);
    setForm({ numero_maquina: m.numero_maquina, oficina: m.oficina, libre: m.libre });
    setModalForma(true);
  };

  const guardar = async () => {
    if (!form.numero_maquina.trim() || !form.oficina.trim()) {
      setError('Completa todos los campos.');
      return;
    }
    setGuardando(true);
    try {
      if (editando) {
        await editarMaquina(editando.id_maquina, form);
        await dialogo.avisar({ mensaje: 'Máquina actualizada.' });
      } else {
        await crearMaquina(form);
        await dialogo.avisar({ mensaje: 'Máquina creada.' });
      }
      setModalForma(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (m: Maquina) => {
    const ok = await dialogo.confirmar({
      titulo:    'Eliminar máquina',
      mensaje:   `Máquina #${m.numero_maquina} — Oficina: "${m.oficina}". Esta acción no se puede deshacer.`,
      confirmar: 'Sí, eliminar',
      peligro:   true,
    });
    if (!ok) return;
    try {
      await eliminarMaquina(m.id_maquina);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: theme.colors.primaryDark, fontFamily: theme.font.family, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="engranaje" size={22} color={theme.colors.primary} /> Máquinas
        </h1>
        <button style={btnPrimario} onClick={abrirNueva}>
          <Icono nombre="mas" size={16} /> Nueva Máquina
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }}
          onClick={() => setError(null)}
        >
          {error} <span style={{ opacity: 0.7 }}>(clic para cerrar)</span>
        </div>
      )}

      {/* Toolbar: búsqueda + filtro de estado + paginación */}
      <div style={toolbar}>
        <div style={{ flex: '1 1 260px', minWidth: '220px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icono nombre="buscar" size={16} color={theme.colors.white} />
          <input
            style={inputSobreGuinda}
            placeholder="Buscador (número, oficina)"
            value={busqueda}
            onChange={(e) => cambiarBusqueda(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button style={filtroBtn(estadoFiltro === '')} onClick={() => cambiarFiltro('')}>Todos</button>
          <button style={filtroBtn(estadoFiltro === 'Disponible')} onClick={() => cambiarFiltro('Disponible')}>Disponible</button>
          <button style={filtroBtn(estadoFiltro === 'Ocupada')} onClick={() => cambiarFiltro('Ocupada')}>Ocupada</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          <select
            value={tamPagina}
            onChange={(e) => cambiarTamPagina(Number(e.target.value))}
            style={{ ...inputSobreGuinda, width: 'auto', padding: '6px 8px' }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button style={btnIcono(theme.colors.white)} disabled={paginaActual === 1} onClick={() => setPagina(1)}>
              <Icono nombre="regresarIzq" size={14} color={theme.colors.white} />
            </button>
            <button style={btnIcono(theme.colors.white)} disabled={paginaActual === 1} onClick={() => setPagina((p) => p - 1)}>
              <Icono nombre="flechaIzq" size={14} color={theme.colors.white} />
            </button>
            <span style={{ color: theme.colors.white, fontSize: '0.8rem', fontWeight: 700, minWidth: '52px', textAlign: 'center' }}>
              {paginaActual} / {totalPaginas}
            </span>
            <button style={btnIcono(theme.colors.white)} disabled={paginaActual === totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              <Icono nombre="flechaDer" size={14} color={theme.colors.white} />
            </button>
            <button style={btnIcono(theme.colors.white)} disabled={paginaActual === totalPaginas} onClick={() => setPagina(totalPaginas)}>
              <Icono nombre="regresarDer" size={14} color={theme.colors.white} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={panel}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.primary }}>
                <th style={th}>ID</th>
                <th style={th}>Número</th>
                <th style={th}>Oficina</th>
                <th style={th}>Estado</th>
                <th style={th}>Fecha registro</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td style={td} colSpan={6}>Cargando…</td></tr>
              ) : paginadas.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={6}>No hay máquinas registradas.</td></tr>
              ) : (
                paginadas.map((m) => (
                  <tr key={m.id_maquina}>
                    <td style={{ ...td, fontWeight: 700 }}>{m.id_maquina}</td>
                    <td style={td}>{m.numero_maquina}</td>
                    <td style={td}>{m.oficina}</td>
                    <td style={td}><span style={badgeEstado(m.libre)}>{m.libre ? 'Disponible' : 'Ocupada'}</span></td>
                    <td style={{ ...td, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>{fmtFecha(m.fecha_registro)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button style={btnIcono(theme.colors.charcoal)} title="Ver" onClick={() => setDetalle(m)}>
                          <Icono nombre="ojo" size={15} />
                        </button>
                        <button style={btnIcono(theme.colors.gold)} title="Editar" onClick={() => abrirEditar(m)}>
                          <Icono nombre="editar" size={15} />
                        </button>
                        <button style={btnIcono(theme.colors.alert.red)} title="Eliminar" onClick={() => eliminar(m)}>
                          <Icono nombre="papelera" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}` }}>
          {filtradas.length === 0 ? 'Sin resultados' : `Mostrando ${(paginaActual - 1) * tamPagina + 1} - ${Math.min(paginaActual * tamPagina, filtradas.length)} de ${filtradas.length} máquinas`}
        </div>
      </div>

      {/* Modal: detalle */}
      <Modal open={!!detalle} title="Detalle de máquina" onClose={() => setDetalle(null)} width={420}>
        {detalle && (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: '10px' }}>
            <dt style={{ fontWeight: 700, color: theme.colors.textSecondary }}>ID:</dt>
            <dd style={{ margin: 0 }}>{detalle.id_maquina}</dd>
            <dt style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Número:</dt>
            <dd style={{ margin: 0 }}>{detalle.numero_maquina}</dd>
            <dt style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Oficina:</dt>
            <dd style={{ margin: 0 }}>{detalle.oficina}</dd>
            <dt style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Estado:</dt>
            <dd style={{ margin: 0 }}><span style={badgeEstado(detalle.libre)}>{detalle.libre ? 'Disponible' : 'Ocupada'}</span></dd>
            <dt style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Registro:</dt>
            <dd style={{ margin: 0 }}>{fmtFecha(detalle.fecha_registro)}</dd>
          </dl>
        )}
      </Modal>

      {/* Modal: alta / edición */}
      <Modal open={modalForma} title={editando ? 'Editar máquina' : 'Nueva máquina'} onClose={() => setModalForma(false)} width={440}>
        {campo('Número *', (
          <input
            style={input}
            value={form.numero_maquina}
            maxLength={50}
            onChange={(e) => setForm((f) => ({ ...f, numero_maquina: e.target.value }))}
          />
        ))}
        {campo('Oficina *', (
          <select
            style={input}
            value={form.oficina}
            onChange={(e) => setForm((f) => ({ ...f, oficina: e.target.value }))}
          >
            <option value="">Seleccione</option>
            {OFICINAS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {campo('Estado *', (
          <select
            style={input}
            value={form.libre ? 'true' : 'false'}
            onChange={(e) => setForm((f) => ({ ...f, libre: e.target.value === 'true' }))}
          >
            <option value="true">Disponible</option>
            <option value="false">Ocupada</option>
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
            onClick={guardar}
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

export default Maquinas;
