/**
 * Migra el histórico de Tickets de SID hacia PRISMA.
 *
 * Uso:
 *   DATABASE_URL=postgres://.../prisma \
 *   SID_DATABASE_URL=postgres://.../sid \
 *   node db/migrate-tickets-sid.mjs
 *
 * Idempotente y reanudable — mismo patrón que migrate-consultas-sid.mjs:
 * cada fila migrada guarda su id de SID en `tickets.origen_id` (columna
 * UNIQUE, ver infra/postgres/migrations/2026-09-20_tickets.sql). Cada
 * corrida retoma después del mayor `origen_id` ya migrado; correrlo de
 * nuevo mientras SID sigue recibiendo tráfico durante la transición nunca
 * duplica filas.
 *
 * Identidad (remitente_id/destinatario_id/last_modified_by): SID y PRISMA
 * son dos sistemas de usuarios independientes — no existe ninguna columna
 * puente. Se resuelve por CORREO normalizado (minúsculas, sin espacios)
 * contra `prisma.usuarios`. Cuando no hay cuenta en PRISMA (usuario de SID
 * dado de baja, o simplemente no migrado todavía a PRISMA), el ticket se
 * migra igual: la referencia queda NULL y el nombre original de SID se
 * guarda en `remitente_legacy_nombre`/`destinatario_legacy_nombre` para no
 * perder el dato. De los 13,760 tickets reales de SID, ~2,428 tienen un
 * remitente_id que ya ni siquiera existe en `sid.usuarios` (usuario borrado
 * en algún momento de los 15 años de vida de SID) — para esos no hay nombre
 * que rescatar tampoco, y el ticket se muestra con un genérico
 * ("Usuario de SID (sin cuenta)", resuelto en ticket-api.service.ts).
 *
 * Catálogos: SID acumuló 15 años de captura libre en estado/urgencia/
 * impacto/prioridad — bastante más ancha que el catálogo estático que
 * ofrece hoy el formulario de creación. normalizarCatalogos() traduce las
 * variantes reales conocidas (verificadas contra la data real de SID) a los
 * valores del esquema nuevo (incluye MUY_URGENTE/ALTA/URGENTE(prioridad)/
 * MUY_ALTO — ver 2026-09-21_tickets_ajustes_migracion_sid.sql). `categoria`
 * es un caso aparte: los valores reales ("FOLIO", "IMAGENES", "1", "0", …)
 * no tienen ninguna relación con el catálogo nuevo (TRASPASO_FOLIO,
 * REPOSICION, …), así que se preserva tal cual en `categoria_legacy` y
 * `categoria` queda NULL — forzar un mapeo inventado sería falsificar el dato.
 *
 * Fuera de alcance de este script (no se copian): los ARCHIVOS binarios de
 * `ticket_file` — solo se migran sus metadatos (nombre, tamaño, tipo,
 * ruta original de SID) a `ticket_archivos`. Copiar los archivos en sí
 * requiere acceso al almacenamiento físico de SID (fuera del alcance de
 * una migración de base de datos) y una reescritura de `file_path` hacia
 * `storage/tickets/` de PRISMA — pendiente como tarea aparte antes de
 * ofrecer la descarga de adjuntos históricos en producción.
 */
import pg from 'pg';

const DATABASE_URL     = process.env.DATABASE_URL;
const SID_DATABASE_URL = process.env.SID_DATABASE_URL;
const BATCH_SIZE       = Number(process.env.MIGRATE_TICKETS_BATCH ?? 500);

if (!DATABASE_URL)     { console.error('❌ Falta DATABASE_URL (destino, PRISMA).'); process.exit(1); }
if (!SID_DATABASE_URL) { console.error('❌ Falta SID_DATABASE_URL (origen, SID).');  process.exit(1); }

const origen  = new pg.Client({ connectionString: SID_DATABASE_URL });
const destino = new pg.Client({ connectionString: DATABASE_URL });

const normEmail = (e) => (e ?? '').trim().toLowerCase();

const MAPA_ESTADO = {
  'nuevo': 'NUEVO', 'abierto': 'ABIERTO',
  'en proceso': 'EN_PROCESO', 'en curso': 'EN_PROCESO',
  'en espera': 'EN_ESPERA', 'resuelto': 'RESUELTO', 'cerrado': 'CERRADO',
};
const MAPA_URGENCIA = {
  'media': 'MEDIA', 'mediana': 'MEDIA', 'urgente': 'URGENTE',
  'muy urgente': 'MUY_URGENTE', 'alta': 'ALTA', 'baja': 'BAJA', 'indefinida': 'INDEFINIDA',
};
const MAPA_IMPACTO = { 'medio': 'MEDIO', 'muy alto': 'MUY_ALTO', 'alto': 'ALTO', 'bajo': 'BAJO' };
const MAPA_PRIORIDAD = { 'media': 'MEDIA', 'mediana': 'MEDIA', 'urgente': 'URGENTE', 'alta': 'ALTA', 'baja': 'BAJA' };
const MAPA_TIPO = { 'apertura de folio': 'APERTURA', 'modificación de actos': 'MODIFICACION' };

function normalizarCatalogos(fila) {
  const lc = (v) => (v ?? '').trim().toLowerCase();
  return {
    tipo:      MAPA_TIPO[lc(fila.tipo)] ?? null,
    // estado es NOT NULL en el destino — 'NUEVO' es el mismo default que usa
    // la tabla para cualquier fila que no calce con el mapa (no debería
    // pasar: los 13,760 tickets reales cubren el 100% de los 7 valores
    // conocidos, pero un dato futuro fuera de catálogo no debe tronar la migración).
    estado:    MAPA_ESTADO[lc(fila.estado)] ?? 'NUEVO',
    urgencia:  MAPA_URGENCIA[lc(fila.urgencia)] ?? 'INDEFINIDA',
    impacto:   fila.impacto ? (MAPA_IMPACTO[lc(fila.impacto)] ?? null) : null,
    prioridad: fila.prioridad ? (MAPA_PRIORIDAD[lc(fila.prioridad)] ?? null) : null,
  };
}

async function main() {
  await origen.connect();
  await destino.connect();
  console.log('🔌 Conectado a origen (SID) y destino (PRISMA).');

  // ── Mapa de identidad: usuario de SID → cuenta de PRISMA (por correo) ──
  const { rows: usuariosSid } = await origen.query(`
    SELECT u.usuario_id, u.email, u.name,
           TRIM(CONCAT(COALESCE(p.nombre,''),' ',COALESCE(p.ape_paterno,''),' ',COALESCE(p.ape_materno,''))) AS nombre_persona
      FROM usuarios u
      LEFT JOIN persona p ON p.usuario_id = u.usuario_id
  `);
  const nombreSidPorId = new Map(
    usuariosSid.map((u) => [u.usuario_id, (u.nombre_persona || '').trim() || u.name || `Usuario SID #${u.usuario_id}`]),
  );
  const emailSidPorId = new Map(usuariosSid.map((u) => [u.usuario_id, normEmail(u.email)]));

  const { rows: usuariosPrisma } = await destino.query(`SELECT id, email, unidad_id FROM usuarios`);
  const prismaPorEmail = new Map(usuariosPrisma.map((u) => [normEmail(u.email), u]));

  console.log(`👤 ${usuariosSid.length} usuarios en SID · ${usuariosPrisma.length} cuentas en PRISMA.`);

  /** SID usuario_id → { id_prisma, nombre_legacy } */
  function resolverUsuario(sidUsuarioId) {
    if (!sidUsuarioId) return { id: null, nombreLegacy: null };
    const email = emailSidPorId.get(sidUsuarioId);
    const cuenta = email ? prismaPorEmail.get(email) : undefined;
    if (cuenta) return { id: cuenta.id, nombreLegacy: null };
    const nombreLegacy = nombreSidPorId.get(sidUsuarioId) ?? null; // null si el usuario_id ya ni existe en SID
    return { id: null, nombreLegacy };
  }

  // ── 1) Tickets ──────────────────────────────────────────────
  const { rows: [{ max_migrado }] } = await destino.query(
    `SELECT COALESCE(MAX(origen_id), 0) AS max_migrado FROM tickets`,
  );
  console.log(`↪️  Tickets: retomando después de origen_id=${max_migrado}.`);

  let cursor = Number(max_migrado);
  let leidas = 0, insertadas = 0, errores = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT ticket_id, destinatario_id, remitente_id, titulo, fecha_aper, tipo, categoria,
              estado, urgencia, impacto, prioridad, descripcion, created_at, updated_at,
              ticket_code, last_action, last_modified_by, last_actor, change_log,
              solucion, fecha_solucion
         FROM tickets
        WHERE ticket_id > $1
        ORDER BY ticket_id
        LIMIT $2`,
      [cursor, BATCH_SIZE],
    );
    if (rows.length === 0) break;
    leidas += rows.length;

    for (const fila of rows) {
      try {
        const remitente    = resolverUsuario(fila.remitente_id);
        const destinatario = resolverUsuario(fila.destinatario_id);
        const modificadoPor = resolverUsuario(fila.last_modified_by).id;
        const cat = normalizarCatalogos(fila);

        const res = await destino.query(
          `INSERT INTO tickets
             (origen_id, ticket_code, titulo, descripcion, tipo, estado, urgencia, impacto, prioridad,
              categoria, categoria_legacy,
              remitente_id, remitente_legacy_nombre, destinatario_id, destinatario_legacy_nombre,
              solucion, fecha_solucion, change_log, last_action, last_modified_by,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NULL,$10, $11,$12,$13,$14, $15,$16,$17,$18,$19, $20,$21)
           ON CONFLICT (origen_id) DO NOTHING`,
          [
            fila.ticket_id, fila.ticket_code, fila.titulo ?? '(sin título)', fila.descripcion ?? '',
            cat.tipo, cat.estado, cat.urgencia, cat.impacto, cat.prioridad,
            (fila.categoria ?? '').trim() || null,
            remitente.id, remitente.nombreLegacy,
            destinatario.id, destinatario.nombreLegacy,
            fila.solucion, fila.fecha_solucion,
            JSON.stringify(fila.change_log ?? []), fila.last_action, modificadoPor,
            fila.fecha_aper ?? fila.created_at, fila.updated_at,
          ],
        );
        insertadas += res.rowCount;
      } catch (e) {
        errores++;
        console.error(`❌ Ticket ticket_id=${fila.ticket_id} (SID): ${e.message}`);
      }
    }

    cursor = rows[rows.length - 1].ticket_id;
    console.log(`  … tickets migrados hasta origen_id=${cursor} (${insertadas} insertados de ${leidas} leídos)`);
  }
  console.log(`✅ Tickets — leídos: ${leidas} · insertados: ${insertadas} · errores: ${errores}`);

  // ── 1b) Reconciliar el contador de folios ──────────────────
  // SID ya generaba folios con el mismo formato YYMM+secuencia que usa
  // ticket-api.service.ts (siguienteTicketCode) para tickets NUEVOS creados
  // en PRISMA. Sin este paso, el contador arranca en 0 y la primera
  // creación en vivo choca con un folio que SID ya usó este mismo mes
  // (UNIQUE ticket_code) — se detectó así, en la verificación manual.
  await destino.query(`
    INSERT INTO ticket_code_counters (yymm, seq)
    SELECT substring(ticket_code from 1 for 4) AS yymm,
           MAX(substring(ticket_code from 5)::int) AS seq
      FROM tickets
     WHERE ticket_code ~ '^[0-9]{7}$'
     GROUP BY substring(ticket_code from 1 for 4)
    ON CONFLICT (yymm) DO UPDATE SET seq = GREATEST(ticket_code_counters.seq, EXCLUDED.seq)
  `);
  console.log('✅ Contador de folios (ticket_code_counters) reconciliado con los folios migrados.');

  // ── 2) Adjuntos (solo metadatos — ver nota de alcance arriba) ──
  const { rows: [{ max_migrado_file }] } = await destino.query(
    `SELECT COALESCE(MAX(origen_id), 0) AS max_migrado_file FROM ticket_archivos`,
  );
  console.log(`↪️  Adjuntos: retomando después de origen_id=${max_migrado_file}.`);

  let cursorFile = Number(max_migrado_file);
  let leidasFile = 0, insertadasFile = 0, erroresFile = 0, sinTicket = 0;

  for (;;) {
    const { rows } = await origen.query(
      `SELECT file_id, ticket_id, file_path, original_name, file_size, file_type, created_at
         FROM ticket_file
        WHERE file_id > $1
        ORDER BY file_id
        LIMIT $2`,
      [cursorFile, BATCH_SIZE],
    );
    if (rows.length === 0) break;
    leidasFile += rows.length;

    for (const fila of rows) {
      try {
        const { rows: [ticketPrisma] } = await destino.query(
          `SELECT id FROM tickets WHERE origen_id = $1`, [fila.ticket_id],
        );
        if (!ticketPrisma) { sinTicket++; continue; }

        const res = await destino.query(
          `INSERT INTO ticket_archivos (origen_id, ticket_id, file_path, original_name, file_size, file_type, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (origen_id) DO NOTHING`,
          [
            fila.file_id, ticketPrisma.id, fila.file_path, fila.original_name ?? 'archivo',
            fila.file_size ?? 0, fila.file_type ?? '', fila.created_at,
          ],
        );
        insertadasFile += res.rowCount;
      } catch (e) {
        erroresFile++;
        console.error(`❌ Adjunto file_id=${fila.file_id} (SID): ${e.message}`);
      }
    }

    cursorFile = rows[rows.length - 1].file_id;
    console.log(`  … adjuntos migrados hasta origen_id=${cursorFile} (${insertadasFile} insertados de ${leidasFile} leídos)`);
  }
  console.log(`✅ Adjuntos — leídos: ${leidasFile} · insertados: ${insertadasFile} · sin ticket en destino: ${sinTicket} · errores: ${erroresFile}`);
  console.log('⚠️  Solo se migraron METADATOS de adjuntos. Los archivos binarios siguen en el almacenamiento de SID — ver nota de alcance en el encabezado de este script.');
}

main()
  .then(() => Promise.all([origen.end(), destino.end()]))
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await Promise.all([origen.end(), destino.end()]);
    process.exit(1);
  });
