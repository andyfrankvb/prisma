/**
 * Component: StatusBadge — Quintana Roo theme
 */
import React from 'react';
import { theme } from '../theme';
import type { EstatusOficio } from '../types';

interface Props {
  estatus: EstatusOficio;
  /**
   * El oficio llegó a esta área por un turno. RECIBIDO significa «nadie ha
   * tomado acción todavía», y sobre un oficio turnado sí se tomó una: se le
   * cambió de área. Por eso se distingue mientras no lo asignen.
   */
  turnado?: boolean;
  /** Llegó de vuelta porque el área a la que se turnó lo regresó. */
  devuelto?: boolean;
  /**
   * Oficio informativo: se cerró sin contestación ni firma. Decir «Finalizado»
   * daría a entender que hay un documento firmado, y no lo hay.
   */
  deConocimiento?: boolean;
}

export const StatusBadge: React.FC<Props> = ({ estatus, turnado, devuelto, deConocimiento }) => {
  const cfg = deConocimiento
    ? { bg: '#E0F2FE', text: '#075985', label: 'De conocimiento' }
    : (turnado && estatus === 'RECIBIDO')
    ? (devuelto
        ? { bg: '#FEF3C7', text: '#92400E', label: 'Devuelto' }
        : { bg: '#EDE9FE', text: '#5B21B6', label: 'Turnado' })
    : theme.estatus[estatus] ?? { bg: '#EDE9E4', text: '#3D3935', label: estatus };
  return (
    <span style={{
      display:         'inline-flex',
      alignItems:      'center',
      padding:         '3px 10px',
      borderRadius:    '20px',
      fontSize:        '0.7rem',
      fontWeight:      700,
      fontFamily:      theme.font.family,
      letterSpacing:   '0.05em',
      textTransform:   'uppercase',
      backgroundColor: cfg.bg,
      color:           cfg.text,
      whiteSpace:      'nowrap',
      border:          `1px solid ${cfg.text}22`,
    }}>
      {cfg.label}
    </span>
  );
};
