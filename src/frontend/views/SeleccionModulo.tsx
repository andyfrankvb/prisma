/**
 * View: SeleccionModulo
 * Pantalla post-login para elegir el módulo a usar.
 * File: src/frontend/views/SeleccionModulo.tsx
 *
 * Se muestra cuando el usuario tiene 2+ módulos habilitados.
 * Si tiene 1 módulo → redirige automáticamente.
 * Si tiene 0 módulos → muestra mensaje de sin acceso.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { theme }       from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import type { ModuloConEstado, RolUsuario } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

// ── Mapa de módulo → ruta del dashboard ──────────────────────

/**
 * Dado un módulo y el usuario autenticado, devuelve la ruta del dashboard.
 * Usa unidad_tipo ('DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION') para
 * distinguir al Director General de los directores de área, sin depender
 * de un ID de BD que varía entre entornos.
 */
function getRutaModulo(
  clave:       string,
  rol:         RolUsuario,
  unidad_tipo: string,
  rolesFlujo?: string[],
): string {
  const esDG = unidad_tipo === 'DIRECCION_GENERAL';

  switch (clave) {
    case 'oficialia_partes':
      // Roles configurados en flujos tienen prioridad sobre el rol de sistema.
      // ENCARGADO se evalúa ANTES que JURIDICO: el encargado gestiona el flujo
      // (asigna, da VoBo, reconsidera). Si además tuviera una asignación jurídica
      // incidental, igual debe entrar a su tablero de gestión, no al de jurídico.
      if (rolesFlujo?.includes('OFICIAL'))    return '/dashboard/oficial';
      if (rolesFlujo?.includes('ENCARGADO'))  return '/dashboard/gestion';
      if (rolesFlujo?.includes('JURIDICO'))   return '/dashboard/juridico';
      if (rolesFlujo?.includes('SECRETARIA')) return '/dashboard/gestion';
      if (rol === 'OFICIAL')    return '/dashboard/oficial';
      if (rol === 'OPERATIVO')  return '/dashboard/juridico';
      if (rol === 'ENCARGADO')  return '/dashboard/gestion';
      if (rol === 'SECRETARIA') return '/dashboard/gestion';
      if (rol === 'JURIDICO')   return '/dashboard/juridico';
      // DIRECTOR (incluida la Directora General) → listado operativo de oficios.
      // Las métricas viven ahora en el módulo "Tablero de Dirección" (tablero_direccion).
      if (rol === 'DIRECTOR')   return '/dashboard/gestion';
      if (rol === 'SUPERADMIN') return '/dashboard/superadmin';
      return '/dashboard/gestion';

    case 'supervision_eventos':
      // Todos los directores (incluida la DG) usan la vista operativa con
      // pestañas "Mis Actividades" y "Mis Eventos". Las métricas y supervisión
      // viven en el módulo aparte "Tablero de Dirección".
      if (rol === 'SUPERADMIN') return '/dashboard/superadmin';
      return '/dashboard/director-area';

    case 'tramites_seguimiento':
      return '/dashboard/tramites';

    case 'catalogos':
      return '/catalogos';

    case 'tablero_direccion':
      // Módulo de monitoreo: Panel de Dirección con métricas, supervisión y bandeja
      return '/dashboard/director';

    default:
      return '/dashboard/gestion';
  }
}

// ── Iconos y colores por módulo ───────────────────────────────

const MODULO_CFG: Record<string, { icon: string; color: string; desc: string }> = {
  oficialia_partes:     { icon: '📥', color: '#AB0A3D', desc: 'Recepción y seguimiento de oficios oficiales' },
  supervision_eventos:  { icon: '📅', color: '#1E40AF', desc: 'Gestión de eventos operativos y tareas por área' },
  tramites_seguimiento: { icon: '🎫', color: '#065F46', desc: 'Seguimiento de resoluciones entre delegaciones y Dirección Jurídica' },
  tablero_direccion:    { icon: '📊', color: '#7C3AED', desc: 'Métricas, supervisión y monitoreo general de Dirección' },
  catalogos:            { icon: '📇', color: '#B68400', desc: 'Depurar dependencias, sub-unidades, remitentes y correos' },
};

function getModuloCfg(clave: string) {
  return MODULO_CFG[clave] ?? { icon: '🧩', color: theme.colors.primary, desc: 'Módulo del sistema' };
}

// ── Component ─────────────────────────────────────────────────

export const SeleccionModulo: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const isMobile         = useIsMobile();

  const [modulos,  setModulos]  = useState<ModuloConEstado[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [rolesFlujo, setRolesFlujo] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    // SuperAdmin siempre tiene acceso a todo — redirigir directo
    if (user.rol === 'SUPERADMIN') {
      navigate('/dashboard/superadmin', { replace: true });
      return;
    }

    fetch(`${BASE}/usuarios/mis-modulos`, { headers })
      .then((res) => res.json())
      .then(async (body) => {
        const habilitados: ModuloConEstado[] = (body.data ?? []).filter(
          (m: ModuloConEstado) => m.habilitado && m.activo,
        );

        if (habilitados.length === 0) {
          setModulos([]);
          setLoading(false);
          return;
        }

        // Obtener roles de flujo del usuario para routing dinámico
        let rolesFlujo: string[] = [];
        try {
          const flujoRes = await fetch(`${BASE}/usuarios/mis-roles-flujo`, { headers });
          const flujoBody = await flujoRes.json();
          rolesFlujo = (flujoBody.data ?? []).map((r: any) => r.rol_flujo);
        } catch { /* ignorar */ }

        setRolesFlujo(rolesFlujo);

        if (habilitados.length === 1) {
          // Un solo módulo → redirigir automáticamente
          const ruta = getRutaModulo(habilitados[0].clave, user.rol, user.unidad_tipo, rolesFlujo);
          navigate(ruta, { replace: true });
          return;
        }

        setModulos(habilitados);
        setLoading(false);
      })
      .catch(() => {
        // Si falla la consulta de módulos, usar redirección por rol como fallback
        setError('No se pudieron cargar los módulos. Intenta de nuevo.');
        setLoading(false);
      });
  }, [user, navigate]);

  const handleSeleccionar = (modulo: ModuloConEstado) => {
    if (!user) return;
    setSelecting(modulo.clave);
    const ruta = getRutaModulo(modulo.clave, user.rol, user.unidad_tipo, rolesFlujo);
    navigate(ruta, { replace: true });
  };

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div style={fullPage}>
        <div style={{ textAlign: 'center', color: theme.colors.textSecondary }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 600, fontFamily: theme.font.family }}>
            Cargando módulos…
          </p>
        </div>
      </div>
    );
  }

  // ── Sin módulos asignados ─────────────────────────────────

  if (!loading && modulos.length === 0 && !error) {
    return (
      <div style={fullPage}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', color: theme.colors.primaryDark, fontFamily: theme.font.family, fontWeight: 900 }}>
            Sin acceso
          </h2>
          <p style={{ margin: '0 0 24px', color: theme.colors.textSecondary, fontSize: '0.9rem', lineHeight: 1.6 }}>
            Tu cuenta no tiene módulos habilitados. Contacta al administrador del sistema para que te asigne acceso.
          </p>
          <button
            onClick={logout}
            style={{
              padding:         '10px 24px',
              backgroundColor: theme.colors.primary,
              color:           '#fff',
              border:          'none',
              borderRadius:    theme.radius.sm,
              fontWeight:      700,
              fontSize:        '0.875rem',
              cursor:          'pointer',
              fontFamily:      theme.font.family,
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────

  if (error) {
    return (
      <div style={fullPage}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
          <p style={{ color: theme.colors.alert.red, fontWeight: 600, marginBottom: '16px', fontFamily: theme.font.family }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding:         '10px 24px',
              backgroundColor: theme.colors.primary,
              color:           '#fff',
              border:          'none',
              borderRadius:    theme.radius.sm,
              fontWeight:      700,
              fontSize:        '0.875rem',
              cursor:          'pointer',
              fontFamily:      theme.font.family,
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Selección de módulo ───────────────────────────────────

  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      background:     `linear-gradient(135deg, ${theme.colors.primaryDark} 0%, ${theme.colors.primary} 60%, ${theme.colors.primaryLight} 100%)`,
      alignItems:     'center',
      justifyContent: 'center',
      fontFamily:     theme.font.family,
      padding:        isMobile ? '16px 12px' : '24px',
    }}>
      <div style={{
        backgroundColor: theme.colors.background,
        borderRadius:    theme.radius.lg,
        boxShadow:       theme.shadow.lg,
        padding:         isMobile ? '24px 18px' : '40px',
        width:           '100%',
        maxWidth:        '560px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width:           '64px',
            height:          '64px',
            borderRadius:    '50%',
            backgroundColor: theme.colors.primary,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            margin:          '0 auto 16px',
            fontSize:        '1.8rem',
          }}>
            🧩
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 900, color: theme.colors.primaryDark }}>
            Selecciona un módulo
          </h2>
          <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: '0.875rem' }}>
            Bienvenido, <strong style={{ color: theme.colors.textPrimary }}>{user?.nombre}</strong>.
            ¿A qué módulo deseas acceder?
          </p>
        </div>

        {/* Tarjetas de módulos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {modulos.map((modulo) => {
            const cfg       = getModuloCfg(modulo.clave);
            const isLoading = selecting === modulo.clave;

            return (
              <button
                key={modulo.id}
                onClick={() => handleSeleccionar(modulo)}
                disabled={!!selecting}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '16px',
                  padding:         '18px 20px',
                  backgroundColor: isLoading ? '#FDE8EF' : '#fff',
                  border:          `2px solid ${isLoading ? theme.colors.primary : theme.colors.border}`,
                  borderRadius:    theme.radius.md,
                  cursor:          selecting ? 'not-allowed' : 'pointer',
                  textAlign:       'left',
                  width:           '100%',
                  transition:      'all 0.15s ease',
                  boxShadow:       isLoading ? theme.shadow.sm : 'none',
                  opacity:         selecting && !isLoading ? 0.5 : 1,
                  fontFamily:      theme.font.family,
                }}
                onMouseEnter={(e) => {
                  if (!selecting) {
                    e.currentTarget.style.borderColor = cfg.color;
                    e.currentTarget.style.boxShadow   = theme.shadow.sm;
                    e.currentTarget.style.transform   = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selecting) {
                    e.currentTarget.style.borderColor = theme.colors.border;
                    e.currentTarget.style.boxShadow   = 'none';
                    e.currentTarget.style.transform   = 'none';
                  }
                }}
              >
                {/* Icono */}
                <div style={{
                  width:           '48px',
                  height:          '48px',
                  borderRadius:    '10px',
                  backgroundColor: `${cfg.color}18`,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  fontSize:        '1.5rem',
                  flexShrink:      0,
                }}>
                  {isLoading ? '⏳' : cfg.icon}
                </div>

                {/* Texto */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: theme.colors.textPrimary }}>
                    {modulo.nombre_display}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: theme.colors.textSecondary, lineHeight: 1.4 }}>
                    {modulo.descripcion ?? cfg.desc}
                  </p>
                </div>

                {/* Flecha */}
                <span style={{ color: cfg.color, fontSize: '1.2rem', flexShrink: 0 }}>
                  {isLoading ? '' : '→'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px' }}>
          <button
            onClick={logout}
            style={{
              background:  'none',
              border:      'none',
              color:       theme.colors.textSecondary,
              fontSize:    '0.8rem',
              cursor:      'pointer',
              fontFamily:  theme.font.family,
              textDecoration: 'underline',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────

const fullPage: React.CSSProperties = {
  minHeight:      '100vh',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  backgroundColor: theme.colors.background,
  fontFamily:     theme.font.family,
  padding:        '24px',
};
