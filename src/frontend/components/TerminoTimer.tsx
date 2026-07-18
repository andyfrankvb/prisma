/**
 * Component: TerminoTimer
 * Shows a traffic-light indicator + countdown for deadline-bound oficios.
 *
 * Traffic-light rules:
 *  RED    → tiene_termino && dias_restantes <= 1
 *  YELLOW → tiene_termino && dias_restantes <= 3
 *  GREEN  → !tiene_termino || dias_restantes > 3
 */

import React, { useMemo } from 'react';
import { theme } from '../theme';

interface Props {
  tiene_termino:     boolean;
  fecha_vencimiento: string | null;
}

function calcDiasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy       = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence     = new Date(fecha);
  vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

type Semaforo = 'RED' | 'YELLOW' | 'GREEN';

function getSemaforo(tiene_termino: boolean, dias: number | null): Semaforo {
  if (!tiene_termino || dias === null) return 'GREEN';
  if (dias <= 1) return 'RED';
  if (dias <= 3) return 'YELLOW';
  return 'GREEN';
}

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  RED:    theme.colors.alert.red,
  YELLOW: theme.colors.alert.yellow,
  GREEN:  theme.colors.alert.green,
};

export const TerminoTimer: React.FC<Props> = ({ tiene_termino, fecha_vencimiento }) => {
  const dias      = useMemo(() => calcDiasRestantes(fecha_vencimiento), [fecha_vencimiento]);
  const semaforo  = getSemaforo(tiene_termino, dias);
  const color     = SEMAFORO_COLOR[semaforo];

  if (!tiene_termino) {
    return (
      <span style={{ color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
        Sin término
      </span>
    );
  }

  const label =
    dias === null
      ? '—'
      : dias < 0
      ? `Vencido (${Math.abs(dias)}d)`
      : dias === 0
      ? 'Vence hoy'
      : `${dias}d restante${dias !== 1 ? 's' : ''}`;

  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '6px',
        fontSize:     '0.8rem',
        fontWeight:   600,
        color,
      }}
      title={fecha_vencimiento ?? undefined}
    >
      {/* Traffic-light dot */}
      <span
        style={{
          width:        '10px',
          height:       '10px',
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink:   0,
        }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
};
