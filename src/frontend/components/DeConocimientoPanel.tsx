/**
 * DeConocimientoPanel — la casilla «De conocimiento» del detalle del oficio.
 *
 * Hay oficios que no piden respuesta: solo informan algo a la operación interna.
 * Al marcarlos, el oficio se cierra sin pasar por proyecto, visto bueno ni firma.
 *
 * Va aparte del panel de SIQROO/SIGER a propósito: aquélla es captura de datos y
 * ésta cierra el oficio, así que no comparten el mismo botón de guardar.
 *
 * Solo se muestra a quien puede usarla — el servidor lo resuelve y lo informa en
 * `puede_de_conocimiento`.
 */
import React, { useState } from 'react';
import { theme }                 from '../theme';
import { marcarDeConocimiento }  from '../api';
import type { Oficio }           from '../types';

export const DeConocimientoPanel: React.FC<{
  oficio: Oficio;
  onDone?: (actualizado: Oficio) => void;
}> = ({ oficio, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  if (!oficio.puede_de_conocimiento) return null;

  const marcado = !!oficio.de_conocimiento;

  const cambiar = async () => {
    const aviso = marcado
      ? '¿Quitar la marca de conocimiento? El oficio regresará al punto del flujo en el que estaba.'
      : 'Al marcarlo de conocimiento el oficio queda cerrado, sin proyecto de contestación ni firma. ¿Continuar?';
    if (!window.confirm(aviso)) return;

    setSaving(true); setError(null);
    try {
      const { data } = await marcarDeConocimiento(oficio.id, !marcado);
      onDone?.(data);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo aplicar el cambio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border:          `1px solid ${marcado ? '#0EA5E9' : theme.colors.border}`,
      backgroundColor: marcado ? '#F0F9FF' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: saving ? 'wait' : 'pointer' }}>
        <input
          type="checkbox"
          checked={marcado}
          disabled={saving}
          onChange={cambiar}
          style={{ width: '16px', height: '16px', marginTop: '2px', cursor: saving ? 'wait' : 'pointer' }}
        />
        <span>
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: theme.colors.textPrimary }}>
            De conocimiento
          </span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
            {marcado
              ? 'Este oficio se cerró como informativo, sin contestación.'
              : 'El oficio solo informa: no requiere contestación y queda finalizado.'}
          </span>
        </span>
      </label>

      {marcado && oficio.de_conocimiento_en && (
        <p style={{ margin: '8px 0 0 26px', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
          Marcado el {new Date(oficio.de_conocimiento_en).toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })}
        </p>
      )}

      {error && (
        <p style={{ margin: '8px 0 0 26px', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}
    </div>
  );
};
