/**
 * ResumenEvento — vista de resumen completo de un evento.
 * File: src/frontend/components/ResumenEvento.tsx
 *
 * Modal que muestra de un vistazo cómo va el evento: avance, contadores,
 * fechas, compromisos, participantes y todas las actividades con su estado.
 * Carga el detalle por su cuenta a partir del resumen recibido.
 */

import React, { useState, useEffect } from 'react';
import { Icono } from './Icono';
import { theme } from '../theme';
import type { EventoResumen, EventoDetalle, EstadoTarea } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatFecha(iso: string | null | undefined, conHora = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const base = `${dd}/${mm}/${d.getFullYear()}`;
  if (!conHora) return base;
  return `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ESTADO_TAREA_CFG: Record<string, { bg: string; text: string; label: string }> = {
  PENDIENTE:      { bg: '#FEF3C7', text: '#92400E', label: 'Pendiente'      },
  EN_PROGRESO:    { bg: '#EFEDEA', text: '#3D3935', label: 'En Progreso'    },
  EN_REVISION:    { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión'    },
  EN_REVISION_DG: { bg: '#FDE8EF', text: '#8A0730', label: 'En Revisión DG' },
  DEVUELTO:       { bg: '#FEE2E2', text: '#991B1B', label: 'Devuelto'       },
  DEVUELTO_DG:    { bg: '#FFEDD5', text: '#9A3412', label: 'Devuelto por DG' },
  COMPLETADA:     { bg: '#D1FAE5', text: '#065F46', label: 'Completada'     },
  FINALIZADO:     { bg: '#D1FAE5', text: '#065F46', label: 'Finalizado'     },
};

interface DirectorOpcion { id: number; nombre: string; oficina_nombre?: string }

interface Props {
  resumen: EventoResumen;
  onClose: () => void;
  /** Gestión de participantes y responsable desde el modal, en eventos abiertos:
   *  la DG en los suyos, el director de área en el que él creó. */
  puedeGestionar?:  boolean;
  directoresArea?:  DirectorOpcion[];
  /** De quién es el evento. Cambia cómo se nombra a la gente: en la Dirección
   *  General los participantes son titulares de área; en el evento de un
   *  director son su equipo. */
  ambito?: 'DIRECCION_GENERAL' | 'AREA';
  /** Se dispara al agregar participante o cambiar responsable, para que la
   *  vista padre refresque su detalle (p. ej. el selector de "Asignar a"). */
  onCambio?: () => void;
}

export const ResumenEvento: React.FC<Props> = ({ resumen, onClose, puedeGestionar = false, directoresArea = [], ambito = 'DIRECCION_GENERAL', onCambio }) => {
  const esAmbitoArea = ambito === 'AREA';
  const [detalle, setDetalle] = useState<EventoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [nuevoParticipante, setNuevoParticipante] = useState<number | ''>('');
  const [agregando, setAgregando] = useState(false);
  const [errorPart, setErrorPart] = useState<string | null>(null);

  const cargar = () => {
    setLoading(true);
    fetch(`${BASE}/eventos/${resumen.id}`, { headers: { ...authHeaders() } })
      .then((r) => r.json())
      .then((j) => setDetalle(j.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [resumen.id]);

  const agregarParticipante = async () => {
    if (!nuevoParticipante) return;
    setAgregando(true);
    setErrorPart(null);
    try {
      const res = await fetch(`${BASE}/eventos/${resumen.id}/directores`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ director_id: Number(nuevoParticipante) }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message ?? `HTTP ${res.status}`);
      }
      setNuevoParticipante('');
      cargar();
      onCambio?.();   // el padre refresca su detalle (selector "Asignar a", etc.)
    } catch (err: any) {
      setErrorPart(err.message);
    } finally {
      setAgregando(false);
    }
  };

  const cambiarResponsable = async (responsableId: number | null) => {
    setErrorPart(null);
    try {
      const res = await fetch(`${BASE}/eventos/${resumen.id}/responsable`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable_id: responsableId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message ?? `HTTP ${res.status}`);
      }
      cargar();
      onCambio?.();
    } catch (err: any) {
      setErrorPart(err.message);
    }
  };

  const total = resumen.total_tareas || 0;
  const pct   = total ? Math.round((resumen.tareas_completada / total) * 100) : 0;

  const stats = [
    { label: 'Finalizadas', valor: resumen.tareas_completada,  bg: '#D1FAE5', text: '#065F46' },
    { label: 'En progreso', valor: resumen.tareas_en_progreso, bg: '#EFEDEA', text: '#3D3935' },
    { label: 'Pendientes',  valor: resumen.tareas_pendiente,   bg: '#FEF3C7', text: '#92400E' },
    { label: 'Vencidas',    valor: resumen.tareas_vencidas,    bg: '#FEE2E2', text: '#991B1B' },
    { label: 'Por vencer',  valor: resumen.tareas_proximas,    bg: '#FFEDD5', text: '#9A3412' },
  ];

  const responsableId = detalle?.responsable_id ?? resumen.responsable_id ?? null;

  return (
    <div
      role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', fontFamily: theme.font.family }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${theme.colors.border}` }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: theme.colors.textPrimary }}>{resumen.titulo}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: resumen.estado === 'ABIERTO' ? '#D1FAE5' : '#EDE9E4', color: resumen.estado === 'ABIERTO' ? '#065F46' : '#3D3935', textTransform: 'uppercase' }}>
                {resumen.estado === 'ABIERTO' ? '● Abierto' : '● Cerrado'}
              </span>
              {resumen.fecha_programada && (
                <span style={{ fontSize: '0.75rem', color: theme.colors.primary, fontWeight: 600 }}><Icono nombre="calendario" inline />Fecha límite: {resumen.fecha_programada}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: theme.colors.textSecondary, flexShrink: 0, marginLeft: '12px' }}>×</button>
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 22px' }}>

          {resumen.descripcion && (
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: theme.colors.textPrimary, lineHeight: 1.5, backgroundColor: '#F9FAFB', padding: '10px 12px', borderRadius: '8px' }}>{resumen.descripcion}</p>
          )}

          {/* Avance */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avance del evento</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: theme.colors.textPrimary }}>{pct}% <span style={{ fontSize: '0.72rem', fontWeight: 500, color: theme.colors.textSecondary }}>({resumen.tareas_completada}/{total} finalizadas)</span></span>
            </div>
            <div style={{ height: '10px', backgroundColor: theme.colors.border, borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.colors.alert.green, transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Contadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px', marginBottom: '20px' }}>
            {stats.map((s) => (
              <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.text, lineHeight: 1 }}>{s.valor}</div>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: s.text, textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Fechas */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '0.8rem', color: theme.colors.textSecondary, marginBottom: '20px' }}>
            <span><Icono nombre="calendario" inline />Creado: <strong style={{ color: theme.colors.textPrimary }}>{formatFecha(resumen.fecha_creacion)}</strong></span>
            <span><Icono nombre="calendario" inline />Fecha límite: <strong style={{ color: theme.colors.textPrimary }}>{resumen.fecha_programada || '—'}</strong></span>
            {resumen.fecha_cierre && <span><Icono nombre="candado" inline />Cerrado: <strong style={{ color: theme.colors.textPrimary }}>{formatFecha(resumen.fecha_cierre)}</strong></span>}
          </div>

          {/* Cierre del evento — justificación, quién y cuándo */}
          {(resumen.estado === 'CERRADO' || detalle?.fecha_cierre) && (
            <div style={{ marginBottom: '20px', padding: '12px 14px', backgroundColor: '#F9FAFB', border: `1px solid ${theme.colors.border}`, borderLeft: '4px solid #374151', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}><Icono nombre="candado" inline />Cierre del evento</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.78rem', color: theme.colors.textSecondary, marginBottom: '6px' }}>
                <span>Cerrado por: <strong style={{ color: theme.colors.textPrimary }}>{detalle?.cerrado_por_nombre ?? '—'}</strong></span>
                <span>Fecha y hora: <strong style={{ color: theme.colors.textPrimary }}>{formatFecha(detalle?.fecha_cierre ?? resumen.fecha_cierre, true)}</strong></span>
              </div>
              <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>
                Justificación:
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: theme.colors.textPrimary, lineHeight: 1.5, fontStyle: detalle?.justificacion_cierre ? 'normal' : 'italic' }}>
                  {detalle?.justificacion_cierre || 'Sin justificación registrada.'}
                </p>
              </div>
            </div>
          )}

          {/* Participantes */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Participantes</p>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>Cargando…</p>
            ) : (detalle?.directores_participantes ?? []).length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>Sin participantes.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(detalle?.directores_participantes ?? []).map((p) => {
                  const esResp = p.id === responsableId;
                  return (
                    <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: esResp ? '#FDE8EF' : '#F3F4F6', color: esResp ? '#8A0730' : theme.colors.textPrimary, border: esResp ? '1px solid #F2C9D6' : `1px solid ${theme.colors.border}` }}>
                      <Icono nombre={esResp ? 'etiqueta' : 'persona'} size={12} />{p.nombre}{esResp ? ' · Responsable' : ''}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Cambiar el director responsable — solo aquí, dentro del Abrir */}
            {puedeGestionar && resumen.estado !== 'CERRADO' && (
              <div style={{ marginTop: '12px', padding: '10px 12px', backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8A0730' }}><Icono nombre="persona" inline />{esAmbitoArea ? 'Responsable del evento:' : 'Director responsable:'}</span>
                <select
                  value={responsableId ?? ''}
                  onChange={(e) => cambiarResponsable(e.target.value ? Number(e.target.value) : null)}
                  disabled={loading}
                  style={{ padding: '6px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.8rem', fontFamily: theme.font.family, minWidth: '220px' }}
                >
                  <option value="">— Sin responsable designado —</option>
                  {(detalle?.directores_participantes ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                {(detalle?.directores_participantes ?? []).length === 0 && (
                  <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>Incorpora participantes primero.</span>
                )}
              </div>
            )}

            {/* Incorporar un nuevo director participante — solo aquí, dentro del Abrir */}
            {puedeGestionar && resumen.estado !== 'CERRADO' && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={nuevoParticipante}
                    onChange={(e) => setNuevoParticipante(e.target.value ? Number(e.target.value) : '')}
                    disabled={agregando}
                    style={{ padding: '6px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.8rem', fontFamily: theme.font.family, minWidth: '220px' }}
                  >
                    <option value="">{esAmbitoArea ? '— Incorporar a alguien de mi equipo… —' : '— Incorporar otro director… —'}</option>
                    {directoresArea
                      .filter((d) => !(detalle?.directores_participantes ?? []).some((p) => p.id === d.id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.nombre}{d.oficina_nombre ? ` · ${d.oficina_nombre}` : ''}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={agregarParticipante}
                    disabled={!nuevoParticipante || agregando}
                    style={{ padding: '7px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: (!nuevoParticipante || agregando) ? 'not-allowed' : 'pointer', opacity: (!nuevoParticipante || agregando) ? 0.5 : 1, fontFamily: theme.font.family }}
                  >
                    {agregando ? 'Agregando…' : 'Incorporar'}
                  </button>
                </div>
                {errorPart && <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{errorPart}</p>}
                <p style={{ margin: 0, fontSize: '0.7rem', color: theme.colors.textSecondary }}>
                  {esAmbitoArea
                    ? 'Puedes sumar a alguien de tu equipo aunque el evento ya tenga actividades.'
                    : 'Puedes sumar a otro director al evento aunque ya tenga actividades.'}
                </p>
              </div>
            )}
          </div>

          {/* Actividades */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Actividades {detalle ? `(${detalle.tareas.length})` : ''}
            </p>
            {loading ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>Cargando actividades…</p>
            ) : (detalle?.tareas ?? []).length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textSecondary }}>Este evento aún no tiene actividades.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(detalle?.tareas ?? []).map((t) => {
                  const cfg = ESTADO_TAREA_CFG[t.estado] ?? ESTADO_TAREA_CFG.PENDIENTE;
                  return (
                    <div key={t.id} style={{ border: `1px solid ${theme.colors.border}`, borderLeft: `3px solid ${t.vencida ? theme.colors.alert.red : cfg.text}`, borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: theme.colors.textPrimary }}>{t.titulo}</span>
                        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: '20px', fontSize: '0.64rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' }}>{cfg.label}</span>
                        {t.vencida && <span style={{ fontSize: '0.64rem', fontWeight: 700, color: theme.colors.alert.red, backgroundColor: '#FEE2E2', padding: '2px 8px', borderRadius: '20px' }}><Icono nombre="alerta" inline />Vencida</span>}
                        {!t.vencida && t.proxima_a_vencer && <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#9A3412', backgroundColor: '#FFEDD5', padding: '2px 8px', borderRadius: '20px' }}><Icono nombre="reloj" inline />Por vencer</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.74rem', color: theme.colors.textSecondary }}>
                        <span><Icono nombre="persona" inline />{t.reasignado_a_nombre || t.asignado_a_nombre}</span>
                        {t.fecha_programada
                          ? <span><Icono nombre="calendario" inline />Programada: {t.fecha_programada}</span>
                          : <span style={{ fontStyle: 'italic' }}>Sin fecha límite</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 18px', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 20px', backgroundColor: '#fff', color: theme.colors.primary, border: `1px solid ${theme.colors.primary}`, borderRadius: '7px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: theme.font.family }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};
