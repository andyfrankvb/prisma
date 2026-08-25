/**
 * PaseFirmaPanel — mandar el oficio a firma de la Directora General.
 *
 * Un área trabaja el oficio, lo aprueba, y entonces decide quién lo firma: su
 * propio titular —por la firma que le está delegada— o la Directora General,
 * cuando el tema no entra en esa delegación.
 *
 * No es un turno. El oficio no cambia de área ni de destinatario: sigue en la
 * lista de quien lo trabajó y con el mismo «dirigido a» del documento original.
 * Lo único que cambia es que lo cierra la Dirección General.
 *
 * Del otro lado, la secretaría puede regresarlo si hay que corregir algo; el
 * oficio vuelve con quien lo mandó, conservando su visto bueno.
 */
import React, { useEffect, useState } from 'react';
import { theme }                        from '../theme';
import { mandarAPaseFirma, devolverPaseFirma } from '../api';
import type { Oficio }                  from '../types';
import { useDialogo }                   from '../context/DialogoContext';

export const PaseFirmaPanel: React.FC<{
  oficio: Oficio;
  onDone?: () => void;
}> = ({ oficio, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const dialogo = useDialogo();

  useEffect(() => { setError(null); }, [oficio.id]);

  const enEspera  = !!oficio.en_pase_firma;
  const puedeIr   = !!oficio.puede_mandar_firma;
  const puedeVolver = !!oficio.puede_devolver_pase_firma;
  const devuelto  = oficio.pase_firma_devuelto_motivo;

  // Sin nada que hacer ni nada que contar, el panel no ocupa espacio.
  if (!enEspera && !puedeIr && !devuelto) return null;

  const mandar = async () => {
    const sigue = await dialogo.confirmar({
      titulo:    'Mandar a firma de la Dirección General',
      mensaje:   `El oficio ${oficio.folio} conserva su visto bueno y sigue siendo de tu área, pero lo firmará la Directora General. Se avisará a la Dirección General.`,
      confirmar: 'Mandar a firma',
    });
    if (!sigue) return;

    setSaving(true); setError(null);
    try {
      await mandarAPaseFirma(oficio.id);
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo mandar a firma');
    } finally {
      setSaving(false);
    }
  };

  const regresar = async () => {
    const motivo = await dialogo.pedirTexto({
      titulo:      'Regresar sin firmar',
      mensaje:     'El oficio vuelve con quien lo mandó, conservando su visto bueno. Se le informará el motivo.',
      etiqueta:    '¿Qué hay que corregir?',
      placeholder: 'ESCRIBE QUÉ HAY QUE CORREGIR…',
      confirmar:   'Regresar',
      peligro:     true,
    });
    if (!motivo) return;

    setSaving(true); setError(null);
    try {
      await devolverPaseFirma(oficio.id, motivo);
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo regresar el oficio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${enEspera ? theme.colors.primary : theme.colors.border}`,
      backgroundColor: enEspera ? '#FDE8EF' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Firma
          </span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px', maxWidth: '46ch' }}>
            {enEspera
              ? 'Esperando la firma de la Directora General. El oficio sigue siendo de tu área.'
              : 'Si el tema no entra en tu firma delegada, mándalo a firma de la Dirección General.'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {puedeIr && (
            <button type="button" onClick={mandar} disabled={saving} style={{ ...btnSec, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Mandando…' : 'Mandar a firma de la Dirección General'}
            </button>
          )}
          {puedeVolver && (
            <button
              type="button"
              onClick={regresar}
              disabled={saving}
              title="Regresarlo al área para que corrijan, sin firmarlo"
              style={{ ...btnSec, color: '#B45309', borderColor: '#B45309', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Regresando…' : 'Regresar sin firmar'}
            </button>
          )}
        </div>
      </div>

      {/* Lo que pidió corregir la Dirección General la última vez que lo regresó. */}
      {!enEspera && devuelto && (
        <p style={{
          margin: '10px 0 0', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          <strong>La Dirección General lo regresó sin firmar:</strong> {devuelto}
        </p>
      )}

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}
    </div>
  );
};

// ── estilos ──
const btnSec: React.CSSProperties = {
  padding: '6px 12px', fontSize: '0.74rem', fontWeight: 700, color: theme.colors.primary,
  backgroundColor: '#fff', border: `1px solid ${theme.colors.primary}`, borderRadius: '6px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
