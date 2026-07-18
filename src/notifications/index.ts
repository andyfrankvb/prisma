/**
 * Notification Service — public entry point
 * File: src/notifications/index.ts
 *
 * Call startNotificationService() once during app bootstrap:
 *
 *   import http from 'http';
 *   import app  from './app';
 *   import { startNotificationService } from './notifications';
 *
 *   const server = http.createServer(app);
 *   startNotificationService(server);
 *   server.listen(3000);
 */

import type { Server } from 'http';
import { wsServer }              from './ws.server';
import { startDeadlineScheduler } from './deadline.scheduler';
import { logger }                 from '../utils/logger';

export { dispatch, notifyVoboAprobado, notifyDeadline1Day, notifyDeadlineOverdue }
  from './notification.dispatcher';

export { wsServer } from './ws.server';

export function startNotificationService(httpServer: Server): void {
  wsServer.attach(httpServer);
  startDeadlineScheduler();
  logger.info('NotificationService started — WebSocket + Deadline Scheduler active');
}
