/**
 * Diálogos del sistema — reemplazo de los cuadros nativos del navegador.
 *
 * `window.confirm`, `window.prompt` y `window.alert` no se pueden estilizar:
 * salen con la tipografía y los colores del navegador, dicen «localhost» y
 * rompen la imagen del sistema justo en el momento de confirmar una acción.
 *
 * Aquí viven los tres equivalentes, con el diseño de PRISMA. Se usan igual de
 * fácil porque devuelven una promesa:
 *
 *   const dialogo = useDialogo();
 *   if (!await dialogo.confirmar({ mensaje: '¿Continuar?' })) return;
 *   const motivo = await dialogo.pedirTexto({ mensaje: '¿Por qué?' });
 *   await dialogo.avisar({ mensaje: 'Listo' });
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { theme } from '../theme';
import { Modal } from '../components/Modal';

interface OpcionesBase {
  titulo?:  string;
  mensaje:  string;
  /** Texto del botón principal. */
  confirmar?: string;
  /** Acción destructiva o irreversible: el botón principal se pinta en rojo. */
  peligro?: boolean;
}

interface OpcionesTexto extends OpcionesBase {
  etiqueta?:    string;
  placeholder?: string;
  /** Valor inicial del campo. */
  valor?:       string;
  /** Convertir a mayúsculas mientras se escribe, como el resto del módulo. */
  mayusculas?:  boolean;
  /** Exigir que se escriba algo para poder continuar. Por omisión sí. */
  obligatorio?: boolean;
}

interface API {
  confirmar:  (o: OpcionesBase)  => Promise<boolean>;
  pedirTexto: (o: OpcionesTexto) => Promise<string | null>;
  avisar:     (o: OpcionesBase)  => Promise<void>;
}

const DialogoContext = createContext<API | null>(null);

type Tipo = 'confirmar' | 'texto' | 'aviso';

interface Estado extends OpcionesTexto {
  tipo: Tipo;
}

export const DialogoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [texto,  setTexto]  = useState('');
  const resolver = useRef<((v: any) => void) | null>(null);

  const abrir = useCallback((e: Estado): Promise<any> => {
    setEstado(e);
    setTexto(e.valor ?? '');
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const cerrar = (valor: any) => {
    resolver.current?.(valor);
    resolver.current = null;
    setEstado(null);
    setTexto('');
  };

  const api: API = {
    confirmar:  (o) => abrir({ ...o, tipo: 'confirmar' }),
    pedirTexto: (o) => abrir({ ...o, tipo: 'texto' }),
    avisar:     (o) => abrir({ ...o, tipo: 'aviso' }),
  };

  const esTexto     = estado?.tipo === 'texto';
  const esAviso     = estado?.tipo === 'aviso';
  const obligatorio = estado?.obligatorio !== false;
  const puedeSeguir = !esTexto || !obligatorio || texto.trim().length > 0;

  const aceptar = () => {
    if (!puedeSeguir) return;
    if (esTexto)  return cerrar(texto.trim());
    if (esAviso)  return cerrar(undefined);
    cerrar(true);
  };

  const cancelar = () => cerrar(esTexto ? null : esAviso ? undefined : false);

  return (
    <DialogoContext.Provider value={api}>
      {children}

      <Modal
        open={!!estado}
        title={estado?.titulo ?? (esAviso ? 'Aviso' : 'Confirmar')}
        onClose={cancelar}
        width={460}
      >
        {estado && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.55, color: theme.colors.textPrimary }}>
              {estado.mensaje}
            </p>

            {esTexto && (
              <div style={{ display: 'grid', gap: '6px' }}>
                {estado.etiqueta && (
                  <label style={{ fontSize: '0.76rem', fontWeight: 600, color: theme.colors.charcoal }}>
                    {estado.etiqueta}
                  </label>
                )}
                <textarea
                  autoFocus
                  rows={3}
                  value={texto}
                  onChange={(e) => setTexto(estado.mayusculas === false ? e.target.value : e.target.value.toUpperCase())}
                  placeholder={estado.placeholder ?? ''}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aceptar();
                  }}
                  style={{
                    width: '100%', padding: '9px 11px', boxSizing: 'border-box',
                    border: `1px solid ${theme.colors.border}`, borderRadius: '7px',
                    fontSize: '0.85rem', fontFamily: theme.font.family, resize: 'vertical',
                    textTransform: estado.mayusculas === false ? 'none' : 'uppercase',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '2px' }}>
              {!esAviso && (
                <button type="button" onClick={cancelar} style={btnSecundario}>Cancelar</button>
              )}
              <button
                type="button"
                onClick={aceptar}
                disabled={!puedeSeguir}
                style={{
                  ...btnPrimario,
                  backgroundColor: estado.peligro ? theme.colors.alert.red : theme.colors.primary,
                  opacity: puedeSeguir ? 1 : 0.5,
                  cursor: puedeSeguir ? 'pointer' : 'not-allowed',
                }}
              >
                {estado.confirmar ?? (esAviso ? 'Entendido' : 'Confirmar')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DialogoContext.Provider>
  );
};

/** Los diálogos del sistema. Requiere que la app esté dentro de DialogoProvider. */
export function useDialogo(): API {
  const ctx = useContext(DialogoContext);
  if (!ctx) throw new Error('useDialogo debe usarse dentro de DialogoProvider');
  return ctx;
}

// ── estilos ──
const btnPrimario: React.CSSProperties = {
  padding: '8px 18px', fontSize: '0.8rem', fontWeight: 700, color: '#fff',
  border: 'none', borderRadius: '7px', fontFamily: theme.font.family,
};
const btnSecundario: React.CSSProperties = {
  padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, color: theme.colors.primary,
  backgroundColor: '#fff', border: `1px solid ${theme.colors.primary}`, borderRadius: '7px',
  cursor: 'pointer', fontFamily: theme.font.family,
};
