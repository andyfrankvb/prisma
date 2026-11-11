/**
 * View: Tickets
 * File: src/frontend/views/Tickets.tsx
 *
 * Migrado desde SID (src/app/views/pages/tickets/tickets.component.ts,
 * backend/app/Http/Controllers/TicketController.php). Mesa de ayuda interna:
 * cualquier usuario puede crear y ver sus tickets; solo la Mesa de Control de
 * Tickets (o SUPERADMIN) puede gestionarlos — ver el permiso `puede_gestionar`
 * que calcula el backend (ticket-api.service.ts) y la nota de arquitectura ahí
 * sobre por qué los roles numéricos de SID no se replican tal cual.
 *
 * Reconstruido con el theme y los componentes base de PRISMA — sin
 * Bootstrap, jQuery, DataTables, SweetAlert, NobleUI ni Feather Icons.
 */

import React, { useEffect, useState } from 'react';
import { Icono } from '../components/Icono';
import { TicketFormModal } from '../components/TicketFormModal';
import { TicketDetalleModal } from '../components/TicketDetalleModal';
import { theme } from '../theme';
import { getTickets } from '../api';
import { Ticket, EstadoTicket, ESTADO_TICKET_LABEL, URGENCIA_TICKET_LABEL } from '../types';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const ESTADOS: EstadoTicket[] = ['NUEVO', 'ABIERTO', 'EN_PROCESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO'];

// ── estilos (mismo patrón que Consultas.tsx / Maquinas.tsx) ─────────

const panel: React.CSSProperties = {
  background: theme.colors.surface, borderRadius: theme.radius.lg,
  boxShadow: theme.shadow.md, border: `1px solid ${theme.colors.border}`, overflow: 'hidden',
};
const toolbar: React.CSSProperties = {
  background: `linear-gradient(180deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 140%)`,
  borderRadius: theme.radius.lg, padding: '14px 16px', marginBottom: '16px',
  boxShadow: theme.shadow.md, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
};
const inputSobreGuinda: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.35)', borderRadius: theme.radius.sm, padding: '8px 10px',
  fontSize: '0.85rem', fontFamily: theme.font.family, color: theme.colors.white,
  background: 'rgba(255,255,255,0.1)', width: '100%', boxSizing: 'border-box',
};
const btnPrimario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px',
  borderRadius: theme.radius.sm, border: 'none', background: theme.colors.primary,
  color: theme.colors.white, fontWeight: 700, fontSize: '0.85rem', fontFamily: theme.font.family, cursor: 'pointer',
};
const btnIcono = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
  borderRadius: theme.radius.sm, border: `1px solid ${color}33`, background: `${color}14`, color, cursor: 'pointer',
});
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: '0.72rem', fontWeight: 700,
  letterSpacing: '0.04em', textTransform: 'uppercase', color: theme.colors.white, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 14px', fontSize: '0.85rem', color: theme.colors.textPrimary,
  borderBottom: `1px solid ${theme.colors.border}`,
};

const badgeEstado = (estado: EstadoTicket): React.CSSProperties => {
  const colores: Record<EstadoTicket, [string, string]> = {
    NUEVO: ['#DBEAFE', '#1E40AF'], ABIERTO: ['#FEF3C7', '#92400E'], EN_PROCESO: ['#FEF9E7', '#7D6608'],
    EN_ESPERA: ['#EDE9FE', '#5B21B6'], RESUELTO: ['#D1FAE5', '#065F46'], CERRADO: ['#E5E7EB', '#374151'],
  };
  const [bg, fg] = colores[estado] ?? ['#E5E7EB', '#374151'];
  return {
    display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px',
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
    backgroundColor: bg, color: fg, border: `1px solid ${fg}22`,
  };
};

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

export const Tickets: React.FC = () => {
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTicket | ''>('');
  const [pagina, setPagina] = useState(1);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [ticketSeleccionado, setTicketSeleccionado] = useState<number | null>(null);

  const cargar = () => {
    setCargando(true);
    setError(null);
    getTickets({
      search:    search.trim() || undefined,
      estado:    estadoFiltro || undefined,
      page:      pagina,
      limit:     PAGE_SIZE,
    })
      .then((res) => {
        setTickets(res.data);
        setTotal(res.meta.total);
        setPuedeGestionar(res.meta.puede_gestionar);
      })
      .catch((e: Error) => setError(e.message || 'Error al cargar tickets.'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    const timer = setTimeout(cargar, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estadoFiltro, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: theme.colors.primaryDark, fontFamily: theme.font.family, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icono nombre="etiqueta" size={22} color={theme.colors.primary} /> Tickets
        </h1>
        <button style={btnPrimario} onClick={() => setFormAbierto(true)}>
          <Icono nombre="mas" size={16} /> Nuevo ticket
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => setError(null)}>
          {error} <span style={{ opacity: 0.7 }}>(clic para cerrar)</span>
        </div>
      )}

      <div style={toolbar}>
        <div style={{ flex: '1 1 260px', minWidth: '220px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icono nombre="buscar" size={16} color={theme.colors.white} />
          <input
            style={inputSobreGuinda}
            placeholder="Buscar por folio, título o descripción"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPagina(1); }}
          />
        </div>

        <select
          style={{ ...inputSobreGuinda, width: 'auto' }}
          value={estadoFiltro}
          onChange={(e) => { setEstadoFiltro(e.target.value as EstadoTicket | ''); setPagina(1); }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_TICKET_LABEL[e]}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <button style={btnIcono(theme.colors.white)} disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
            <Icono nombre="flechaIzq" size={14} color={theme.colors.white} />
          </button>
          <span style={{ color: theme.colors.white, fontSize: '0.8rem', fontWeight: 700, minWidth: '52px', textAlign: 'center' }}>
            {pagina} / {totalPaginas}
          </span>
          <button style={btnIcono(theme.colors.white)} disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            <Icono nombre="flechaDer" size={14} color={theme.colors.white} />
          </button>
        </div>
      </div>

      <div style={panel}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.primary }}>
                <th style={th}>Folio</th>
                <th style={th}>Título</th>
                <th style={th}>Estado</th>
                <th style={th}>Urgencia</th>
                <th style={th}>Remitente</th>
                <th style={th}>Destinatario</th>
                <th style={th}>Creado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td style={td} colSpan={8}>Cargando…</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: theme.colors.textSecondary }} colSpan={8}>No hay tickets.</td></tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{t.ticket_code}</td>
                    <td style={td}>{t.titulo}</td>
                    <td style={td}><span style={badgeEstado(t.estado)}>{ESTADO_TICKET_LABEL[t.estado]}</span></td>
                    <td style={td}>{URGENCIA_TICKET_LABEL[t.urgencia] ?? t.urgencia}</td>
                    <td style={td}>{t.remitente_nombre}</td>
                    <td style={td}>{t.destinatario_nombre ?? '—'}</td>
                    <td style={{ ...td, color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>{fmtFecha(t.created_at)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button style={btnIcono(theme.colors.charcoal)} title="Ver" onClick={() => setTicketSeleccionado(t.id)}>
                        <Icono nombre="ojo" size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: theme.colors.textSecondary, borderTop: `1px solid ${theme.colors.border}` }}>
          {total === 0 ? 'Sin resultados' : `${total} ticket${total === 1 ? '' : 's'}`}
        </div>
      </div>

      <TicketFormModal open={formAbierto} onClose={() => setFormAbierto(false)} onCreado={cargar} />

      <TicketDetalleModal
        ticketId={ticketSeleccionado}
        open={ticketSeleccionado !== null}
        onClose={() => setTicketSeleccionado(null)}
        puedeGestionar={puedeGestionar}
        onActualizado={cargar}
      />
    </div>
  );
};

export default Tickets;
