/**
 * Component: TicketFormModal
 * File: src/frontend/components/TicketFormModal.tsx
 *
 * Formulario de alta de un ticket. Migrado desde SID
 * (tickets.component.ts: `openNewModal` + `saveTicket`), sin el estado
 * inicial "nuevo" deshabilitado como campo (aquí el backend siempre crea en
 * NUEVO — no es una decisión del formulario) y sin el forzado de oficina
 * (lo resuelve el backend: ver `resolverDestino` en ticket-api.service.ts).
 */

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { theme } from '../theme';
import { useDialogo } from '../context/DialogoContext';
import { crearTicket, getTicketDestinatarios } from '../api';
import {
  CrearTicketPayload, TipoTicket, UrgenciaTicket, CategoriaTicket,
  TIPO_TICKET_LABEL, URGENCIA_TICKET_LABEL, CATEGORIAS_TICKET_OPCIONES,
} from '../types';

const TIPOS: TipoTicket[] = ['APERTURA', 'MODIFICACION'];
const URGENCIAS: UrgenciaTicket[] = ['URGENTE', 'MEDIA', 'BAJA', 'INDEFINIDA'];

const ADJUNTO_MAX_BYTES = 5 * 1024 * 1024;
const ADJUNTO_EXT = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreado:  () => void;
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

const FORM_VACIO = {
  titulo: '', descripcion: '', tipo: '' as TipoTicket | '', urgencia: '' as UrgenciaTicket | '',
  categoria: '' as CategoriaTicket | '', destinatario_id: '' as number | '',
};

export const TicketFormModal: React.FC<Props> = ({ open, onClose, onCreado }) => {
  const dialogo = useDialogo();
  const [form, setForm] = useState(FORM_VACIO);
  const [destinatarios, setDestinatarios] = useState<{ id: number; nombre: string }[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(FORM_VACIO);
    setArchivos([]);
    setError(null);
    setErrorArchivo(null);
    getTicketDestinatarios().then((r) => setDestinatarios(r.data)).catch(() => setDestinatarios([]));
  }, [open]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorArchivo(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > ADJUNTO_MAX_BYTES) {
      setErrorArchivo('El archivo supera el máximo permitido de 5 MB.');
      e.target.value = '';
      return;
    }
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!ADJUNTO_EXT.includes(ext)) {
      setErrorArchivo('Tipo de archivo no permitido. Solo: JPG, PNG, PDF, DOC, DOCX.');
      e.target.value = '';
      return;
    }
    setArchivos([file]);
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.descripcion.trim() || !form.tipo || !form.urgencia) {
      setError('Completa los campos obligatorios.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const payload: CrearTicketPayload = {
        titulo:      form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        tipo:        form.tipo as TipoTicket,
        urgencia:    form.urgencia as UrgenciaTicket,
        categoria:   form.categoria || null,
        destinatario_id: form.destinatario_id === '' ? null : Number(form.destinatario_id),
      };
      await crearTicket(payload, archivos);
      await dialogo.avisar({ mensaje: 'Ticket creado correctamente.' });
      onCreado();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al crear el ticket.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} title="Nuevo ticket" onClose={onClose} width={520}>
      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {campo('Título *', (
        <input style={input} maxLength={255} value={form.titulo}
          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
      ))}

      {campo('Descripción *', (
        <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {campo('Tipo *', (
          <select style={input} value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoTicket }))}>
            <option value="">Seleccione</option>
            {TIPOS.map((t) => <option key={t} value={t}>{TIPO_TICKET_LABEL[t]}</option>)}
          </select>
        ))}
        {campo('Urgencia *', (
          <select style={input} value={form.urgencia} onChange={(e) => setForm((f) => ({ ...f, urgencia: e.target.value as UrgenciaTicket }))}>
            <option value="">Seleccione</option>
            {URGENCIAS.map((u) => <option key={u} value={u}>{URGENCIA_TICKET_LABEL[u]}</option>)}
          </select>
        ))}
      </div>

      {campo('Categoría', (
        <select style={input} value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as CategoriaTicket }))}>
          <option value="">Sin categoría</option>
          {CATEGORIAS_TICKET_OPCIONES.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.rol_asignado})</option>)}
        </select>
      ))}

      {destinatarios.length > 0 && campo('Asignar a (opcional)', (
        <select style={input} value={form.destinatario_id} onChange={(e) => setForm((f) => ({ ...f, destinatario_id: e.target.value ? Number(e.target.value) : '' }))}>
          <option value="">Sin asignar</option>
          {destinatarios.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      ))}

      {campo('Adjunto (opcional, máx. 5 MB)', (
        <>
          <input type="file" onChange={onFile} accept={ADJUNTO_EXT.join(',')} />
          {errorArchivo && <div style={{ color: '#991B1B', fontSize: '0.78rem', marginTop: '4px' }}>{errorArchivo}</div>}
        </>
      ))}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
        <button style={{ ...btnPrimario, background: theme.colors.charcoal }} onClick={onClose} type="button">Cancelar</button>
        <button style={{ ...btnPrimario, opacity: guardando ? 0.7 : 1 }} onClick={guardar} disabled={guardando} type="button">
          {guardando ? 'Guardando…' : 'Crear ticket'}
        </button>
      </div>
    </Modal>
  );
};

export default TicketFormModal;
