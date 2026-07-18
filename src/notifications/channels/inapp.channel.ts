/**
 * Channel: In-App Push
 * File: src/notifications/channels/inapp.channel.ts
 *
 * Supports two transports (configured via INAPP_TRANSPORT env var):
 *  - 'websocket' → broadcasts via the shared WebSocket server (ws.server.ts)
 *  - 'firebase'  → sends via Firebase Cloud Messaging (FCM)
 *
 * In both cases the notification is also persisted to the
 * `notificaciones` DB table so the frontend can fetch history.
 *
 * Required env vars:
 *  INAPP_TRANSPORT = 'websocket' | 'firebase'   (default: websocket)
 *
 *  Firebase:
 *    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { db }          from '../../db';
import { wsServer }    from '../ws.server';
import type { InAppMessage } from '../notification.types';

// ── Persist to DB ─────────────────────────────────────────────────────────────

async function persistNotification(msg: InAppMessage): Promise<number> {
  const [row] = await db('notificaciones')
    .insert({
      user_id:       msg.user_id,
      type:          msg.type,
      title:         msg.title,
      body:          msg.body,
      oficio_id:     msg.oficio_id ?? null,
      folio:         msg.folio ?? null,
      tarea_id:      msg.tarea_id ?? null,
      evento_titulo: msg.evento_titulo ?? null,
      read:          false,
      created_at:    msg.created_at,
    })
    .returning('id');
  return row.id;
}

// ── WebSocket push ────────────────────────────────────────────────────────────

async function pushViaWebSocket(msg: InAppMessage, notif_id: number): Promise<void> {
  wsServer.sendToUser(msg.user_id, {
    type:          'NOTIFICATION',
    notif_id,
    event:         msg.type,
    title:         msg.title,
    body:          msg.body,
    oficio_id:     msg.oficio_id ?? null,
    folio:         msg.folio ?? null,
    tarea_id:      msg.tarea_id ?? null,
    evento_titulo: msg.evento_titulo ?? null,
    created_at:    msg.created_at.toISOString(),
  });
}

// ── Firebase FCM push ─────────────────────────────────────────────────────────

let _firebaseApp: any = null;

async function getFirebaseMessaging() {
  if (!_firebaseApp) {
    // @ts-ignore — optional runtime dependency
    const admin = await import('firebase-admin');
    _firebaseApp = admin.default.initializeApp({
      credential: admin.default.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return _firebaseApp.messaging();
}

async function pushViaFirebase(msg: InAppMessage): Promise<void> {
  // Retrieve the user's FCM token from DB
  const user = await db('usuarios').where({ id: msg.user_id }).select('fcm_token').first();
  if (!user?.fcm_token) return; // user has no registered device token

  const messaging = await getFirebaseMessaging();
  await messaging.send({
    token: user.fcm_token,
    notification: {
      title: msg.title,
      body:  msg.body,
    },
    data: {
      event:     msg.type,
      oficio_id: String(msg.oficio_id),
      folio:     msg.folio,
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendInApp(msg: InAppMessage): Promise<void> {
  const notif_id  = await persistNotification(msg);
  const transport = process.env.INAPP_TRANSPORT ?? 'websocket';

  if (transport === 'firebase') {
    await pushViaFirebase(msg);
  } else {
    await pushViaWebSocket(msg, notif_id);
  }
}
