/**
 * Estilos compartidos entre dashboards — Quintana Roo theme
 * File: src/frontend/styles.ts
 */
import { theme } from './theme';
import type React from 'react';

export const thStyle: React.CSSProperties = {
  padding:       '13px 16px',
  textAlign:     'left',
  fontWeight:    700,
  fontSize:      '0.72rem',
  whiteSpace:    'nowrap',
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  fontFamily:    theme.font.family,
  color:         theme.colors.textSecondary,
  borderBottom:  `2px solid ${theme.colors.border}`,
};

export const tdStyle: React.CSSProperties = {
  padding:       '12px 16px',
  verticalAlign: 'middle',
  fontSize:      '0.875rem',
  fontFamily:    theme.font.family,
};

export const emptyCell: React.CSSProperties = {
  textAlign:  'center',
  padding:    '40px',
  color:      theme.colors.textSecondary,
  fontFamily: theme.font.family,
  fontSize:   '0.875rem',
};

export const inputStyle: React.CSSProperties = {
  width:           '100%',
  padding:         '10px 12px',
  border:          `1.5px solid ${theme.colors.border}`,
  borderRadius:    theme.radius.sm,
  fontSize:        '0.875rem',
  fontFamily:      theme.font.family,
  boxSizing:       'border-box' as const,
  color:           theme.colors.textPrimary,
  backgroundColor: theme.colors.white,
  outline:         'none',
};

export const selectStyle: React.CSSProperties = {
  padding:         '9px 12px',
  border:          `1.5px solid ${theme.colors.border}`,
  borderRadius:    theme.radius.sm,
  fontSize:        '0.875rem',
  fontFamily:      theme.font.family,
  backgroundColor: theme.colors.white,
  color:           theme.colors.textPrimary,
  cursor:          'pointer',
};

export const btnPrimary: React.CSSProperties = {
  padding:         '10px 22px',
  backgroundColor: theme.colors.primary,
  color:           theme.colors.white,
  border:          'none',
  borderRadius:    theme.radius.sm,
  fontWeight:      700,
  fontSize:        '0.8rem',
  fontFamily:      theme.font.family,
  letterSpacing:   '0.05em',
  textTransform:   'uppercase' as const,
  cursor:          'pointer',
  boxShadow:       theme.shadow.sm,
};

export const btnSecondary: React.CSSProperties = {
  padding:         '9px 18px',
  backgroundColor: theme.colors.white,
  color:           theme.colors.primary,
  border:          `1.5px solid ${theme.colors.primary}`,
  borderRadius:    theme.radius.sm,
  fontWeight:      700,
  fontSize:        '0.8rem',
  fontFamily:      theme.font.family,
  letterSpacing:   '0.04em',
  textTransform:   'uppercase' as const,
  cursor:          'pointer',
};

export const btnAction: React.CSSProperties = {
  padding:         '5px 12px',
  backgroundColor: theme.colors.primary,
  color:           theme.colors.white,
  border:          'none',
  borderRadius:    theme.radius.sm,
  fontSize:        '0.72rem',
  fontWeight:      700,
  fontFamily:      theme.font.family,
  letterSpacing:   '0.04em',
  textTransform:   'uppercase' as const,
  cursor:          'pointer',
  marginRight:     '4px',
};

export const alertStyle: React.CSSProperties = {
  padding:         '10px 14px',
  backgroundColor: '#FDE8EF',
  color:           theme.colors.primary,
  borderRadius:    theme.radius.sm,
  fontSize:        '0.875rem',
  marginBottom:    '12px',
  borderLeft:      `3px solid ${theme.colors.primary}`,
  fontFamily:      theme.font.family,
};

export const labelStyle: React.CSSProperties = {
  display:       'block',
  marginBottom:  '6px',
  fontWeight:    700,
  fontSize:      '0.72rem',
  color:         theme.colors.charcoal,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  fontFamily:    theme.font.family,
};

export const sectionTitleStyle: React.CSSProperties = {
  margin:        0,
  color:         theme.colors.primaryDark,
  fontSize:      '1.1rem',
  fontWeight:    900,
  fontFamily:    theme.font.family,
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
};

export const tableHeaderStyle: React.CSSProperties = {
  backgroundColor: theme.colors.surface,
};

export const detailPanelHeaderStyle: React.CSSProperties = {
  padding:        '14px 20px',
  background:     `linear-gradient(90deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 100%)`,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  flexShrink:     0,
};

export const pageHeaderStyle: React.CSSProperties = {
  padding:         '20px 24px 0',
  backgroundColor: theme.colors.surface,
  borderBottom:    `1px solid ${theme.colors.border}`,
};
