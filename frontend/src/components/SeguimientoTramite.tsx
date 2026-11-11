/**
 * SeguimientoTramite — línea temporal unificada de una resolución (trámite).
 * File: src/frontend/components/SeguimientoTramite.tsx
 *
 * Fusiona en UNA sola línea temporal, ordenada por fecha:
 *   · MOVIMIENTOS — cambios de estado (auditoría), y color según el estado.
 *   · COMENTARIOS — mensajes enviados, en morado (marca distintiva).
 *
 * Recibe la auditoría ya cargada en el detalle y trae los comentarios por su cuenta.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Icono } from './Icono';
import { theme } from '../theme';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export interface MovimientoAuditoria {
  id:              number;
  estado_anterior: string | null;
  estado_nuevo:    string;
  usuario_nombre:  string;
  fecha_cambio:    string;
  comentario:      string | null;
}

interface Comentario {
  id:           number;
  tramite_id:   number;
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

// Etiqueta y color por estado (para los movimientos)
const ESTADO_LABEL: Record<string, string> = {
  NUEVO: 'Nuevo', EN_REVISION: 'En Revisión', EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado', RECHAZADO: 'Rechazado',
  DEVUELTO_DELEGADO: 'Devuelto al Delegado', DEVUELTO_JURIDICO: 'Devuelto a Jurídico',
};
const ESTADO_STYLE: Record<string, { dot: string; bg: string; text: string }> = {
  NUEVO:             { dot: '#3D3935', bg: '#EFEDEA', text: '#3D3935' },
  EN_REVISION:       { dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  EN_PROCESO:        { dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  FINALIZADO:        { dot: '#374151', bg: '#F3F4F6', text: '#374151' },
  RECHAZADO:         { dot: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
  DEVUELTO_DELEGADO: { dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  DEVUELTO_JURIDICO: { dot: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
};
const ESTADO_FALLBACK = { dot: '#6B7280', bg: '#F3F4F6', text: '#374151' };
const COMENTARIO_STYLE = { dot: '#AB0A3D', bg: '#FDE8EF', text: '#8A0730' };

interface TimelineItem {
  key:            string;
  tipo:           'MOVIMIENTO' | 'COMENTARIO';
  autor_nombre:   string;
  fecha:          string;
  contenido:      string | null;
  estado_nuevo?:  string;
  estado_anterior?: string | null;
}

interface Props {
  tramiteId:     number;
  auditoria:     MovimientoAuditoria[];
  puedeEscribir: boolean;
}

export const SeguimientoTramite: React.FC<Props> = ({ tramiteId, auditoria, puedeEscribir }) => {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviando,        setEnviando]        = useState(false);
  const [envioError,      setEnvioError]      = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Comentario[] }>(`/tramites/${tramiteId}/comentarios`);
      setComentarios(res.data);
    } catch { /* si falla, seguimos mostrando los movimientos */ }
    finally { setLoading(false); }
  }, [tramiteId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enviar = async () => {
    if (!nuevoComentario.trim()) return;
    setEnviando(true); setEnvioError(null);
    try {
      const res = await apiFetch<{ data: Comentario }>(`/tramites/${tramiteId}/comentarios`, {
        method: 'POST', body: JSON.stringify({ contenido: nuevoComentario.trim() }),
      });
      setComentarios((prev) => [...prev, res.data]);
      setNuevoComentario('');
    } catch (err: any) { setEnvioError(err.message); }
    finally { setEnviando(false); }
  };

  // Fusión cronológica (más antiguo → más reciente)
  const items: TimelineItem[] = [
    ...auditoria.map((a) => ({
      key: `m${a.id}`, tipo: 'MOVIMIENTO' as const, autor_nombre: a.usuario_nombre,
      fecha: a.fecha_cambio, contenido: a.comentario,
      estado_nuevo: a.estado_nuevo, estado_anterior: a.estado_anterior,
    })),
    ...comentarios.map((c) => ({
      key: `c${c.id}`, tipo: 'COMENTARIO' as const, autor_nombre: c.autor_nombre,
      fecha: c.creado_en, contenido: c.contenido,
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        Línea de tiempo · movimientos y comentarios
      </p>

      {loading && items.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}><Icono nombre="reloj" inline />Cargando…</p>
      )}

      {items.length === 0 && !loading && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textSecondary }}>Sin actividad todavía.</p>
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, idx) => {
            const esComentario = it.tipo === 'COMENTARIO';
            const st           = esComentario ? COMENTARIO_STYLE : (ESTADO_STYLE[it.estado_nuevo ?? ''] ?? ESTADO_FALLBACK);
            const isLast       = idx === items.length - 1;
            const estadoLbl    = ESTADO_LABEL[it.estado_nuevo ?? ''] ?? it.estado_nuevo;
            const antLbl       = it.estado_anterior ? (ESTADO_LABEL[it.estado_anterior] ?? it.estado_anterior) : null;
            return (
              <div key={it.key} style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                {/* Columna de la línea temporal: punto + conector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '14px' }}>
                  <span style={{ width: '13px', height: '13px', borderRadius: '50%', backgroundColor: st.dot, border: '2px solid #fff', boxShadow: `0 0 0 2px ${st.dot}`, marginTop: '4px', flexShrink: 0 }} />
                  {!isLast && <span style={{ width: '2px', flex: 1, backgroundColor: theme.colors.border, marginTop: '4px' }} />}
                </div>

                {/* Contenido del ítem */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? '2px' : '16px' }}>
                  <div style={{
                    backgroundColor: esComentario ? '#FAF5FF' : 'transparent',
                    border:          esComentario ? `1px solid ${st.dot}33` : 'none',
                    borderLeft:      esComentario ? `3px solid ${st.dot}` : 'none',
                    borderRadius:    esComentario ? '8px' : '0',
                    padding:         esComentario ? '8px 12px' : '0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: st.bg, color: st.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
                        {esComentario ? 'Comentario' : `${estadoLbl}`}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: theme.colors.textPrimary }}>{it.autor_nombre}</span>
                      <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{formatFecha(it.fecha)}</span>
                    </div>

                    {/* Movimiento: transición de estado */}
                    {!esComentario && antLbl && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                        {antLbl} → <strong style={{ color: theme.colors.textPrimary }}>{estadoLbl}</strong>
                      </p>
                    )}

                    {it.contenido && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.5, fontStyle: esComentario ? 'normal' : 'italic' }}>
                        {esComentario ? it.contenido : `"${it.contenido}"`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulario de escritura */}
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
