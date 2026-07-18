/**
 * Server entry point
 * File: src/server.ts
 */

// ── Validate env FIRST — fails fast if required vars are missing ──
import { validateApiEnv } from './utils/env';
validateApiEnv();

import http    from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import path    from 'path';
import jwt     from 'jsonwebtoken';
import bcrypt  from 'bcrypt';
import pinoHttp from 'pino-http';

import oficiosRouter        from './modules/oficialia_partes/oficios.routes';
import usuariosRouter       from './modules/usuarios/usuarios.routes';
import filesRouter          from './modules/files/files.routes';
import notificacionesRouter from './modules/notificaciones/notificaciones.routes';
import directorRouter       from './modules/director/director.routes';
import adminRouter          from './modules/admin/admin.routes';
import eventosRouter        from './modules/eventos/eventos.routes';
import tramitesRouter       from './modules/tramites/tramites.routes';
import { startNotificationService } from './notifications';
import { AppError } from './utils/AppError';
import { logger }   from './utils/logger';
import { db }       from './db';
import { registerOficialiaPartes }    from './modules/oficialia_partes/oficios.registry';
import { registerSupervisionEventos } from './modules/eventos/eventos.registry';
import { registerTramitesSeguimiento } from './modules/tramites/tramites.registry';

const app  = express();
const PORT = Number(process.env.PORT ?? 3000);
const isProd = process.env.NODE_ENV === 'production';

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  // CSP is handled by Nginx in production; keep permissive here for API-only responses
  contentSecurityPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.APP_URL ?? 'http://localhost')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || !isProd) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Request logging (pino-http) ───────────────────────────────
app.use(pinoHttp({
  logger,
  // No loguear health checks — demasiado ruido
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Static: uploaded files ────────────────────────────────────
app.use('/files', express.static(path.join(process.cwd(), 'storage')));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Auth: login ───────────────────────────────────────────────
app.post('/api/v1/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Se inicia sesión con el usuario (sin dominio). Si escriben el correo
    // completo (usuario@dominio), tomamos solo la parte anterior al '@'.
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Usuario inválido' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Contraseña inválida' });
    }

    const usuario = email.toLowerCase().trim().split('@')[0];

    const user = await db('usuarios as u')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where({ 'u.email': usuario })
      .select(
        'u.id', 'u.nombre', 'u.email', 'u.password_hash',
        'u.rol', 'u.unidad_id', 'u.activo',
        'cu.tipo as unidad_tipo',
      )
      .first();

    // Constant-time comparison to prevent timing attacks
    const dummyHash = '$2b$10$invalidhashfortimingprotection000000000000000000000000';
    const valid = user
      ? await bcrypt.compare(password, user.password_hash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (user.activo === false) {
      return res.status(403).json({ message: 'Usuario inactivo. Contacta al administrador.' });
    }

    const token = jwt.sign(
      {
        id:          user.id,
        nombre:      user.nombre,
        email:       user.email,
        rol:         user.rol,
        oficina_id:  user.unidad_id,   // mantiene compatibilidad con código existente
        unidad_id:   user.unidad_id,
        unidad_tipo: user.unidad_tipo, // tipo de unidad para routing sin depender de IDs
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
    );

    res.json({
      token,
      user: {
        id:          user.id,
        nombre:      user.nombre,
        email:       user.email,
        rol:         user.rol,
        oficina_id:  user.unidad_id,
        unidad_id:   user.unidad_id,
        unidad_tipo: user.unidad_tipo,
      },
    });
  } catch (err) { next(err); }
});

// ── API routes ────────────────────────────────────────────────
app.use('/api/v1',                oficiosRouter);
app.use('/api/v1/usuarios',       usuariosRouter);
app.use('/api/v1/files',          filesRouter);
app.use('/api/v1/notificaciones', notificacionesRouter);
app.use('/api/v1/director',       directorRouter);
app.use('/api/v1/admin',          adminRouter);
app.use('/api/v1/eventos',        eventosRouter);
app.use('/api/v1/tramites',       tramitesRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  let status  = err.statusCode ?? 500;
  let message = err.message    ?? 'Error interno del servidor';

  // Errores de subida (multer) → mensajes claros en español, status correcto
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status  = 413;
      message = 'El archivo supera el tamaño máximo permitido (20 MB).';
    } else {
      status  = 400;
      message = `No se pudo procesar el archivo: ${err.message}`;
    }
  }

  // Log all errors in production; only 5xx in development
  if (isProd || status >= 500) {
    logger.error({ err, method: req.method, path: req.path, status }, err.message);
  } else if (status >= 400) {
    logger.warn({ method: req.method, path: req.path, status }, err.message);
  }

  // Never leak stack traces to the client
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────
const server = http.createServer(app);
startNotificationService(server);

// ── Registrar módulos en el ModuleRegistry ────────────────────
registerOficialiaPartes();
registerSupervisionEventos();
registerTramitesSeguimiento();

server.listen(PORT, () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});
