/**
 * SeguimientoOficio — línea temporal unificada de un oficio (Recepción de Oficios).
 * File: src/frontend/components/SeguimientoOficio.tsx
 *
 * Fusiona en UNA sola línea temporal, ordenada por fecha:
 *   · MOVIMIENTOS — cambios de estado (auditoría): recibido, asignado, en revisión
 *     (proyecto entregado), reconsideración, VoBo, finalizado. 🔄 con color por estado.
 *   · COMENTARIOS — observaciones de corrección del encargado. 💬 en morado.
 *
 * Muestra los detalles y fechas de los avances, entregas y revisiones del oficio.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { theme } from '../theme';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

interface Movimiento {
  id:              number;
  estado_anterior: string | null;
  estado_nuevo:    string;
  fecha_cambio:    string;
  usuario_nombre:  string;
  /** Texto ya armado. Lo traen los movimientos de delegatorio. */
  detalle?:        string;
}

interface ComentarioReconsideracion {
  id:               number;
  comentario:       string;
  fecha:            string;
  version:          number;
  encargado_nombre: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } });
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

// Etiqueta y color por estado del oficio (para los movimientos)
const ESTADO_LABEL: Record<string, string> = {
  RECIBIDO: 'Recibido', ASIGNADO: 'Asignado', EN_REVISION: 'Proyecto en revisión',
  EN_RECONSIDERACION: 'En reconsideración', VOBO_APROBADO: 'VoBo aprobado', FINALIZADO: 'Finalizado',
  DELEGATORIO: 'Delegatorio', TURNADO: 'Turnado a otra área', DEVUELTO: 'Devuelto por competencia',
};
const ESTADO_STYLE: Record<string, { dot: string; bg: string; text: string }> = {
  RECIBIDO:           { dot: '#2563EB', bg: '#DBEAFE', text: '#1E40AF' },
  ASIGNADO:           { dot: '#4F46E5', bg: '#E0E7FF', text: '#3730A3' },
  EN_REVISION:        { dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
  EN_RECONSIDERACION: { dot: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
  VOBO_APROBADO:      { dot: '#059669', bg: '#D1FAE5', text: '#065F46' },
  FINALIZADO:         { dot: '#374151', bg: '#F3F4F6', text: '#374151' },
  DELEGATORIO:        { dot: '#0EA5E9', bg: '#E0F2FE', text: '#075985' },
  TURNADO:            { dot: '#7C3AED', bg: '#EDE9FE', text: '#5B21B6' },
  DEVUELTO:           { dot: '#D97706', bg: '#FEF3C7', text: '#92400E' },
};
const ESTADO_FALLBACK  = { dot: '#6B7280', bg: '#F3F4F6', text: '#374151' };
const COMENTARIO_STYLE = { dot: '#7C3AED', bg: '#EDE9FE', text: '#5B21B6' };

interface TimelineItem {
  key:              string;
  tipo:             'MOVIMIENTO' | 'COMENTARIO';
  autor_nombre:     string;
  fecha:            string;
  contenido:        string | null;
  estado_nuevo?:    string;
  estado_anterior?: string | null;
}

interface Props {
  oficioId: number;
}

export const SeguimientoOficio: React.FC<Props> = ({ oficioId }) => {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [comentarios, setComentarios] = useState<ComentarioReconsideracion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, c] = await Promise.all([
        apiFetch<{ data: Movimiento[] }>(`/oficios/${oficioId}/historial`),
        apiFetch<{ data: ComentarioReconsideracion[] }>(`/oficios/${oficioId}/comentarios`).catch(() => ({ data: [] as ComentarioReconsideracion[] })),
      ]);
      setMovimientos(h.data);
      setComentarios(c.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [oficioId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Fusión cronológica (más antiguo → más reciente)
  const items: TimelineItem[] = [
    ...movimientos.map((m) => ({
      key: `m${m.id}`, tipo: 'MOVIMIENTO' as const, autor_nombre: m.usuario_nombre,
      fecha: m.fecha_cambio, contenido: m.detalle ?? null,
      estado_nuevo: m.estado_nuevo, estado_anterior: m.estado_anterior,
    })),
    ...comentarios.map((c) => ({
      key: `c${c.id}`, tipo: 'COMENTARIO' as const, autor_nombre: c.encargado_nombre,
      fecha: c.fecha, contenido: c.comentario,
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        Línea de tiempo · avances, entregas y revisiones
      </p>

      {loading && <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>⏳ Cargando…</p>}
      {!loading && error && <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.alert.red }}>⚠ {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: theme.colors.textSecondary }}>Sin movimientos todavía.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, idx) => {
            const esComentario   = it.tipo === 'COMENTARIO';
            // Un delegatorio no es un cambio de estatus del oficio: no lleva la
            // línea «de → a», solo su texto.
            const esDelegatorio  = ['DELEGATORIO', 'TURNADO', 'DEVUELTO'].includes(it.estado_nuevo ?? '');
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
                        {esComentario ? '💬 Comentario' : `${it.estado_nuevo === 'DEVUELTO' ? '↩️' : it.estado_nuevo === 'TURNADO' ? '🔀' : esDelegatorio ? '📨' : '🔄'} ${estadoLbl}`}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: theme.colors.textPrimary }}>{it.autor_nombre}</span>
                      <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{formatFecha(it.fecha)}</span>
                    </div>

                    {!esComentario && !esDelegatorio && antLbl && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                        {antLbl} → <strong style={{ color: theme.colors.textPrimary }}>{estadoLbl}</strong>
                      </p>
                    )}

                    {it.contenido && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: theme.colors.textPrimary, lineHeight: 1.5 }}>
                        {it.contenido}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
