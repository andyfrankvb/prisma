/**
 * Integration test app helper
 * File: src/tests/integration/helpers/app.helper.ts
 *
 * Builds a minimal Express app wired to the real router,
 * with auth middleware replaced by a test injector.
 */

import express, { Request, Response, NextFunction } from 'express';
import oficiosRouter from '../../../modules/oficialia_partes/oficios.routes';
import type { AuthUser } from '../../../modules/oficialia_partes/oficios.types';

/** Call this to inject a user into req.user for all subsequent requests */
let _currentUser: AuthUser | null = null;

export function setTestUser(user: AuthUser | null): void {
  _currentUser = user;
}

/** Fake auth middleware — injects _currentUser into req.user */
function fakeAuth(req: Request, _res: Response, next: NextFunction): void {
  if (_currentUser) {
    (req as any).user = _currentUser;
  }
  next();
}

/** Generic error handler for tests */
function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  res.status(err.statusCode ?? 500).json({ message: err.message });
}

export function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Inject fake auth before routes
  app.use(fakeAuth);

  // Mount the real router (minus the authenticate middleware — replaced above)
  app.use('/api/v1', oficiosRouter);

  app.use(errorHandler);
  return app;
}
