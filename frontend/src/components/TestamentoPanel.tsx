/**
 * TestamentoPanel — búsqueda de testamentos.
 *
 * Un oficio de testamentos se resuelve en dos etapas con plazo fijo de 3 días
 * hábiles: 2 para que las delegaciones busquen y entreguen, y 1 para que la
 * Dirección General arme el proyecto de contestación.
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
import { cuentaPlazo }                  from '../utils/diasHabiles';
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

  /**
   * La cuenta del plazo en palabras, con su color: verde con holgura, ámbar al
   * filo, rojo una vez pasado. Va en días hábiles, los mismos con los que se fijó
   * el vencimiento.
   */
  const Cuenta: React.FC<{ hasta?: string | null }> = ({ hasta }) => {
    const c = cuentaPlazo(hasta);
    if (!c) return null;

    const plural = (n: number) => (n === 1 ? 'día hábil' : 'días hábiles');

    const texto =
      c.estado === 'hoy'     ? 'vence hoy'
      : c.estado === 'restan' ? (c.dias === 1 ? 'queda 1 día hábil' : `quedan ${c.dias} ${plural(c.dias)}`)
      // Si venció el viernes y hoy es sábado no ha pasado ningún día hábil:
      // decir «vencido hace 0 días» sería absurdo.
      : c.dias === 0          ? 'vencido'
      : `vencido hace ${c.dias} ${plural(c.dias)}`;

    const color =
      c.estado === 'vencido' ? theme.colors.alert.red
      : c.estado === 'hoy' || c.dias <= 1 ? theme.colors.alert.yellow
      : theme.colors.alert.green;

    return (
      <span style={{
        marginLeft: '8px', padding: '1px 8px', borderRadius: '20px',
        fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
        color, backgroundColor: `${color}1F`,
      }}>
        {texto}
      </span>
    );
  };

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
      border: `1px solid ${oficio.testamento ? '#AB0A3D' : theme.colors.border}`,
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
              {/* Marcado, el plazo no se repite: las dos fechas van abajo con su
                  cuenta de días. Sin marcar todavía no hay fechas que mostrar, y
                  ahí el total sí informa de lo que se está aceptando. */}
              {oficio.testamento
                ? 'Búsqueda en curso en las delegaciones.'
                : 'Búsqueda de testamentos: 3 días hábiles en total — 2 para las delegaciones y 1 para el proyecto.'}
            </span>
          </span>
        </label>
      </div>

      {oficio.testamento_sin_delegatorio && (
        <p style={{
          margin: '10px 0 0 26px', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          {/* Nombraba «Delegar a otra área», que ya no existe: las tres formas de
              mandar un oficio se unificaron bajo «Turnar a otra área», y de sus
              opciones «Solicitud a otra área» es la única que conserva el
              expediente y hace que la delegación conteste.

              Sin el plazo: las fechas van justo abajo, con su cuenta de días. */}
          Falta solicitar la búsqueda. Abre «Turnar a otra área» y elige
          <strong> «Solicitud a otra área»</strong>: el expediente permanece a tu cargo y las
          delegaciones deben devolverte su respuesta. Selecciona ahí las que la realizarán.
        </p>
      )}

      {oficio.testamento && (
        <div style={{ display: 'grid', gap: '6px', marginTop: '10px', marginLeft: '26px', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: theme.colors.textSecondary }}>Delegaciones entregan:&nbsp;</span>
            <strong>{fecha(oficio.testamento_vence_delegaciones)}</strong>
            <Cuenta hasta={oficio.testamento_vence_delegaciones} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: theme.colors.textSecondary }}>Proyecto de contestación:&nbsp;</span>
            <strong>{fecha(oficio.testamento_vence_encargado)}</strong>
            <Cuenta hasta={oficio.testamento_vence_encargado} />
          </div>
        </div>
      )}

      {error && (
        <p style={{ margin: '8px 0 0 26px', fontSize: '0.72rem', color: theme.colors.alert.red }}>{error}</p>
      )}
    </div>
  );
};


