/**
 * SistemasPanel — en qué sistemas se capturó la solicitud y con qué número de
 * control interno (NCI).
 *
 * SIQROO y SIGER son independientes: puede ir en uno, en los dos o en ninguno.
 * Al ingresar el oficio no siempre se sabe todavía, por eso esto vive en el
 * detalle y no en el formulario de alta.
 *
 * Lo usan el Oficial (quien ingresa), el Encargado (Gestión) y el jurídico al
 * que se le reasignó. El backend no restringe quién lo captura; cada vista solo
 * muestra los oficios que le corresponden.
 */
import React, { useEffect, useState } from 'react';
import { theme }              from '../theme';
import { actualizarSistemas } from '../api';
import type { Oficio }        from '../types';

/** Un sistema y su NCI, tal como se editan en el formulario. */
interface EstadoSistema {
  aplica: boolean;
  nci:    string;
}

const SISTEMAS = [
  { clave: 'siqroo' as const, etiqueta: 'SIQROO' },
  { clave: 'siger'  as const, etiqueta: 'SIGER'  },
];

export const SistemasPanel: React.FC<{
  oficio: Oficio;
  onDone?: (actualizado: Oficio) => void;
}> = ({ oficio, onDone }) => {
  const [siqroo, setSiqroo] = useState<EstadoSistema>({ aplica: false, nci: '' });
  const [siger,  setSiger]  = useState<EstadoSistema>({ aplica: false, nci: '' });
  const [editando, setEditando] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Al cambiar de oficio se recarga lo guardado y se cierra la edición.
  useEffect(() => {
    setSiqroo({ aplica: !!oficio.siqroo_aplica, nci: oficio.siqroo_control_interno ?? '' });
    setSiger({  aplica: !!oficio.siger_aplica,  nci: oficio.siger_control_interno  ?? '' });
    setEditando(false);
    setError(null);
  }, [oficio.id, oficio.siqroo_aplica, oficio.siqroo_control_interno,
      oficio.siger_aplica, oficio.siger_control_interno]);

  const estado = { siqroo, siger };
  const set    = { siqroo: setSiqroo, siger: setSiger };

  const guardar = async () => {
    setSaving(true); setError(null);
    try {
      const { data } = await actualizarSistemas(oficio.id, {
        siqroo_aplica:          siqroo.aplica,
        siqroo_control_interno: siqroo.nci.trim(),
        siger_aplica:           siger.aplica,
        siger_control_interno:  siger.nci.trim(),
      });
      setEditando(false);
      onDone?.(data);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const cancelar = () => {
    setSiqroo({ aplica: !!oficio.siqroo_aplica, nci: oficio.siqroo_control_interno ?? '' });
    setSiger({  aplica: !!oficio.siger_aplica,  nci: oficio.siger_control_interno  ?? '' });
    setEditando(false); setError(null);
  };

  // Marcado en algún sistema pero sin su NCI: es lo que hay que completar.
  const pendiente =
    (!!oficio.siqroo_aplica && !oficio.siqroo_control_interno) ||
    (!!oficio.siger_aplica  && !oficio.siger_control_interno);

  return (
    <div style={{
      border: `1px solid ${pendiente ? '#F59E0B' : theme.colors.border}`,
      backgroundColor: pendiente ? '#FFFBEB' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Registro en sistemas
          </span>
          {pendiente && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px' }}>
              NCI pendiente
            </span>
          )}
        </div>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} style={btnSec}>
            {oficio.siqroo_aplica || oficio.siger_aplica ? 'Editar' : 'Registrar'}
          </button>
        )}
      </div>

      {!editando ? (
        <div style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary }}>
          {SISTEMAS.map(({ clave, etiqueta }) => {
            const aplica = !!oficio[`${clave}_aplica` as keyof Oficio];
            const nci    = oficio[`${clave}_control_interno` as keyof Oficio] as string | null;
            return (
              <div key={clave} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, minWidth: '58px' }}>{etiqueta}</span>
                {!aplica
                  ? <span style={{ color: theme.colors.textSecondary }}>No aplica</span>
                  : <span>NCI: <strong>{nci || '— pendiente —'}</strong></span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {SISTEMAS.map(({ clave, etiqueta }) => (
            <div key={clave} style={{ display: 'grid', gap: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={estado[clave].aplica}
                  onChange={(e) => set[clave]({ ...estado[clave], aplica: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                Ingresada en {etiqueta}
              </label>
              {estado[clave].aplica && (
                <input
                  style={input}
                  value={estado[clave].nci}
                  onChange={(e) => set[clave]({ ...estado[clave], nci: e.target.value })}
                  placeholder={`NCI en ${etiqueta} (se puede capturar después)`}
                />
              )}
            </div>
          ))}

          {error && <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={cancelar} style={btnSec}>Cancelar</button>
            <button type="button" onClick={guardar} disabled={saving} style={{ ...btnPri, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando…' : 'Guardar'}
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

/**
 * Chips compactos para la columna «Sistemas» de las listas: uno por cada
 * sistema donde se capturó la solicitud, en ámbar si le falta el NCI.
 */
export const SistemasChips: React.FC<{ oficio: Oficio }> = ({ oficio }) => {
  const marcados = SISTEMAS.filter(({ clave }) => !!oficio[`${clave}_aplica` as keyof Oficio]);
  if (marcados.length === 0) {
    return <span style={{ color: theme.colors.textSecondary, fontSize: '0.75rem' }}>—</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {marcados.map(({ clave, etiqueta }) => {
        const listo = !!oficio[`${clave}_control_interno` as keyof Oficio];
        return (
          <span
            key={clave}
            title={listo ? `${etiqueta}: NCI capturado` : `${etiqueta}: falta el NCI`}
            style={{
              fontSize: '0.64rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap',
              backgroundColor: listo ? '#D1FAE5' : '#FEF3C7',
              color:           listo ? '#065F46' : '#92400E',
            }}
          >
            {etiqueta}
          </span>
        );
      })}
    </span>
  );
};
