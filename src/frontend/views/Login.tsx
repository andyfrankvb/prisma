/**
 * View: Login — Gobierno del Estado de Quintana Roo
 * Diseño basado en el Toolkit Oficial 2022|2027
 */

import React, { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme, FONDO_INSTITUCIONAL } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { GlifoMaya } from '../components/GlifoMaya';
import { getRecursos, urlArchivoRecurso } from '../api';
import type { RecursoPublico } from '../api';

export const Login: React.FC = () => {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const isMobile   = useIsMobile();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // Recursos públicos (video y manual) — configurables desde el SUPERADMIN.
  // Si el endpoint falla, simplemente no se muestran: no debe estorbar el login.
  const [recursos, setRecursos] = useState<RecursoPublico[]>([]);
  useEffect(() => {
    getRecursos().then((r) => setRecursos(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      // Siempre redirigir a la pantalla de selección de módulo
      // SeleccionModulo se encarga de redirigir automáticamente si solo hay 1 módulo
      navigate('/seleccionar-modulo', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  /*
   * `alignItems: flex-start` + `margin: auto` en la tarjeta, y no
   * `alignItems: center`: centrado así, una tarjeta más alta que la ventana se
   * desborda por arriba Y por abajo, y la mitad de arriba queda fuera de alcance
   * —no hay forma de subir el scroll hasta ella—. Con `margin: auto` queda igual
   * de centrada mientras quepa, y cuando no cabe se puede recorrer entera. Se
   * nota en portátiles de 768 px de alto, no en un monitor grande.
   */
  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'flex-start',
      justifyContent: 'center',
      // Los márgenes exteriores ceden primero cuando sobra poco alto.
      padding:        isMobile ? '20px 14px' : 'clamp(12px, 3vh, 32px)',
      background:     FONDO_INSTITUCIONAL,
      fontFamily:     theme.font.family,
    }}>

      {/* Tarjeta: el bloque flota sobre el degradado, como en la selección de
          módulos. Se parte en dos —identidad y formulario— y en móvil se apila
          quedando solo el formulario, donde el ancho no da para las dos mitades. */}
      <div style={{
        display:       'flex',
        margin:        'auto',
        width:         '100%',
        maxWidth:      '960px',
        // 560 px era fijo: en una pantalla de 768 px de alto la tarjeta ya no
        // cabía junto con sus márgenes. Ahora es el menor de los dos, así que en
        // monitores grandes se ve idéntica y en portátiles se ajusta sola.
        minHeight:     isMobile ? 0 : 'min(560px, 82vh)',
        borderRadius:  '18px',
        overflow:      'hidden',
        backgroundColor: theme.colors.surface,
        boxShadow:     '0 2px 10px rgba(61,57,53,0.12), 0 24px 60px rgba(61,57,53,0.30)',
      }}>

        {/* ── Panel de identidad ──────────────────────────────────
            El logotipo NO va aquí: es guinda sobre transparente y sobre este
            fondo desaparecería. Va del lado blanco, donde se lee entero. */}
        {!isMobile && (
          <div style={{
            flex:           '0 0 42%',
            position:       'relative',
            overflow:       'hidden',
            display:        'flex',
            flexDirection:  'column',
            justifyContent: 'center',
            padding:        'clamp(28px, 5vh, 52px) 44px',
            background:     `linear-gradient(150deg, ${theme.colors.primary} 0%, ${theme.colors.primaryDark} 100%)`,
          }}>
            {/* Glifos mayas como filigrana de fondo, en lugar de círculos
                genéricos. Van a opacidad muy baja y sangrados por los bordes:
                se perciben como textura, no como ilustración, y no le disputan
                la lectura al titular. */}
            <div style={{ position: 'absolute', top: '-56px', right: '-70px',
                          color: 'rgba(255,255,255,0.14)' }}>
              <GlifoMaya variante="perfil" size={280} />
            </div>
            <div style={{ position: 'absolute', bottom: '-70px', left: '-64px',
                          color: 'rgba(255,255,255,0.10)' }}>
              <GlifoMaya variante="ojo" size={230} />
            </div>
            <div style={{ position: 'absolute', top: '46%', right: '-96px',
                          color: `${theme.colors.gold}45` }}>
              <GlifoMaya variante="sol" size={190} />
            </div>

            {/* Solo la marca, en grande. El PNG es guinda sobre transparente y
                aquí se perdería, así que se pasa a blanco con un filtro: eso
                respeta la transparencia y evita la caja blanca detrás. Si algún
                día hay una versión monocromática oficial, se cambia el src y se
                quita el filtro. */}
            <img
              src="/PRISMA1.png"
              alt="PRISMA — Plataforma de Control y Seguimiento"
              style={{
                position:  'relative',
                width:     '100%',
                maxWidth:  '330px',
                height:    'auto',
                objectFit: 'contain',
                margin:    '0 auto',
                filter:    'brightness(0) invert(1)',
              }}
            />
          </div>
        )}

        {/* ── Panel del formulario ──────────────────────────────── */}
        <div style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        isMobile ? '34px 24px' : 'clamp(28px, 5vh, 52px) 48px',
          backgroundColor: theme.colors.surface,
        }}>
          <div style={{
            width:        '100%',
            maxWidth:     '380px',
          }}>
          {/* En escritorio la marca ya preside el panel de al lado; repetirla
              aquí la duplicaría. Solo aparece cuando ese panel se oculta. */}
          {isMobile && (
            <img
              src="/PRISMA1.png"
              alt="PRISMA — Plataforma de Control y Seguimiento"
              style={{
                height: '52px', width: 'auto', maxWidth: '100%',
                objectFit: 'contain', display: 'block', marginBottom: '28px',
              }}
            />
          )}
          <h2 style={{
            margin:      '0 0 8px',
            fontSize:    '1.5rem',
            fontWeight:  900,
            color:       theme.colors.primaryDark,
            fontFamily:  theme.font.family,
          }}>
            Iniciar Sesión
          </h2>
          <p style={{
            margin:      '0 0 36px',
            color:       theme.colors.textSecondary,
            fontSize:    '0.875rem',
          }}>
            Ingresa tus credenciales para acceder al sistema
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle} htmlFor="email">
                Usuario
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="ej. juanperez"
              />
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={labelStyle} htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div role="alert" style={{
                marginBottom:    '20px',
                padding:         '12px 16px',
                borderRadius:    theme.radius.sm,
                backgroundColor: '#FDE8EF',
                color:           theme.colors.primary,
                fontSize:        '0.875rem',
                fontWeight:      500,
                borderLeft:      `3px solid ${theme.colors.primary}`,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-login"
              disabled={loading}
              style={{
                fontFamily: theme.font.family,
                ['--btn-color' as any]:      theme.colors.primary,
                ['--btn-color-dark' as any]: theme.colors.primaryDark,
              } as React.CSSProperties}
            >
              {loading && <span className="spinner" aria-hidden />}
              {loading ? 'Verificando…' : 'Ingresar'}
            </button>
          </form>

          {/* ── Recursos públicos (configurables por el SUPERADMIN) ── */}
          {recursos.length > 0 && (
            <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: `1px solid ${theme.colors.border}`, display: 'grid', gap: '10px' }}>
              {recursos.map((r) => (
                <a
                  key={r.slot}
                  className="recurso-card"
                  href={r.tipo === 'enlace' ? r.url : urlArchivoRecurso(r.slot)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={recursoVars}
                >
                  <span style={recursoTitulo}>{r.titulo}</span>
                  <span className="recurso-flecha" aria-hidden>→</span>
                </a>
              ))}
            </div>
          )}

          <p style={{
            marginTop:  '28px',
            textAlign:  'center',
            fontSize:   '0.72rem',
            color:      theme.colors.grayMid,
          }}>
            Unidos para Transformar · Quintana Roo 2022–2027
          </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Estilos de los apartados de recursos ──
// El diseño (animación, hover) vive en global.css bajo .recurso-card; aquí solo
// se pasan los colores del tema como variables CSS.
const recursoVars = {
  ['--recurso-acento' as any]: theme.colors.primary,
  ['--recurso-borde'  as any]: theme.colors.border,
} as React.CSSProperties;

const recursoTitulo: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 700, color: theme.colors.charcoal,
  fontFamily: theme.font.family, minWidth: 0, lineHeight: 1.35,
};

const labelStyle: React.CSSProperties = {
  display:      'block',
  marginBottom: '6px',
  fontWeight:   700,
  fontSize:     '0.8rem',
  color:        theme.colors.charcoal,
  textTransform:'uppercase',
  letterSpacing:'0.05em',
  fontFamily:   theme.font.family,
};

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '12px 14px',
  border:       `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  fontSize:     '0.9rem',
  fontFamily:   theme.font.family,
  outline:      'none',
  boxSizing:    'border-box',
  color:        theme.colors.textPrimary,
  backgroundColor: theme.colors.white,
  transition:   'border-color 0.2s',
};
