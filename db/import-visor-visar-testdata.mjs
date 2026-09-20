/**
 * Importa datos de prueba REALES del prototipo VISAR (~/Kiro/SAR/visar) al
 * módulo Visor de Documentos de PRISMA: delegación, sección, 5 tomos reales
 * (CXLIV, CXLV, CXLVI, CXLVII, CXLIX), sus ~3,483 fojas escaneadas y las
 * 434 inscripciones reales importadas ahí desde Excel (Gisnet).
 *
 * A diferencia de db/seed-visor-test.mjs (3 imágenes placeholder), esto trae
 * PDFs reales — pensado para poder probar el visor de punta a punta con
 * variedad y volumen reales, no solo el flujo feliz.
 *
 * SOLO PARA DESARROLLO LOCAL. No es la migración de producción desde SID
 * (esa sigue pendiente como db/migrate-visor-sid.mjs, fuera de este
 * alcance) — la fuente aquí es la base de datos del prototipo VISAR, que
 * solo existe en la máquina de quien migró el módulo.
 *
 * Requiere que los archivos físicos ya estén copiados al volumen de
 * storage de PRISMA bajo /app/storage/visor_documentos/importado_visar/
 * (mismo árbol relativo que VISAR: delegaciones/1/secciones/1/tomos/...).
 * Ver el comando `docker cp` usado para copiarlos antes de correr esto.
 *
 * Uso (dentro del contenedor app_api, para que DATABASE_URL ya apunte a la
 * BD correcta y los archivos copiados sean visibles):
 *   VISAR_DATABASE_URL=postgresql://visar_user:visar_secret@host.docker.internal:5432/visar_db \
 *   node db/import-visor-visar-testdata.mjs
 *
 * Idempotente: cada tabla destino usa `origen_id` (id en VISAR) como
 * UNIQUE, igual que db/migrate-tickets-sid.mjs.
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const VISAR_DATABASE_URL = process.env.VISAR_DATABASE_URL
  ?? 'postgresql://visar_user:visar_secret@host.docker.internal:5432/visar_db';

if (!DATABASE_URL) { console.error('❌ Falta DATABASE_URL.'); process.exit(1); }

const STORAGE_PREFIX = '/visor_documentos/importado_visar/';

const src = new pg.Client({ connectionString: VISAR_DATABASE_URL });
const dst = new pg.Client({ connectionString: DATABASE_URL });

async function importarDelegaciones() {
  const { rows } = await src.query('SELECT id, nombre FROM delegaciones ORDER BY id');
  const mapa = new Map(); // origen_id (delegacion VISAR) -> id en PRISMA
  for (const d of rows) {
    const existente = await dst.query('SELECT id FROM visor_delegaciones WHERE nombre = $1', [d.nombre]);
    let id;
    if (existente.rowCount > 0) {
      id = existente.rows[0].id;
    } else {
      const ins = await dst.query(
        'INSERT INTO visor_delegaciones (nombre, activo) VALUES ($1, true) RETURNING id',
        [d.nombre],
      );
      id = ins.rows[0].id;
    }
    mapa.set(d.id, id);
  }
  console.log(`✅ Delegaciones: ${mapa.size} (reutilizando por nombre si ya existían)`);
  return mapa;
}

async function importarSecciones() {
  const { rows } = await src.query('SELECT id, numero, nombre FROM secciones ORDER BY id');
  const mapa = new Map();
  for (const s of rows) {
    // La sección se identifica por número romano (numero), no por nombre —
    // PRISMA ya trae las 4 secciones fijas sembradas por la migración base.
    const existente = await dst.query('SELECT id FROM visor_secciones WHERE numero = $1', [s.numero]);
    if (existente.rowCount === 0) {
      throw new Error(`No existe visor_secciones.numero=${s.numero} en PRISMA. Corre primero db:migrate.`);
    }
    mapa.set(s.id, existente.rows[0].id);
  }
  console.log(`✅ Secciones: ${mapa.size} (mapeadas por número contra el catálogo fijo de PRISMA)`);
  return mapa;
}

async function importarTomos(mapaDelegaciones, mapaSecciones) {
  const { rows } = await src.query(
    'SELECT id, delegacion_id, seccion_id, numero_romano, indice_orden, anio_registro, cajon, id_libro, inscripcion_inicial, inscripcion_final FROM tomos ORDER BY id',
  );
  const mapa = new Map(); // origen_id (tomo VISAR) -> id en PRISMA
  let creados = 0;
  for (const t of rows) {
    const delegacionId = mapaDelegaciones.get(t.delegacion_id);
    const seccionId = mapaSecciones.get(t.seccion_id);

    const ins = await dst.query(
      `INSERT INTO visor_tomos
         (origen_id, delegacion_id, seccion_id, numero_romano, indice_orden, anio_registro, cajon, id_libro, inscripcion_inicial, inscripcion_final)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (origen_id) DO UPDATE SET numero_romano = EXCLUDED.numero_romano
       RETURNING id, (xmax = 0) AS insertado`,
      [t.id, delegacionId, seccionId, t.numero_romano, t.indice_orden, t.anio_registro || 0, t.cajon, t.id_libro, t.inscripcion_inicial, t.inscripcion_final],
    );
    mapa.set(t.id, ins.rows[0].id);
    if (ins.rows[0].insertado) creados++;
  }
  console.log(`✅ Tomos: ${mapa.size} (${creados} nuevos)`);
  return mapa;
}

async function importarFojas(mapaTomos) {
  const { rows } = await src.query('SELECT id, tomo_id, numero_foja, inscripcion, orden_secuencial FROM fojas ORDER BY id');
  const mapa = new Map(); // origen_id (foja VISAR) -> id en PRISMA
  let creadas = 0;
  for (const f of rows) {
    const tomoId = mapaTomos.get(f.tomo_id);
    if (!tomoId) continue;

    const ins = await dst.query(
      `INSERT INTO visor_fojas (origen_id, tomo_id, numero_foja, inscripcion, orden_secuencial)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (origen_id) DO UPDATE SET numero_foja = EXCLUDED.numero_foja
       RETURNING id, (xmax = 0) AS insertado`,
      [f.id, tomoId, f.numero_foja, f.inscripcion, f.orden_secuencial],
    );
    mapa.set(f.id, ins.rows[0].id);
    if (ins.rows[0].insertado) creadas++;
  }
  console.log(`✅ Fojas: ${mapa.size} (${creadas} nuevas)`);
  return mapa;
}

async function importarImagenes(mapaFojas) {
  const { rows } = await src.query('SELECT id, foja_id, version, ruta_storage, formato FROM imagenes_foja ORDER BY id');
  let creadas = 0;
  for (const img of rows) {
    const fojaId = mapaFojas.get(img.foja_id);
    if (!fojaId) continue;

    const rutaPrisma = STORAGE_PREFIX + img.ruta_storage;
    const res = await dst.query(
      `INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (foja_id, version) DO UPDATE SET ruta_storage = EXCLUDED.ruta_storage
       RETURNING (xmax = 0) AS insertado`,
      [fojaId, img.version, rutaPrisma, img.formato],
    );
    if (res.rows[0].insertado) creadas++;
  }
  console.log(`✅ Imágenes de foja: ${rows.length} procesadas (${creadas} nuevas)`);
}

async function importarInscripciones(mapaTomos, mapaFojas) {
  const { rows } = await src.query(
    'SELECT id, tomo_id, numero_inscripcion, volumen, asignacion, estatus, observaciones FROM inscripciones ORDER BY id',
  );

  // Fojas por (tomo_id destino, numero_foja) para resolver foja_id — la
  // correspondencia numero_inscripcion ↔ numero_foja (con padding a 5
  // dígitos) está verificada contra los datos reales, ver la migración.
  const fojasPorTomo = new Map(); // tomoIdDestino -> Map(numero_foja -> fojaIdDestino)
  const { rows: fojasDestino } = await dst.query('SELECT id, tomo_id, numero_foja FROM visor_fojas');
  for (const f of fojasDestino) {
    if (!fojasPorTomo.has(f.tomo_id)) fojasPorTomo.set(f.tomo_id, new Map());
    fojasPorTomo.get(f.tomo_id).set(f.numero_foja, f.id);
  }

  let creadas = 0;
  let sinFoja = 0;
  for (const i of rows) {
    const tomoId = mapaTomos.get(i.tomo_id);
    if (!tomoId) continue;

    const numeroFojaEsperado = String(i.numero_inscripcion).padStart(5, '0');
    const fojaId = fojasPorTomo.get(tomoId)?.get(numeroFojaEsperado) ?? null;
    if (!fojaId) sinFoja++;

    const res = await dst.query(
      `INSERT INTO visor_inscripciones (origen_id, tomo_id, foja_id, numero_inscripcion, volumen, asignacion, estatus, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (origen_id) DO UPDATE SET foja_id = EXCLUDED.foja_id
       RETURNING (xmax = 0) AS insertado`,
      [i.id, tomoId, fojaId, i.numero_inscripcion, i.volumen, i.asignacion, i.estatus === 'N/A' ? null : i.estatus, i.observaciones],
    );
    if (res.rows[0].insertado) creadas++;
  }
  console.log(`✅ Inscripciones: ${rows.length} procesadas (${creadas} nuevas, ${sinFoja} sin foja resuelta)`);
}

async function main() {
  await src.connect();
  await dst.connect();
  console.log('🔌 Conectado a VISAR (origen) y PRISMA (destino).');

  const mapaDelegaciones = await importarDelegaciones();
  const mapaSecciones = await importarSecciones();
  const mapaTomos = await importarTomos(mapaDelegaciones, mapaSecciones);
  const mapaFojas = await importarFojas(mapaTomos);
  await importarImagenes(mapaFojas);
  await importarInscripciones(mapaTomos, mapaFojas);

  console.log('\n✅ Importación de datos de prueba de VISAR completa.');
}

main()
  .then(async () => { await src.end(); await dst.end(); })
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
    process.exit(1);
  });
