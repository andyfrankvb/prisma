/**
 * Semilla de datos de prueba para el módulo Visor de Documentos.
 *
 * No hay todavía archivos reales de SID que migrar (eso queda para un futuro
 * db/migrate-visor-sid.mjs, mismo patrón idempotente que
 * db/migrate-tickets-sid.mjs). Este script solo siembra 1 delegación de
 * prueba, 1 tomo, 3 fojas y sus imágenes placeholder (generadas con `sharp`,
 * la misma librería que usa el servicio de imágenes en producción) para que
 * el visor se pueda probar de punta a punta en un ambiente sin acervo real.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node db/seed-visor-test.mjs
 *
 * Es idempotente: si el tomo de prueba (numero_romano='TEST-I') ya existe,
 * no lo vuelve a crear.
 */
import pg from 'pg';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('❌ Falta DATABASE_URL.'); process.exit(1); }

const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');
const DELEGACION_NOMBRE = 'Delegación de Prueba (Visor)';
const TOMO_NUMERO_ROMANO = 'TEST-I';
const FOJAS = [
  { numero_foja: '001', inscripcion: 'INS-0001', color: { r: 214, g: 196, b: 168 } }, // papel cálido
  { numero_foja: '002', inscripcion: 'INS-0002', color: { r: 200, g: 210, b: 220 } },
  { numero_foja: '003', inscripcion: null,       color: { r: 220, g: 205, b: 190 } },
];

const client = new pg.Client({ connectionString: DATABASE_URL });

async function generarImagenPlaceholder(fojaId, numeroFoja, color) {
  const dir = path.join(STORAGE_BASE, 'visor_documentos', 'tomos', 'test', 'fojas', String(fojaId));
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'V3_VALIDADA.jpg');

  const svgTexto = `<svg width="1200" height="1600">
    <text x="600" y="800" font-size="48" text-anchor="middle" fill="rgba(61,57,53,0.35)" font-family="sans-serif">
      Foja ${numeroFoja} — imagen de prueba
    </text>
  </svg>`;

  await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: color },
  })
    .composite([{ input: Buffer.from(svgTexto), blend: 'over' }])
    .jpeg({ quality: 85 })
    .toFile(dest);

  // Ruta relativa guardada en BD, mismo formato que storage.service.ts (`/carpeta/archivo`).
  return `/visor_documentos/tomos/test/fojas/${fojaId}/V3_VALIDADA.jpg`;
}

async function main() {
  await client.connect();

  const tomoExistente = await client.query(
    'SELECT id FROM visor_tomos WHERE numero_romano = $1',
    [TOMO_NUMERO_ROMANO],
  );
  if (tomoExistente.rowCount > 0) {
    console.log(`ℹ️  El tomo de prueba "${TOMO_NUMERO_ROMANO}" ya existe (id ${tomoExistente.rows[0].id}). No se modifica.`);
    return;
  }

  const usuario = await client.query(
    `SELECT id FROM usuarios ORDER BY (rol = 'SUPERADMIN') DESC, id ASC LIMIT 1`,
  );
  if (usuario.rowCount === 0) {
    throw new Error('No hay usuarios en la base. Corre primero db:seed:admin.');
  }
  const usuarioId = usuario.rows[0].id;

  const seccion = await client.query('SELECT id FROM visor_secciones WHERE numero = 1');
  if (seccion.rowCount === 0) {
    throw new Error('No existe la Sección Primera. Corre primero db:migrate.');
  }
  const seccionId = seccion.rows[0].id;

  const delegacion = await client.query(
    `INSERT INTO visor_delegaciones (nombre, activo)
     VALUES ($1, true)
     ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id`,
    [DELEGACION_NOMBRE],
  );
  const delegacionId = delegacion.rows[0].id;

  const tomo = await client.query(
    `INSERT INTO visor_tomos (delegacion_id, seccion_id, numero_romano, indice_orden, anio_registro, cajon)
     VALUES ($1, $2, $3, 1, 2024, 'CAJÓN-TEST')
     RETURNING id`,
    [delegacionId, seccionId, TOMO_NUMERO_ROMANO],
  );
  const tomoId = tomo.rows[0].id;
  console.log(`✅ Tomo de prueba creado (id ${tomoId}).`);

  for (let i = 0; i < FOJAS.length; i++) {
    const f = FOJAS[i];
    const foja = await client.query(
      `INSERT INTO visor_fojas (tomo_id, numero_foja, inscripcion, orden_secuencial)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tomoId, f.numero_foja, f.inscripcion, i + 1],
    );
    const fojaId = foja.rows[0].id;

    const rutaStorage = await generarImagenPlaceholder(fojaId, f.numero_foja, f.color);

    await client.query(
      `INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato, subido_por_id)
       VALUES ($1, 'V3_VALIDADA', $2, 'jpg', $3)`,
      [fojaId, rutaStorage, usuarioId],
    );

    // Foja 1: además con dictamen y transcripción de ejemplo, para que las
    // pestañas de Curaduría/Transcripción muestren algo desde el primer clic.
    if (i === 0) {
      await client.query(
        `INSERT INTO visor_dictamenes_versiones_foja (foja_id, version_seleccionada, justificacion_juridica, usuario_id)
         VALUES ($1, 'V3_VALIDADA', 'Legible y completa; se descarta V2009 por manchas de humedad en el margen inferior.', $2)`,
        [fojaId, usuarioId],
      );
      await client.query(
        `INSERT INTO visor_transcripciones_foja (foja_id, texto_transcrito, origen, modelo_ia, creado_por)
         VALUES ($1, 'Texto de prueba — transcripción generada para verificar el flujo del visor.', 'IA', 'seed-test', $2)`,
        [fojaId, usuarioId],
      );
    }

    console.log(`  · Foja ${f.numero_foja} creada (id ${fojaId}), imagen en ${rutaStorage}`);
  }

  console.log('✅ Semilla del Visor de Documentos lista.');
}

main()
  .then(() => client.end())
  .catch((e) => { console.error('❌ ' + (e.message ?? e)); client.end(); process.exit(1); });
