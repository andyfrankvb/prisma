/**
 * Component: DelegatoriosPanel
 *
 * La sección «Documentos del flujo» del expediente: qué áreas tienen delegatorio,
 * cuáles ya contestaron (con su documento y observación) y cuáles siguen pendientes.
 *
 * Desde aquí, quien puede hacerlo también detona nuevos delegatorios y devuelve
 * una respuesta a corregir.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../theme';
import {
  getDelegatorios, getAreasDestino, crearDelegatorios, devolverDelegatorio,
} from '../api';
import type { Delegatorio } from '../api';

const ETIQUETA: Record<string, { texto: string; color: string; fondo: string }> = {
  PENDIENTE:   { texto: 'Pendiente',      color: '#92400E', fondo: '#FEF3C7' },
  ASIGNADO:    { texto: 'En proceso',     color: '#92400E', fondo: '#FEF3C7' },
  EN_REVISION: { texto: 'En revisión',    color: '#1E40AF', fondo: '#DBEAFE' },
  CONTESTADO:  { texto: '✓ Contestado',   color: '#065F46', fondo: '#D1FAE5' },
};

export const DelegatoriosPanel: React.FC<{
  oficioId: number;
  /** Solo quien detonó o puede detonar ve el alta y la devolución. */
  puedeDelegar?: boolean;
  onCambio?: () => void;
}> = ({ oficioId, puedeDelegar = false, onCambio }) => {
  const [items,   setItems]   = useState<Delegatorio[]>([]);
  const [areas,   setAreas]   = useState<{ id: number; nombre: string; tipo: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Alta de delegatorio
  const [abierto,   setAbierto]   = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    getDelegatorios(oficioId)
      .then((r) => setItems(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [oficioId]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (abierto && areas.length === 0) getAreasDestino().then((r) => setAreas(r.data)).catch(() => {});
  }, [abierto, areas.length]);

  const yaDelegadas = items.map((i) => i.unidad_destino_id);
  const pendientes  = items.filter((i) => i.estado !== 'CONTESTADO').length;

  const enviar = async () => {
    setGuardando(true); setError(null);
    try {
      await crearDelegatorios(oficioId, descripcion.trim(), seleccion);
      setAbierto(false); setDescripcion(''); setSeleccion([]);
      cargar(); onCambio?.();
    } catch (e: any) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const devolver = async (id: number) => {
    const c = prompt('¿Qué debe corregir el área?');
    if (!c?.trim()) return;
    try {
      await devolverDelegatorio(id, c.trim());
      cargar(); onCambio?.();
    } catch (e: any) { setError(e.message); }
  };

  // Si no hay nada y no puede delegar, la sección no estorba.
  if (cargando) return null;
  if (items.length === 0 && !puedeDelegar) return null;

  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <span style={titulo}>Documentos del flujo</span>
          {pendientes > 0 && (
            <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '10px' }}>
              {pendientes} sin contestar
            </span>
          )}
        </div>
        {puedeDelegar && !abierto && (
          <button onClick={() => setAbierto(true)} style={btnPrimario}>Delegar a otra área</button>
        )}
      </div>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', cursor: 'pointer' }}>
          ⚠ {error}
        </div>
      )}

      {/* Alta */}
      {abierto && (
        <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
          <label style={etiqueta}>¿Qué información se solicita?</label>
          <textarea
            value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2}
            placeholder="Describe lo que necesitas del área…"
            style={{ ...input, resize: 'vertical' }}
          />
          <label style={{ ...etiqueta, marginTop: '10px' }}>Áreas destino</label>
          <div style={{ display: 'grid', gap: '4px', maxHeight: '170px', overflowY: 'auto' }}>
            {areas.map((a) => {
              const ya = yaDelegadas.includes(a.id);
              return (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', opacity: ya ? 0.45 : 1, cursor: ya ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox" disabled={ya}
                    checked={seleccion.includes(a.id)}
                    onChange={(e) => setSeleccion((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))}
                  />
                  {a.nombre}{ya && <span style={{ fontSize: '0.7rem', color: theme.colors.textSecondary }}>· ya delegada</span>}
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => { setAbierto(false); setSeleccion([]); setDescripcion(''); }} style={btnSecundario}>Cancelar</button>
            <button
              onClick={enviar}
              disabled={guardando || !descripcion.trim() || seleccion.length === 0}
              style={{ ...btnPrimario, opacity: (guardando || !descripcion.trim() || !seleccion.length) ? 0.5 : 1 }}
            >
              {guardando ? 'Enviando…' : `Delegar${seleccion.length ? ` a ${seleccion.length}` : ''}`}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.78rem', color: theme.colors.textSecondary }}>
          Sin delegatorios. Si necesitas información de otra área, puedes delegarlo.
        </p>
      ) : items.map((d) => {
        const e = ETIQUETA[d.estado] ?? ETIQUETA.PENDIENTE;
        return (
          <div key={d.id} style={fila}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.82rem', color: theme.colors.textPrimary }}>{d.area}</strong>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: e.color, backgroundColor: e.fondo, padding: '2px 9px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                {e.texto}
              </span>
            </div>

            {d.estado === 'CONTESTADO' ? (
              <div style={{ marginTop: '6px' }}>
                {d.observacion && (
                  <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: theme.colors.textSecondary, whiteSpace: 'pre-wrap' }}>
                    {d.observacion}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {d.documento_url && (
                    <a href={`/files${d.documento_url}`} target="_blank" rel="noopener noreferrer" style={btnSecundario}>
                      Ver documento
                    </a>
                  )}
                  {puedeDelegar && (
                    <button onClick={() => devolver(d.id)} style={{ ...btnSecundario, color: '#B45309', borderColor: '#B45309' }}>
                      Devolver a corregir
                    </button>
                  )}
                  {d.respondido_por && (
                    <span style={{ fontSize: '0.7rem', color: theme.colors.grayMid }}>por {d.respondido_por}</span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: theme.colors.textSecondary }}>
                {d.asignado_a ? `Trabajándolo: ${d.asignado_a}` : 'Esperando que el área lo asigne'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '14px 16px', marginBottom: '14px', backgroundColor: theme.colors.surface,
};
const titulo: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: theme.colors.textSecondary,
};
const fila: React.CSSProperties = {
  padding: '10px 0', borderTop: `1px solid ${theme.colors.border}`,
};
const etiqueta: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: theme.colors.charcoal,
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${theme.colors.border}`,
  borderRadius: '6px', fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box',
};
const btnPrimario: React.CSSProperties = {
  padding: '7px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none',
  borderRadius: '7px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSecundario: React.CSSProperties = {
  padding: '6px 12px', backgroundColor: '#fff', color: theme.colors.primary,
  border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', fontWeight: 700,
  fontSize: '0.74rem', cursor: 'pointer', fontFamily: theme.font.family, textDecoration: 'none',
};
