/**
 * Migra el histórico del módulo de Folios de SID (consecutivo de oficios de
 * SALIDA) hacia `folios_salida` en PRISMA, y deja el contador listo para que
 * el primer folio que emita PRISMA en producción sea +1 del último real de SID.
 *
 * Uso:
 *   DATABASE_URL=postgres://.../prisma \
 *   SID_DATABASE_URL=postgres://.../sid \
 *   node db/migrate-folios-sid.mjs
 *
 * Idempotente y reanudable — mismo patrón que migrate-tickets-sid.mjs y
 * migrate-consultas-sid.mjs: cada fila guarda su identidad de origen
 * (`origen_sid_tabla` + `origen_sid_id`, UNIQUE — ver
 * infra/postgres/migrations/2026-09-19_folios_salida.sql) y cada INSERT lleva
 * `ON CONFLICT DO NOTHING`. Correrlo de nuevo mientras SID sigue en producción
 * durante la transición nunca duplica filas.
 *
 * ── Dos fuentes, sin relacionarse con `oficios` de PRISMA ────────────────────
 *
 * `folios` (tabla estructurada, con `num_folio` como consecutivo entero) y
 * `registros` (el archivo previo a esa tabla, con su propia numeración en
 * texto). Ninguna de las dos tiene ni puede tener un `oficio_id` de PRISMA:
 * SID no conocía el concepto de "oficio" que introdujo este módulo, así que
 * las dos se insertan con `oficio_id NULL` y `es_legacy = TRUE` — quedan como
 * historial de solo lectura, nunca como un folio "vivo" al que se le pueda dar
 * seguimiento de estatus.
 *
 * ── Por qué el contador se reconcilia solo contra `folios.num_folio` ─────────
 *
 * `num_folio` es el entero que de verdad maneja hoy la emisión en SID
 * (`Folio::max('num_folio') + 1`, sin reinicio). `registros` es un archivo ya
 * congelado de una era anterior a esa tabla, con numeración propia y
 * desconectada de este contador — incluirlo en la reconciliación adelantaría
 * el consecutivo sin ninguna base real. Se migra igual como historial (se
 * quiere ver), pero no participa en el cálculo de "el siguiente folio".
 *
 * Fuera de alcance: los folios de RRHH/Delegación/Administrador de SID se
 * migran tal cual (rol_formato = 'LEGACY', se preserva el texto original) —
 * este módulo de PRISMA solo EMITE folios nuevos para Analista/Director
 * Jurídico (ver folio-salida.formatter.ts). Los demás roles no tienen aún un
 * flujo equivalente en Oficialía de Partes.
 */
import pg from 'pg';

const DATABASE_URL     = process.env.DATABASE_URL;
const SID_DATABASE_URL = process.env.SID_DATABASE_URL;
const BATCH_SIZE       = Number(process.env.MIGRATE_FOLIOS_BATCH ?? 500);

if (!DATABASE_URL)     { console.error('❌ Falta DATABASE_URL (destino, PRISMA).'); process.exit(1); }
if (!SID_DATABASE_URL) { console.error('❌ Falta SID_DATABASE_URL (origen, SID).');  process.exit(1); }

const origen  = new pg.Client({ connectionString: SID_DATABASE_URL });
const destino = new pg.Client({ connectionString: DATABASE_URL });

const MESES_ROMANO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Intenta rescatar año y mes romano del propio folio_generado; si no puede, usa fecha_hora. */
function anioYMesDe(folioGenerado, fechaHora) {
  const enTexto = String(folioGenerado ?? '').match(/\/([IVX]{1,4})\/(\d{4})(?:\D|$)/);
  if (enTexto) return { mesRomano: enTexto[1], anio: Number(enTexto[2]) };
  const f = fechaHora ? new Date(fechaHora) : new Date();
  return { mesRomano: MESES_ROMANO[f.getMonth() + 1], anio: f.getFullYear() };
}

async function main() {
  await origen.connect();
  await destino.connect();
  console.log('🔌 Conectado a origen (SID) y destino (PRISMA).');

  // ── 1) `folios` (tabla estructurada — la que de verdad alimenta el contador) ──
  const { rows: [{ max_migrado }] } = await destino.query(
    `SELECT COALESCE(MAX(origen_sid_id), 0) AS max_migrado
       FROM folios_salida WHERE origen_sid_tabla = 'folios'`,
  );
  console.log(`↪️  folios: retomando después de folio_id=${max_migrado}.`);

  let cursor = Number(max_migrado);
  let leidas = 0, insertadas = 0, errores = 0;
  let maxNumFolioVisto = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT folio_id, num_folio, usuario_id, fecha_hora, folio_generado
         FROM folios
        WHERE folio_id > $1
        ORDER BY folio_id
        LIMIT $2`,
      [cursor, BATCH_SIZE],
    );
    if (rows.length === 0) break;
    leidas += rows.length;

    for (const fila of rows) {
      try {
        if (!fila.folio_generado) { continue; } // sin texto de folio no hay nada que preservar
        const { mesRomano, anio } = anioYMesDe(fila.folio_generado, fila.fecha_hora);
        const consecutivo = Number(fila.num_folio) || 0;
        if (consecutivo > maxNumFolioVisto) maxNumFolioVisto = consecutivo;

        const res = await destino.query(
          `INSERT INTO folios_salida
             (oficio_id, consecutivo, folio_formateado, rol_formato, anio, mes_romano,
              estatus, es_legacy, origen_sid_tabla, origen_sid_id, creado_en)
           VALUES (NULL, $1, $2, 'LEGACY', $3, $4, 'ASIGNADO', TRUE, 'folios', $5, $6)
           ON CONFLICT (origen_sid_tabla, origen_sid_id) WHERE es_legacy DO NOTHING`,
          [consecutivo, fila.folio_generado, anio, mesRomano, fila.folio_id, fila.fecha_hora ?? new Date()],
        );
        insertadas += res.rowCount;
      } catch (e) {
        errores++;
        console.error(`❌ folio_id=${fila.folio_id} (SID/folios): ${e.message}`);
      }
    }

    cursor = rows[rows.length - 1].folio_id;
    console.log(`  … folios migrados hasta folio_id=${cursor} (${insertadas} insertados de ${leidas} leídos)`);
  }
  console.log(`✅ folios — leídos: ${leidas} · insertados: ${insertadas} · errores: ${errores}`);

  // ── 2) `registros` (archivo previo a la tabla `folios` — solo historial) ──
  const { rows: [{ max_migrado_reg }] } = await destino.query(
    `SELECT COALESCE(MAX(origen_sid_id), 0) AS max_migrado_reg
       FROM folios_salida WHERE origen_sid_tabla = 'registros'`,
  );
  console.log(`↪️  registros: retomando después de folio_id=${max_migrado_reg}.`);

  let cursorReg = Number(max_migrado_reg);
  let leidasReg = 0, insertadasReg = 0, erroresReg = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT folio_id, folio, fecha, generado_por
         FROM registros
        WHERE folio_id > $1
        ORDER BY folio_id
        LIMIT $2`,
      [cursorReg, BATCH_SIZE],
    );
    if (rows.length === 0) break;
    leidasReg += rows.length;

    for (const fila of rows) {
      try {
        if (!fila.folio) continue;
        const folioLimpio = String(fila.folio).replace(/-/g, '');
        const { mesRomano, anio } = anioYMesDe(folioLimpio, fila.fecha);

        const res = await destino.query(
          `INSERT INTO folios_salida
             (oficio_id, consecutivo, folio_formateado, rol_formato, anio, mes_romano,
              estatus, es_legacy, origen_sid_tabla, origen_sid_id, creado_en)
           VALUES (NULL, 0, $1, 'LEGACY', $2, $3, 'ASIGNADO', TRUE, 'registros', $4, $5)
           ON CONFLICT (origen_sid_tabla, origen_sid_id) WHERE es_legacy DO NOTHING`,
          [folioLimpio, anio, mesRomano, fila.folio_id, fila.fecha ?? new Date()],
        );
        insertadasReg += res.rowCount;
      } catch (e) {
        erroresReg++;
        console.error(`❌ folio_id=${fila.folio_id} (SID/registros): ${e.message}`);
      }
    }

    cursorReg = rows[rows.length - 1].folio_id;
    console.log(`  … registros migrados hasta folio_id=${cursorReg} (${insertadasReg} insertados de ${leidasReg} leídos)`);
  }
  console.log(`✅ registros — leídos: ${leidasReg} · insertados: ${insertadasReg} · errores: ${erroresReg}`);

  // ── 3) Reconciliar el contador global ──────────────────────────────────────
  // El siguiente folio que emita PRISMA en vivo debe ser maxNumFolioVisto + 1,
  // igual que SID hacía con MAX(num_folio)+1. Se toma del MAYOR num_folio leído
  // en esta corrida (no de lo ya insertado antes), para que una corrida parcial
  // no adelante el contador con datos incompletos.
  const { rows: [{ max_actual }] } = await destino.query(
    `SELECT COALESCE(MAX(consecutivo), 0) AS max_actual
       FROM folios_salida WHERE origen_sid_tabla = 'folios'`,
  );
  const proximoConsecutivo = Math.max(Number(max_actual), maxNumFolioVisto);
  await destino.query(`SELECT setval('folio_salida_consecutivo_seq', $1)`, [proximoConsecutivo]);
  console.log(`✅ Contador (folio_salida_consecutivo_seq) puesto en ${proximoConsecutivo}. El próximo folio vivo será ${proximoConsecutivo + 1}.`);
}

main()
  .then(() => Promise.all([origen.end(), destino.end()]))
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await Promise.all([origen.end(), destino.end()]);
    process.exit(1);
  });
