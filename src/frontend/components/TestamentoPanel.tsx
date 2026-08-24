/**
 * TestamentoPanel — búsqueda de testamentos.
 *
 * Un oficio de testamentos se resuelve en dos etapas con plazo fijo de 10 días
 * hábiles: 5 para que las delegaciones busquen y entreguen, y 5 para que el
 * encargado arme el proyecto de contestación.
 *
 * Los plazos no se acortan si alguien contesta antes: quien sigue puede
 * adelantarse, pero conserva sus días.
 *
 * Por debajo son delegatorios normales —los mismos de siempre—, por eso al
 * marcarlo hay que decir a qué delegaciones aplica la búsqueda.
 */
import React, { useEffect, useState } from 'react';
import { theme }                        from '../theme';
import { marcarTestamento, quitarTestamento } from '../api';
import type { Oficio }                  from '../types';
import { useDialogo }                   from '../context/DialogoContext';

export const TestamentoPanel: React.FC<{
  oficio: Oficio;
  /** Quién puede detonar delegatorios: es el mismo permiso. */
  puedeDelegar?: boolean;
  onCambio?: () => void;
}> = ({ oficio, puedeDelegar = false, onCambio }) => {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const dialogo = useDialogo();

  useEffect(() => { setError(null); }, [oficio.id]);

  if (!puedeDelegar && !oficio.testamento) return null;

  const fecha = (f?: string | null) =>
    f ? new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }) : '—';

  const marcar = async () => {
    setSaving(true); setError(null);
    try {
      await marcarTestamento(oficio.id);
      onCambio?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo marcar el testamento');
    } finally {
      setSaving(false);
    }
  };

  const quitar = async () => {
    const sigue = await dialogo.confirmar({
      titulo:    'Quitar la marca de testamento',
      mensaje:   'Se eliminan los plazos. Los delegatorios ya creados siguen su curso.',
      confirmar: 'Quitar',
    });
    if (!sigue) return;
    setSaving(true); setError(null);
    try {
      await quitarTestamento(oficio.id);
      onCambio?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo quitar la marca');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${oficio.testamento ? '#7C3AED' : theme.colors.border}`,
      backgroundColor: oficio.testamento ? '#F5F3FF' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: saving ? 'wait' : 'pointer' }}>
          <input
            type="checkbox"
            checked={!!oficio.testamento}
            disabled={saving || (!oficio.testamento && !puedeDelegar)}
            onChange={(e) => (e.target.checked ? marcar() : quitar())}
            style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer' }}
          />
          <span>
            <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: theme.colors.textPrimary }}>
              Testamento
            </span>
            <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
              {oficio.testamento
                ? 'Búsqueda en curso. 5 días hábiles para las delegaciones y 5 para el proyecto de contestación.'
                : 'Búsqueda de testamentos: 10 días hábiles en total, repartidos en dos etapas de 5.'}
            </span>
          </span>
        </label>
      </div>

      {oficio.testamento_sin_delegatorio && (
        <p style={{
          margin: '10px 0 0 26px', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          Falta delegar la búsqueda. Usa «Delegar a otra área» abajo y elige las delegaciones
          que la harán; heredarán el plazo de 5 días hábiles.
        </p>
      )}

      {oficio.testamento && (
        <div style={{ display: 'grid', gap: '4px', marginTop: '10px', marginLeft: '26px', fontSize: '0.78rem' }}>
          <div>
            <span style={{ color: theme.colors.textSecondary }}>Delegaciones entregan: </span>
            <strong>{fecha(oficio.testamento_vence_delegaciones)}</strong>
          </div>
          <div>
            <span style={{ color: theme.colors.textSecondary }}>Proyecto de contestación: </span>
            <strong>{fecha(oficio.testamento_vence_encargado)}</strong>
          </div>
        </div>
      )}

      {error && (
        <p style={{ margin: '8px 0 0 26px', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}
    </div>
  );
};


