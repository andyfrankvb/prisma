/**
 * Component: AppShell — Gobierno del Estado de Quintana Roo
 * Barra superior con identidad visual del Toolkit 2022|2027
 */

import React from 'react';
import { useNavigate }       from 'react-router-dom';
import { useAuth }           from '../context/AuthContext';
import { NotificationBell }  from './NotificationBell';
import { FondoGlifos }       from './FondoGlifos';
import { theme }             from '../theme';
import { useIsMobile }       from '../hooks/useIsMobile';

interface Props { children: React.ReactNode; }

export const AppShell: React.FC<Props> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const isMobile         = useIsMobile();

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      fontFamily: theme.font.family,
      // Sin fondo propio: lo pinta FondoGlifos desde atrás. Uno opaco aquí
      // taparía la filigrana, que va en una capa con zIndex negativo.
    }}>

      <FondoGlifos />

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header style={{
        background:    theme.colors.white,
        padding:       isMobile ? '0 12px' : '0 26px',
        height:        '58px',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        flexShrink:    0,
        boxShadow:     `0 2px 12px rgba(0,0,0,0.1)`,
        position:      'sticky',
        top:           0,
        zIndex:        100,
      }}>

        {/* Left: logo only */}
        <img
          src="/LOGO.PRISMA.png"
          alt="PRISMA"
          style={{
            // Tope práctico: la barra mide 58 px, así que por encima de 52 el
            // logo empieza a tocar los bordes y se pierde el aire.
            height:    '52px',
            width:     'auto',
            objectFit: 'contain',
            display:   'block',
            flexShrink: 0,
          }}
        />

        {/* Right: usuario + campana + salir */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px' }}>

          {/* En móvil se oculta el bloque de texto del usuario para ahorrar espacio */}
          {user && !isMobile && (
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ color: theme.colors.primary, fontSize: '0.82rem', fontWeight: 700 }}>
                {user.nombre}
              </div>
            </div>
          )}

          <NotificationBell />

          {/* Botón: volver a selección de módulos */}
          <button
            onClick={() => navigate('/seleccionar-modulo', { replace: true })}
            aria-label="Cambiar módulo"
            style={{
              background:    'transparent',
              border:        `1px solid ${theme.colors.primary}`,
              color:         theme.colors.primary,
              padding:       '6px 14px',
              borderRadius:  theme.radius.sm,
              fontSize:      '0.75rem',
              fontWeight:    700,
              fontFamily:    theme.font.family,
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
              cursor:        'pointer',
              transition:    'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(171,10,61,0.08)`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {isMobile ? '←' : '← Módulos'}
          </button>

          {/* Botón: cerrar sesión */}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            style={{
              background:    'transparent',
              border:        `1px solid rgba(171,10,61,0.3)`,
              color:         theme.colors.primary,
              padding:       '6px 14px',
              borderRadius:  theme.radius.sm,
              fontSize:      '0.75rem',
              fontWeight:    700,
              fontFamily:    theme.font.family,
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
              cursor:        'pointer',
              transition:    'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(171,10,61,0.08)`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {isMobile ? '⎋' : 'Cerrar sesión'}
          </button>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────── */}
      {/* Sin `position` ni `zIndex`: en cuanto los tenía, se volvía un contexto
          de apilamiento y encerraba a sus elementos fijos —el visor a pantalla
          completa quedaba por debajo del encabezado y no se podía reducir—. */}
      <main style={{ flex: 1, overflow: 'auto', backgroundColor: 'transparent' }}>
        {children}
      </main>
    </div>
  );
};
