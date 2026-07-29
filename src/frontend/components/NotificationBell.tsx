/**
 * Component: NotificationBell
 * Renders a bell icon with unread badge and a dropdown list of notifications.
 * Consumes the useNotifications hook.
 */

import React, { useState, useRef, useEffect } from 'react';
import { theme } from '../theme';
import { useNotifications } from '../hooks/useNotifications';

const EVENT_ICON: Record<string, string> = {
  DEADLINE_1_DAY:              '⚠️',
  DEADLINE_OVERDUE:            '🚨',
  VOBO_APROBADO:               '📝',
  TAREA_COMENTARIO:            '💬',
  TAREA_ESTADO:                '✅',
  TAREA_FECHA_COMPROMISO:      '📅',
  TAREA_ASIGNADA:              '👤',
  TRAMITE_NUEVO:               '🎫',
  TRAMITE_APROBADO:            '✅',
  TRAMITE_RECHAZADO:           '❌',
  TRAMITE_FINALIZADO:          '🔒',
  TRAMITE_DEVUELTO_DELEGADO:   '↩️',
  TRAMITE_DEVUELTO_JURIDICO:   '↪️',
  TRAMITE_NUEVO_COMENTARIO:    '💬',
};

const EVENT_COLOR: Record<string, string> = {
  DEADLINE_1_DAY:              theme.colors.alert.yellow,
  DEADLINE_OVERDUE:            theme.colors.alert.red,
  VOBO_APROBADO:               theme.colors.alert.green,
  TAREA_COMENTARIO:            theme.colors.primary,
  TAREA_ESTADO:                theme.colors.alert.green,
  TAREA_FECHA_COMPROMISO:      theme.colors.primaryLight,
  TAREA_ASIGNADA:              theme.colors.primary,
  TRAMITE_NUEVO:               '#1E40AF',
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
          fontSize:        '1.4rem',
          padding:         '4px 8px',
          borderRadius:    '8px',
          color:           theme.colors.white,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position:        'absolute',
              top:             '0',
              right:           '0',
              backgroundColor: theme.colors.alert.red,
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
            overflowY:    'auto',
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
              padding:         '12px 16px',
              borderBottom:    `1px solid ${theme.colors.border}`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'space-between',
              backgroundColor: theme.colors.primary,
              borderRadius:    '10px 10px 0 0',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
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

          {/* Items */}
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
                  backgroundColor: n.read ? '#fff' : '#EFF6FF',
                  cursor:          'pointer',
                  display:         'flex',
                  gap:             '12px',
                  alignItems:      'flex-start',
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    fontSize:        '1.2rem',
                    flexShrink:      0,
                    width:           '32px',
                    height:          '32px',
                    borderRadius:    '50%',
                    backgroundColor: `${EVENT_COLOR[n.event]}22`,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                  }}
                  aria-hidden="true"
                >
                  {EVENT_ICON[n.event]}
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
      )}
    </div>
  );
};
