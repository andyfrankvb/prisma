/**
 * MenuAcciones — las acciones de un renglón, detrás de un solo botón.
 *
 * Cada función nueva del módulo agregaba otro botón a la columna de acciones, y
 * la columna crecía a lo ancho hasta descuadrar la tabla: un oficio recién
 * recibido mostraba dos botones, uno aprobado mostraba cuatro. Aquí todas caben
 * en el mismo ancho, y el renglón deja de moverse según el estatus.
 *
 * El panel se dibuja fuera de la tabla, colgado del <body>, y se coloca con
 * coordenadas de pantalla. Dejarlo dentro de la celda no funciona: aunque quede
 * en la posición correcta, las filas lo pintan encima. Por vivir fuera del flujo
 * se cierra al hacer scroll, porque si no quedaría flotando lejos de su botón.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../theme';

export interface AccionMenu {
  label:    string;
  onClick:  () => void;
  icono?:   string;
  /** Tiñe la acción según lo que hace: aprobar, devolver, o solo consultar. */
  tono?:    'normal' | 'positivo' | 'atencion' | 'neutro';
}

const TONO: Record<string, string> = {
  normal:   theme.colors.textPrimary,
  positivo: '#065F46',
  atencion: '#92400E',
  neutro:   '#1E40AF',
};

export const MenuAcciones: React.FC<{ acciones: AccionMenu[] }> = ({ acciones }) => {
  const [abierto, setAbierto] = useState(false);
  const [pos,     setPos]     = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    // `true` para enterarse también del scroll de la tabla, que no burbujea.
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    window.addEventListener('keydown', conEsc);
    document.addEventListener('mousedown', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('keydown', conEsc);
      document.removeEventListener('mousedown', cerrar);
    };
  }, [abierto]);

  if (acciones.length === 0) {
    return <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>—</span>;
  }

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const alto = acciones.length * 34 + 12;
    // Si no cabe abajo, se despliega hacia arriba en vez de salirse de pantalla.
    const haciaArriba = r.bottom + alto > window.innerHeight - 8;
    setPos({
      top:  haciaArriba ? r.top - alto - 4 : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - 210, window.innerWidth - 218)),
    });
    setAbierto(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); abierto ? setAbierto(false) : abrir(); }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '5px 11px', borderRadius: '7px', cursor: 'pointer',
          fontFamily: theme.font.family, fontSize: '0.76rem', fontWeight: 700,
          color: theme.colors.primary, backgroundColor: '#fff',
          border: `1px solid ${theme.colors.primary}`, whiteSpace: 'nowrap',
        }}
      >
        Acciones
        <span style={{ fontSize: '0.6rem' }}>▾</span>
      </button>

      {abierto && pos && createPortal(
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: '210px', zIndex: 60,
            backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`,
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(61,57,53,.16)',
            padding: '6px', display: 'grid', gap: '2px',
          }}
        >
          {acciones.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setAbierto(false); a.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
                padding: '7px 10px', borderRadius: '7px', cursor: 'pointer',
                border: 'none', background: 'transparent', textAlign: 'left',
                fontFamily: theme.font.family, fontSize: '0.79rem', fontWeight: 600,
                color: TONO[a.tono ?? 'normal'],
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.colors.background; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {a.icono && <span style={{ width: '16px', flexShrink: 0 }}>{a.icono}</span>}
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
