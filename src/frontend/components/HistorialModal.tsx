/**
 * Componente: HistorialModal
 * Ventana con el historial de una solicitud (oficio): cada cambio de estado con
 * su etapa, fecha/hora, usuario y el evento ocurrido. Se alimenta de la auditoría
 * de estados (GET /oficios/:id/historial).
 */

import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { Modal } from './Modal';
import { SeguimientoOficio } from './SeguimientoOficio';
import { getHistorial } from '../api';
import type { RegistroMovimiento } from '../api';
import type { Oficio } from '../types';

const ESTATUS_LABEL: Record<string, string> = {
  RECIBIDO:           'Solicitud ingresada',
  ASIGNADO:           'Solicitud asignada',
  EN_REVISION:        'Proyecto en revisión',
  EN_RECONSIDERACION: 'En reconsideración',
  VOBO_APROBADO:      'Solicitud con visto bueno',
  FINALIZADO:         'Solicitud finalizada',
  DELEGATORIO:        'Delegatorio',
};

const ETAPA: Record<string, string> = {
  RECIBIDO:           'Recepción',
  ASIGNADO:           'Gestión jurídica',
  EN_REVISION:        'Revisión',
  EN_RECONSIDERACION: 'Reconsideración',
  VOBO_APROBADO:      'Visto bueno',
  FINALIZADO:         'Entrega',
  DELEGATORIO:        'Delegatorio',
};

const EVENTOS: Record<string, string> = {
  'RECIBIDO→ASIGNADO':                 'Asignada al área jurídica',
  'ASIGNADO→EN_REVISION':              'Proyecto de contestación enviado a revisión',
  'EN_REVISION→EN_RECONSIDERACION':    'Devuelta para corrección',
  'EN_RECONSIDERACION→EN_REVISION':    'Corrección reenviada a revisión',
  'EN_REVISION→VOBO_APROBADO':         'Visto bueno otorgado',
  'VOBO_APROBADO→FINALIZADO':          'Documento firmado — solicitud finalizada',
};

function eventoDe(m: RegistroMovimiento): string {
  // Los movimientos de delegatorio traen su texto ya armado desde el servidor.
  if (m.detalle) return m.detalle;
  if (!m.estado_anterior) return 'Solicitud registrada en el sistema';
  return EVENTOS[`${m.estado_anterior}→${m.estado_nuevo}`] ?? '—';
}

const fFecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fHora  = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

interface Props {
  oficio: Oficio;
  open:   boolean;
  onClose: () => void;
}

export const HistorialModal: React.FC<Props> = ({ oficio, open, onClose }) => {
  const [movs,    setMovs]    = useState<RegistroMovimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    getHistorial(oficio.id)
      .then((r) => setMovs([...r.data].reverse()))   // más reciente primero
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, oficio.id]);

  return (
    <Modal open={open} title={`Historial de solicitud — ${oficio.folio}`} onClose={onClose} width={900}>
      {/* Encabezado con datos de la solicitud */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 20px', marginBottom: '18px' }}>
        <Dato label="Folio"                    value={oficio.folio} />
        <Dato label="Estatus de la solicitud"  value={ESTATUS_LABEL[oficio.estatus] ?? oficio.estatus} />
        <Dato label="Fecha de registro"        value={fFecha(oficio.fecha_registro)} />
      </div>

      {loading ? (
        <p style={muted}>Cargando historial…</p>
      ) : error ? (
        <p style={{ ...muted, color: theme.colors.alert.red }}>{error}</p>
      ) : movs.length === 0 ? (
        <p style={muted}>Sin movimientos registrados.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr>
                {['Estatus de solicitud', 'Etapa', 'Fecha', 'Hora', 'Usuario origen', 'Evento'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{ESTATUS_LABEL[m.estado_nuevo] ?? m.estado_nuevo}</td>
                  <td style={td}>{ETAPA[m.estado_nuevo] ?? '—'}</td>
                  <td style={td}>{fFecha(m.fecha_cambio)}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{fHora(m.fecha_cambio)}</td>
                  <td style={td}>{m.usuario_nombre}</td>
                  <td style={{ ...td, color: theme.colors.textSecondary }}>{eventoDe(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Línea de tiempo: avances, entregas, revisiones y comentarios */}
      {open && (
        <div style={{ marginTop: '22px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '18px' }}>
          <SeguimientoOficio oficioId={oficio.id} />
        </div>
      )}
    </Modal>
  );
};

const Dato: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.colors.textSecondary }}>{label}</div>
    <div style={{ fontSize: '0.9rem', color: theme.colors.textPrimary, fontWeight: 600 }}>{value}</div>
  </div>
);

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.colors.textSecondary, borderBottom: `2px solid ${theme.colors.border}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: '0.82rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}`, verticalAlign: 'top' };
const muted: React.CSSProperties = { margin: 0, padding: '20px', textAlign: 'center', fontSize: '0.85rem', color: theme.colors.textSecondary, fontStyle: 'italic' };
