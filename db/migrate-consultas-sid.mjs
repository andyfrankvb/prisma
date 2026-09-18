/**
 * Migra el histórico de Consulta Pública SIQROO de SID hacia PRISMA.
 *
 * Uso:
 *   DATABASE_URL=postgres://.../prisma \
 *   SID_DATABASE_URL=postgres://.../sid \
 *   node db/migrate-consultas-sid.mjs
 *
 * Idempotente y reanudable: cada fila migrada guarda su id de SID en
 * `origen_id` (columna UNIQUE en `consulta_publica` de PRISMA — ver
 * infra/postgres/migrations/2026-09-18_consulta_publica.sql). Cada corrida
 * retoma después del mayor `origen_id` ya migrado, y cada INSERT lleva
 * `ON CONFLICT (origen_id) DO NOTHING` como respaldo — correrlo de nuevo (por
 * ejemplo, para traer lo nuevo mientras SID sigue recibiendo tráfico durante
 * la transición) nunca duplica filas.
 *
 * Esquema limpio en destino: NO se copian `nombres`/`apellido` (en SID solo
 * se usan para componer `nombre_completo`), `usuario`/`tramite` (redundantes
 * con `tipo_usuario`) ni `fecha_registro` (duplicado de `hora_busqueda` con
 * desfase de huso horario) — ver consultas.types.ts.
 */
import pg from 'pg';

const DATABASE_URL     = process.env.DATABASE_URL;
const SID_DATABASE_URL = process.env.SID_DATABASE_URL;
const BATCH_SIZE       = Number(process.env.MIGRATE_CONSULTAS_BATCH ?? 500);

if (!DATABASE_URL)     { console.error('❌ Falta DATABASE_URL (destino, PRISMA).'); process.exit(1); }
if (!SID_DATABASE_URL) { console.error('❌ Falta SID_DATABASE_URL (origen, SID).');  process.exit(1); }

const origen  = new pg.Client({ connectionString: SID_DATABASE_URL });
const destino = new pg.Client({ connectionString: DATABASE_URL });

/** Nombre a usar cuando el legacy no trae `nombre_completo` (defensivo — en la data real de SID nunca pasa). */
function resolverNombre(fila) {
  const directo = (fila.nombre_completo ?? '').trim();
  if (directo) return directo;
  const compuesto = `${fila.nombres ?? ''} ${fila.apellido ?? ''}`.trim();
  return compuesto || 'SIN NOMBRE';
}

/** Filas sin lo mínimo indispensable se registran y se saltan, en vez de tronar la corrida completa. */
function validar(fila) {
  if (!fila.codigo_acceso || !String(fila.codigo_acceso).trim()) return 'codigo_acceso vacío';
  if (fila.busqueda === null || typeof fila.busqueda !== 'object') return 'busqueda nula o inválida';
  if (!fila.hora_busqueda) return 'hora_busqueda vacía';
  return null;
}

async function main() {
  await origen.connect();
  await destino.connect();
  console.log('🔌 Conectado a origen (SID) y destino (PRISMA).');

  const { rows: [{ max_migrado }] } = await destino.query(
    `SELECT COALESCE(MAX(origen_id), 0) AS max_migrado FROM consulta_publica`,
  );
  console.log(`↪️  Retomando después de origen_id=${max_migrado}.`);

  let cursor           = Number(max_migrado);
  let totalLeidas      = 0;
  let totalInsertadas  = 0;
  let totalOmitidas    = 0;
  let totalErrores     = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT id, nombre_completo, nombres, apellido, codigo_acceso, busqueda,
              filtro_busqueda, tipo_usuario, oficina, folio, estado_contador, hora_busqueda
         FROM consulta_publica
        WHERE id > $1
        ORDER BY id
        LIMIT $2`,
      [cursor, BATCH_SIZE],
    );
    if (rows.length === 0) break;

    totalLeidas += rows.length;

    for (const fila of rows) {
      const motivo = validar(fila);
      if (motivo) {
        totalOmitidas++;
        console.warn(`⚠️  Omitida fila id=${fila.id} (SID): ${motivo}`);
        continue;
      }

      try {
        const res = await destino.query(
          `INSERT INTO consulta_publica
             (origen_id, nombre_completo, codigo_acceso, busqueda, filtro_busqueda,
              tipo_usuario, oficina, folio, estado_contador, hora_busqueda)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (origen_id) DO NOTHING`,
          [
            fila.id,
            resolverNombre(fila),
            fila.codigo_acceso,
            fila.busqueda,
            fila.filtro_busqueda,
            fila.tipo_usuario,
            fila.oficina,
            fila.folio,
            fila.estado_contador,
            fila.hora_busqueda,
          ],
        );
        totalInsertadas += res.rowCount;
      } catch (e) {
        totalErrores++;
        console.error(`❌ Fila id=${fila.id} (SID): ${e.message}`);
      }
    }

    cursor = rows[rows.length - 1].id;
    console.log(`  … migradas hasta origen_id=${cursor} (${totalInsertadas} insertadas de ${totalLeidas} leídas hasta ahora)`);
  }

  console.log('─'.repeat(60));
  console.log(
    `✅ Listo. Leídas: ${totalLeidas} · Insertadas: ${totalInsertadas} · ` +
    `Ya existentes: ${totalLeidas - totalInsertadas - totalOmitidas - totalErrores} · ` +
    `Omitidas: ${totalOmitidas} · Errores: ${totalErrores}`,
  );
}

main()
  .then(() => Promise.all([origen.end(), destino.end()]))
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await Promise.all([origen.end(), destino.end()]);
    process.exit(1);
  });
