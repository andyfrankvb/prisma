/**
 * ResolucionPanel — la casilla «Resolución» de las áreas.
 *
 * Hay asuntos que llegan dirigidos a una delegación pero que resuelve la
 * Dirección General. La delegación avanza lo que le toca y desde aquí se lo
 * manda, en un solo paso.
 *
 * Por debajo es el mismo envío de información entre áreas que ya existe —con su
 * documento y su justificación—, solo que la casilla fija el destino y deja
 * dicho que se trató de una resolución. Se hizo así a propósito: un camino
 * paralelo con reglas propias acabaría contradiciendo al otro.
 */
import React, { useEffect, useState } from 'react';
import { theme }            from '../theme';
import { getAreasTurno, turnarOficio } from '../api';
import type { AreaTurno }   from '../api';
import type { Oficio }      from '../types';
import { useDialogo }       from '../context/DialogoContext';

export const ResolucionPanel: React.FC<{
  oficio: Oficio;
  onDone?: () => void;
}> = ({ oficio, onDone }) => {
  const [abierto, setAbierto] = useState(false);
  const [motivo,  setMotivo]  = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [dg,      setDg]      = useState<AreaTurno | null>(null);
  const dialogo = useDialogo();

  useEffect(() => { setAbierto(false); setMotivo(''); setArchivo(null); setError(null); }, [oficio.id]);

  useEffect(() => {
    if (!abierto || dg) return;
    getAreasTurno()
      .then((r) => setDg(r.data.find((a) => a.tipo === 'DIRECCION_GENERAL') ?? null))
      .catch(() => {});
  }, [abierto, dg]);

  // Ni la casilla ni la constancia: no hay nada que mostrar.
  if (!oficio.puede_marcar_resolucion && !oficio.resolucion) return null;

  const enviar = async () => {
    if (!motivo.trim()) return;
    if (!archivo) { setError('Adjunta el documento con lo que trabajó tu área'); return; }
    if (!dg)      { setError('No se encontró la Dirección General'); return; }

    const sigue = await dialogo.confirmar({
      titulo:    'Enviar como resolución',
      mensaje:   `El oficio ${oficio.folio} se marcará como resolución y pasará a la Dirección General, que continuará el seguimiento.`,
      confirmar: 'Enviar',
    });
    if (!sigue) return;

    setSaving(true); setError(null);
    try {
      await turnarOficio(oficio.id, dg.id, motivo.trim(), 'INFORMACION', archivo, true);
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la resolución');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${oficio.resolucion ? '#B68400' : theme.colors.border}`,
      backgroundColor: oficio.resolucion ? '#FEF9E7' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: oficio.resolucion ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={!!oficio.resolucion || abierto}
          disabled={saving || !!oficio.resolucion}
          onChange={(e) => setAbierto(e.target.checked)}
          style={{ width: '16px', height: '16px', marginTop: '2px' }}
        />
        <span>
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: theme.colors.textPrimary }}>
            Resolución
          </span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
            {oficio.resolucion
              ? 'Se envió a la Dirección General como resolución.'
              : 'El asunto lo resuelve la Dirección General: adjunta lo que trabajó tu área y se lo mandas.'}
          </span>
        </span>
      </label>

      {abierto && !oficio.resolucion && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '12px', marginLeft: '26px' }}>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.toUpperCase())}
            rows={2}
            placeholder="¿QUÉ SE ENVÍA Y HASTA DÓNDE TRABAJÓ TU ÁREA?"
            style={{ ...input, resize: 'vertical', textTransform: 'uppercase' }}
          />
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '4px' }}>
              Documento con lo trabajado <span style={{ color: theme.colors.alert.red }}>*</span>
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              style={{ ...input, padding: '6px 8px' }}
            />
          </div>

          {error && <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} style={btnSec}>Cancelar</button>
            <button
              type="button"
              onClick={enviar}
              disabled={saving || !motivo.trim() || !archivo}
              style={{ ...btnPri, opacity: (saving || !motivo.trim() || !archivo) ? 0.5 : 1 }}
            >
              {saving ? 'Enviando…' : 'Enviar a la Dirección General'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── estilos ──
const input: React.CSSProperties = {
  padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px',
  fontSize: '0.82rem', fontFamily: theme.font.family, boxSizing: 'border-box', width: '100%',
};
const btnPri: React.CSSProperties = {
  padding: '7px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#fff',
  backgroundColor: theme.colors.primary, border: 'none', borderRadius: '6px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
const btnSec: React.CSSProperties = {
  padding: '6px 12px', fontSize: '0.74rem', fontWeight: 700, color: theme.colors.primary,
  backgroundColor: '#fff', border: `1px solid ${theme.colors.primary}`, borderRadius: '6px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
