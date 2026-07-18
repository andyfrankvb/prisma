/**
 * Component: AppShell — Gobierno del Estado de Quintana Roo
 * Barra superior con identidad visual del Toolkit 2022|2027
 */

import React from 'react';
import { useNavigate }       from 'react-router-dom';
import { useAuth }           from '../context/AuthContext';
import { NotificationBell }  from './NotificationBell';
import { theme }             from '../theme';
import { useIsMobile }       from '../hooks/useIsMobile';
import type { RolUsuario }   from '../types';

const ROL_LABEL: Record<RolUsuario, string> = {
  OFICIAL:    'Oficial de Partes',
  ENCARGADO:  'Director Jurídico',
  JURIDICO:   'Área Jurídica',
  SECRETARIA: 'Secretaría',
  DIRECTOR:   'Dirección General',
  SUPERADMIN: 'Super Administrador',
};

const ROL_BADGE_COLOR: Record<RolUsuario, string> = {
  OFICIAL:    '#B68400',
  ENCARGADO:  '#440412',
  JURIDICO:   '#065F46',
  SECRETARIA: '#1D4ED8',
  DIRECTOR:   '#AB0A3D',
  SUPERADMIN: '#4C1D95',
};

interface Props { children: React.ReactNode; }

export const AppShell: React.FC<Props> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const isMobile         = useIsMobile();

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: theme.font.family }}>

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header style={{
        background:    `linear-gradient(90deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 100%)`,
        padding:       isMobile ? '0 12px' : '0 24px',
        height:        '58px',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        flexShrink:    0,
        boxShadow:     '0 2px 12px rgba(68,4,18,0.35)',
        position:      'sticky',
        top:           0,
        zIndex:        100,
      }}>

        {/* Left: logo + nombre */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Logo PRISMA */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            padding:         '5px 12px',
            borderRadius:    '10px',
            background:      'linear-gradient(145deg, #ffffff 0%, #f1f1ec 100%)',
            boxShadow:       '0 2px 8px rgba(0,0,0,0.18)',
            flexShrink:      0,
          }}>
            <img
              src="/LOGO.PRISMA.png"
              alt="PRISMA"
              style={{
                height:    '34px',
                width:     'auto',
                objectFit: 'contain',
                display:   'block',
              }}
            />
          </div>

          <div>
            <div style={{
              color:         theme.colors.white,
              fontWeight:    900,
              fontSize:      '0.9rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight:    1.1,
            }}>
              PRISMA
            </div>
            <div style={{
              color:         theme.colors.gold,
              fontSize:      '0.62rem',
              fontWeight:    700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              RPPC
            </div>
          </div>
        </div>

        {/* Right: usuario + campana + salir */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px' }}>

          {/* En móvil se oculta el bloque de texto del usuario para ahorrar espacio */}
          {user && !isMobile && (
            <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
              <div style={{ color: theme.colors.white, fontSize: '0.82rem', fontWeight: 700 }}>
                {user.nombre}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                <span style={{
                  backgroundColor: ROL_BADGE_COLOR[user.rol] ?? theme.colors.primary,
                  color:           '#fff',
                  fontSize:        '0.6rem',
                  fontWeight:      700,
                  padding:         '1px 7px',
                  borderRadius:    '10px',
                  textTransform:   'uppercase',
                  letterSpacing:   '0.06em',
                }}>
                  {ROL_LABEL[user.rol]}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>
                  {user.oficina_nombre}
                </span>
              </div>
            </div>
          )}

          <NotificationBell />

          {/* Botón: volver a selección de módulos */}
          <button
            onClick={() => navigate('/seleccionar-modulo', { replace: true })}
            aria-label="Cambiar módulo"
            style={{
              background:    'rgba(255,255,255,0.1)',
              border:        '1px solid rgba(255,255,255,0.25)',
              color:         theme.colors.white,
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
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            {isMobile ? '←' : '← Módulos'}
          </button>

          {/* Botón: cerrar sesión */}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            style={{
              background:    'rgba(255,255,255,0.08)',
              border:        '1px solid rgba(255,255,255,0.2)',
              color:         'rgba(255,255,255,0.75)',
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
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            {isMobile ? '⎋' : 'Cerrar sesión'}
          </button>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', backgroundColor: theme.colors.background }}>
        {children}
      </main>
    </div>
  );
};
