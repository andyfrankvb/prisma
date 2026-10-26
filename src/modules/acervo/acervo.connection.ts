import knex, { Knex } from 'knex';
import { AcervoOriginEnvironment, obtenerOrigenAcervo } from './acervo.origin';

interface AcervoEnvironment extends AcervoOriginEnvironment {
  DATABASE_URL?: string;
  ACERVO_DATABASE_URL?: string;
  NODE_ENV?: string;
}

function obtenerEntornoAcervo(): AcervoEnvironment {
  return {
    ...process.env, DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV,
    ACERVO_ORIGEN: process.env.ACERVO_ORIGEN, ACERVO_DATABASE_URL: process.env.ACERVO_DATABASE_URL,
  };
}

// La conexión de Acervo se configura independientemente de la base de PRISMA.
export function crearConfiguracionAcervo(
  environment: AcervoEnvironment = obtenerEntornoAcervo(),
): Knex.PgConnectionConfig {
  const origen = obtenerOrigenAcervo(environment);
  if (environment.NODE_ENV === 'production'
      && (origen.modo !== 'servidor' || origen.base_de_datos !== 'consultas_gisnet')) {
    throw new Error('En producción Acervo requiere ACERVO_ORIGEN=gisnet y su conexión independiente.');
  }
  const connectionUrl = origen.modo === 'demo' ? environment.DATABASE_URL : environment.ACERVO_DATABASE_URL;
  const nombreVariable = origen.modo === 'demo' ? 'DATABASE_URL' : 'ACERVO_DATABASE_URL';
  if (!connectionUrl) {
    throw new Error('Falta ' + nombreVariable + ' en el entorno de app_api.');
  }

  let source: URL;
  try {
    source = new URL(connectionUrl);
  } catch {
    throw new Error(nombreVariable + ' debe ser una URL válida de PostgreSQL.');
  }
  if (!['postgres:', 'postgresql:'].includes(source.protocol)) {
    throw new Error(nombreVariable + ' debe usar PostgreSQL.');
  }

  const host = source.hostname.replace(/^\[|\]$/g, '');
  const hosts = origen.modo === 'demo'
    ? ['db', 'localhost', '127.0.0.1', '::1'] : origen.modo === 'servidor'
      ? [origen.base_de_datos === 'consultas_gisnet' ? '10.1.100.60' : '10.1.100.15'] : ['db_acervo', 'localhost', '127.0.0.1', '::1'];
  if (!hosts.includes(host)) {
    throw new Error('El servidor de Acervo no corresponde al origen configurado.');
  }
  if (origen.modo === 'copia_local' && source.pathname !== '/acervo_cozumel') {
    throw new Error('ACERVO_DATABASE_URL debe apuntar a acervo_cozumel.');
  }

  if (origen.modo === 'servidor' && source.pathname !== '/' + origen.base_de_datos) {
    throw new Error('La conexión al servidor de Acervo debe apuntar a ' + origen.base_de_datos + '.');
  }

  let user: string;
  let password: string;
  try {
    user = decodeURIComponent(source.username);
    password = decodeURIComponent(source.password);
  } catch {
    throw new Error(nombreVariable + ' contiene credenciales con codificación inválida.');
  }
  if (origen.modo === 'servidor' && !password) {
    throw new Error('Falta la contraseña del servidor en ACERVO_DATABASE_URL.');
  }
  if (!user) {
    throw new Error(nombreVariable + ' debe indicar el usuario de PostgreSQL.');
  }
  if (origen.modo === 'copia_local' && user !== 'acervo_lector') {
    throw new Error('La copia local se consulta con el usuario acervo_lector.');
  }

  // Solo usa el host autorizado, puerto y credenciales del origen seleccionado.
  // El nombre de la base es fijo; tampoco se heredan parámetros que lo cambien.
  return {
    host,
    port: Number(source.port || 5432),
    user,
    password,
    database: origen.base_de_datos,
    application_name: 'PRISMA-acervo-' + origen.modo,
    connectionTimeoutMillis: 5000,
    // El usuario decide cuánto esperar: la aplicación no corta consultas por duración.
    statement_timeout: 0,
    query_timeout: 0,
    options: (origen.modo === 'servidor' ? '-c default_transaction_read_only=on -c jit=off ' : '') + '-c statement_timeout=0',
  };
}

export function crearConexionAcervo(
  environment: AcervoEnvironment = obtenerEntornoAcervo(),
): Knex {
  return knex({
    client: 'pg',
    connection: crearConfiguracionAcervo(environment),
    pool: { min: 0, max: 3 },
    acquireConnectionTimeout: 5000,
    compileSqlOnError: false,
  });
}
