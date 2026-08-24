/**
 * Component: Modal — Quintana Roo theme
 *
 * Mejoras UX:
 *  - El header (con la X) queda FIJO arriba (sticky): no se va con el scroll.
 *  - `closeOnBackdrop` (default true): si es false, hacer clic afuera NO cierra
 *    (evita cierres accidentales, p. ej. al ingresar un oficio).
 *  - `confirmClose` (default false): pide confirmación antes de cerrar (X o Esc).
 */
import React, { useEffect, useRef, useState } from 'react';
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
  // La confirmación al cerrar se resuelve dentro del propio modal: usar el
  // diálogo del sistema aquí crearía un ciclo, porque ese diálogo es un Modal.
  const [confirmando, setConfirmando] = useState(false);

  const requestClose = () => {
    if (confirmClose) { setConfirmando(true); return; }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, confirmClose, onClose]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) dialogRef.current?.focus(); }, [open]);
  useEffect(() => { if (!open) setConfirmando(false); }, [open]);

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
        {confirmando && (
          <div style={{
            padding: '12px 24px', backgroundColor: '#FEF3C7',
            borderBottom: `1px solid ${theme.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '0.82rem', color: '#92400E' }}>
              ¿Cerrar esta ventana? Se perderá lo que hayas capturado.
            </span>
            <span style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                style={{
                  padding: '6px 14px', fontSize: '0.76rem', fontWeight: 700,
                  color: theme.colors.primary, backgroundColor: '#fff',
                  border: `1px solid ${theme.colors.primary}`, borderRadius: '6px',
                  cursor: 'pointer', fontFamily: theme.font.family,
                }}
              >
                Seguir capturando
              </button>
              <button
                type="button"
                onClick={() => { setConfirmando(false); onClose(); }}
                style={{
                  padding: '6px 14px', fontSize: '0.76rem', fontWeight: 700, color: '#fff',
                  backgroundColor: theme.colors.alert.red, border: 'none', borderRadius: '6px',
                  cursor: 'pointer', fontFamily: theme.font.family,
                }}
              >
                Cerrar y descartar
              </button>
            </span>
          </div>
        )}

        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
};
