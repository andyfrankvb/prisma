/**
 * Pone la MISMA contraseña a todos los usuarios — solo para entornos de prueba.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node db/qa-password.mjs <contraseña> --base=<nombre>
 *
 * Ejemplo en QA:
 *   DATABASE_URL=... node db/qa-password.mjs "Prueba.2026" --base=prisma_qa
 *
 * ── Para qué sirve ───────────────────────────────────────────────────────────
 *
 * QA se llena copiando la base de producción, y esa copia trae los hash de las
 * contraseñas reales: nadie puede entrar a probar sin pedirle su clave a cada
 * persona. Esto le pone a todos una contraseña conocida, de una sola vez.
 *
 * ── Por qué pide tantas cosas ────────────────────────────────────────────────
 *
 * Es el script más destructivo del repositorio: deja fuera a TODO el mundo de un
 * solo golpe, y no se puede deshacer —los hash anteriores no se guardan en
 * ninguna parte—. Correrlo contra producción por una variable de entorno mal
 * puesta sería un incidente mayúsculo, y el `.env` de la máquina de desarrollo
 * apunta justamente a producción.
 *
 * De ahí las tres llaves, y que todas fallen cerrando:
 *
 *   1. Lista negra dura: si la base se llama `prisma` o vive en el servidor de
 *      producción, se niega sin más. No hay bandera que lo permita.
 *   2. Hay que ESCRIBIR el nombre de la base en `--base=`. No basta con que el
 *      DATABASE_URL apunte ahí: hay que decirlo a propósito, y si no coincide
 *      con la base real, no corre.
 *   3. Antes de escribir imprime a qué base y a cuántas personas va a afectar.
 */
import pg from 'pg';
import bcrypt from 'bcrypt';

// Bases y servidores que NUNCA se tocan, pase lo que pase.
const PROHIBIDAS = ['prisma'];
const SERVIDORES_PROHIBIDOS = ['10.1.100.133'];

const [, , password, ...resto] = process.argv;
const baseEsperada = (resto.find((a) => a.startsWith('--base=')) ?? '').split('=')[1];

function abortar(mensaje) {
  console.error(`❌ ${mensaje}`);
  process.exit(1);
}

if (!password)      abortar('Falta la contraseña.\n   Uso: node db/qa-password.mjs <contraseña> --base=<nombre>');
if (password.length < 8) abortar('La contraseña debe tener al menos 8 caracteres (es la regla del sistema).');
if (!baseEsperada)  abortar('Falta --base=<nombre>. Hay que escribir a propósito el nombre de la base que se va a modificar.');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) abortar('Falta la variable DATABASE_URL.');

if (SERVIDORES_PROHIBIDOS.some((h) => DATABASE_URL.includes(h))) {
  abortar('Ese DATABASE_URL apunta al servidor de PRODUCCIÓN. Este script no corre ahí.');
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  const { rows: [info] } = await client.query(
    'SELECT current_database() AS base, inet_server_addr()::text AS ip',
  );

  if (PROHIBIDAS.includes(info.base)) {
    abortar(`La base se llama «${info.base}», que es la de PRODUCCIÓN. Este script no corre ahí.`);
  }
  if (info.base !== baseEsperada) {
    abortar(`Dijiste --base=${baseEsperada} pero el DATABASE_URL apunta a «${info.base}». No se toca nada.`);
  }

  const { rows: [conteo] } = await client.query(
    'SELECT count(*)::int AS activos FROM usuarios WHERE activo',
  );

  console.log(`🔑 Base ....... ${info.base} @ ${info.ip ?? 'local'}`);
  console.log(`   Usuarios ... ${conteo.activos} activos`);
  console.log(`   Contraseña . ${password}`);

  // El mismo costo que usa el alta de usuarios, para que el hash sea indistinguible
  // de uno real y las pruebas midan lo que de verdad pasa al iniciar sesión.
  const hash = await bcrypt.hash(password, 12);

  // `password_debe_cambiar` se queda APAGADA a propósito.
  //
  // El sistema obliga a cambiar la contraseña cuando la puso un tercero, que es lo
  // correcto para una persona de verdad. Aquí sería contraproducente: los 52
  // usuarios de QA entrarían y lo primero que verían es una pantalla exigiéndoles
  // una contraseña nueva, con lo que QA quedaría inservible justo para lo que se
  // llenó. Y la marca de tiempo se pone igual, para que ninguna sesión anterior a
  // este cambio siga viva.
  const { rowCount } = await client.query(
    `UPDATE usuarios
        SET password_hash         = $1,
            password_debe_cambiar = false,
            password_cambiada_en  = now()
      WHERE activo`,
    [hash],
  );

  console.log(`✅ ${rowCount} contraseñas actualizadas. Todos entran con «${password}».`);
}

main()
  .then(() => client.end())
  .catch((e) => {
    console.error('❌ ' + (e.message ?? e));
    client.end();
    process.exit(1);
  });
