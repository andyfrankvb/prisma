/**
 * Seed del usuario SuperAdmin inicial para producción.
 *
 * Uso:
 *   DATABASE_URL=postgres://...              (obligatoria)
 *   SUPERADMIN_INITIAL_PASSWORD=...          (obligatoria — NO se guarda en git)
 *   SUPERADMIN_EMAIL=ticsadmin               (opcional, default: ticsadmin)
 *   SUPERADMIN_NOMBRE="Administrador TICS"   (opcional)
 *   node db/seed-admin.mjs
 *
 * La contraseña se guarda HASHEADA (bcrypt); nunca en texto plano.
 * Es idempotente: si el usuario ya existe (por email), no lo toca.
 */
import pg from 'pg';
import bcrypt from 'bcrypt';

const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD     = process.env.SUPERADMIN_INITIAL_PASSWORD;
const EMAIL        = (process.env.SUPERADMIN_EMAIL  || 'ticsadmin').trim();
const NOMBRE       = (process.env.SUPERADMIN_NOMBRE || 'Administrador TICS').trim();

if (!DATABASE_URL) { console.error('❌ Falta DATABASE_URL.'); process.exit(1); }
if (!PASSWORD)     { console.error('❌ Falta SUPERADMIN_INITIAL_PASSWORD (la contraseña inicial).'); process.exit(1); }

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  // ¿Ya existe?
  const ya = await client.query('SELECT id FROM usuarios WHERE email = $1', [EMAIL]);
  if (ya.rowCount > 0) {
    console.log(`ℹ️  El usuario "${EMAIL}" ya existe (id ${ya.rows[0].id}). No se modifica.`);
    return;
  }

  // Oficina del SuperAdmin: TICS (Innovación/Informática) → si no, Dirección General → si no, la primera.
  const unidad = await client.query(`
    SELECT id FROM catalogo_unidades
    ORDER BY
      CASE
        WHEN nombre ILIKE '%innovaci%' OR nombre ILIKE '%informát%' OR nombre ILIKE '%tics%' THEN 0
        WHEN tipo = 'DIRECCION_GENERAL' THEN 1
        ELSE 2
      END, id
    LIMIT 1
  `);
  if (unidad.rowCount === 0) throw new Error('No hay oficinas en catalogo_unidades. Corre primero db:migrate.');
  const unidadId = unidad.rows[0].id;

  const hash = await bcrypt.hash(PASSWORD, 10);

  const res = await client.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, unidad_id, activo, cargo)
     VALUES ($1, $2, $3, 'SUPERADMIN', $4, true, 'Super Administrador')
     RETURNING id`,
    [NOMBRE, EMAIL, hash, unidadId],
  );
  console.log(`✅ SuperAdmin "${EMAIL}" creado (id ${res.rows[0].id}, oficina ${unidadId}).`);
  console.log('   La contraseña se guardó hasheada. Recomendado cambiarla tras el primer ingreso.');
}

main()
  .then(() => client.end())
  .catch((e) => { console.error('❌ ' + (e.message ?? e)); client.end(); process.exit(1); });
