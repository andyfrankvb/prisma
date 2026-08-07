/**
 * Component: Modal — Quintana Roo theme
 *
 * Mejoras UX:
 *  - El header (con la X) queda FIJO arriba (sticky): no se va con el scroll.
 *  - `closeOnBackdrop` (default true): si es false, hacer clic afuera NO cierra
 *    (evita cierres accidentales, p. ej. al ingresar un oficio).
 *  - `confirmClose` (default false): pide confirmación antes de cerrar (X o Esc).
 */
import React, { useEffect, useRef } from 'react';
import { theme } from '../theme';

interface Props {
  open:             boolean;
  title:            string;
  onClose:          () => void;
  children:         React.ReactNode;
  width?:           string | number;
  closeOnBackdrop?: boolean;   // cerrar al hacer clic en el fondo (default: true)
  confirmClose?:    boolean;   // pedir confirmación antes de cerrar (default: false)
}

export const Modal: React.FC<Props> = ({
  open, title, onClose, children, width = 520,
  closeOnBackdrop = true, confirmClose = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const requestClose = () => {
    if (confirmClose && !window.confirm('¿Deseas cerrar esta ventana? Se perderán los datos que hayas capturado.')) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, confirmClose, onClose]);   // eslint-disable-line react-hooks/exhaustive-deps

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
      onClick={(e) => { if (e.target === e.currentTarget && closeOnBackdrop) requestClose(); }}
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
        {/* Header — FIJO arriba (sticky): no se desplaza con el scroll */}
        <div style={{
          position:        'sticky', top: 0, zIndex: 2,
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
          <button onClick={requestClose} aria-label="Cerrar" style={{
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
