/**
 * HistorialFoliosSalidaModal — el consecutivo completo de folios de salida.
 *
 * Incluye los folios vivos (emitidos ya en PRISMA) y los migrados de SID —
 * marcados como «Histórico (SID)»—, en una sola lista ordenada por fecha. Es
 * la vista que permite conciliar «lo que ya se emitió» contra «lo que sigue»,
 * sin tener que entrar a SID.
 *
 * Solo se ofrece a quien el servidor autoriza (Director Jurídico y/o
 * SUPERADMIN); el botón que la abre se muestra de más por conveniencia
 * (`rol === 'DIRECTOR' || 'SUPERADMIN'`) pero quien de verdad decide es el
 * backend — un 403 aquí se traduce en un mensaje, no en un hueco de seguridad.
 */
import React, { useEffect, useState } from 'react';
import { theme }   from '../theme';
import { Modal }   from './Modal';
import { getHistorialFoliosSalida } from '../api';
import type { FolioSalida } from '../types';

const fFecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const HistorialFoliosSalidaModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [data,    setData]    = useState<FolioSalida[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null);
    getHistorialFoliosSalida({ page, limit, search: search || undefined })
      .then((r) => { setData(r.data); setTotal(r.total); })
      .catch((e) => setError(e?.message ?? 'No se pudo cargar el historial'))
      .finally(() => setLoading(false));
  }, [open, page, search]);

  useEffect(() => { if (open) setPage(1); }, [open]);

  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  return (
    <Modal open={open} title="Historial de folios de salida" onClose={onClose} width={860}>
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Buscar por folio…"
        style={{
          width: '100%', padding: '8px 12px', marginBottom: '14px',
          border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
          fontSize: '0.85rem', fontFamily: theme.font.family,
        }}
      />

      {loading ? (
        <p style={muted}>Cargando…</p>
      ) : error ? (
        <p style={{ ...muted, color: theme.colors.alert.red }}>{error}</p>
      ) : data.length === 0 ? (
        <p style={muted}>Sin folios que mostrar.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr>
                {['Folio', 'Origen', 'Estatus', 'Fecha', 'Asignado / reservado por'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{f.folio_formateado}</td>
                  <td style={td}>
                    {f.es_legacy
                      ? <span style={chip('#E0E7FF', '#3730A3')}>Histórico (SID)</span>
                      : <span style={chip('#DCFCE7', '#166534')}>PRISMA</span>}
                  </td>
                  <td style={td}>{f.estatus}</td>
                  <td style={td}>{fFecha(f.creado_en)}</td>
                  <td style={td}>{f.asignado_por_nombre ?? f.reservado_por_nombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={botonPag}>‹</button>
          <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Página {page} de {totalPaginas}</span>
          <button onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas} style={botonPag}>›</button>
        </div>
      )}
    </Modal>
  );
};

const chip = (bg: string, color: string): React.CSSProperties => ({
  fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: '10px', backgroundColor: bg, color,
});
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: theme.colors.textSecondary, borderBottom: `2px solid ${theme.colors.border}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: '0.82rem', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}` };
const muted: React.CSSProperties = { margin: 0, padding: '20px', textAlign: 'center', fontSize: '0.85rem', color: theme.colors.textSecondary, fontStyle: 'italic' };
const botonPag: React.CSSProperties = {
  padding: '4px 12px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.sm,
  backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem',
};
