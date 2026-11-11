/**
 * SeguimientoTarea — línea temporal unificada de una tarea de evento.
 * File: src/frontend/components/SeguimientoTarea.tsx
 *
 * Fusiona el historial (avances / devoluciones / aprobaciones) con los
 * comentarios (mensajes) en UNA sola línea temporal ordenada por fecha, con
 * una marca distintiva por tipo — el COMENTARIO se distingue en morado.
 *
 * Componente autocontenido: carga sus propios datos a partir de eventoId/tareaId.
 * Se usa en todas las vistas (directores, operativos y revisión de equipo) para
 * que el seguimiento se vea idéntico en todos los roles.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icono } from './Icono';
import type { NombreIcono } from './Icono';
import { theme } from '../theme';
import type { RegistroHistorial } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

interface Comentario {
  id:           number;
  tarea_id:     number;
  contenido:    string;
  creado_en:    string;
  autor_id:     number;
  autor_nombre: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

type TimelineTipo = 'AVANCE' | 'DEVOLUCION' | 'APROBACION_N1' | 'APROBACION_N2' | 'REASIGNACION' | 'COMENTARIO';

interface TimelineItem {
  key:           string;
  tipo:          TimelineTipo;
  autor_nombre:  string;
  creado_en:     string;
  contenido:     string | null;
  documento_url: string | null;
}

// Config visual por tipo — el COMENTARIO se distingue en morado
const TIMELINE_CFG: Record<TimelineTipo, { label: string; icon: NombreIcono; dot: string; bg: string; text: string }> = {
  AVANCE:        { label: 'Avance',            icon: 'subir', dot: '#3D3935', bg: '#EFEDEA', text: '#3D3935' },
  DEVOLUCION:    { label: 'Devolución',        icon: 'regresarIzq',  dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  APROBACION_N1: { label: 'Aprobación (área)', icon: 'check',  dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  APROBACION_N2: { label: 'Aprobación (DG)',   icon: 'checkCirculo', dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  REASIGNACION:  { label: 'Delegación',        icon: 'personas', dot: '#B68400', bg: '#FBF3DF', text: '#7A5A00' },
  COMENTARIO:    { label: 'Comentario',        icon: 'comentario', dot: '#AB0A3D', bg: '#FDE8EF', text: '#8A0730' },
};

interface Props {
  eventoId:      number;
  tareaId:       number;
  puedeEscribir: boolean;
}

export const SeguimientoTarea: React.FC<Props> = ({ eventoId, tareaId, puedeEscribir }) => {
  const [registros,   setRegistros]   = useState<RegistroHistorial[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviando,        setEnviando]        = useState(false);
  const [envioError,      setEnvioError]      = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, c] = await Promise.all([
        apiFetch<{ data: RegistroHistorial[] }>(`/eventos/${eventoId}/tareas/${tareaId}/historial`),
        apiFetch<{ data: Comentario[] }>(`/eventos/${eventoId}/tareas/${tareaId}/comentarios`).catch(() => ({ data: [] as Comentario[] })),
      ]);
      setRegistros(h.data);
      setComentarios(c.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventoId, tareaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    if (!nuevoComentario.trim()) return;
    setEnviando(true);
    setEnvioError(null);
    try {
      const res = await apiFetch<{ data: Comentario }>(
        `/eventos/${eventoId}/tareas/${tareaId}/comentarios`,
        { method: 'POST', body: JSON.stringify({ contenido: nuevoComentario.trim() }) },
      );
      setComentarios((prev) => [...prev, res.data]);
      setNuevoComentario('');
    } catch (err: any) { setEnvioError(err.message); }
    finally { setEnviando(false); }
  };

  // Fusión cronológica (más antiguo → más reciente)
  const items: TimelineItem[] = [
    ...registros.map((r) => ({
      key: `h${r.id}`, tipo: r.tipo as TimelineTipo, autor_nombre: r.autor_nombre,
      creado_en: r.creado_en, contenido: r.contenido, documento_url: r.documento_url,
    })),
    ...comentarios.map((c) => ({
      key: `c${c.id}`, tipo: 'COMENTARIO' as TimelineTipo, autor_nombre: c.autor_nombre,
      creado_en: c.creado_en, contenido: c.contenido, documento_url: null,
    })),
  ].sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime());

  return (
    <div>
      {loading && (
        <div style={{ textAlign: 'center', padding: '28px 0', color: theme.colors.textSecondary }}>
          <span style={{ fontSize: '1.4rem' }}>⏳</span>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>Cargando…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" style={{ padding: '10px 12px', backgroundColor: '#FEE2E2', color: theme.colors.alert.red, borderRadius: '8px', fontSize: '0.82rem' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textSecondary, textAlign: 'center', padding: '24px 0' }}>
          Sin actividad todavía.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, idx) => {
            const cfg          = TIMELINE_CFG[it.tipo] ?? TIMELINE_CFG.COMENTARIO;
            const isLast       = idx === items.length - 1;
            const esComentario = it.tipo === 'COMENTARIO';
            return (
              <div key={it.key} style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                {/* Columna de la línea temporal: punto + conector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '14px' }}>
                  <span style={{ width: '13px', height: '13px', borderRadius: '50%', backgroundColor: cfg.dot, border: '2px solid #fff', boxShadow: `0 0 0 2px ${cfg.dot}`, marginTop: '4px', flexShrink: 0 }} />
                  {!isLast && <span style={{ width: '2px', flex: 1, backgroundColor: theme.colors.border, marginTop: '4px' }} />}
                </div>

                {/* Contenido del ítem */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? '2px' : '18px' }}>
                  <div style={{
                    backgroundColor: esComentario ? '#FAF5FF' : 'transparent',
                    border:          esComentario ? `1px solid ${cfg.dot}33` : 'none',
                    borderLeft:      esComentario ? `3px solid ${cfg.dot}` : 'none',
                    borderRadius:    esComentario ? '8px' : '0',
                    padding:         esComentario ? '8px 12px' : '0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: cfg.bg, color: cfg.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
                        <Icono nombre={cfg.icon} size={13} /> {cfg.label}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: theme.colors.textPrimary }}>{it.autor_nombre}</span>
                      <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{formatFecha(it.creado_en)}</span>
                    </div>
                    {it.contenido && (
                      <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.5 }}>{it.contenido}</p>
                    )}
                    {it.documento_url && (
                      <a href={`/files${it.documento_url}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#3D3935', textDecoration: 'none', backgroundColor: '#F5F4F2', padding: '4px 10px', borderRadius: '6px', border: '1px solid #E2DDD8' }}>
                        <Icono nombre="documento" inline />Ver documento adjunto
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulario de escritura — solo para quien puede comentar */}
      {puedeEscribir && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '16px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '14px' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            <Icono nombre="comentario" inline />Agregar comentario
          </p>
          <textarea
            value={nuevoComentario}
            onChange={(e) => setNuevoComentario(e.target.value)}
            rows={2}
            placeholder="Escribe un comentario…"
            disabled={enviando}
            style={{ padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.8rem', fontFamily: theme.font.family, resize: 'vertical', width: '100%', boxSizing: 'border-box' as const }}
          />
          {envioError && <p style={{ margin: 0, fontSize: '0.75rem', color: theme.colors.alert.red }}><Icono nombre="alerta" inline />{envioError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={enviar}
              disabled={enviando || !nuevoComentario.trim()}
              style={{ padding: '6px 16px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: (enviando || !nuevoComentario.trim()) ? 'not-allowed' : 'pointer', opacity: (enviando || !nuevoComentario.trim()) ? 0.6 : 1, fontFamily: theme.font.family }}
            >
              {enviando ? 'Enviando…' : 'Comentar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
