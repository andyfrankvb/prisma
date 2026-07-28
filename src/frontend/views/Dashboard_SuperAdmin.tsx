/**
 * View: Dashboard_SuperAdmin
 * Layout con sidebar de navegación para el superadmin.
 * Solo muestra: Administración de usuarios y Gestión de módulos.
 */

import React, { useState } from 'react';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';

import { AdminUsuarios } from './AdminUsuarios';
import { SeccionModulos } from './SeccionModulos';
import { ConfiguracionFlujos } from './ConfiguracionFlujos';
import { SeccionCatalogos } from './SeccionCatalogos';

type ModuloKey = 'usuarios' | 'modulos' | 'flujos' | 'catalogos';

interface NavItem {
  key:      ModuloKey;
  icon:     string;
  label:    string;
  sublabel: string;
  color:    string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'usuarios', icon: '🛡',  label: 'Administración', sublabel: 'Usuarios del sistema', color: '#4C1D95' },
  { key: 'modulos',  icon: '🧩',  label: 'Módulos',        sublabel: 'Gestión de acceso',    color: '#4C1D95' },
  { key: 'flujos',   icon: '⚙️',  label: 'Flujos',         sublabel: 'Configuración de actores', color: '#4C1D95' },
  { key: 'catalogos', icon: '📇', label: 'Catálogos',      sublabel: 'Dependencias y remitentes', color: '#4C1D95' },
];

export const Dashboard_SuperAdmin: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [modulo, setModulo] = useState<ModuloKey>('usuarios');

  const current = NAV_ITEMS.find((n) => n.key === modulo)!;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 'calc(100vh - 58px)', overflow: isMobile ? 'visible' : 'hidden', fontFamily: theme.font.family }}>

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside style={{
        width:           isMobile ? '100%' : '220px',
        flexShrink:      0,
        backgroundColor: theme.colors.primaryDark,
        display:         'flex',
        flexDirection:   isMobile ? 'row' : 'column',
        overflowX:       isMobile ? 'auto' : 'hidden',
        overflowY:       isMobile ? 'hidden' : 'auto',
        borderRight:     isMobile ? 'none' : `1px solid rgba(255,255,255,0.08)`,
        borderBottom:    isMobile ? `1px solid rgba(255,255,255,0.08)` : 'none',
      }}>
        {/* Perfil — oculto en móvil (la barra horizontal solo lleva pestañas) */}
        {!isMobile && (
        <div style={{
          padding:      '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            width:           '40px',
            height:          '40px',
            borderRadius:    '50%',
            backgroundColor: '#4C1D95',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        '1.2rem',
            marginBottom:    '10px',
          }}>
            🛡
          </div>
          <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3 }}>
            {user?.nombre}
          </p>
          <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Super Administrador
          </p>
        </div>
        )}

        {/* Nav items */}
        <nav style={{ padding: isMobile ? '8px' : '10px 8px', flex: 1, display: isMobile ? 'flex' : 'block', gap: isMobile ? '6px' : 0 }}>
          {!isMobile && (
            <p style={{ margin: '8px 8px 6px', fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Módulos
            </p>
          )}
          {NAV_ITEMS.map((item) => {
            const active = modulo === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setModulo(item.key)}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '10px',
                  width:           isMobile ? 'auto' : '100%',
                  flexShrink:      0,
                  padding:         '10px 12px',
                  marginBottom:    isMobile ? 0 : '2px',
                  border:          'none',
                  borderRadius:    '8px',
                  backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderLeft:      active ? `3px solid ${item.color}` : '3px solid transparent',
                  cursor:          'pointer',
                  textAlign:       'left',
                  transition:      'background 0.15s',
                  fontFamily:      theme.font.family,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ margin: 0, color: active ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: active ? 700 : 500, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </p>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.sublabel}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer — oculto en móvil */}
        {!isMobile && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ margin: 0, fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            PRISMA · Q.Roo
          </p>
        </div>
        )}
      </aside>

      {/* ── Módulo activo ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: theme.colors.background }}>

        {/* Breadcrumb strip */}
        <div style={{
          padding:         '8px 20px',
          backgroundColor: theme.colors.surface,
          borderBottom:    `1px solid ${theme.colors.border}`,
          display:         'flex',
          alignItems:      'center',
          gap:             '8px',
          fontSize:        '0.78rem',
          color:           theme.colors.textSecondary,
          flexShrink:      0,
        }}>
          <span style={{ color: 'rgba(171,10,61,0.5)' }}>Super Admin</span>
          <span>›</span>
          <span style={{ fontWeight: 700, color: current.color }}>{current.icon} {current.label}</span>
          <span style={{ marginLeft: 'auto', color: theme.colors.textSecondary }}>{current.sublabel}</span>
        </div>

        {/* Vista del módulo */}
        <div style={{ height: 'calc(100% - 37px)', overflow: 'auto' }}>
          {modulo === 'usuarios'  && <AdminUsuarios />}
          {modulo === 'modulos'   && <SeccionModulos />}
          {modulo === 'flujos'    && <ConfiguracionFlujos />}
          {modulo === 'catalogos' && <SeccionCatalogos />}
        </div>
      </div>
    </div>
  );
};
