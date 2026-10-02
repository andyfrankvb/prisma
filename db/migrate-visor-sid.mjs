/**
 * Migra el catálogo del acervo digitalizado de SID hacia el Visor de PRISMA.
 *
 * Uso:
 *   DATABASE_URL=postgres://.../prisma \
 *   SID_DATABASE_URL=postgres://.../sid \
 *   node db/migrate-visor-sid.mjs
 *
 * ── Qué trae ───────────────────────────────────────────────────────────────
 * La tabla `visor_pdf_index` de SID: un renglón por PDF, con delegación,
 * sección, tomo, volumen, página y la ruta del archivo en la carpeta
 * compartida. Al momento de escribir esto son 638,171 archivos de 5,896 tomos
 * de las cuatro delegaciones.
 *
 * ── Lo que NO hace: copiar archivos ────────────────────────────────────────
 * Los PDF se quedan donde el SID los dejó y PRISMA los lee de ahí. Son 22.6 GB
 * que no tiene sentido duplicar, y así cualquier archivo que SID agregue o
 * reemplace se ve igual desde PRISMA. En la base solo se guarda la ruta
 * relativa al punto de montaje (`/visor_sid/...`), que es como el servicio de
 * imágenes ya resuelve sus rutas.
 *
 * ── Idempotente y reanudable ───────────────────────────────────────────────
 * Cada fila guarda el id de origen de SID (`origen_id`, UNIQUE) y cada INSERT
 * lleva ON CONFLICT DO NOTHING. Correrlo de nuevo —para traer lo que SID haya
 * digitalizado después— no duplica nada ni toca lo ya migrado.
 */
import pg from 'pg';

const DATABASE_URL     = process.env.DATABASE_URL;
const SID_DATABASE_URL = process.env.SID_DATABASE_URL;
const LOTE             = Number(process.env.MIGRATE_VISOR_LOTE ?? 5000);

/**
 * Punto de montaje del acervo dentro del contenedor, relativo a la carpeta de
 * almacenamiento de PRISMA. La ruta guardada queda, por ejemplo:
 *   /visor_sid/VISOR/Secciones/Cancun/SECCION 4/CCLXXVI/1_1/000381.pdf
 */
const PREFIJO_STORAGE = process.env.VISOR_PREFIJO_STORAGE ?? '/visor_sid';

/** Lo que hay que quitarle a la ruta de SID para dejarla relativa al montaje. */
const RAIZ_SID = process.env.VISOR_RAIZ_SID ?? '/mnt/direccion_tics/SID';

if (!DATABASE_URL)     { console.error('❌ Falta DATABASE_URL (destino, PRISMA).'); process.exit(1); }
if (!SID_DATABASE_URL) { console.error('❌ Falta SID_DATABASE_URL (origen, SID).');  process.exit(1); }

const origen  = new pg.Client({ connectionString: SID_DATABASE_URL });
const destino = new pg.Client({ connectionString: DATABASE_URL });

/**
 * Nombre de la delegación tal como debe verse en PRISMA.
 *
 * En el acervo, la carpeta de Cozumel se llama "Cozumel tiff": un nombre que
 * quedó del proceso de conversión y que no tiene por qué llegar a la pantalla.
 */
function nombreDelegacion(oficina) {
  const limpio = String(oficina ?? '').trim();
  return limpio.replace(/\s+tiff$/i, '');
}

/**
 * Volumen del tomo, o cadena vacía si el tomo no se subdivide.
 *
 * En las 5,156 fojas cuyo archivo cuelga directo del tomo, sin carpeta de
 * volumen, el catálogo de SID guardó ahí el NOMBRE DEL ARCHIVO ("000001.pdf").
 * Tomarlo al pie de la letra creaba un tomo por archivo: 2,501 "tomos" de una
 * sola foja solo en la Sección 5 de Cancún.
 */
function volumenReal(volumen, nombreArchivo) {
  const v = String(volumen ?? '').trim();
  if (!v) return '';
  if (/\.(pdf|tif|tiff|jpg|jpeg|png)$/i.test(v)) return '';
  if (nombreArchivo && v === String(nombreArchivo).trim()) return '';
  return v;
}

/** "SECCION 4" → 4. El acervo va de la 3 a la 7; las siete están sembradas. */
function numeroSeccion(seccion) {
  const m = String(seccion ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Ruta relativa al montaje: se le quita la raíz que usa SID en su servidor. */
function rutaRelativa(rutaCompleta) {
  const r = String(rutaCompleta ?? '');
  const sinRaiz = r.startsWith(RAIZ_SID) ? r.slice(RAIZ_SID.length) : r;
  return `${PREFIJO_STORAGE}${sinRaiz.startsWith('/') ? '' : '/'}${sinRaiz}`;
}

async function main() {
  await origen.connect();
  await destino.connect();
  console.log('🔌 Conectado a origen (SID) y destino (PRISMA).');

  const { rows: [{ total }] } = await origen.query(
    `SELECT COUNT(*)::int AS total FROM visor_pdf_index WHERE version_activa IS NOT FALSE`,
  );
  console.log(`📚 ${total.toLocaleString('es-MX')} archivos por revisar en el catálogo de SID.`);

  // Catálogos de PRISMA en memoria: son decenas de filas contra cientos de
  // miles de archivos, así que resolverlos por consulta en cada fila sería
  // gastar un viaje a la base por documento.
  const delegaciones = new Map();
  const secciones    = new Map();
  const tomos        = new Map();

  for (const s of (await destino.query('SELECT id, numero FROM visor_secciones')).rows) {
    secciones.set(Number(s.numero), s.id);
  }
  for (const d of (await destino.query('SELECT id, nombre FROM visor_delegaciones')).rows) {
    delegaciones.set(d.nombre.toLowerCase(), d.id);
  }

  async function idDelegacion(oficina) {
    const nombre = nombreDelegacion(oficina);
    const clave  = nombre.toLowerCase();
    if (delegaciones.has(clave)) return delegaciones.get(clave);

    const { rows } = await destino.query(
      `INSERT INTO visor_delegaciones (nombre, activo) VALUES ($1, true)
       ON CONFLICT DO NOTHING RETURNING id`, [nombre],
    );
    const id = rows[0]?.id
      ?? (await destino.query('SELECT id FROM visor_delegaciones WHERE lower(nombre) = $1', [clave])).rows[0].id;
    delegaciones.set(clave, id);
    return id;
  }

  async function idTomo(delegacionId, seccionId, numeroRomano, volumen) {
    const clave = `${delegacionId}|${seccionId}|${numeroRomano}|${volumen}`;
    if (tomos.has(clave)) return tomos.get(clave);

    const { rows } = await destino.query(
      `INSERT INTO visor_tomos (delegacion_id, seccion_id, numero_romano, volumen)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (delegacion_id, seccion_id, numero_romano, volumen)
       DO UPDATE SET numero_romano = EXCLUDED.numero_romano
       RETURNING id`,
      [delegacionId, seccionId, numeroRomano, volumen],
    );
    tomos.set(clave, rows[0].id);
    return rows[0].id;
  }

  let leidas = 0, nuevas = 0, omitidas = 0, cursor = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT id_documento, oficina, seccion, tomo, volumen, pagina, ruta_completa, version, nombre_archivo
         FROM visor_pdf_index
        WHERE id_documento > $1 AND version_activa IS NOT FALSE
        ORDER BY id_documento
        LIMIT $2`,
      [cursor, LOTE],
    );
    if (rows.length === 0) break;

    for (const fila of rows) {
      leidas++;
      const numSeccion = numeroSeccion(fila.seccion);
      const seccionId  = numSeccion ? secciones.get(numSeccion) : null;

      // Sin sección o sin tomo no hay dónde colgar la foja: se registra y sigue,
      // en vez de abortar una corrida de cientos de miles de archivos.
      if (!seccionId || !fila.tomo || !fila.ruta_completa) {
        omitidas++;
        if (omitidas <= 10) console.warn(`⚠️  Omitido id_documento=${fila.id_documento}: sección/tomo/ruta incompletos`);
        continue;
      }

      const delegacionId = await idDelegacion(fila.oficina);
      // El volumen puede faltar: en el acervo hay 5,156 archivos que cuelgan
      // directo del tomo, sin carpeta de volumen.
      // Sin volumen se guarda cadena vacía, no nulo: así la clave única del
      // tomo es una comparación directa (ver la migración del acervo).
      const tomoId = await idTomo(delegacionId, seccionId, String(fila.tomo).trim(), volumenReal(fila.volumen, fila.nombre_archivo));

      const numeroFoja = fila.pagina != null ? String(fila.pagina) : null;
      if (!numeroFoja) { omitidas++; continue; }

      const { rows: fojaRows } = await destino.query(
        `INSERT INTO visor_fojas (tomo_id, numero_foja, orden_secuencial)
         VALUES ($1, $2, $3)
         ON CONFLICT (tomo_id, numero_foja) DO UPDATE SET numero_foja = EXCLUDED.numero_foja
         RETURNING id`,
        [tomoId, numeroFoja, Number(fila.pagina)],
      );
      const fojaId = fojaRows[0].id;

      const res = await destino.query(
        `INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato, origen_id)
         VALUES ($1, $2, $3, 'pdf', $4)
         ON CONFLICT (origen_id) DO NOTHING`,
        // El acervo de SID tiene una sola versión activa por foja; el número
        // solo aparece si algún día publican una segunda digitalización.
        [fojaId, Number(fila.version ?? 1) > 1 ? `V_SID${fila.version}` : 'V_SID', rutaRelativa(fila.ruta_completa), fila.id_documento],
      );
      nuevas += res.rowCount;
    }

    cursor = rows[rows.length - 1].id_documento;
    console.log(`  … ${leidas.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} · ${nuevas.toLocaleString('es-MX')} fojas nuevas · ${tomos.size} tomos`);
  }

  console.log('─'.repeat(64));
  console.log(`✅ Listo. Leídas: ${leidas.toLocaleString('es-MX')} · Imágenes nuevas: ${nuevas.toLocaleString('es-MX')} · Omitidas: ${omitidas} · Tomos: ${tomos.size} · Delegaciones: ${delegaciones.size}`);
}

main()
  .then(() => Promise.all([origen.end(), destino.end()]))
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await Promise.all([origen.end(), destino.end()]);
    process.exit(1);
  });
