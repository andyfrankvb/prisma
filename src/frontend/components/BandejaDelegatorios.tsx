/**
 * Component: BandejaDelegatorios
 *
 * Lo que le toca al usuario dentro de un delegatorio: como encargado del área
 * destino (recibir, asignar, revisar y enviar la respuesta) o como la persona a
 * la que se le asignó (subir documento y justificación).
 *
 * No se muestra si no hay nada: así no estorba a quien no participa.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Icono } from './Icono';
import { theme } from '../theme';
import {
  getBandejaDelegatorios, getCandidatosAsignacion, asignarDelegatorio,
  responderDelegatorio, devolverDelegatorio, aprobarDelegatorio,
  rechazarDelegatorio,
} from '../api';
import type { Abogado } from '../types';
import { useDialogo }  from '../context/DialogoContext';
import { useAuth }     from '../context/AuthContext';
import { ListaAcciones } from './MenuAcciones';

type Item = Awaited<ReturnType<typeof getBandejaDelegatorios>>['data'][number];

export const BandejaDelegatorios: React.FC<{
  onCambio?: () => void;
  /** Cuántos hay sin contestar, para el número de la pestaña que la contiene. */
  onConteo?: (n: number) => void;
  /**
   * Solo lo de este oficio. Así el trabajo se hace dentro del expediente que le
   * corresponde, en vez de en un cuadro suelto arriba de la lista: ahí ocupaba
   * media pantalla y repetía oficios que ya salían abajo, en su propio renglón.
   */
  oficioId?: number;
  /**
   * Monta el componente sin dibujar nada. Se usa para que la pestaña conserve su
   * número: quien tiene la lista es quien sabe cuántos hay pendientes.
   */
  soloConteo?: boolean;
}> = ({ onCambio, onConteo, oficioId, soloConteo = false }) => {
  const [items,   setItems]   = useState<Item[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [aviso,   setAviso]   = useState<string | null>(null);
  const [gente,   setGente]   = useState<Abogado[]>([]);
  const [activo,  setActivo]  = useState<number | null>(null);   // delegatorio abierto
  const [observacion, setObservacion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Solicitud en la que se está eligiendo a quién asignarla. */
  const [repartiendo, setRepartiendo] = useState<number | null>(null);
  const dialogo = useDialogo();
  const { user } = useAuth();

  const cargar = useCallback(() => {
    getBandejaDelegatorios().then((r) => setItems(r.data)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  // Cuántas hay pendientes. Dentro de un expediente se cuentan solo las suyas:
  // quien pregunta quiere saber si ESE oficio le pide algo, no cuántas tiene en
  // total.
  const cuantas = oficioId ? items.filter((d) => d.oficio_id === oficioId).length : items.length;
  useEffect(() => { onConteo?.(cuantas); }, [cuantas, onConteo]);
  useEffect(() => {
    if (items.length && gente.length === 0) {
      getCandidatosAsignacion().then(setGente).catch(() => {});
    }
  }, [items.length, gente.length]);

  const notificar = (m: string) => { setAviso(m); setTimeout(() => setAviso(null), 4000); cargar(); onCambio?.(); };
  const fallar    = (e: any) => setError(e.message);

  const asignar = async (id: number, usuarioId: number) => {
    try { const r = await asignarDelegatorio(id, usuarioId); notificar(r.message); } catch (e) { fallar(e); }
  };
  const responder = async (id: number) => {
    if (!observacion.trim()) { setError('Escribe la justificación de tu respuesta'); return; }

    /**
     * El documento es opcional —hay respuestas que solo dicen que no se encontró
     * información— pero olvidarlo es fácil, y una respuesta sin adjunto se
     * distingue poco de un descuido. Se pregunta una vez en lugar de exigirlo.
     */
    if (!archivo) {
      const sigue = await dialogo.confirmar({
        titulo:    'Responder sin documento',
        mensaje:   'Vas a contestar solo con tu justificación, sin adjuntar ningún archivo. Es válido cuando no se encontró información; si tienes el documento, adjúntalo antes de enviar.',
        confirmar: 'Enviar sin documento',
      });
      if (!sigue) return;
    }

    setOcupado(true);
    try {
      const r = await responderDelegatorio(id, observacion.trim(), archivo);
      setActivo(null); setObservacion(''); setArchivo(null); notificar(r.message);
    } catch (e) { fallar(e); } finally { setOcupado(false); }
  };
  const aprobar = async (id: number) => {
    try { const r = await aprobarDelegatorio(id); notificar(r.message); } catch (e) { fallar(e); }
  };
  /** El área regresa el delegatorio por no ser de su competencia. */
  const rechazar = async (id: number) => {
    const m = await dialogo.pedirTexto({
      titulo:      'No compete a mi área',
      mensaje:     'Se regresará a quien lo solicitó y se le informará el motivo.',
      etiqueta:    '¿Por qué no le compete a tu área?',
      placeholder: 'ESCRIBE EL MOTIVO…',
      confirmar:   'Rechazar',
      peligro:     true,
    });
    if (!m) return;
    try { const r = await rechazarDelegatorio(id, m); notificar(r.message); } catch (e) { fallar(e); }
  };
  const devolver = async (id: number) => {
    const c = await dialogo.pedirTexto({
      titulo:      'Devolver a corregir',
      mensaje:     'Se regresará a quien lo trabajó con tus comentarios.',
      etiqueta:    '¿Qué debe corregirse?',
      placeholder: 'ESCRIBE LO QUE HAY QUE CORREGIR…',
      confirmar:   'Devolver',
    });
    if (!c) return;
    try { const r = await devolverDelegatorio(id, c); notificar(r.message); } catch (e) { fallar(e); }
  };

  // Dentro de un expediente solo interesa lo de ese oficio.
  const visibles = oficioId ? items.filter((d) => d.oficio_id === oficioId) : items;

  // Sin nada que atender no se dibuja: ni el cuadro ni un aviso de que está
  // vacío. Antes decía «No hay delegatorios pendientes» y dejaba un hueco de
  // media pantalla a quien no tenía ninguno.
  if (soloConteo || visibles.length === 0) return null;

  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={titulo}>
          {oficioId ? 'Lo que te pidieron de este oficio' : 'Solicitudes por atender'}
        </span>
        {!oficioId && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 9px', borderRadius: '10px' }}>
            {visibles.length}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}
      {aviso && (
        <div role="status" style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 600 }}>
          <Icono nombre="check" inline />{aviso}
        </div>
      )}

      {visibles.map((d) => (
        <div key={d.id} style={fila}>
          {/* Dentro del expediente, el folio y el remitente ya están arriba:
              repetirlos aquí solo alarga la pantalla. */}
          {!oficioId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.85rem', color: theme.colors.primary }}>{d.folio}</strong>
              <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>{d.area}</span>
            </div>
          )}
          <p style={{ margin: '4px 0', fontSize: '0.8rem' }}>
            <strong>Solicitan:</strong> {d.descripcion}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '0.73rem', color: theme.colors.textSecondary }}>
            {oficioId
              ? (d.solicitado_por ? `Lo pidió ${d.solicitado_por}` : '')
              : <>{d.remitente} · {d.dependencia_origen}{d.solicitado_por && ` · pidió ${d.solicitado_por}`}</>}
          </p>
          {/* Lo que más confundía: atender una solicitud no te lleva el oficio.
              Se dice aquí, donde se decide, y no en un manual. */}
          {d.estado === 'PENDIENTE' && (
            <p style={{ margin: '0 0 10px', fontSize: '0.73rem', color: theme.colors.textSecondary }}>
              El oficio no cambia de área: sigue siendo de quien lo pidió. Lo que decides es si tu
              área contesta esta solicitud.
            </p>
          )}

          {/* PENDIENTE → atenderla o regresarla.
              Se evita la palabra «aceptar» a propósito: en el turnado significa
              hacerse cargo de un oficio que cambia de área, y aquí no cambia
              nada de sitio —el oficio sigue siendo de quien lo pidió—. Usar el
              mismo verbo para las dos cosas hacía creer que atender una solicitud
              era quedarse con el expediente.

              Las tarjetas son las mismas que el resto de «Acciones»: son
              decisiones del mismo tipo y con otros controles parecían venir de
              otro sistema. El desplegable de personas aparece al elegir asignar,
              porque una lista de nombres no cabe en una tarjeta. */}
          {d.estado === 'PENDIENTE' && (
            repartiendo === d.id ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                <select
                  defaultValue=""
                  autoFocus
                  onChange={(e) => e.target.value && asignar(d.id, Number(e.target.value))}
                  style={{ ...input, width: '100%' }}
                >
                  <option value="">— Elige a quién de tu área —</option>
                  {gente.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                </select>
                <div>
                  <button onClick={() => setRepartiendo(null)} style={btnSec}>Cancelar</button>
                </div>
              </div>
            ) : (
              <ListaAcciones acciones={[
                {
                  label: 'Asignar',
                  descripcion: 'Tu área la atiende. Repártela a alguien de tu equipo.',
                  onClick: () => setRepartiendo(d.id),
                },
                // El encargado puede quedársela en vez de repartirla, igual que
                // «Trabajar» en un oficio: asignársela a sí mismo es lo que hace
                // por debajo, y le ahorra buscarse en la lista.
                ...(user?.id ? [{
                  label: 'Trabajar',
                  descripcion: 'Tu área la atiende. Quédatela tú y sube la respuesta.',
                  onClick: () => asignar(d.id, user.id),
                }] : []),
                {
                  label: 'No compete a mi área',
                  tono: 'atencion' as const,
                  descripcion: 'Tu área no la atiende. Regresa a quien la pidió, con el motivo.',
                  onClick: () => rechazar(d.id),
                },
              ]} />
            )
          )}

          {/* ASIGNADO → quien lo trabaja sube documento + justificación */}
          {d.estado === 'ASIGNADO' && (
            activo === d.id ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                <textarea
                  value={observacion} onChange={(e) => setObservacion(e.target.value.toUpperCase())} rows={2}
                  placeholder="JUSTIFICACIÓN DE LA RESPUESTA…"
                  style={{ ...input, resize: 'vertical', textTransform: 'uppercase' }}
                />
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  style={{ fontSize: '0.78rem', fontFamily: theme.font.family }} />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setActivo(null); setObservacion(''); setArchivo(null); }} style={btnSec}>Cancelar</button>
                  <button onClick={() => responder(d.id)} disabled={ocupado} style={{ ...btnPri, opacity: ocupado ? 0.6 : 1 }}>
                    {ocupado ? 'Enviando…' : 'Enviar a mi encargado'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ListaAcciones acciones={[{
                  label: 'Responder',
                  descripcion: d.asignado_a
                    ? `La trabaja ${d.asignado_a}. Sube el documento y la justificación.`
                    : 'Sube el documento y la justificación de la respuesta.',
                  onClick: () => { setActivo(d.id); setObservacion(''); setArchivo(null); },
                }]} />
              </>
            )
          )}

          {/* EN_REVISION → el encargado revisa y envía o devuelve */}
          {d.estado === 'EN_REVISION' && (
            <div>
              {d.observacion && (
                <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: theme.colors.textSecondary, whiteSpace: 'pre-wrap' }}>
                  {d.observacion}
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {d.documento_url && (
                  <a href={`/files${d.documento_url}`} target="_blank" rel="noopener noreferrer" style={btnSec}>Ver documento</a>
                )}
                <button onClick={() => aprobar(d.id)} style={btnPri}>Enviar respuesta</button>
                <button onClick={() => devolver(d.id)} style={{ ...btnSec, color: '#B45309', borderColor: '#B45309' }}>
                  Devolver a corregir
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderLeft: `3px solid ${theme.colors.gold}`,
  borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
  backgroundColor: theme.colors.surface, fontFamily: theme.font.family,
};
const titulo: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: theme.colors.primaryDark,
};
const fila: React.CSSProperties = { padding: '12px 0', borderTop: `1px solid ${theme.colors.border}` };
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: `1px solid ${theme.colors.border}`,
  borderRadius: '6px', fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box',
};
const select: React.CSSProperties = { ...input, width: 'auto', minWidth: '240px' };
const btnPri: React.CSSProperties = {
  padding: '7px 14px', backgroundColor: theme.colors.primary, color: '#fff', border: 'none',
  borderRadius: '7px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSec: React.CSSProperties = {
  padding: '6px 12px', backgroundColor: '#fff', color: theme.colors.primary,
  border: `1px solid ${theme.colors.primary}`, borderRadius: '6px', fontWeight: 700,
  fontSize: '0.74rem', cursor: 'pointer', fontFamily: theme.font.family, textDecoration: 'none',
};
