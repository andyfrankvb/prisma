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
import { Icono } from '../components/Icono';
import type { NombreIcono } from '../components/Icono';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { theme, FONDO_INSTITUCIONAL } from '../theme';
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

    // Sin este renglón el módulo caía al `default` de abajo y mandaba a la
    // recepción de oficios: el menú lo ofrecía y llevaba a otro lado.
    case 'control_correspondencia':
      return '/correspondencia';

    case 'tablero_direccion':
      // Módulo de monitoreo: Panel de Dirección con métricas, supervisión y bandeja
      return '/dashboard/director';

    default:
      return '/dashboard/gestion';
  }
}

// ── Iconos y colores por módulo ───────────────────────────────

// Sólo colores del toolkit (ver theme.ts): guinda 1945C, guinda oscuro 7421C,
// dorado 125C y su variante clara, y gris carbón Black 7C. Se distinguen entre
// sí sin salirse de la identidad institucional.
const MODULO_CFG: Record<string, { icon: NombreIcono; color: string; desc: string }> = {
  oficialia_partes:     { icon: 'descargar',  color: theme.colors.primary,     desc: 'Recepción y seguimiento de oficios oficiales' },
  supervision_eventos:  { icon: 'calendario', color: theme.colors.charcoal,    desc: 'Gestión de eventos operativos y tareas por área' },
  tramites_seguimiento: { icon: 'documento',  color: theme.colors.gold,        desc: 'Seguimiento de resoluciones entre delegaciones y Dirección Jurídica' },
  tablero_direccion:    { icon: 'grafica',    color: theme.colors.primaryDark, desc: 'Métricas, supervisión y monitoreo general de Dirección' },
  catalogos:            { icon: 'lista',      color: theme.colors.goldLight,   desc: 'Depurar dependencias, sub-unidades, remitentes y correos' },
};

function getModuloCfg(clave: string) {
  return MODULO_CFG[clave] ?? { icon: 'lista', color: theme.colors.primary, desc: 'Módulo del sistema' };
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

        /**
         * Con un solo módulo se entra directo, salvo que la persona haya venido a
         * propósito.
         *
         * El salto automático ahorra un clic al iniciar sesión, pero convertía esta
         * pantalla en inalcanzable para quien tiene un único módulo —la mayoría—: el
         * botón «Módulos» de la cabecera los traía aquí y el salto los devolvía al
         * instante. Y aquí vive lo que no pertenece a ningún módulo, como cambiar la
         * propia contraseña.
         *
         * `?elegir=1` distingue las dos llegadas: entrar al sistema, o venir a esta
         * pantalla queriendo.
         */
        const vinoAElegir = new URLSearchParams(window.location.search).get('elegir') === '1';
        if (habilitados.length === 1 && !vinoAElegir) {
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
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Icono nombre="reloj" size={40} color={theme.colors.grayMid} /></div>
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
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Icono nombre="candado" size={46} color={theme.colors.grayMid} /></div>
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
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><Icono nombre="alerta" size={40} color={theme.colors.alert.yellow} /></div>
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
      background:     FONDO_INSTITUCIONAL,
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
          {/* El logotipo completo va sin disco detrás: es horizontal y trae su
              propio texto, así que el círculo lo recortaba y competía con él.
              El PNG es transparente y se apoya en el fondo claro de la tarjeta. */}
          <img
            src="/PRISMA1.png"
            alt="PRISMA — Plataforma de Control y Seguimiento"
            style={{
              height:    isMobile ? '68px' : '92px',
              width:     'auto',
              maxWidth:  '100%',
              objectFit: 'contain',
              display:   'block',
              margin:    '0 auto 18px',
            }}
          />
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
                  flexShrink:      0,
                }}>
                  <Icono nombre={isLoading ? 'reloj' : cfg.icon} size={24} color={cfg.color} />
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

        {/* Footer.
            Aquí viven las dos acciones que son de la CUENTA y no del trabajo. En
            la cabecera estorbaban: compiten en tamaño con «Módulos» y se ven en
            todas las pantallas, cuando cambiar la contraseña se hace una vez cada
            varios meses. */}
        <div style={{ textAlign: 'center', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/mi-contrasena')}
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
            Cambiar mi contraseña
          </button>
          <span aria-hidden="true" style={{ color: theme.colors.border, fontSize: '0.8rem' }}>·</span>
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

// Las pantallas de carga, sin acceso y de error comparten el mismo fondo que la
// selección de módulos, para que no haya un salto visual entre ellas.
const fullPage: React.CSSProperties = {
  minHeight:      '100vh',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  background:     FONDO_INSTITUCIONAL,
  fontFamily:     theme.font.family,
  padding:        '24px',
};
