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

/**
 * SIQROO lleva número de control interno; SIGER no —ahí solo se marca que la
 * solicitud se capturó, y quien la atiende es la delegación a la que se delegue.
 */
const SISTEMAS = [
  { clave: 'siqroo' as const, etiqueta: 'SIQROO', conNci: true  },
  { clave: 'siger'  as const, etiqueta: 'SIGER',  conNci: false },
];

export const SistemasPanel: React.FC<{
  oficio: Oficio;
  onDone?: (actualizado: Oficio) => void;
}> = ({ oficio, onDone }) => {
  const [siqroo, setSiqroo] = useState<EstadoSistema>({ aplica: false, nci: '' });
  const [siger,  setSiger]  = useState<EstadoSistema>({ aplica: false, nci: '' });
  const [fre, setFre] = useState(false);
  const [editando, setEditando] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Al cambiar de oficio se recarga lo guardado y se cierra la edición.
  useEffect(() => {
    setSiqroo({ aplica: !!oficio.siqroo_aplica, nci: oficio.siqroo_control_interno ?? '' });
    setSiger({  aplica: !!oficio.siger_aplica,  nci: oficio.siger_control_interno  ?? '' });
    setFre(!!oficio.fre_incorporado);
    setEditando(false);
    setError(null);
  }, [oficio.id, oficio.siqroo_aplica, oficio.siqroo_control_interno,
      oficio.siger_aplica, oficio.siger_control_interno, oficio.fre_incorporado]);

  const estado = { siqroo, siger };
  const set    = { siqroo: setSiqroo, siger: setSiger };

  const guardar = async () => {
    setSaving(true); setError(null);
    try {
      const { data } = await actualizarSistemas(oficio.id, {
        siqroo_aplica:          siqroo.aplica,
        siqroo_control_interno: siqroo.nci.trim(),
        siger_aplica:           siger.aplica,
        siger_control_interno:  '',
        fre_incorporado:        fre,
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
    setFre(!!oficio.fre_incorporado);
    setEditando(false); setError(null);
  };

  // Solo SIQROO tiene NCI que completar.
  const nciPendiente = !!oficio.siqroo_aplica && !oficio.siqroo_control_interno;
  // SIGER marcado sin delegatorio a una delegación: el oficio no puede cerrarse.
  const sigerPendiente = !!oficio.siger_sin_delegatorio;
  // FRE marcado sin delegatorio a Informática: mismo caso.
  const frePendiente   = !!oficio.fre_sin_delegatorio;
  const pendiente = nciPendiente || sigerPendiente || frePendiente;

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
          {nciPendiente && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px' }}>
              NCI pendiente
            </span>
          )}
        </div>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} style={btnSec}>
            {oficio.siqroo_aplica || oficio.siger_aplica || oficio.fre_incorporado ? 'Editar' : 'Registrar'}
          </button>
        )}
      </div>

      {frePendiente && (
        <p style={{
          margin: '0 0 10px', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          Tiene marcada la incorporación de FRE pero no se ha delegado a la Dirección
          de Informática. El oficio no podrá recibir visto bueno ni firmarse hasta que se delegue.
        </p>
      )}

      {sigerPendiente && (
        <p style={{
          margin: '0 0 10px', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          Está marcado en SIGER pero no se ha delegado a ninguna delegación.
          El oficio no podrá recibir visto bueno ni firmarse hasta que se delegue.
        </p>
      )}

      {!editando ? (
        <div style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: theme.colors.textPrimary }}>
          {/* SIQROO y su FRE van juntos; SIGER es de otro sistema y va aparte. */}
          {SISTEMAS.map(({ clave, etiqueta, conNci }) => {
            const aplica = !!oficio[`${clave}_aplica` as keyof Oficio];
            const nci    = oficio[`${clave}_control_interno` as keyof Oficio] as string | null;
            return (
              <React.Fragment key={clave}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, minWidth: '58px' }}>{etiqueta}</span>
                  {!aplica
                    ? <span style={{ color: theme.colors.textSecondary }}>No aplica</span>
                    : conNci
                      ? <span>NCI: <strong>{nci || '— pendiente —'}</strong></span>
                      : <span><strong>Ingresada</strong></span>}
                </div>

                {clave === 'siqroo' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, minWidth: '58px' }}>FRE</span>
                      {oficio.fre_incorporado
                        ? <span>
                            <strong>Incorporado</strong>
                            {oficio.fre_incorporado_en && (
                              <span style={{ color: theme.colors.textSecondary }}>
                                {' '}· {new Date(oficio.fre_incorporado_en).toLocaleDateString('es-MX', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                })}
                              </span>
                            )}
                          </span>
                        : <span style={{ color: theme.colors.textSecondary }}>No aplica</span>}
                    </div>
                    <hr style={separador} />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {SISTEMAS.map(({ clave, etiqueta, conNci }) => (
            <React.Fragment key={clave}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={estado[clave].aplica}
                    onChange={(e) => set[clave]({ ...estado[clave], aplica: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  Ingresada en {etiqueta}
                </label>
                {estado[clave].aplica && conNci && (
                  <input
                    style={{ ...input, textTransform: 'uppercase' }}
                    value={estado[clave].nci}
                    onChange={(e) => set[clave]({ ...estado[clave], nci: e.target.value.toUpperCase() })}
                    placeholder={`NCI EN ${etiqueta} (SE PUEDE CAPTURAR DESPUÉS)`}
                  />
                )}
                {estado[clave].aplica && !conNci && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                    Requiere delegar el oficio a una delegación para poder cerrarse.
                  </p>
                )}
              </div>

              {clave === 'siqroo' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fre}
                      onChange={(e) => setFre(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    Incorporar FRE
                  </label>
                  {fre && (
                    <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                      Requiere delegar el oficio a la Dirección de Informática para poder cerrarse.
                    </p>
                  )}
                  <hr style={separador} />
                </>
              )}
            </React.Fragment>
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
const separador: React.CSSProperties = {
  border: 'none', borderTop: `1px dashed ${theme.colors.border}`, margin: '2px 0',
};
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
        // SIGER no lleva NCI: marcado ya es completo.
        const conNci = SISTEMAS.find((x) => x.clave === clave)?.conNci ?? true;
        const listo  = !conNci || !!oficio[`${clave}_control_interno` as keyof Oficio];
        return (
          <span
            key={clave}
            title={!conNci ? `${etiqueta}: ingresada` : listo ? `${etiqueta}: NCI capturado` : `${etiqueta}: falta el NCI`}
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
