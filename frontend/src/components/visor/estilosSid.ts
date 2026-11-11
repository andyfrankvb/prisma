/**
 * Estilos compartidos: Visor de Documentos
 * File: src/frontend/components/visor/estilosSid.ts
 *
 * Reconstruye el lenguaje visual de SID (tarjetas redondeadas con sombra,
 * tabs con acento guinda, tablas con encabezado pegajoso, badges en
 * pastilla) con los tokens de `theme.ts` — sin Bootstrap.
 */
import type React from 'react';
import { theme } from '../../theme';

export const SIDEBAR_WIDTH = '380px';

export const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: `${SIDEBAR_WIDTH} minmax(0, 1fr)`, gap: '20px', alignItems: 'start', width: '100%',
};

export const card: React.CSSProperties = {
  background: theme.colors.surface, borderRadius: theme.radius.lg, boxShadow: theme.shadow.sm,
  border: `1px solid ${theme.colors.border}`, width: '100%',
};

export const cardBody: React.CSSProperties = { padding: '16px' };

export const cardHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 16px', borderBottom: `1px solid ${theme.colors.border}`,
};

export const etiqueta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px',
  fontSize: '0.72rem', fontWeight: 700, color: theme.colors.textSecondary,
};

export const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 12px', borderRadius: '999px',
  border: `1px solid ${theme.colors.border}`, fontSize: '0.82rem', fontFamily: theme.font.family,
};

export const botonPrimario: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '999px', fontWeight: 700,
  fontSize: '0.82rem', fontFamily: theme.font.family, cursor: 'pointer', border: 'none',
  background: theme.colors.primary, color: '#fff',
};

export const botonOutline = (color: string): React.CSSProperties => ({
  padding: '7px 16px', borderRadius: '999px', fontWeight: 700, fontSize: '0.78rem',
  fontFamily: theme.font.family, cursor: 'pointer', border: `1px solid ${color}55`,
  background: `${color}0F`, color,
});

export const badge = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: '999px',
  fontSize: '0.72rem', fontWeight: 700, background: bg, color: fg,
});

export const tabsWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px',
};

export const tab = (activa: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 20px',
  borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, fontFamily: theme.font.family,
  cursor: 'pointer', border: `1px solid ${activa ? theme.colors.primary : theme.colors.border}`,
  background: activa ? theme.colors.primary : theme.colors.surface,
  color: activa ? '#fff' : theme.colors.textSecondary,
  boxShadow: activa ? theme.shadow.sm : 'none',
  transition: 'all 0.15s ease',
});

export const tablaWrap: React.CSSProperties = { width: '100%', maxHeight: 'calc(100vh - 290px)', overflow: 'auto' };

export const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: '640px' };

export const th: React.CSSProperties = {
  position: 'sticky', top: 0, textAlign: 'left', padding: '10px 14px', fontSize: '0.7rem', fontWeight: 700,
  letterSpacing: '0.03em', textTransform: 'uppercase', color: theme.colors.textSecondary,
  background: theme.colors.background, borderBottom: `1px solid ${theme.colors.border}`, whiteSpace: 'nowrap',
};

export const td: React.CSSProperties = {
  padding: '9px 14px', fontSize: '0.82rem', color: theme.colors.textPrimary,
  borderBottom: `1px solid ${theme.colors.border}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

export const filaClicable = (activa: boolean): React.CSSProperties => ({
  cursor: 'pointer', background: activa ? `${theme.colors.primary}12` : 'transparent',
});

export const scrollLista: React.CSSProperties = { maxHeight: '320px', overflowY: 'auto', marginTop: '10px' };

export const itemLista = (activo: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: theme.radius.sm,
  cursor: 'pointer', marginBottom: '4px',
  background: activo ? `${theme.colors.primary}14` : 'transparent',
  outline: activo ? `1px solid ${theme.colors.primary}55` : 'none',
});

export const itemListaNumero = (activo: boolean): React.CSSProperties => ({
  width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
  background: activo ? theme.colors.primary : theme.colors.background,
  color: activo ? '#fff' : theme.colors.textSecondary,
});
