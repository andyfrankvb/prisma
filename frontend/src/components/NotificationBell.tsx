/**
 * Component: NotificationBell
 * Renders a bell icon with unread badge and a dropdown list of notifications.
 * Consumes the useNotifications hook.
 */

import React, { useState, useRef, useEffect } from 'react';
import { theme } from '../theme';
import { useNotifications } from '../hooks/useNotifications';

/**
 * Íconos de línea, del mismo trazo que la campana. Sustituyen a los emoticones:
 * cada sistema operativo los dibujaba distinto y su color competía con el de la
 * categoría, que es lo que en realidad clasifica el aviso.
 */
const Glifo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round"
  >
    {children}
  </svg>
);

const RELOJ     = <Glifo><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></Glifo>;
const ALERTA    = <Glifo><path d="M12 3 22 20H2Z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17" /></Glifo>;
const PALOMA    = <Glifo><polyline points="20 6 9 17 4 12" /></Glifo>;
const GLOBO     = <Glifo><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Glifo>;
const CALENDARIO= <Glifo><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></Glifo>;
const PERSONA   = <Glifo><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Glifo>;
const DOCUMENTO = <Glifo><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><polyline points="14 3 14 8 19 8" /></Glifo>;
const TACHE     = <Glifo><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Glifo>;
const CANDADO   = <Glifo><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Glifo>;
const REGRESA_I = <Glifo><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></Glifo>;
const REGRESA_D = <Glifo><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></Glifo>;

const EVENT_ICON: Record<string, React.ReactNode> = {
  DEADLINE_1_DAY:              RELOJ,
  DEADLINE_OVERDUE:            ALERTA,
  VOBO_APROBADO:               PALOMA,
  TAREA_COMENTARIO:            GLOBO,
  TAREA_ESTADO:                PALOMA,
  TAREA_FECHA_COMPROMISO:      CALENDARIO,
  TAREA_ASIGNADA:              PERSONA,
  TRAMITE_NUEVO:               DOCUMENTO,
  TRAMITE_APROBADO:            PALOMA,
  TRAMITE_RECHAZADO:           TACHE,
  TRAMITE_FINALIZADO:          CANDADO,
  TRAMITE_DEVUELTO_DELEGADO:   REGRESA_I,
  TRAMITE_DEVUELTO_JURIDICO:   REGRESA_D,
  TRAMITE_NUEVO_COMENTARIO:    GLOBO,
};

const EVENT_COLOR: Record<string, string> = {
  DEADLINE_1_DAY:              theme.colors.alert.yellow,
  DEADLINE_OVERDUE:            theme.colors.alert.red,
  VOBO_APROBADO:               theme.colors.alert.green,
  TAREA_COMENTARIO:            theme.colors.primary,
  TAREA_ESTADO:                theme.colors.alert.green,
  TAREA_FECHA_COMPROMISO:      theme.colors.primaryLight,
  TAREA_ASIGNADA:              theme.colors.primary,
  TRAMITE_NUEVO:               '#3D3935',
  TRAMITE_APROBADO:            theme.colors.alert.green,
  TRAMITE_RECHAZADO:           theme.colors.alert.red,
  TRAMITE_FINALIZADO:          '#374151',
  TRAMITE_DEVUELTO_DELEGADO:   '#92400E',
  TRAMITE_DEVUELTO_JURIDICO:   '#991B1B',
  TRAMITE_NUEVO_COMENTARIO:    theme.colors.primary,
};

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, connected, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open && unreadCount > 0) markAllRead(); }}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        style={{
          position:        'relative',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          padding:         '6px 10px',
          borderRadius:    '8px',
          color:           theme.colors.primary,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           '40px',
          height:          '40px',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position:        'absolute',
              top:             '0',
              right:           '0',
              // Pantone 125C: el rojo de alertas desentonaba en una barra que es
              // toda de la paleta institucional.
              backgroundColor: theme.colors.gold,
              color:           '#fff',
              borderRadius:    '50%',
              width:           '18px',
              height:          '18px',
              fontSize:        '0.65rem',
              fontWeight:      700,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              lineHeight:      1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Connection dot */}
      <span
        title={connected ? 'Conectado' : 'Desconectado'}
        style={{
          position:        'absolute',
          bottom:          '2px',
          left:            '4px',
          width:           '7px',
          height:          '7px',
          borderRadius:    '50%',
          backgroundColor: connected ? theme.colors.alert.green : '#9CA3AF',
        }}
        aria-hidden="true"
      />

      {/* Dropdown panel */}
      {open && (
        <div
          role="region"
          aria-label="Panel de notificaciones"
          style={{
            position:     'absolute',
            top:          'calc(100% + 8px)',
            right:        0,
            width:        '360px',
            maxHeight:    '480px',
            // El recorte y el redondeo viven aquí; el scroll, en el div de la
            // lista. Cuando iban juntos, la barra se dibujaba sobre el canto y le
            // cortaba la curva a las esquinas derechas.
            overflow:      'hidden',
            display:       'flex',
            flexDirection: 'column',
            background:   theme.colors.surface,
            borderRadius: '10px',
            boxShadow:    '0 8px 32px rgba(0,0,0,0.18)',
            border:       `1px solid ${theme.colors.border}`,
            zIndex:       999,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              flexShrink:      0,
              padding:         '11px 16px',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'space-between',
              backgroundColor: theme.colors.charcoal,   // Pantone Black 7C
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Notificaciones
            </span>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Lista: aquí vive el scroll, por dentro del marco redondeado */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 16px', color: theme.colors.textSecondary, fontSize: '0.875rem', margin: 0 }}>
              Sin notificaciones
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.notif_id}
                onClick={() => markRead(n.notif_id)}
                style={{
                  padding:         '12px 16px',
                  borderBottom:    `1px solid ${theme.colors.border}`,
                  // Tinte guinda muy claro para lo no leído: el azul anterior era
                  // frío y no pertenecía a la paleta institucional.
                  backgroundColor: n.read ? '#fff' : '#FDF3F6',
                  cursor:          'pointer',
                  display:         'flex',
                  gap:             '12px',
                  alignItems:      'flex-start',
                }}
              >
                {/* Icono: el disco lleva el color de la categoría y el trazo lo
                    hereda, así el glifo siempre contrasta con su propio fondo. */}
                <span
                  style={{
                    flexShrink:      0,
                    width:           '32px',
                    height:          '32px',
                    borderRadius:    '50%',
                    backgroundColor: `${EVENT_COLOR[n.event] ?? theme.colors.primary}1A`,
                    color:           EVENT_COLOR[n.event] ?? theme.colors.primary,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                  }}
                  aria-hidden="true"
                >
                  {EVENT_ICON[n.event] ?? DOCUMENTO}
                </span>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: n.read ? 400 : 700, fontSize: '0.85rem', color: theme.colors.textPrimary }}>
                    {n.title}
                  </p>
                  <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: theme.colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.body}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF' }}>
                    {new Date(n.created_at).toLocaleString('es-MX')}
                  </p>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <span
                    style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: theme.colors.primary, flexShrink: 0, marginTop: '4px' }}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))
          )}
          </div>
        </div>
      )}
    </div>
  );
};
