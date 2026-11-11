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
import { getCorreos, editarCorreo, eliminarCorreo, adoptarCorreo, getCorreosRegistrados } from '../api';
import type { CorreoItem, TipoCorreo, CorreoRegistrado } from '../api';
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

/**
 * Quién tiene correos dados de alta. Solo para el SuperAdmin.
 *
 * El resto de la pantalla es privado a propósito: cada quien ve su lista y nadie
 * ve la de los demás. Eso deja al administrador entrando a «Mis correos», sin ver
 * nada —ninguno es suyo— y con la impresión de que la función no guarda nada.
 * Este bloque responde esa pregunta: quién tiene, de qué área y cuáles.
 *
 * Es de solo lectura. Corregir o quitar un correo sigue siendo de su dueño: son
 * las cuentas con las que trabaja, y el administrador no tiene cómo saber cuál
 * dejó de servirle.
 */
const RegistradosPorUsuario: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [filas,    setFilas]    = useState<CorreoRegistrado[] | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState('');
  const [busca,    setBusca]    = useState('');
  const dialogo = useDialogo();

  const cargar = useCallback(() => {
    getCorreosRegistrados()
      .then((r) => setFilas(r.data))
      // Un 403 aquí no es una falla: es que quien mira no es el SuperAdmin. El
      // bloque simplemente no se dibuja, sin avisos que no vienen al caso.
      .catch(() => setFilas([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // El listado devuelve el tipo como lo guarda la base; las rutas lo esperan en
  // minúscula, que es como viaja en la URL.
  const ruta = (c: CorreoRegistrado): TipoCorreo =>
    (c.tipo === 'ORIGEN' ? 'origen' : 'destino');

  const guardar = async (c: CorreoRegistrado) => {
    const valor = borrador.trim().toLowerCase();
    if (!valor || valor === c.correo) { setEditando(null); return; }
    try { await editarCorreo(ruta(c), c.id, valor); setEditando(null); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  const quitar = async (c: CorreoRegistrado) => {
    const sigue = await dialogo.confirmar({
      titulo:  'Quitar el correo de otra persona',
      mensaje: `«${c.correo}» dejará de aparecerle a ${c.usuario_nombre ?? 'quien lo tenga'} al registrar. `
             + 'Los oficios ya capturados con esa cuenta no cambian.',
      confirmar: 'Quitar',
      peligro:   true,
    });
    if (!sigue) return;
    try { await eliminarCorreo(ruta(c), c.id); cargar(); }
    catch (e: any) { onError(e.message); }
  };

  if (!filas || filas.length === 0) return null;

  /**
   * El buscador filtra por las tres cosas con las que se llega hasta aquí: el
   * correo, la persona y su área. Se busca «gloria» igual que «catastro» o
   * «cozumel», sin tener que saber en qué columna cae.
   *
   * Se filtra en el navegador porque la lista completa ya está cargada: son los
   * correos de la institución, no un histórico que crezca sin freno, y una ida al
   * servidor por cada tecla no compraría nada.
   */
  const q = busca.trim().toLowerCase();
  const visibles = q
    ? filas.filter((f) => [f.correo, f.usuario_nombre, f.unidad_nombre]
        .some((campo) => (campo ?? '').toLowerCase().includes(q)))
    : filas;

  // Agrupado por persona, respetando el orden que ya trae el servidor: los
  // heredados —sin dueño— quedan al final, en su propio grupo.
  const grupos: { clave: string; nombre: string; unidad: string | null; items: CorreoRegistrado[] }[] = [];
  for (const f of visibles) {
    const clave = String(f.usuario_id ?? 'heredados');
    let g = grupos.find((x) => x.clave === clave);
    if (!g) {
      g = {
        clave,
        nombre: f.usuario_nombre ?? 'Sin dueño (heredados del catálogo anterior)',
        unidad: f.unidad_nombre ?? null,
        items:  [],
      };
      grupos.push(g);
    }
    g.items.push(f);
  }

  return (
    <div style={{ ...caja, marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: theme.colors.textPrimary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Correos registrados por usuario
        </span>
        <span style={{ fontSize: '0.72rem', color: theme.colors.grayMid }}>
          {q
            ? `${visibles.length} de ${filas.length}`
            : `${filas.length} en total · ${grupos.length} ${grupos.length === 1 ? 'lista' : 'listas'}`}
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '0.76rem', color: theme.colors.textSecondary }}>
        Se dan de alta solos cuando alguien registra un oficio recibido por correo. Desde aquí puedes
        corregir un dedazo o quitar el que ya no sirva, aunque sea de otra persona.
      </p>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por correo, persona o área…"
        aria-label="Buscar entre los correos registrados"
        style={{ ...input, flex: 'none', width: '100%', marginBottom: '14px' }}
      />

      {q && visibles.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.textSecondary }}>
          Ningún correo, persona o área coincide con «{busca.trim()}».
        </p>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {grupos.map((g) => (
          <div key={g.clave}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <strong style={{ fontSize: '0.82rem', color: theme.colors.primaryDark }}>{g.nombre}</strong>
              {g.unidad && (
                <span style={{ fontSize: '0.72rem', color: theme.colors.textSecondary }}>· {g.unidad}</span>
              )}
              <span style={{ fontSize: '0.72rem', color: theme.colors.grayMid }}>
                {g.items.length} {g.items.length === 1 ? 'correo' : 'correos'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: '5px' }}>
              {g.items.map((c) => (
                <div key={c.id} style={{ ...fila, gap: '10px' }}>
                  <span style={{
                    flexShrink: 0, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em',
                    padding: '2px 7px', borderRadius: '999px',
                    backgroundColor: c.tipo === 'ORIGEN' ? '#EDE9E4' : '#F3EDE3',
                    color: c.tipo === 'ORIGEN' ? theme.colors.charcoal : theme.colors.gold,
                  }}>
                    {c.tipo === 'ORIGEN' ? 'ENVÍA' : 'RECIBE'}
                  </span>
                  {editando === c.id ? (
                    <>
                      <input
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value.toLowerCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardar(c); if (e.key === 'Escape') setEditando(null); }}
                        autoFocus
                        style={input}
                      />
                      <button onClick={() => guardar(c)} style={{ ...btn, color: theme.colors.primary }}>Guardar</button>
                      <button onClick={() => setEditando(null)} style={btn}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '0.82rem', color: theme.colors.textPrimary, wordBreak: 'break-all' }}>
                        {c.correo}
                      </span>
                      <button
                        onClick={() => { setEditando(c.id); setBorrador(c.correo); }}
                        title="Corregir la escritura"
                        style={{ ...btn, color: theme.colors.primary }}
                      >
                        Editar
                      </button>
                      <button onClick={() => quitar(c)} title="Quitarlo de su lista" style={{ ...btn, color: '#B45309' }}>
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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

      {/* Solo se dibuja para el SuperAdmin: a los demás el servidor les responde
          403 y el bloque se queda callado. */}
      <RegistradosPorUsuario onError={setError} />
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
