/**
 * Component: Modal — Quintana Roo theme
 */
import React, { useEffect, useRef } from 'react';
import { theme } from '../theme';

interface Props {
  open:     boolean;
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
  width?:   string | number;
}

export const Modal: React.FC<Props> = ({ open, title, onClose, children, width = 520 }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => { if (open) dialogRef.current?.focus(); }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="modal-title"
      style={{
        position:        'fixed', inset: 0, zIndex: 1000,
        display:         'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(61,57,53,0.55)',
        backdropFilter:  'blur(2px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef} tabIndex={-1}
        style={{
          background:   theme.colors.surface,
          borderRadius: theme.radius.lg,
          width, maxWidth: '95vw', maxHeight: '90vh',
          overflowY:    'auto',
          boxShadow:    theme.shadow.lg,
          outline:      'none',
          fontFamily:   theme.font.family,
        }}
      >
        {/* Header */}
        <div style={{
          display:         'flex', alignItems: 'center', justifyContent: 'space-between',
          padding:         '16px 24px',
          borderBottom:    `1px solid ${theme.colors.border}`,
          background:      `linear-gradient(90deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 100%)`,
          borderRadius:    `${theme.radius.lg} ${theme.radius.lg} 0 0`,
        }}>
          <h2 id="modal-title" style={{
            margin: 0, fontSize: '0.95rem', fontWeight: 900,
            color: theme.colors.white, letterSpacing: '0.02em',
            textTransform: 'uppercase', fontFamily: theme.font.family,
          }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{
            background: 'transparent', border: 'none',
            color: theme.colors.white, fontSize: '1.4rem',
            cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
};
