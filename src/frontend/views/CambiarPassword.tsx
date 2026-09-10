/**
 * CambiarPassword — el usuario cambia su propia contraseña.
 * File: src/frontend/views/CambiarPassword.tsx
 *
 * La misma pantalla sirve para los dos momentos en que esto ocurre, porque el
 * formulario es idéntico y solo cambia el tono:
 *
 *   · FORZADO. Entró con una contraseña que le puso el administrador —recién dado
 *     de alta, o le restablecieron la suya— y el sistema no le responde nada más
 *     hasta que la cambie. Aquí no hay «Cancelar»: no hay a dónde volver.
 *   · VOLUNTARIO. La quiere cambiar porque sí. Se llega desde la cabecera y se
 *     puede salir sin hacer nada.
 *
 * Al guardar, el token deja de valer: el servidor invalida todo lo firmado antes
 * del cambio, y eso es justamente lo que expulsa a cualquier otra sesión abierta
 * con la contraseña anterior. Por eso siempre se termina en el inicio de sesión,
 * incluso cuando el cambio fue voluntario.
 */
import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icono } from '../components/Icono';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { cambiarMiPassword } from '../api';

interface Props {
  /** true cuando la contraseña la puso un tercero y no se puede seguir sin cambiarla. */
  forzado?: boolean;
}

export const CambiarPassword: React.FC<Props> = ({ forzado = false }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [actual,   setActual]   = useState('');
  const [nueva,    setNueva]    = useState('');
  const [repetir,  setRepetir]  = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [listo,    setListo]    = useState(false);

  // Se comprueba aquí y no solo en el servidor porque el servidor nunca ve este
  // campo: la repetición existe para atajar el dedazo antes de mandar nada.
  const noCoinciden = repetir.length > 0 && nueva !== repetir;
  const puedeGuardar = actual.length > 0 && nueva.length >= 8 && nueva === repetir && !guardando;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await cambiarMiPassword(actual, nueva);
      setListo(true);
      // Un respiro para que alcance a leerse el mensaje antes de salir.
      setTimeout(() => { logout(); navigate('/login', { replace: true }); }, 2200);
    } catch (err: any) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const campo: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${theme.colors.border}`, fontSize: '0.9rem',
    fontFamily: theme.font.family, backgroundColor: '#FFFDF0',
  };
  const etiqueta: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 700,
    color: theme.colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '5px',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: theme.font.family, backgroundColor: theme.colors.surface,
    }}>
      <div style={{
        width: '100%', maxWidth: '420px', backgroundColor: '#fff',
        border: `1px solid ${theme.colors.border}`, borderRadius: '14px',
        padding: '28px 26px', boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: theme.colors.primaryDark }}>
          {forzado ? 'Cambia tu contraseña' : 'Cambiar contraseña'}
        </h1>

        <p style={{ margin: '8px 0 20px', fontSize: '0.85rem', color: theme.colors.textSecondary, lineHeight: 1.5 }}>
          {forzado
            ? 'Tu contraseña actual la definió el administrador, así que él también la conoce. Elige una nueva para que sea solo tuya; hasta entonces no podrás usar el sistema.'
            : 'Al guardar se cerrarán todas las sesiones abiertas con tu contraseña anterior, incluida esta.'}
        </p>

        {user && (
          <p style={{ margin: '0 0 18px', fontSize: '0.8rem', color: theme.colors.textPrimary }}>
            <Icono nombre="persona" inline />{user.nombre}
          </p>
        )}

        {listo ? (
          <div role="status" style={{
            padding: '14px 16px', borderRadius: '8px', backgroundColor: '#D1FAE5',
            border: '1px solid #6EE7B7', color: '#065F46', fontSize: '0.85rem', lineHeight: 1.5,
          }}>
            <strong>Contraseña actualizada.</strong> Te llevamos al inicio de sesión para que entres con la nueva.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={etiqueta} htmlFor="pw-actual">
                  {forzado ? 'Contraseña que te dieron' : 'Contraseña actual'}
                </label>
                <input id="pw-actual" type="password" value={actual} autoComplete="current-password"
                  onChange={(e) => setActual(e.target.value)} style={campo} />
              </div>

              <div>
                <label style={etiqueta} htmlFor="pw-nueva">Nueva contraseña</label>
                <input id="pw-nueva" type="password" value={nueva} autoComplete="new-password"
                  onChange={(e) => setNueva(e.target.value)} style={campo} />
                <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: theme.colors.textSecondary }}>
                  Al menos 8 caracteres.
                </p>
              </div>

              <div>
                <label style={etiqueta} htmlFor="pw-repetir">Repite la nueva</label>
                <input id="pw-repetir" type="password" value={repetir} autoComplete="new-password"
                  onChange={(e) => setRepetir(e.target.value)}
                  style={{ ...campo, borderColor: noCoinciden ? theme.colors.alert.red : theme.colors.border }} />
                {noCoinciden && (
                  <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: theme.colors.alert.red }}>
                    Las dos no coinciden.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div role="alert" style={{
                marginTop: '16px', padding: '10px 12px', borderRadius: '8px',
                backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5',
                color: '#991B1B', fontSize: '0.8rem',
              }}>
                <Icono nombre="alerta" inline />{error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
              {!forzado && (
                <button type="button" onClick={() => navigate(-1)} style={{
                  flex: 1, padding: '11px', borderRadius: '8px', cursor: 'pointer',
                  border: `1px solid ${theme.colors.border}`, backgroundColor: '#fff',
                  fontSize: '0.85rem', fontWeight: 600, fontFamily: theme.font.family,
                }}>
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={!puedeGuardar} style={{
                flex: 2, padding: '11px', borderRadius: '8px', border: 'none',
                backgroundColor: theme.colors.primary, color: '#fff',
                fontSize: '0.85rem', fontWeight: 700, fontFamily: theme.font.family,
                cursor: puedeGuardar ? 'pointer' : 'not-allowed',
                opacity: puedeGuardar ? 1 : 0.5,
              }}>
                {guardando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </div>
          </form>
        )}

        {forzado && !listo && (
          <button type="button" onClick={() => { logout(); navigate('/login', { replace: true }); }}
            style={{
              marginTop: '18px', background: 'none', border: 'none', cursor: 'pointer',
              color: theme.colors.textSecondary, fontSize: '0.78rem',
              fontFamily: theme.font.family, textDecoration: 'underline',
            }}>
            Salir sin cambiarla
          </button>
        )}
      </div>
    </div>
  );
};
