/**
 * SeccionCorreos — las cuentas de correo que usa cada quien al registrar.
 *
 * Vivían dentro de «Catálogos de dependencias y remitentes», y no era su lugar:
 * aquellos son listas de la institución, iguales para todos, y estas son de cada
 * persona. La cuenta de la ventanilla de Chetumal no tiene por qué aparecerle a
 * quien captura en Cancún.
 *
 * No hay «Agregar»: los correos se guardan solos al registrar un oficio que llegó
 * por correo, que es el único momento en que se sabe cuáles se usan de verdad.
 * Aquí solo se corrige un dedazo o se quita el que ya no sirve.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import { getCorreos, editarCorreo, eliminarCorreo, adoptarCorreo } from '../api';
import type { CorreoItem, TipoCorreo } from '../api';
import { useDialogo } from '../context/DialogoContext';
import { useIsMobile } from '../hooks/useIsMobile';

const Lista: React.FC<{
  tipo:      TipoCorreo;
  titulo:    string;
  subtitulo: string;
  onError:   (m: string) => void;
}> = ({ tipo, titulo, subtitulo, onError }) => {
  const [items,    setItems]    = useState<CorreoItem[]>([]);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState('');
  const dialogo = useDialogo();

  const cargar = useCallback(() => {
    getCorreos(tipo).then((r) => setItems(r.data)).catch((e) => onError(e.message));
  }, [tipo, onError]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (id: number) => {
    const valor = borrador.trim().toLowerCase();
    if (!valor) return;
    try { await editarCorreo(tipo, id, valor); setEditando(null); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  const quitar = async (c: CorreoItem) => {
    const sigue = await dialogo.confirmar({
      titulo:    'Quitar de tu lista',
      mensaje:   `«${c.nombre}» dejará de aparecerte al registrar. Los oficios que ya se capturaron con esa cuenta no cambian.`,
      confirmar: 'Quitar',
      peligro:   true,
    });
    if (!sigue) return;
    try { await eliminarCorreo(tipo, c.id); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  /**
   * Reclamar un heredado. Son los que venían del catálogo anterior, cuando la
   * lista era una sola para toda la institución: no se sabe de quién eran, así
   * que se le muestran a todos hasta que alguien diga que es suyo. Usarlo al
   * registrar también lo reclama, sin tener que venir aquí.
   */
  const adoptar = async (c: CorreoItem) => {
    try { await adoptarCorreo(tipo, c.id); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  return (
    <div style={caja}>
      <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: theme.colors.primaryDark }}>{titulo}</h3>
      <p style={{ margin: '4px 0 12px', fontSize: '0.78rem', color: theme.colors.textSecondary }}>{subtitulo}</p>

      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>
          Todavía no has usado ninguna. La primera que captures al registrar un oficio aparecerá aquí sola.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '6px' }}>
          {items.map((c) => (
            <div key={c.id} style={fila}>
              {editando === c.id ? (
                <>
                  <input
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value.toLowerCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardar(c.id); if (e.key === 'Escape') setEditando(null); }}
                    autoFocus
                    style={input}
                  />
                  <button onClick={() => guardar(c.id)} style={{ ...btn, color: theme.colors.primary }}>Guardar</button>
                  <button onClick={() => setEditando(null)} style={btn}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '0.84rem', wordBreak: 'break-all' }}>
                    {c.nombre}
                    {c.heredado && (
                      <span
                        title="Venía de la lista antigua, que era de todos. Nadie la ha reclamado."
                        style={{
                          marginLeft: '8px', fontSize: '0.66rem', fontWeight: 700, padding: '1px 7px',
                          borderRadius: '9px', backgroundColor: '#FEF3C7', color: '#92400E', whiteSpace: 'nowrap',
                        }}
                      >
                        Heredado
                      </span>
                    )}
                  </span>
                  {c.heredado && (
                    <button onClick={() => adoptar(c)} title="Pasa a tu lista y deja de verla el resto"
                            style={{ ...btn, color: theme.colors.primary }}>
                      Es mío
                    </button>
                  )}
                  <button
                    onClick={() => { setEditando(c.id); setBorrador(c.nombre); }}
                    title="Corregir la escritura"
                    style={{ ...btn, color: theme.colors.primary }}
                  >
                    Editar
                  </button>
                  <button onClick={() => quitar(c)} title="Quitarla de tu lista" style={{ ...btn, color: '#B45309' }}>
                    Quitar
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SeccionCorreos: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px', fontFamily: theme.font.family, maxWidth: '960px', margin: '0 auto' }}>
      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: theme.colors.textPrimary }}>
        Mis correos de ingreso
      </h2>
      <p style={{ margin: '6px 0 20px', fontSize: '0.85rem', color: theme.colors.textSecondary }}>
        Las cuentas que tú usas al registrar oficios que llegan por correo. Son tuyas: nadie más las ve
        ni tú ves las de los demás. Se guardan solas la primera vez que las capturas, así que aquí solo
        hay que corregir un dedazo o quitar la que ya no uses.
      </p>

      {error && (
        <div role="alert" onClick={() => setError(null)}
          style={{ marginBottom: '14px', padding: '9px 12px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '0.8rem', cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Lista
          tipo="origen"
          titulo="Correos de quien envía"
          subtitulo="Cuentas desde las que te mandan los oficios"
          onError={setError}
        />
        <Lista
          tipo="destino"
          titulo="Correos que reciben"
          subtitulo="Cuentas institucionales donde tú los recibes"
          onError={setError}
        />
      </div>
    </div>
  );
};

// ── estilos ──
const caja: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`, borderRadius: '10px',
  padding: '16px', backgroundColor: theme.colors.surface,
};
const fila: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '7px 10px', border: `1px solid ${theme.colors.border}`, borderRadius: '7px',
};
const input: React.CSSProperties = {
  flex: 1, padding: '6px 8px', border: `1px solid ${theme.colors.border}`,
  borderRadius: '6px', fontSize: '0.84rem', fontFamily: theme.font.family, minWidth: 0,
};
const btn: React.CSSProperties = {
  padding: '4px 9px', background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: theme.font.family, fontSize: '0.76rem', fontWeight: 700,
  color: theme.colors.textSecondary, whiteSpace: 'nowrap',
};
