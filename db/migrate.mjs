/**
 * Runner de migraciones — control de versiones de la base de datos.
 *
 * Uso:   DATABASE_URL=postgres://... node db/migrate.mjs
 *
 * Qué hace:
 *  1. Crea (si no existe) la tabla `schema_migrations` que registra qué se aplicó.
 *  2. Baseline (una sola vez):
 *       - Si la BD está VACÍA  → aplica db/baseline/schema.sql + seed_reference.sql.
 *       - Si la BD YA tiene schema (dev/prod con datos) → NO reconstruye, solo marca.
 *       - Marca el baseline y todas las migraciones ya "horneadas" (baselined.txt).
 *  3. Aplica en orden solo las migraciones NUEVAS (las que no estén registradas),
 *     cada una en su transacción. Si una falla, hace rollback y se detiene.
 *
 * Así, subir la v2/v3 = agregar archivos a infra/postgres/migrations/ y correr esto:
 * solo se aplican los nuevos, nunca se repite ni se rompe la BD.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const ROOT          = path.resolve(__dirname, '..');
const BASELINE_DIR  = path.join(__dirname, 'baseline');
const MIGRATIONS_DIR = path.join(ROOT, 'infra/postgres/migrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Falta la variable DATABASE_URL.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

const readSql = (p) => readFileSync(p, 'utf8');
// Limpia la salida de pg_dump para poder aplicarla con el driver de Node:
//  · quita meta-comandos de psql (\restrict, \unrestrict, \connect) — el driver no los entiende.
//  · quita el reseteo de search_path a '' (dejaría los nombres sin calificar sin resolver).
const sanitizeDump = (sql) => sql
  .split('\n')
  .filter((l) => !/^\s*\\/.test(l))
  .filter((l) => !/set_config\('search_path'/.test(l))
  .join('\n');

async function tableExists(name) {
  const r = await client.query('SELECT to_regclass($1) AS t', [`public.${name}`]);
  return r.rows[0].t !== null;
}

async function main() {
  await client.connect();
  console.log('🔌 Conectado a la base de datos.');

  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
  );

  // ── 1) Baseline (una sola vez) ────────────────────────────
  if (!applied.has('__baseline__')) {
    const coreExists = await tableExists('oficios');

    if (!coreExists) {
      console.log('📦 Base de datos vacía → aplicando baseline (schema + datos de referencia)…');
      await client.query('BEGIN');
      try {
        await client.query('SET search_path TO public');
        await client.query(sanitizeDump(readSql(path.join(BASELINE_DIR, 'schema.sql'))));
        const seedRef = path.join(BASELINE_DIR, 'seed_reference.sql');
        if (existsSync(seedRef)) await client.query(sanitizeDump(readSql(seedRef)));
        await client.query('COMMIT');
        console.log('   ✓ Baseline aplicado (estructura + catálogos de referencia).');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    } else {
      console.log('ℹ️  La BD ya tiene estructura → se marca el baseline sin reconstruir.');
    }

    const baselined = existsSync(path.join(BASELINE_DIR, 'baselined.txt'))
      ? readSql(path.join(BASELINE_DIR, 'baselined.txt')).split('\n').map((s) => s.trim()).filter(Boolean)
      : [];
    await client.query('BEGIN');
    await client.query("INSERT INTO schema_migrations(filename) VALUES ('__baseline__') ON CONFLICT DO NOTHING");
    for (const f of baselined) {
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      applied.add(f);
    }
    await client.query('COMMIT');
    applied.add('__baseline__');
    console.log(`   ✓ ${baselined.length} migraciones registradas como base.`);
  }

  // ── 2) Migraciones nuevas (futuras) ───────────────────────
  const files = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ Sin migraciones pendientes. La base de datos está al día.');
    return;
  }

  console.log(`⏳ Aplicando ${pending.length} migración(es) nueva(s)…`);
  await client.query('SET search_path TO public');
  for (const f of pending) {
    process.stdout.write(`   → ${f} … `);
    await client.query('BEGIN');
    try {
      await client.query(readSql(path.join(MIGRATIONS_DIR, f)));
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log('ok');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('FALLÓ');
      throw new Error(`Migración ${f} falló: ${e.message}`);
    }
  }
  console.log('✅ Migraciones completas.');
}

main()
  .then(() => client.end())
  .catch((e) => {
    console.error('❌ ' + (e.message ?? e));
    client.end();
    process.exit(1);
  });
