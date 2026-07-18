/**
 * Hook: useNotifications
 * File: src/frontend/hooks/useNotifications.ts
 *
 * Connects to the WebSocket server, authenticates with the stored JWT,
 * and surfaces incoming in-app notifications as React state.
 *
 * Usage:
 *   const { notifications, unreadCount, markAllRead } = useNotifications();
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getNotificaciones, marcarNotificacionLeida, marcarTodasLeidas as apiMarcarTodas } from '../api';
import type { NotificacionAPI } from '../api';

export interface InAppNotification {
  notif_id:   number;
  event:      string;
  title:      string;
  body:       string;
  oficio_id:  number;
  folio:      string;
  created_at: string;
  read:       boolean;
}

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`;
const RECONNECT_DELAY_MS = 5_000;
const MAX_STORED = 50;

export function useNotifications() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [connected,     setConnected]     = useState(false);
  const wsRef           = useRef<WebSocket | null>(null);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load history from API on mount ───────────────────────
  useEffect(() => {
    getNotificaciones({ limit: 50 })
      .then(({ data }) => {
        setNotifications(
          data.map((n: NotificacionAPI) => ({
            notif_id:   n.id,
            event:      n.type,
            title:      n.title,
            body:       n.body,
            oficio_id:  n.oficio_id,
            folio:      n.folio,
            created_at: n.created_at,
            read:       n.read,
          })),
        );
      })
      .catch(() => {}); // silencioso si no hay token aún
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'AUTH', token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'NOTIFICATION') {
          const notif: InAppNotification = {
            notif_id:   msg.notif_id,
            event:      msg.event,
            title:      msg.title,
            body:       msg.body,
            oficio_id:  msg.oficio_id,
            folio:      msg.folio,
            created_at: msg.created_at,
            read:       false,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, MAX_STORED));
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const markAllRead = useCallback(() => {
    apiMarcarTodas().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((notif_id: number) => {
    marcarNotificacionLeida(notif_id).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.notif_id === notif_id ? { ...n, read: true } : n)),
    );
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, connected, markAllRead, markRead };
}
