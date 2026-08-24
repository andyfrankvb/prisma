/**
 * AccionesOficio — las acciones del expediente, agrupadas y plegadas.
 *
 * El registro en sistemas, la marca de conocimiento, el turno por competencia y
 * los delegatorios son cosas que se hacen de vez en cuando, pero ocupaban
 * espacio fijo y alargaban el detalle. Aquí viven detrás de un encabezado que se
 * abre solo cuando hacen falta, igual que el historial.
 *
 * Cuando algo requiere atención —falta un NCI, hay delegatorios sin contestar—
 * el encabezado lo avisa aunque esté cerrado, para que no se pase por alto.
 */
import React, { useEffect, useState } from 'react';
import { theme }               from '../theme';
import { SistemasPanel }       from './SistemasPanel';
import { DeConocimientoPanel } from './DeConocimientoPanel';
import { TurnarPanel }         from './TurnarPanel';
import { DelegatoriosPanel }   from './DelegatoriosPanel';
import { TestamentoPanel }     from './TestamentoPanel';
import type { Oficio }         from '../types';

interface Props {
  oficio: Oficio;
  /** Llegó la fila actualizada del oficio: la vista la fusiona con la que tiene. */
  onActualizar?: (actualizado: Oficio) => void;
  /** El oficio dejó esta área (turnado o devuelto): la vista cierra el detalle. */
  onSalio?: () => void;
  /** Algo cambió y hay que recargar, pero el oficio sigue aquí. */
  onRefrescar?: () => void;
  /** Mostrar los delegatorios dentro del grupo. */
  conDelegatorios?: boolean;
  /** Quién puede detonar un delegatorio. */
  puedeDelegar?: boolean;
}

export const AccionesOficio: React.FC<Props> = ({
  oficio, onActualizar, onSalio, onRefrescar, conDelegatorios = false, puedeDelegar = false,
}) => {
  const [abierto, setAbierto] = useState(false);

  // Al cambiar de oficio se pliega otra vez: cada expediente empieza compacto.
  useEffect(() => { setAbierto(false); }, [oficio.id]);

  // Lo que reclama atención aunque el grupo esté cerrado.
  const avisos: string[] = [];
  if (oficio.siqroo_aplica && !oficio.siqroo_control_interno) avisos.push('NCI de SIQROO pendiente');
  if (oficio.siger_aplica  && !oficio.siger_control_interno)  avisos.push('NCI de SIGER pendiente');
  if (oficio.testamento) avisos.push('Testamento en curso');
  if ((oficio.delegatorios_pendientes ?? 0) > 0) {
    const n = oficio.delegatorios_pendientes ?? 0;
    avisos.push(n === 1 ? '1 delegatorio sin contestar' : `${n} delegatorios sin contestar`);
  }

  return (
    <div style={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={encabezado}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: theme.colors.primary }}>
            Acciones del oficio
          </span>
          {avisos.length > 0 && !abierto && (
            <span style={chipAviso}>{avisos.join(' · ')}</span>
          )}
        </span>
        <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary, whiteSpace: 'nowrap' }}>
          {abierto ? 'Ocultar ▲' : 'Mostrar ▼'}
        </span>
      </button>

      {abierto && (
        <div style={{ marginTop: '12px' }}>
          <SistemasPanel oficio={oficio} onDone={(o) => onActualizar?.(o)} />
          <DeConocimientoPanel oficio={oficio} onDone={(o) => onActualizar?.(o)} />
          <TurnarPanel oficio={oficio} onDone={() => onSalio?.()} />
          {conDelegatorios && (
            <TestamentoPanel
              oficio={oficio}
              puedeDelegar={puedeDelegar}
              onCambio={() => onRefrescar?.()}
            />
          )}
          {conDelegatorios && (
            <DelegatoriosPanel
              oficioId={oficio.id}
              puedeDelegar={puedeDelegar}
              onCambio={() => onRefrescar?.()}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '12px 14px', marginBottom: '14px', backgroundColor: theme.colors.surface,
};
const encabezado: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
  width: '100%', padding: 0, background: 'transparent', border: 'none',
  cursor: 'pointer', textAlign: 'left', fontFamily: theme.font.family,
};
const chipAviso: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: '10px',
  backgroundColor: '#FEF3C7', color: '#92400E',
};
