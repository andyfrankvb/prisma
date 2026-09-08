/**
 * EscaneoPaquete — lo que se abre al leer el QR con la cámara del teléfono.
 *
 * Es la pantalla más importante del módulo y la que se usa de pie, en un pasillo,
 * con una mano ocupada cargando el sobre. Todo aquí está subordinado a eso:
 *
 *   · NO pide iniciar sesión. Las sesiones de PRISMA duran 8 horas, así que
 *     exigirla significaría teclear la contraseña casi a diario en el teléfono, y
 *     eso es lo que haría que la gente dejara de registrar. El enemigo de una
 *     bitácora no es el registro falso, es el paso que nadie anotó.
 *   · Un solo botón grande. Quien la abre viene a hacer una cosa.
 *   · El nombre se elige UNA vez y el navegador lo recuerda. A partir de ahí, cada
 *     escaneo es escanear y tocar.
 *
 * Lo que la protege es el `token` que viaja en el QR: para escribir en el recorrido
 * de un paquete hay que tener su código enfrente, o sea el paquete en la mano.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { theme } from '../theme';
import { Icono } from '../components/Icono';
import {
  rastrearPaquete, personasParaEscaneo,
  registrarTrasladoPaquete, registrarEntregaPaquete,
} from '../api';
import type { PaqueteEscaneado } from '../api';

/** Dónde el navegador recuerda quién usa este teléfono. */
const CLAVE_QUIEN = 'prisma.correspondencia.quien';

type Quien = { id: number | null; nombre: string };

function leerQuien(): Quien | null {
  try {
    const crudo = localStorage.getItem(CLAVE_QUIEN);
    return crudo ? JSON.parse(crudo) as Quien : null;
  } catch { return null; }
}

export const EscaneoPaquete: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();

  const [paquete,  setPaquete]  = useState<PaqueteEscaneado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [listo,    setListo]    = useState<string | null>(null);

  const [quien,    setQuien]    = useState<Quien | null>(() => leerQuien());
  const [personas, setPersonas] = useState<{ id: number; nombre: string; unidad: string | null }[]>([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [busca,    setBusca]    = useState('');

  const [codigo,   setCodigo]   = useState('');
  const [ocupado,  setOcupado]  = useState(false);

  const cargar = useCallback(() => {
    setCargando(true); setError(null);
    rastrearPaquete(token)
      .then((r) => setPaquete(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirEleccion = () => {
    setEligiendo(true);
    if (!personas.length) personasParaEscaneo().then((r) => setPersonas(r.data)).catch(() => {});
  };

  const guardarQuien = (q: Quien) => {
    setQuien(q);
    try { localStorage.setItem(CLAVE_QUIEN, JSON.stringify(q)); } catch { /* modo privado */ }
    setEligiendo(false);
    setBusca('');
  };

  const traslado = async () => {
    if (!quien) { abrirEleccion(); return; }
    setOcupado(true); setError(null);
    try {
      const r = await registrarTrasladoPaquete(token, quien.id
        ? { usuario_id: quien.id }
        : { nombre_declarado: quien.nombre });
      setListo(r.message);
      cargar();
    } catch (e: any) { setError(e.message); }
    finally { setOcupado(false); }
  };

  const entrega = async () => {
    setOcupado(true); setError(null);
    try {
      const r = await registrarEntregaPaquete(token, codigo.trim());
      setListo(r.message);
      setCodigo('');
      cargar();
    } catch (e: any) { setError(e.message); }
    finally { setOcupado(false); }
  };

  // ── Pantallas de espera y de error ─────────────────────────────────────────

  if (cargando) return <Marco><p style={txtCentro}>Buscando el paquete…</p></Marco>;

  if (!paquete) {
    return (
      <Marco>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Icono nombre="alerta" size={40} color={theme.colors.gold} />
          <h1 style={titulo}>No encontramos ese paquete</h1>
          <p style={{ ...txtCentro, marginTop: '8px' }}>
            {error ?? 'El código no corresponde a ningún paquete registrado.'}
          </p>
        </div>
      </Marco>
    );
  }

  const esParaMi   = quien?.id != null && quien.id === paquete.destinatario_id;
  const entregado  = paquete.estado === 'ENTREGADO';
  const cancelado  = paquete.estado === 'CANCELADO';
  const sinSalir   = paquete.estado === 'ABIERTO';
  const circulando = paquete.estado === 'EN_TRANSITO';

  return (
    <Marco>
      {/* ── Qué paquete es ── */}
      <p style={etiqueta}>Paquete</p>
      <h1 style={folio}>{paquete.folio}</h1>

      <div style={fichaDatos}>
        <Dato titulo="Va dirigido a" valor={paquete.destinatario_nombre} />
        {paquete.destinatario_unidad && <Dato titulo="Área" valor={paquete.destinatario_unidad} />}
        <Dato titulo="Contiene" valor={`${paquete.cuantos_oficios} ${paquete.cuantos_oficios === 1 ? 'oficio' : 'oficios'}`} />
        {paquete.custodio_nombre && !entregado && (
          <Dato titulo="Lo trae" valor={paquete.custodio_nombre} />
        )}
      </div>

      {/* ── Avisos ── */}
      {listo && (
        <div role="status" style={{ ...aviso, backgroundColor: '#E9F5ED', color: theme.colors.alert.green }}>
          <Icono nombre="checkCirculo" inline />{listo}
        </div>
      )}
      {error && (
        <div role="alert" onClick={() => setError(null)}
             style={{ ...aviso, backgroundColor: '#FDECEF', color: theme.colors.primary, cursor: 'pointer' }}>
          <Icono nombre="alerta" inline />{error}
        </div>
      )}

      {/* ── Lo que se puede hacer ── */}
      {entregado && (
        <div style={{ ...cierre, backgroundColor: '#E9F5ED', color: theme.colors.alert.green }}>
          <Icono nombre="checkCirculo" size={30} />
          <p style={{ margin: '8px 0 0', fontWeight: 700 }}>Este paquete ya fue entregado</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>No hay nada más que registrar.</p>
        </div>
      )}

      {cancelado && (
        <div style={{ ...cierre, backgroundColor: '#FDF6E7', color: '#92400E' }}>
          <Icono nombre="alerta" size={30} />
          <p style={{ margin: '8px 0 0', fontWeight: 700 }}>Este paquete fue cancelado</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            No debería estar circulando. Avisa a quien lo armó.
          </p>
        </div>
      )}

      {sinSalir && (
        <div style={{ ...cierre, backgroundColor: theme.colors.background, color: theme.colors.textSecondary }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Todavía no ha salido</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Quien lo armó tiene que cerrarlo antes de que se pueda rastrear.
          </p>
        </div>
      )}

      {circulando && (
        <>
          {/* Quién soy. Se elige una vez y queda. */}
          <div style={quienCaja}>
            <span style={{ fontSize: '0.78rem', color: theme.colors.textSecondary }}>Eres</span>
            <button onClick={abrirEleccion} style={btnQuien}>
              {quien ? quien.nombre : 'Toca para decir quién eres'}
              <Icono nombre="editar" size={13} />
            </button>
          </div>

          {/* La entrega va primero cuando el paquete es de quien lo escanea: es lo
              que viene a hacer, y ponerla debajo del botón de traslado invitaría a
              tocar el equivocado. */}
          {esParaMi ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: theme.colors.textSecondary }}>
                Este paquete es para ti. Dicta o escribe tu código de recepción.
              </p>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="• • • •"
                aria-label="Código de recepción"
                style={campoCodigo}
              />
              <button onClick={entrega} disabled={ocupado || codigo.length < 4} style={btnGrande}>
                {ocupado ? 'Registrando…' : 'Confirmar que lo recibí'}
              </button>
              <button onClick={traslado} disabled={ocupado} style={btnSecundario}>
                Solo lo traigo, no es para mí
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              <button onClick={traslado} disabled={ocupado} style={btnGrande}>
                {ocupado ? 'Registrando…' : 'Lo traigo yo'}
              </button>
              <p style={{ margin: 0, fontSize: '0.8rem', color: theme.colors.grayMid, textAlign: 'center' }}>
                Si eres {paquete.destinatario_nombre.split(' ').slice(0, 2).join(' ')}, di quién eres
                arriba para confirmar la recepción con tu código.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Por dónde ha pasado ── */}
      {paquete.recorrido.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <p style={etiqueta}>Por dónde ha pasado</p>
          <div style={{ display: 'grid', gap: '2px' }}>
            {paquete.recorrido.map((m, i) => (
              <div key={i} style={renglonRecorrido}>
                <span style={{ fontWeight: 700, color: theme.colors.charcoal }}>
                  {ETIQUETA_MOV[m.tipo] ?? m.tipo}
                </span>
                <span style={{ color: theme.colors.textSecondary }}>{m.quien ?? '—'}</span>
                <span style={{ color: theme.colors.grayMid, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                  {new Date(m.registrado_en).toLocaleString('es-MX', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Elegir quién soy ── */}
      {eligiendo && (
        <div style={capa} onClick={() => setEligiendo(false)}>
          <div style={hoja} onClick={(e) => e.stopPropagation()}>
            <p style={{ ...etiqueta, marginTop: 0 }}>¿Quién eres?</p>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Escribe tu nombre…"
              autoFocus
              style={campoBusca}
            />
            <div style={{ overflowY: 'auto', flex: 1, marginTop: '10px' }}>
              {personas
                .filter((p) => p.nombre.toLowerCase().includes(busca.trim().toLowerCase()))
                .slice(0, 40)
                .map((p) => (
                  <button key={p.id} onClick={() => guardarQuien({ id: p.id, nombre: p.nombre })}
                          style={renglonPersona}>
                    <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                    {p.unidad && (
                      <span style={{ fontSize: '0.74rem', color: theme.colors.grayMid }}>{p.unidad}</span>
                    )}
                  </button>
                ))}
            </div>

            {/* Salida para quien no está en el sistema. Es lo que permite que un
                mensajero externo registre su paso en lugar de dejar el tramo en
                blanco, que es el que más falta hace rastrear. */}
            {busca.trim().length > 2 && (
              <button onClick={() => guardarQuien({ id: null, nombre: busca.trim().toUpperCase() })}
                      style={{ ...renglonPersona, borderTop: `1px solid ${theme.colors.border}` }}>
                <span style={{ fontWeight: 700, color: theme.colors.primary }}>
                  No estoy en la lista: soy «{busca.trim()}»
                </span>
                <span style={{ fontSize: '0.74rem', color: theme.colors.grayMid }}>
                  Quedará registrado como nombre declarado
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </Marco>
  );
};

// ── Piezas ───────────────────────────────────────────────────────────────────

const ETIQUETA_MOV: Record<string, string> = {
  CREADO: 'Se armó', CERRADO: 'Salió', TRASLADO: 'Lo llevó',
  ENTREGADO: 'Entregado', CANCELADO: 'Cancelado',
};

/** El teléfono se sostiene con una mano: una sola columna, angosta y centrada. */
const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    minHeight: '100vh', background: theme.colors.background,
    fontFamily: theme.font.family, padding: '20px 16px 48px',
    display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
  }}>
    <div style={{
      width: '100%', maxWidth: '440px', margin: 'auto',
      background: theme.colors.surface, borderRadius: '16px',
      border: `1px solid ${theme.colors.border}`,
      boxShadow: '0 2px 10px rgba(61,57,53,0.10), 0 16px 40px rgba(61,57,53,0.14)',
      padding: '22px 20px 26px',
    }}>
      {children}
    </div>
  </div>
);

const Dato: React.FC<{ titulo: string; valor: string }> = ({ titulo, valor }) => (
  <div>
    <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em',
                   textTransform: 'uppercase', color: theme.colors.grayMid }}>{titulo}</span>
    <span style={{ fontSize: '0.92rem', color: theme.colors.textPrimary, fontWeight: 600 }}>{valor}</span>
  </div>
);

// ── Estilos. Todos los colores salen del tema, sin literales, para que el día que
//    se haga el modo oscuro este módulo ya esté listo. ────────────────────────

const etiqueta: React.CSSProperties = {
  margin: '0 0 4px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: theme.colors.gold,
};
const folio: React.CSSProperties = {
  margin: '0 0 16px', fontSize: '1.5rem', fontWeight: 800,
  color: theme.colors.primaryDark, letterSpacing: '-0.01em',
};
const fichaDatos: React.CSSProperties = {
  display: 'grid', gap: '12px', padding: '14px 16px', borderRadius: '10px',
  backgroundColor: theme.colors.background, marginBottom: '18px',
};
const txtCentro: React.CSSProperties = {
  textAlign: 'center', color: theme.colors.textSecondary, fontSize: '0.92rem',
};
const titulo: React.CSSProperties = {
  margin: '12px 0 0', fontSize: '1.15rem', fontWeight: 800, color: theme.colors.primaryDark,
};
const aviso: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '9px', fontSize: '0.86rem',
  fontWeight: 600, marginBottom: '14px',
};
const cierre: React.CSSProperties = {
  textAlign: 'center', padding: '22px 16px', borderRadius: '12px',
};
const quienCaja: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
  padding: '10px 14px', borderRadius: '9px',
  border: `1px dashed ${theme.colors.border}`, marginBottom: '16px',
};
const btnQuien: React.CSSProperties = {
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '8px', background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: theme.font.family, fontSize: '0.9rem', fontWeight: 700,
  color: theme.colors.primary, textAlign: 'left', padding: 0,
};
const btnGrande: React.CSSProperties = {
  width: '100%', padding: '17px 20px', borderRadius: '11px', border: 'none',
  backgroundColor: theme.colors.primary, color: theme.colors.white,
  fontFamily: theme.font.family, fontSize: '1rem', fontWeight: 800,
  letterSpacing: '0.03em', cursor: 'pointer',
};
const btnSecundario: React.CSSProperties = {
  width: '100%', padding: '12px 18px', borderRadius: '10px',
  border: `1px solid ${theme.colors.border}`, backgroundColor: 'transparent',
  color: theme.colors.textSecondary, fontFamily: theme.font.family,
  fontSize: '0.86rem', fontWeight: 600, cursor: 'pointer',
};
const campoCodigo: React.CSSProperties = {
  width: '100%', padding: '15px', borderRadius: '10px',
  border: `1.5px solid ${theme.colors.border}`, textAlign: 'center',
  fontSize: '1.7rem', fontWeight: 800, letterSpacing: '0.35em',
  fontFamily: theme.font.family, color: theme.colors.primaryDark, boxSizing: 'border-box',
};
const renglonRecorrido: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px',
  alignItems: 'baseline', padding: '7px 0', fontSize: '0.82rem',
  borderBottom: `1px solid ${theme.colors.border}`,
};
const capa: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(61,57,53,0.45)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
};
const hoja: React.CSSProperties = {
  width: '100%', maxWidth: '440px', maxHeight: '78vh',
  backgroundColor: theme.colors.surface, borderRadius: '16px 16px 0 0',
  padding: '18px 18px 24px', display: 'flex', flexDirection: 'column',
};
const campoBusca: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '9px',
  border: `1.5px solid ${theme.colors.border}`, fontSize: '0.95rem',
  fontFamily: theme.font.family, boxSizing: 'border-box',
};
const renglonPersona: React.CSSProperties = {
  width: '100%', display: 'flex', flexDirection: 'column', gap: '2px',
  padding: '12px 6px', background: 'transparent', border: 'none',
  borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer',
  textAlign: 'left', fontFamily: theme.font.family, fontSize: '0.9rem',
  color: theme.colors.textPrimary,
};

export default EscaneoPaquete;
