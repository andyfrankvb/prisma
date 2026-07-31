/**
 * SiqrooPanel — muestra el estado SIQROO de un oficio y permite capturar el
 * NCI (número de control interno) pendiente.
 *
 * Reutilizable: lo usan el Oficial (quien ingresa), el Encargado (Gestión) y
 * el Jurídico/abogado al que se le reasignó el proyecto. El backend no
 * restringe quién lo captura, y cada vista solo muestra los oficios que le
 * corresponden, así que el alcance queda acotado por la propia lista.
 */
import React, { useState } from 'react';
import { theme }            from '../theme';
import { completarSiqroo }  from '../api';
import type { Oficio }      from '../types';

export const SiqrooPanel: React.FC<{
  oficio: Oficio;
  onDone?: (actualizado: Oficio) => void;
}> = ({ oficio, onDone }) => {
  const [control, setControl] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!oficio.siqroo_aplica) return null;
  const pendiente = !oficio.siqroo_control_interno;

  const guardar = async () => {
    if (!control.trim()) return;
    setSaving(true); setError(null);
    try {
      const { data } = await completarSiqroo(oficio.id, control.trim());
      setControl('');
      onDone?.(data);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar el NCI');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${pendiente ? '#F59E0B' : theme.colors.border}`,
      backgroundColor: pendiente ? '#FFFBEB' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SIQROO</span>
        {pendiente
          ? <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px' }}>🚩 Pendiente por completar</span>
          : <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '10px' }}>✓ Completo</span>}
      </div>

      <div style={{ fontSize: '0.8rem', color: theme.colors.textPrimary, marginBottom: pendiente ? '12px' : 0 }}>
        <div>Nº de control interno: <strong>{oficio.siqroo_control_interno || '—'}</strong></div>
      </div>

      {pendiente && (
        <div style={{ display: 'grid', gap: '8px', borderTop: `1px dashed ${theme.colors.border}`, paddingTop: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary }}>Captura el número de control interno (NCI):</p>
          <input
            style={{ padding: '8px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '6px', fontSize: '0.82rem' }}
            value={control}
            onChange={(e) => setControl(e.target.value)}
            placeholder="Número de control interno"
          />
          {error && <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}
          <button
            type="button"
            onClick={guardar}
            disabled={saving || !control.trim()}
            style={{ justifySelf: 'start', padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#fff', backgroundColor: theme.colors.primary, border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: (saving || !control.trim()) ? 0.6 : 1 }}
          >
            {saving ? 'Guardando…' : 'Guardar NCI'}
          </button>
        </div>
      )}
    </div>
  );
};
