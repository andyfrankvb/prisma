import knex, { Knex } from 'knex';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { AppError } from '../../utils/AppError';

export function configurarGestion(value: string): Knex.PgConnectionConfig {
  try {
    const u = new URL(value);
    const port = Number(u.port || 5432);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname
      || port < 1 || port > 65535 || decodeURIComponent(u.pathname) !== '/consultas_rppc'
      || !u.username || !u.password || u.search || u.hash) throw new Error();
    return { host: u.hostname.replace(/^\[|\]$/g, ''), port, database: 'consultas_rppc',
      user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
      application_name: 'PRISMA-busqueda-gestion', connectionTimeoutMillis: 5000,
      options: '-c default_transaction_read_only=on -c jit=off -c statement_timeout=0',
      statement_timeout: 0, query_timeout: 0 };
  } catch { throw new AppError('Configura la conexión independiente de Búsqueda Gestión a consultas_rppc.', 503); }
}

let pool: Knex | undefined;
export function conexionGestion(): Knex {
  if (pool) return pool;
  let url = process.env.GESTION_DATABASE_URL || '';
  if (process.env.NODE_ENV !== 'production') {
    const file = path.resolve(process.cwd(), '.env.gestion');
    if (existsSync(file)) {
      const line = readFileSync(file, 'utf8').split(/\r?\n/).find(s => s.startsWith('GESTION_DATABASE_URL='));
      url = line?.slice('GESTION_DATABASE_URL='.length).trim() || '';
    }
  }
  pool = knex({ client: 'pg', connection: configurarGestion(url), pool: { min: 0, max: 3 },
    acquireConnectionTimeout: 10000, compileSqlOnError: false });
  return pool;
}
