/**
 * Component: TicketDetalleModal
 * File: src/frontend/components/TicketDetalleModal.tsx
 *
 * Migrado desde SID (tickets.component.ts: `openViewModal` + `openEditModal`
 * + `saveTicket`), fusionados en un solo modal con dos pestañas (Detalle /
 * Historial) — la edición vive dentro de "Detalle", visible solo si
 * `puedeGestionar` es true (Mesa de Control de Tickets o SUPERADMIN; lo
 * calcula el backend, ver `esGestorDeTickets` en ticket-api.service.ts).
 *
 * A diferencia del legacy, el permiso de edición también se aplica en el
 * servidor (SID solo lo bloqueaba en el modal de Angular) — este modal
 * oculta los controles para quien no gestiona, pero la fuente de verdad es
 * el backend.
 */

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Icono } from './Icono';
import { theme } from '../theme';
import { useDialogo } from '../context/DialogoContext';
import { getTicketById, actualizarTicket, getTicketDestinatarios, descargarArchivoTicket } from '../api';
import {
  TicketDetalle, EstadoTicket, UrgenciaTicket, CategoriaTicket, CambioCampoTicket,
  ESTADOS_CON_SOLUCION_TICKET, ESTADO_TICKET_LABEL, URGENCIA_TICKET_LABEL,
  TIPO_TICKET_LABEL, CATEGORIAS_TICKET_OPCIONES,
} from '../types';

const ESTADOS: EstadoTicket[] = ['NUEVO', 'ABIERTO', 'EN_PROCESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO'];
const URGENCIAS: UrgenciaTicket[] = ['URGENTE', 'MEDIA', 'BAJA', 'INDEFINIDA'];

interface Props {
  ticketId:        number | null;
  open:            boolean;
  onClose:         () => void;
  puedeGestionar:  boolean;
  onActualizado:   () => void;
}

const input: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
  padding: '8px 10px', fontSize: '0.85rem', fontFamily: theme.font.family,
  color: theme.colors.textPrimary, width: '100%', boxSizing: 'border-box',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 700,
  color: theme.colors.textPrimary, marginBottom: '4px',
};
const campo = (etiqueta: string, children: React.ReactNode, key?: string) => (
  <div key={key} style={{ marginBottom: '14px' }}>
    <label style={label}>{etiqueta}</label>
    {children}
  </div>
);
const btnPrimario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
  borderRadius: theme.radius.sm, border: 'none', background: theme.colors.primary,
  color: theme.colors.white, fontWeight: 700, fontSize: '0.85rem',
  fontFamily: theme.font.family, cursor: 'pointer',
};
const tabBtn = (activo: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: '999px', border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: '0.8rem', fontFamily: theme.font.family,
  background: activo ? theme.colors.primary : theme.colors.background,
  color: activo ? theme.colors.white : theme.colors.textSecondary,
});

const badgeEstado = (estado: EstadoTicket): React.CSSProperties => {
  const colores: Record<EstadoTicket, [string, string]> = {
    NUEVO:      ['#DBEAFE', '#1E40AF'],
    ABIERTO:    ['#FEF3C7', '#92400E'],
    EN_PROCESO: ['#FEF9E7', '#7D6608'],
    EN_ESPERA:  ['#EDE9FE', '#5B21B6'],
    RESUELTO:   ['#D1FAE5', '#065F46'],
    CERRADO:    ['#E5E7EB', '#374151'],
  };
  const [bg, fg] = colores[estado] ?? ['#E5E7EB', '#374151'];
  return {
    display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px',
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    backgroundColor: bg, color: fg, border: `1px solid ${fg}22`,
  };
};

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

export const TicketDetalleModal: React.FC<Props> = ({ ticketId, open, onClose, puedeGestionar, onActualizado }) => {
  const dialogo = useDialogo();
  const [tab, setTab] = useState<'detalle' | 'historial'>('detalle');
  const [ticket, setTicket] = useState<TicketDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [destinatarios, setDestinatarios] = useState<{ id: number; nombre: string }[]>([]);

  const [form, setForm] = useState({
    titulo: '', descripcion: '', estado: 'NUEVO' as EstadoTicket, urgencia: 'MEDIA' as UrgenciaTicket,
    categoria: '' as CategoriaTicket | '', destinatario_id: '' as number | '', solucion: '',
  });
  const [archivos, setArchivos] = useState<File[]>([]);

  useEffect(() => {
    if (!open || !ticketId) return;
    setTab('detalle');
    setError(null);
    setArchivos([]);
    setCargando(true);
    getTicketById(ticketId)
      .then((r) => {
        setTicket(r.data);
        setForm({
          titulo: r.data.titulo, descripcion: r.data.descripcion, estado: r.data.estado,
          urgencia: r.data.urgencia, categoria: r.data.categoria ?? '',
          destinatario_id: r.data.destinatario_id ?? '', solucion: r.data.solucion ?? '',
        });
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setCargando(false));

    if (puedeGestionar) {
      getTicketDestinatarios().then((r) => setDestinatarios(r.data)).catch(() => setDestinatarios([]));
    }
  }, [open, ticketId, puedeGestionar]);

  const bloqueado = !ticket || ['CERRADO', 'RESUELTO'].includes(ticket.estado);
  const editable  = puedeGestionar && !bloqueado;
  const requiereSolucion = ESTADOS_CON_SOLUCION_TICKET.includes(form.estado);

  const guardar = async () => {
    if (!ticket) return;
    if (form.estado === 'CERRADO' && form.solucion.trim().length < 5) {
      setError('Debes capturar la solución (mínimo 5 caracteres) para cerrar el ticket.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await actualizarTicket(ticket.id, {
        titulo:      form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        estado:      form.estado,
        urgencia:    form.urgencia,
        categoria:   form.categoria || null,
        destinatario_id: form.destinatario_id === '' ? null : Number(form.destinatario_id),
        ...(requiereSolucion ? { solucion: form.solucion.trim() } : {}),
      }, archivos);
      await dialogo.avisar({ mensaje: 'Ticket actualizado correctamente.' });
      onActualizado();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al actualizar el ticket.');
    } finally {
      setGuardando(false);
    }
  };

  const descargar = async (fileId: number, nombre: string) => {
    if (!ticket) return;
    try {
      const blob = await descargarArchivoTicket(ticket.id, fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo descargar el archivo.');
    }
  };

  return (
    <Modal open={open} title={ticket ? `Ticket ${ticket.ticket_code}` : 'Ticket'} onClose={onClose} width={620}>
      {cargando && <div style={{ color: theme.colors.textSecondary }}>Cargando…</div>}
      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {ticket && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button style={tabBtn(tab === 'detalle')} onClick={() => setTab('detalle')} type="button">Detalle</button>
            <button style={tabBtn(tab === 'historial')} onClick={() => setTab('historial')} type="button">
              Historial ({ticket.change_log.length})
            </button>
          </div>

          {tab === 'detalle' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Estado:</div>
                <div><span style={badgeEstado(ticket.estado)}>{ESTADO_TICKET_LABEL[ticket.estado]}</span></div>
                <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Tipo:</div>
                <div>{ticket.tipo ? TIPO_TICKET_LABEL[ticket.tipo] : 'Sin especificar'}</div>
                <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Remitente:</div>
                <div>{ticket.remitente_nombre} — {ticket.remitente_unidad_nombre ?? '—'}</div>
                <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Destinatario:</div>
                <div>{ticket.destinatario_nombre ?? 'Sin asignar'}</div>
                {ticket.categoria_legacy && (
                  <>
                    <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Categoría (SID):</div>
                    <div title="Categoría original de SID — no tiene equivalente en el catálogo nuevo.">{ticket.categoria_legacy}</div>
                  </>
                )}
                <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Creado:</div>
                <div>{fmtFecha(ticket.created_at)}</div>
                {ticket.fecha_solucion && (
                  <>
                    <div style={{ fontWeight: 700, color: theme.colors.textSecondary }}>Cerrado:</div>
                    <div>{fmtFecha(ticket.fecha_solucion)}</div>
                  </>
                )}
              </div>

              {editable ? (
                <>
                  {campo('Título', (
                    <input style={input} maxLength={255} value={form.titulo}
                      onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
                  ))}
                  {campo('Descripción', (
                    <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={form.descripcion}
                      onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {campo('Estado', (
                      <select style={input} value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoTicket }))}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_TICKET_LABEL[e]}</option>)}
                      </select>
                    ))}
                    {campo('Urgencia', (
                      <select style={input} value={form.urgencia} onChange={(e) => setForm((f) => ({ ...f, urgencia: e.target.value as UrgenciaTicket }))}>
                        {URGENCIAS.map((u) => <option key={u} value={u}>{URGENCIA_TICKET_LABEL[u]}</option>)}
                      </select>
                    ))}
                  </div>
                  {campo('Categoría', (
                    <select style={input} value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as CategoriaTicket }))}>
                      <option value="">Sin categoría</option>
                      {CATEGORIAS_TICKET_OPCIONES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  ))}
                  {campo('Destinatario', (
                    <select style={input} value={form.destinatario_id} onChange={(e) => setForm((f) => ({ ...f, destinatario_id: e.target.value ? Number(e.target.value) : '' }))}>
                      <option value="">Sin asignar</option>
                      {destinatarios.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  ))}
                  {requiereSolucion && campo(`Solución${form.estado === 'CERRADO' ? ' *' : ''}`, (
                    <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={form.solucion}
                      onChange={(e) => setForm((f) => ({ ...f, solucion: e.target.value }))} />
                  ))}
                  {campo('Adjuntar archivo (opcional)', (
                    <input type="file" onChange={(e) => setArchivos(e.target.files?.[0] ? [e.target.files[0]] : [])} />
                  ))}
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: theme.colors.textSecondary, marginBottom: '14px' }}>
                  {ticket.descripcion}
                  {ticket.solucion && (
                    <div style={{ marginTop: '10px' }}>
                      <strong style={{ color: theme.colors.textPrimary }}>Solución:</strong> {ticket.solucion}
                    </div>
                  )}
                  {bloqueado && puedeGestionar && (
                    <div style={{ marginTop: '10px', fontStyle: 'italic' }}>Este ticket está cerrado/resuelto y ya no admite cambios.</div>
                  )}
                </div>
              )}

              {ticket.archivos.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={label}>Adjuntos</div>
                  {ticket.archivos.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '0.82rem' }}>
                      <Icono nombre="documento" size={14} color={theme.colors.textSecondary} />
                      <span style={{ flex: 1 }}>{a.original_name}</span>
                      <button
                        style={{ border: 'none', background: 'none', color: theme.colors.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => descargar(a.id, a.original_name)}
                        type="button"
                      >
                        <Icono nombre="descargar" size={14} /> Descargar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editable && (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button style={{ ...btnPrimario, background: theme.colors.charcoal }} onClick={onClose} type="button">Cerrar</button>
                  <button style={{ ...btnPrimario, opacity: guardando ? 0.7 : 1 }} onClick={guardar} disabled={guardando} type="button">
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'historial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {ticket.change_log.length === 0 ? (
                <div style={{ color: theme.colors.textSecondary, fontSize: '0.85rem' }}>Sin cambios registrados.</div>
              ) : (
                [...ticket.change_log].reverse().map((h, i) => (
                  <div key={i} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px' }}>
                      <span>{h.action}</span>
                      <span style={{ color: theme.colors.textSecondary, fontWeight: 400 }}>{fmtFecha(h.at)}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: theme.colors.textSecondary, marginBottom: '6px' }}>{h.user?.nombre ?? '—'}</div>
                    {(Object.entries(h.diff) as [string, CambioCampoTicket][]).map(([campo, cambio]) => (
                      <div key={campo} style={{ fontSize: '0.78rem' }}>
                        <strong>{campo}:</strong> {String(cambio.old ?? '—')} → {String(cambio.new ?? '—')}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default TicketDetalleModal;
