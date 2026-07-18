/**
 * WebSocket Server
 * File: src/notifications/ws.server.ts
 *
 * Maintains a map of userId → WebSocket connections.
 * Clients authenticate by sending { type: 'AUTH', token: '<jwt>' }
 * immediately after connecting.
 *
 * Usage:
 *   import { wsServer } from './ws.server';
 *   wsServer.attach(httpServer);
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage }       from 'http';
import type { Server }                from 'http';
import jwt                            from 'jsonwebtoken';
import { logger }                     from '../utils/logger';

const wsLog = logger.child({ module: 'ws-server' });

interface AuthenticatedSocket extends WebSocket {
  userId?: number;
  isAlive:  boolean;
}

interface JwtPayload {
  id:    number;
  email: string;
  rol:   string;
}

class WsServer {
  private wss: WebSocketServer | null = null;
  /** userId → Set of open sockets (a user may have multiple tabs) */
  private connections = new Map<number, Set<AuthenticatedSocket>>();

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket: AuthenticatedSocket, _req: IncomingMessage) => {
      socket.isAlive = true;

      socket.on('pong', () => { socket.isAlive = true; });

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'AUTH' && msg.token) {
            const payload = jwt.verify(
              msg.token,
              process.env.JWT_SECRET!,
            ) as JwtPayload;

            socket.userId = payload.id;

            if (!this.connections.has(payload.id)) {
              this.connections.set(payload.id, new Set());
            }
            this.connections.get(payload.id)!.add(socket);

            socket.send(JSON.stringify({ type: 'AUTH_OK', userId: payload.id }));
          }
        } catch {
          // Ignore malformed messages or invalid tokens
        }
      });

      socket.on('close', () => {
        if (socket.userId !== undefined) {
          const sockets = this.connections.get(socket.userId);
          if (sockets) {
            sockets.delete(socket);
            if (sockets.size === 0) this.connections.delete(socket.userId);
          }
        }
      });

      socket.on('error', (err) => {
        wsLog.error({ err }, 'WebSocket socket error');
      });
    });

    // Heartbeat — remove stale connections every 30 s
    const heartbeat = setInterval(() => {
      this.wss?.clients.forEach((raw) => {
        const socket = raw as AuthenticatedSocket;
        if (!socket.isAlive) {
          socket.terminate();
          return;
        }
        socket.isAlive = false;
        socket.ping();
      });
    }, 30_000);

    this.wss.on('close', () => clearInterval(heartbeat));

    wsLog.info('WebSocket server attached at /ws');
  }

  /** Send a JSON message to all open sockets for a given userId */
  sendToUser(userId: number, payload: object): void {
    const sockets = this.connections.get(userId);
    if (!sockets || sockets.size === 0) return;

    const data = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }

  /** Broadcast to all authenticated connections (e.g. system-wide alerts) */
  broadcast(payload: object): void {
    const data = JSON.stringify(payload);
    this.wss?.clients.forEach((raw) => {
      const socket = raw as AuthenticatedSocket;
      if (socket.readyState === WebSocket.OPEN && socket.userId !== undefined) {
        socket.send(data);
      }
    });
  }

  get connectedUserIds(): number[] {
    return Array.from(this.connections.keys());
  }
}

// Singleton
export const wsServer = new WsServer();
