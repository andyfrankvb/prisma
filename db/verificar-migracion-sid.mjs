/**
 * Reconcilia, módulo por módulo, lo que hay en SID contra lo que llegó a PRISMA.
 *
 * Uso:
 *   DATABASE_URL=postgres://.../prisma \
 *   SID_DATABASE_URL=postgres://.../sid \
 *   node db/verificar-migracion-sid.mjs                 # verifica todo lo declarado
 *   node db/verificar-migracion-sid.mjs --modulo=tickets # un solo módulo
 *   node db/verificar-migracion-sid.mjs --inventario     # qué tablas tiene SID y cuáles ya tienen migrador
 *
 * Solo LEE. No escribe en ninguna de las dos bases.
 *
 * ── Por qué no basta con comparar conteos ───────────────────────────────────
 *
 * Cada migrador transforma a propósito: tickets cuya identidad no se pudo
 * resolver quedan con `remitente_id` NULL (el usuario de SID ya no existe),
 * `categoria` se preserva en `categoria_legacy` sin mapear, y los folios de
 * `registros` entran como historial de solo lectura. Un "sobran/faltan" sin
 * contexto confunde una pérdida real con una decisión de diseño.
 *
 * Por eso cada control declara su `tolerancia`: cuántas filas pueden diferir y
 * POR QUÉ. Si la diferencia cabe en lo declarado, pasa y se explica; si no,
 * truena. Lo que no está declarado es exactamente lo que hay que revisar.
 *
 * ── Fuentes de origen ───────────────────────────────────────────────────────
 *
 * `SID_DATABASE_URL` es la base de SID. El catálogo del acervo del Visor
 * (`visor_pdf_index`, `sid_inscripciones_control`) suele venir como extracto
 * aparte; si está en otra base, apúntala con `SID_CATALOGO_DATABASE_URL`.
 * Cuando una fuente no está configurada, sus módulos se reportan como
 * "no verificable" y el resto sigue corriendo.
 */
import pg from 'pg';

const DATABASE_URL     = process.env.DATABASE_URL;
const SID_DATABASE_URL = process.env.SID_DATABASE_URL;
const SID_CATALOGO_URL = process.env.SID_CATALOGO_DATABASE_URL ?? SID_DATABASE_URL;

if (!DATABASE_URL) { console.error('❌ Falta DATABASE_URL (destino, PRISMA).'); process.exit(1); }

const args        = process.argv.slice(2);
const soloModulo  = args.find((a) => a.startsWith('--modulo='))?.split('=')[1];
const inventario  = args.includes('--inventario');
const exactos     = args.includes('--exactos');

/**
 * Catálogo de verificación. Un módulo por entrada; cada control es una
 * pregunta que se le hace a las dos bases y cuyas respuestas deben cuadrar.
 *
 *   origen      cuál conexión de origen usa ('sid' | 'catalogo')
 *   migrador    script que lo migra, o null si todavía no existe
 *   controles[] { concepto, sid, prisma, tolerancia, motivo }
 *                 tolerancia: 0 = debe cuadrar exacto
 *                             n = se permiten hasta n filas de diferencia
 *                             null = informativo, nunca falla
 */
const MODULOS = [
  {
    nombre: 'tickets',
    origen: 'sid',
    migrador: 'db/migrate-tickets-sid.mjs',
    controles: [
      {
        concepto: 'tickets migrados',
        sid: 'SELECT count(*) FROM tickets',
        prisma: 'SELECT count(*) FROM tickets WHERE origen_id IS NOT NULL',
        tolerancia: 0,
        motivo: 'Todo ticket de SID debe existir en PRISMA; `origen_id` es UNIQUE, no puede duplicar.',
      },
      {
        concepto: 'último id de origen alcanzado',
        sid: 'SELECT COALESCE(max(id), 0) FROM tickets',
        prisma: 'SELECT COALESCE(max(origen_id), 0) FROM tickets',
        tolerancia: 0,
        motivo: 'Si el máximo no coincide, la corrida se quedó a medias (es reanudable: vuelve a correrla).',
      },
      {
        concepto: 'archivos adjuntos',
        sid: 'SELECT count(*) FROM ticket_archivos',
        prisma: 'SELECT count(*) FROM ticket_archivos WHERE origen_id IS NOT NULL',
        tolerancia: 0,
        motivo: 'Se migra el registro del adjunto. El binario no se copia: se lee de donde SID lo dejó.',
      },
      {
        // SID y PRISMA son dos padrones de usuarios distintos: la identidad se
        // resuelve por CORREO normalizado. Que un ticket viejo no case es normal
        // (el remitente ya no existe ni en SID: ~2,428 casos). Que NINGUNO case
        // no lo es, y es justo lo que se observó en la copia de producción:
        // 0 de 13,760 tickets quedaron ligados a un usuario de PRISMA. Por eso
        // esto compara contra los huérfanos reales de SID en vez de solo informar.
        concepto: 'identidad sin resolver',
        sid: 'SELECT count(*) FROM tickets t WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = t.remitente_id)',
        prisma: 'SELECT count(*) FROM tickets WHERE origen_id IS NOT NULL AND remitente_id IS NULL',
        tolerancia: 0,
        motivo: 'Si en PRISMA hay más sin resolver que huérfanos en SID, el cruce por correo no funcionó: '
              + 'el histórico se ve, pero ningún ticket viejo aparece filtrando por usuario.',
      },
      {
        concepto: 'nombre del remitente conservado (informativo)',
        sid: 'SELECT count(*) FROM tickets',
        prisma: 'SELECT count(*) FROM tickets WHERE origen_id IS NOT NULL AND remitente_legacy_nombre IS NOT NULL',
        tolerancia: null,
        motivo: 'La diferencia son tickets cuyo remitente ya no existía en SID: no hay nombre que rescatar.',
      },
    ],
  },
  {
    nombre: 'consultas',
    origen: 'sid',
    migrador: 'db/migrate-consultas-sid.mjs',
    controles: [
      {
        concepto: 'consultas migradas',
        sid: 'SELECT count(*) FROM consulta_publica',
        prisma: 'SELECT count(*) FROM consulta_publica WHERE origen_id IS NOT NULL',
        tolerancia: 0,
        motivo: 'Histórico cerrado de Consulta Pública: debe cuadrar exacto.',
      },
      {
        concepto: 'último id de origen alcanzado',
        sid: 'SELECT COALESCE(max(id), 0) FROM consulta_publica',
        prisma: 'SELECT COALESCE(max(origen_id), 0) FROM consulta_publica',
        tolerancia: 0,
        motivo: 'Detecta una corrida interrumpida.',
      },
    ],
  },
  {
    nombre: 'folios',
    origen: 'sid',
    migrador: 'db/migrate-folios-sid.mjs',
    controles: [
      {
        concepto: 'folios estructurados',
        sid: 'SELECT count(*) FROM folios',
        prisma: "SELECT count(*) FROM folios_salida WHERE origen_sid_tabla = 'folios'",
        tolerancia: 0,
        motivo: 'Es la tabla que de verdad alimenta el consecutivo; de aquí sale "el siguiente folio".',
      },
      {
        concepto: 'archivo previo (registros)',
        sid: 'SELECT count(*) FROM registros',
        prisma: "SELECT count(*) FROM folios_salida WHERE origen_sid_tabla = 'registros'",
        tolerancia: 0,
        motivo: 'Entra como historial de solo lectura; no participa en el consecutivo.',
      },
      {
        concepto: 'consecutivo listo para emitir',
        sid: 'SELECT COALESCE(max(num_folio), 0) FROM folios',
        prisma: "SELECT COALESCE(max(consecutivo), 0) FROM folios_salida WHERE origen_sid_tabla = 'folios'",
        tolerancia: 0,
        motivo: 'CRÍTICO: si PRISMA va abajo del último real de SID, el primer folio nuevo repite uno ya emitido.',
      },
    ],
  },
  {
    nombre: 'visor-acervo',
    origen: 'catalogo',
    migrador: 'db/migrate-visor-sid.mjs',
    controles: [
      {
        concepto: 'documentos del acervo',
        sid: 'SELECT count(*) FROM visor_pdf_index WHERE version_activa',
        prisma: 'SELECT count(*) FROM visor_imagenes_foja WHERE origen_id IS NOT NULL',
        tolerancia: 0,
        motivo: 'Un renglón por PDF. Los archivos no se copian: se cataloga la ruta y se leen de donde SID los dejó.',
      },
      {
        concepto: 'rutas sin repetir en destino',
        sid: 'SELECT count(DISTINCT ruta_relativa) FROM visor_pdf_index WHERE version_activa',
        prisma: 'SELECT count(DISTINCT ruta_storage) FROM visor_imagenes_foja WHERE origen_id IS NOT NULL',
        tolerancia: 0,
        motivo: 'Dos renglones apuntando al mismo PDF significan acervo duplicado en el Visor.',
      },
      {
        concepto: 'tomos (informativo)',
        sid: 'SELECT count(DISTINCT (oficina, seccion, tomo, volumen)) FROM visor_pdf_index WHERE version_activa',
        prisma: 'SELECT count(*) FROM visor_tomos',
        tolerancia: null,
        motivo: 'El tomo se deriva del catálogo, no viene como tabla propia en SID; en PRISMA incluye además lo de PEMR.',
      },
    ],
  },
  {
    nombre: 'visor-inscripciones',
    origen: 'catalogo',
    migrador: 'infra/postgres/migrations/2026-10-05_visor_inscripciones_sid.sql',
    controles: [
      {
        // El conteo crudo de `sid_inscripciones_control` (190,404) NO es la meta:
        // trae 611 renglones que SID dejó en PENDIENTE y 676 duplicados exactos.
        // La meta son las inscripciones PROCESADAS y ÚNICAS — 189,117 al revisar
        // esto, contra 189,116 migradas. La única que falta es un renglón con los
        // campos corridos (tomo "XXX-01", volumen "0058"), por eso la tolerancia.
        concepto: 'inscripciones procesadas y únicas',
        sid: `SELECT count(DISTINCT (oficina_codigo, seccion_num, tomo, volumen, inscripcion))
                FROM sid_inscripciones_control WHERE estado = 'OK'`,
        prisma: 'SELECT count(DISTINCT origen_sid_id) FROM visor_inscripciones WHERE origen_sid_id IS NOT NULL',
        tolerancia: 1,
        motivo: 'Es el índice que hace buscable el acervo: lo que falte aquí no aparece en una búsqueda.',
      },
      {
        concepto: 'pendientes en el origen (informativo)',
        sid: "SELECT count(*) FROM sid_inscripciones_control WHERE estado <> 'OK'",
        prisma: 'SELECT 0',
        tolerancia: null,
        motivo: 'SID nunca terminó de procesarlas. No son pérdida de la migración: hay que pedirlas al proveedor.',
      },
    ],
  },
];

/** Tablas de SID que ya tiene cubiertas algún migrador, para el inventario. */
const TABLAS_CUBIERTAS = new Set([
  'tickets', 'ticket_archivos', 'consulta_publica', 'folios', 'registros',
  'visor_pdf_index', 'sid_inscripciones_control',
]);

const destino = new pg.Client({ connectionString: DATABASE_URL });
const origenes = new Map();

/** Abre (una sola vez) la conexión de origen que pide el módulo, o null si no está configurada. */
async function conexionOrigen(cual) {
  if (origenes.has(cual)) return origenes.get(cual);
  const url = cual === 'catalogo' ? SID_CATALOGO_URL : SID_DATABASE_URL;
  if (!url) { origenes.set(cual, null); return null; }
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    origenes.set(cual, cliente);
  } catch (e) {
    console.warn(`⚠️  No se pudo conectar al origen '${cual}': ${e.message}`);
    origenes.set(cual, null);
  }
  return origenes.get(cual);
}

/** Corre un escalar y devuelve el número, o un Error si la consulta no aplica a esa base. */
async function escalar(cliente, sql) {
  try {
    const { rows } = await cliente.query(sql);
    return Number(Object.values(rows[0])[0]);
  } catch (e) {
    return new Error(e.message.split('\n')[0]);
  }
}

/** Inventario del origen: toda tabla de SID con su tamaño, marcando lo que ya tiene migrador. */
async function correrInventario() {
  const sid = await conexionOrigen('sid');
  if (!sid) {
    console.error('❌ El inventario necesita SID_DATABASE_URL.');
    process.exitCode = 1;
    return;
  }
  const { rows } = await sid.query(`
    SELECT c.relname AS tabla, c.reltuples::bigint AS estimado
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
     ORDER BY c.reltuples DESC`);

  console.log(`\n📋 Inventario de SID — ${rows.length} tablas\n`);
  console.log('   FILAS        TABLA                                   ESTADO');
  console.log('   ' + '─'.repeat(72));
  let pendientes = 0;
  for (const r of rows) {
    let filas = r.estimado;
    if (exactos) filas = await escalar(sid, `SELECT count(*) FROM "${r.tabla}"`);
    const cubierta = TABLAS_CUBIERTAS.has(r.tabla);
    if (!cubierta && Number(filas) > 0) pendientes++;
    console.log(
      `   ${String(filas).padStart(10)}   ${r.tabla.padEnd(38)}  ` +
      (cubierta ? '✅ con migrador' : Number(filas) > 0 ? '⬜ SIN migrador' : '·  vacía'),
    );
  }
  console.log('   ' + '─'.repeat(72));
  console.log(`\n   ${pendientes} tablas con datos y sin migrador declarado.`);
  console.log(`   ${exactos ? 'Conteos exactos.' : 'Conteos estimados (reltuples). Usa --exactos para contar de verdad.'}\n`);
}

/** Verificación declarada: recorre módulos y controles, y resume el veredicto. */
async function correrVerificacion() {
  const aRevisar = soloModulo ? MODULOS.filter((m) => m.nombre === soloModulo) : MODULOS;
  if (aRevisar.length === 0) {
    console.error(`❌ No hay módulo '${soloModulo}'. Declarados: ${MODULOS.map((m) => m.nombre).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  let fallas = 0;
  let noVerificables = 0;

  for (const modulo of aRevisar) {
    console.log(`\n━━ ${modulo.nombre}`);
    console.log(`   migrador: ${modulo.migrador ?? '(ninguno todavía)'}`);

    const origen = await conexionOrigen(modulo.origen);
    if (!origen) {
      noVerificables++;
      console.log(`   ⏭️  No verificable: falta la conexión de origen '${modulo.origen}'.`);
      continue;
    }

    for (const c of modulo.controles) {
      const enSid    = await escalar(origen, c.sid);
      const enPrisma = await escalar(destino, c.prisma);

      if (enSid instanceof Error || enPrisma instanceof Error) {
        noVerificables++;
        const cual = enSid instanceof Error ? 'SID' : 'PRISMA';
        const err  = enSid instanceof Error ? enSid : enPrisma;
        console.log(`   ⏭️  ${c.concepto}: no se pudo consultar en ${cual} — ${err.message}`);
        continue;
      }

      const diferencia = enSid - enPrisma;
      const cifras = `SID ${enSid.toLocaleString('es-MX')} · PRISMA ${enPrisma.toLocaleString('es-MX')}`;

      if (c.tolerancia === null) {
        console.log(`   ℹ️  ${c.concepto}: ${cifras}`);
        console.log(`        ${c.motivo}`);
      } else if (Math.abs(diferencia) <= c.tolerancia) {
        console.log(`   ✅ ${c.concepto}: ${cifras}`);
      } else {
        fallas++;
        const signo = diferencia > 0 ? 'faltan' : 'sobran';
        console.log(`   ❌ ${c.concepto}: ${cifras} → ${signo} ${Math.abs(diferencia).toLocaleString('es-MX')}`);
        console.log(`        ${c.motivo}`);
      }
    }
  }

  console.log('\n' + '─'.repeat(74));
  if (fallas === 0 && noVerificables === 0) {
    console.log('✅ Todo lo declarado cuadra.');
  } else {
    console.log(
      `${fallas > 0 ? '❌' : '⚠️'}  Discrepancias: ${fallas} · No verificables: ${noVerificables}`,
    );
  }
  console.log('─'.repeat(74) + '\n');
  if (fallas > 0) process.exitCode = 1;
}

async function main() {
  await destino.connect();
  if (inventario) await correrInventario();
  else await correrVerificacion();
}

async function cerrar() {
  await destino.end().catch(() => {});
  for (const c of origenes.values()) if (c) await c.end().catch(() => {});
}

main()
  .then(cerrar)
  .catch(async (e) => {
    console.error('❌ ' + (e.message ?? e));
    await cerrar();
    process.exit(1);
  });
