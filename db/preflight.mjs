/**
 * Revisión previa a migrar — NO ESCRIBE NADA.
 *
 * Uso:   DATABASE_URL=postgres://... node db/preflight.mjs
 *        (o `npm run db:check`, que es lo mismo)
 *
 * Antes de tocar la base de producción conviene saber tres cosas, y ninguna se
 * puede suponer desde la computadora de quien programa:
 *
 *   · A QUÉ BASE se está apuntando de verdad. El `.env` del servidor manda, y un
 *     DATABASE_URL equivocado no avisa: aplica las migraciones en otro lado.
 *   · QUÉ VERSIÓN de PostgreSQL es. `gen_random_uuid()` viene incluida desde la
 *     13; en una anterior la migración de correspondencia falla a la mitad.
 *   · CUÁLES migraciones faltan realmente. El repositorio dice cuáles existen,
 *     solo la base dice cuáles ya se aplicaron.
 *
 * Este archivo abre la conexión, pregunta, imprime y se va. Si algo sale mal es
 * mejor enterarse aquí, donde no hay nada que deshacer.
 */
import { readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const ROOT           = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'infra/postgres/migrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Falta la variable DATABASE_URL.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  const { rows: [v] } = await client.query('SHOW server_version');
  const mayor = parseInt(v.server_version, 10);
  const okVer = mayor >= 13;
  console.log(`PostgreSQL ....... ${v.server_version}  ${okVer ? '✓' : '✗ SE NECESITA 13 O MAYOR (gen_random_uuid)'}`);

  const { rows: [d] } = await client.query(
    'SELECT current_database() AS db, inet_server_addr()::text AS ip, current_user AS usr',
  );
  console.log(`Base de datos .... ${d.db} @ ${d.ip ?? 'local'} (usuario ${d.usr})`);

  const { rows: [t] } = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
  const aplicadas = t.t
    ? new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename))
    : new Set();
  if (!t.t) console.log('⚠️  schema_migrations no existe todavía: el runner la creará.');

  const archivos = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const pendientes = archivos.filter((f) => !aplicadas.has(f));

  console.log(`Migraciones ...... ${aplicadas.size} aplicadas, ${pendientes.length} pendientes`);
  for (const f of pendientes) console.log(`   → ${f}`);

  // El QR de los paquetes se arma con esta dirección. Si está mal, el papel sale
  // impreso con un código que no lleva a ningún lado y nadie se entera hasta que
  // alguien lo escanea en la calle.
  console.log(`APP_URL .......... ${process.env.APP_URL ?? '(sin definir — el QR usará el Host del pedido)'}`);

  if (!okVer) process.exitCode = 1;
}

main()
  .then(() => client.end())
  .catch((e) => {
    console.error('❌ ' + (e.message ?? e));
    client.end();
    process.exit(1);
  });
