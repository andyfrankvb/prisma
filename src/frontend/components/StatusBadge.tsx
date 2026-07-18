/**
 * Component: StatusBadge — Quintana Roo theme
 */
import React from 'react';
import { theme } from '../theme';
import type { EstatusOficio } from '../types';

interface Props { estatus: EstatusOficio; }

export const StatusBadge: React.FC<Props> = ({ estatus }) => {
  const cfg = theme.estatus[estatus] ?? { bg: '#EDE9E4', text: '#3D3935', label: estatus };
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
