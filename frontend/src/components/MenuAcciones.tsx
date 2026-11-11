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
  /**
   * Identificador estable para las acciones que alguien más necesita reconocer.
   * «Turnar a otra área» es la única que abre un formulario, y el expediente lo
   * despliega ahí mismo en vez de mandar a otra pantalla; sin esto habría que
   * reconocerla por su rótulo, que es justo lo que cambia con el tiempo.
   */
  id?:      string;
  label:    string;
  /**
   * Qué hace, en una línea. Lo usa la lista del expediente, donde hay espacio y
   * la persona está decidiendo; el menú de la columna se queda solo con el
   * rótulo, porque ahí lo que estorba es el alto.
   */
  descripcion?: string;
  onClick:  () => void;
  /** Tiñe la acción según lo que hace: aprobar, devolver, o solo consultar. */
  tono?:    'normal' | 'positivo' | 'atencion' | 'neutro';
  /**
   * Por qué no se puede hacer ahora. La acción se muestra igual, apagada y con
   * el motivo debajo: esconderla dejaba a la persona sin saber qué le falta.
   */
  bloqueada?: string | null;
}

/**
 * Paleta institucional, sin colores ajenos: el carbón para lo ordinario, el
 * guinda para la acción que cierra el paso y el dorado para lo que devuelve.
 */
const TONO: Record<string, string> = {
  normal:   theme.colors.charcoal,
  positivo: theme.colors.primary,
  atencion: theme.colors.gold,
  neutro:   theme.colors.charcoal,
};

/**
 * Las mismas acciones, pero desplegadas dentro del expediente.
 *
 * En la lista van detrás de un botón porque compiten por el ancho de la columna;
 * en el detalle hay espacio, así que se muestran una debajo de otra y con su
 * explicación. Esconderlas obligaría a cerrar el expediente, buscar el renglón y
 * abrir el menú para hacer lo que se acaba de leer que hay que hacer.
 *
 * Se alimenta de la misma lista que el menú: si las dos se armaran por separado,
 * tarde o temprano una ofrecería algo que la otra no.
 */
export const ListaAcciones: React.FC<{ acciones: AccionMenu[] }> = ({ acciones }) => {
  if (acciones.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>
        Ahora mismo no hay nada que hacer con este oficio.
      </p>
    );
  }
  return (
    // Una debajo de otra y a todo lo ancho, no en rejilla: cada una lleva su
    // explicación, y en columnas quedaban de distinto alto según lo larga que
    // fuera la frase. En fila vertical se leen como una lista de opciones.
    <div style={{ display: 'grid', gap: '8px' }}>
      {acciones.map((a) => {
        const color = a.bloqueada ? theme.colors.textSecondary : TONO[a.tono ?? 'normal'];
        return (
          <button
            key={a.label}
            type="button"
            disabled={!!a.bloqueada}
            onClick={() => { if (!a.bloqueada) a.onClick(); }}
            // El movimiento va con transform y sombra, no con márgenes ni bordes:
            // así el botón se levanta sin empujar a los de abajo.
            onMouseEnter={(e) => {
              if (a.bloqueada) return;
              e.currentTarget.style.transform   = 'translateY(-2px)';
              e.currentTarget.style.boxShadow   = `0 6px 16px ${color}22`;
              e.currentTarget.style.borderColor = color;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform   = 'translateY(0)';
              e.currentTarget.style.boxShadow   = 'none';
              e.currentTarget.style.borderColor = theme.colors.border;
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px',
              width: '100%', padding: '13px 16px', borderRadius: '10px', textAlign: 'left',
              cursor: a.bloqueada ? 'not-allowed' : 'pointer',
              fontFamily: theme.font.family,
              backgroundColor: '#fff',
              border: `1px solid ${theme.colors.border}`,
              opacity: a.bloqueada ? 0.65 : 1,
              transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
            }}
          >
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color }}>{a.label}</span>
            {/* El motivo del bloqueo manda sobre la descripción: si no se puede
                hacer, lo que hace falta saber es por qué, no para qué sirve. */}
            {(a.bloqueada || a.descripcion) && (
              <span style={{ fontSize: '0.74rem', fontWeight: 400, color: theme.colors.textSecondary, lineHeight: 1.4 }}>
                {a.bloqueada ?? a.descripcion}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
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
    const alto = acciones.length * 32 + 12;
    // Si no cabe abajo, se despliega hacia arriba en vez de salirse de pantalla.
    const haciaArriba = r.bottom + alto > window.innerHeight - 8;
    setPos({
      top:  haciaArriba ? r.top - alto - 4 : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - 196, window.innerWidth - 204)),
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
              disabled={!!a.bloqueada}
              title={a.bloqueada ?? undefined}
              onClick={(e) => { e.stopPropagation(); if (a.bloqueada) return; setAbierto(false); a.onClick(); }}
              style={{
                display: 'block', width: '100%',
                padding: '7px 10px', borderRadius: '6px',
                cursor: a.bloqueada ? 'not-allowed' : 'pointer',
                border: 'none', background: 'transparent', textAlign: 'left',
                fontFamily: theme.font.family, fontSize: '0.8rem', fontWeight: 600,
                color: a.bloqueada ? theme.colors.textSecondary : TONO[a.tono ?? 'normal'],
              }}
              onMouseEnter={(e) => { if (!a.bloqueada) e.currentTarget.style.backgroundColor = theme.colors.background; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {a.label}
              {a.bloqueada && (
                <span style={{
                  display: 'block', fontSize: '0.68rem', fontWeight: 400,
                  marginTop: '2px', lineHeight: 1.35,
                }}>
                  {a.bloqueada}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
