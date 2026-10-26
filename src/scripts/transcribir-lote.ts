/**
 * Genera las transcripciones de una campaña en lote.
 *
 * Uso (dentro del contenedor de la API, donde está montado el acervo):
 *   node dist/scripts/transcribir-lote.js --campania V_PEMR2025 --limite 20
 *   node dist/scripts/transcribir-lote.js --campania V_PEMR2025          # todo
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 * La búsqueda por contenido solo encuentra lo que está transcrito, y las
 * transcripciones se generaban de una en una desde la pantalla. Con 3,127
 * documentos de PEMR 2025 eso no se termina nunca a mano: la pantalla quedaba
 * construida y sin nada que buscar.
 *
 * ── Se puede interrumpir ──────────────────────────────────────────────────
 * No lleva registro de avance ni archivo de estado: en cada arranque pregunta
 * por los documentos que AÚN no tienen transcripción de esa campaña. Cortarlo
 * con Ctrl-C y volver a lanzarlo retoma donde se quedó, y relanzarlo cuando ya
 * terminó no hace nada. Esa es también la razón de `--limite`: medir con pocos
 * antes de soltar las horas que tarda el acervo completo.
 *
 * ── Un documento que falla no detiene el lote ─────────────────────────────
 * Un PDF ilegible o una ruta que no existe se anotan y se sigue. Lo contrario
 * —abortar— significaría que un solo archivo roto a la mitad del acervo tira
 * un proceso de horas y hay que empezar otra vez.
 */
import { db } from '../db';
import { logger } from '../utils/logger';
import { generarTranscripcionIA } from '../modules/visor_documentos/services/transcripcion.service';

/** Pausa entre documentos: no saturar al proveedor de OCR ni al disco de red. */
const PAUSA_MS = 250;

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/**
 * El usuario al que se le atribuye la transcripción.
 *
 * Queda registrado en el documento, así que conviene que sea una cuenta real y
 * no un cero: al revisar una transcripción dudosa, lo primero que se pregunta
 * es quién la generó. Por omisión se usa el primer SUPERADMIN activo.
 */
async function resolverUsuario(): Promise<number> {
  const forzado = argumento('usuario');
  if (forzado) return Number(forzado);
  const fila = await db('usuarios').where({ rol: 'SUPERADMIN', activo: true }).orderBy('id').first();
  if (!fila) throw new Error('No hay un SUPERADMIN activo; pasa --usuario <id>.');
  return fila.id;
}

async function main(): Promise<void> {
  const campania = argumento('campania') ?? 'V_PEMR2025';
  const limite = argumento('limite') ? Number(argumento('limite')) : null;
  const usuarioId = await resolverUsuario();
  const proveedor = process.env.OCR_PROVIDER ?? 'tesseract';

  // Los documentos de la campaña que todavía no tienen su texto. El NOT EXISTS
  // va contra (foja, versión) y no solo contra la foja: cada digitalización
  // tiene su propia transcripción porque dos escaneos del mismo acto no dan el
  // mismo texto.
  const pendientes = await db('visor_imagenes_foja as im')
    .where('im.version', campania)
    .whereNotExists(function () {
      this.select(db.raw('1'))
        .from('visor_transcripciones_foja as t')
        .whereRaw('t.foja_id = im.foja_id')
        .andWhereRaw('t.version = im.version');
    })
    .orderBy('im.foja_id')
    .modify((q) => { if (limite) q.limit(limite); })
    .select('im.foja_id');

  const total = await db('visor_imagenes_foja').where({ version: campania }).count<{ count: string }[]>('* as count');
  const yaHechas = Number(total[0].count) - pendientes.length - (limite ? 0 : 0);

  console.log(`📄 Campaña ......... ${campania}`);
  console.log(`   Motor de OCR .... ${proveedor}${proveedor === 'google-vision' ? '  ⚠️  servicio de paga' : ''}`);
  console.log(`   Atribuido a ..... usuario ${usuarioId}`);
  console.log(`   Documentos ...... ${total[0].count} en total · ${pendientes.length} por transcribir`);
  if (limite) console.log(`   Límite .......... ${limite} en esta corrida`);
  console.log('');

  if (pendientes.length === 0) {
    console.log('✅ No hay nada pendiente.');
    return;
  }

  let hechas = 0;
  let fallidas = 0;
  const inicio = Date.now();

  for (const [i, p] of pendientes.entries()) {
    const t0 = Date.now();
    try {
      await generarTranscripcionIA(p.foja_id, usuarioId, campania);
      hechas++;
      const seg = (Date.now() - t0) / 1000;
      const promedio = (Date.now() - inicio) / 1000 / (i + 1);
      const faltan = Math.round((pendientes.length - i - 1) * promedio);
      console.log(
        `   ${String(i + 1).padStart(5)}/${pendientes.length}  foja ${p.foja_id}  ${seg.toFixed(1)}s` +
        `  ·  faltan ~${Math.floor(faltan / 60)} min`,
      );
    } catch (e: any) {
      fallidas++;
      // Se anota y se sigue: el detalle va al log de la aplicación, donde queda
      // con su traza; aquí basta el renglón para no perder de vista el avance.
      console.log(`   ${String(i + 1).padStart(5)}/${pendientes.length}  foja ${p.foja_id}  ❌ ${e?.message ?? e}`);
      logger.error({ err: e, foja_id: p.foja_id, campania }, 'Falló la transcripción en lote');
    }
    if (PAUSA_MS) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log('');
  console.log(`✅ Transcritas .... ${hechas}`);
  if (fallidas) console.log(`❌ Fallidas ....... ${fallidas}  (quedan pendientes; relanzar las reintenta)`);
  console.log(`⏱  Tiempo ......... ${minutos} min`);
  if (yaHechas >= 0 && !limite) console.log(`📊 Cobertura ...... ${hechas + yaHechas}/${total[0].count}`);
}

main()
  .then(() => db.destroy())
  .catch(async (e) => {
    console.error('❌ ' + (e?.message ?? e));
    await db.destroy();
    process.exit(1);
  });
