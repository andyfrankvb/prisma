/**
 * TurnarPanel — mandar el oficio completo a otra área.
 *
 * Pasa cuando lo solicitado no es competencia del área que lo recibió: el
 * encargado lo turna a la que sí corresponde y el oficio arranca su flujo ahí,
 * desde el principio. A diferencia del delegatorio, el oficio se va completo y
 * no regresa.
 *
 * El folio no cambia: es el que ya se entregó en el acuse.
 *
 * Solo lo ve el encargado del área que hoy tiene el oficio — lo resuelve el
 * servidor y lo informa en `puede_turnar`.
 */
import React, { useEffect, useState } from 'react';
import { theme }                    from '../theme';
import { getAreasTurno, turnarOficio, devolverTurno } from '../api';
import type { AreaTurno }           from '../api';
import type { Oficio }              from '../types';
import { useDialogo }               from '../context/DialogoContext';

export const TurnarPanel: React.FC<{
  oficio: Oficio;
  onDone?: () => void;
}> = ({ oficio, onDone }) => {
  const [abierto, setAbierto] = useState(false);
  const [areas,   setAreas]   = useState<AreaTurno[]>([]);
  const [destino, setDestino] = useState<number | ''>('');
  const [motivo,  setMotivo]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);
  const dialogo = useDialogo();

  useEffect(() => {
    if (abierto && areas.length === 0) {
      getAreasTurno().then((r) => setAreas(r.data)).catch(() => {});
    }
  }, [abierto, areas.length]);

  // Al cambiar de oficio se cierra el formulario para no turnar el equivocado.
  useEffect(() => { setAbierto(false); setDestino(''); setMotivo(''); setError(null); }, [oficio.id]);

  if (!oficio.puede_turnar) return null;

  /** Regresarlo a quien lo mandó: solo tiene sentido si llegó por un turno. */
  const devolver = async () => {
    const motivo = await dialogo.pedirTexto({
      titulo:      'Devolver el oficio',
      mensaje:     'Se regresará a quien te lo turnó y se le informará el motivo.',
      etiqueta:    '¿Por qué no le compete a tu área?',
      placeholder: 'ESCRIBE EL MOTIVO…',
      confirmar:   'Devolver',
      peligro:     true,
    });
    if (!motivo) return;
    setDevolviendo(true); setError(null);
    try {
      await devolverTurno(oficio.id, motivo);
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo devolver el oficio');
    } finally {
      setDevolviendo(false);
    }
  };

  const enviar = async () => {
    if (!destino || !motivo.trim()) return;
    const area = areas.find((a) => a.id === destino);
    const sigue = await dialogo.confirmar({
      titulo:    'Turnar a otra área',
      mensaje:   `El oficio ${oficio.folio} dejará tu área y pasará a «${area?.nombre}», donde iniciará su trámite.`,
      confirmar: 'Turnar',
    });
    if (!sigue) return;

    setSaving(true); setError(null);
    try {
      await turnarOficio(oficio.id, Number(destino), motivo.trim());
      setAbierto(false); setDestino(''); setMotivo('');
      onDone?.();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo turnar el oficio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Competencia
          </span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px' }}>
            Si lo solicitado no corresponde a tu área, túrnalo a la que sí.
          </span>
        </div>
        {!abierto && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {oficio.puede_devolver_turno && (
              <button
                type="button"
                onClick={devolver}
                disabled={devolviendo}
                title="Regresarlo a quien te lo turnó, por no ser de tu competencia"
                style={{ ...btnSec, color: '#B45309', borderColor: '#B45309', opacity: devolviendo ? 0.6 : 1 }}
              >
                {devolviendo ? 'Devolviendo…' : 'Devolver a quien lo turnó'}
              </button>
            )}
            <button type="button" onClick={() => setAbierto(true)} style={btnSec}>Turnar a otra área</button>
          </div>
        )}
      </div>

      {!abierto && error && (
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}

      {abierto && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
          <select
            value={destino === '' ? '' : String(destino)}
            onChange={(e) => setDestino(e.target.value ? Number(e.target.value) : '')}
            style={input}
          >
            <option value="">— Selecciona el área —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre} · {a.titular}</option>
            ))}
          </select>

          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.toUpperCase())}
            rows={2}
            placeholder="¿POR QUÉ CORRESPONDE A ESA ÁREA?"
            style={{ ...input, resize: 'vertical', textTransform: 'uppercase' }}
          />

          {error && <p style={{ margin: 0, fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} style={btnSec}>Cancelar</button>
            <button
              type="button"
              onClick={enviar}
              disabled={saving || !destino || !motivo.trim()}
              style={{ ...btnPri, opacity: (saving || !destino || !motivo.trim()) ? 0.5 : 1 }}
            >
              {saving ? 'Turnando…' : 'Turnar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '8px',
  padding: '14px', marginBottom: '14px', backgroundColor: theme.colors.background,
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
