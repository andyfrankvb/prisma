/**
 * Arma el archivo de carga de una campaña PEMR, a partir de lo que entrega el
 * proveedor: unos libros de Excel y una carpeta de PDF.
 *
 * Uso:
 *   node db/preparar-listados-pemr.mjs \
 *     --listados "/ruta/a/Listados cozumel" \
 *     --acervo   "/Volumes/direccion_tics/SID/VISOR/PEM2025" \
 *     --prefijo  "/visor_sid/VISOR/PEM2025" \
 *     --campania V_PEMR2025 \
 *     --salida   /tmp/pemr2025.csv
 *
 * ── Por qué hace falta un paso previo ──────────────────────────────────────
 * A diferencia del acervo del SID, aquí no hay catálogo en una base: hay libros
 * de Excel con varias hojas cada uno y una carpeta de archivos. Este script los
 * concilia y deja un CSV plano que `db/cargar-visor-pemr.sql` carga de un solo
 * golpe.
 *
 * ── Qué concilia ──────────────────────────────────────────────────────────
 * El listado dice qué inscripciones debería haber; el disco dice cuáles
 * llegaron. Solo se exportan las que tienen archivo, y al final se reporta el
 * resto separando dos casos muy distintos:
 *
 *   · Las que el proveedor marcó INEXISTENTE no son un error: documentó que ese
 *     registro no está en el archivo digital.
 *   · Cualquier otra ausencia sí es un hueco que hay que reclamar o volver a
 *     copiar.
 *
 * ── Lo que NO hace: copiar archivos ───────────────────────────────────────
 * Solo lee nombres y arma rutas relativas al punto de montaje. Los PDF se
 * quedan donde están.
 */
import fs   from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

/** Columnas del listado detallado del proveedor, en su orden. */
const COLUMNAS = ['TOMO', 'VOLUMEN', 'ASIGNACIÓN', 'ESTATUS', 'OBSERVACIONES'];

/** Celdas que Excel dejó rotas: una fórmula que perdió su referencia. */
const CELDA_ROTA = '#REF!';

function argumento(nombre, porOmision = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (porOmision !== null) return porOmision;
  console.error(`❌ Falta --${nombre}`);
  process.exit(1);
}

const DIR_LISTADOS = argumento('listados');
const DIR_ACERVO   = argumento('acervo');
const PREFIJO      = argumento('prefijo');
const SALIDA       = argumento('salida');
/** Opcional: un `find` ya hecho, en vez de recorrer el acervo desde aquí. */
const LISTA_ARCHIVOS = argumento('lista', '');
/**
 * Clave de la campaña, tal como está en `visor_campanias.clave`.
 *
 * Viaja como primera columna del CSV y no como variable de psql (`-v`): zsh se
 * come los argumentos con `=` y el cargador se quedaba sin saber qué campaña
 * estaba cargando, fallando de forma muy opaca.
 */
const CAMPANIA = argumento('campania');

/** Texto de celda, ya sea valor simple o texto enriquecido. */
function texto(celda) {
  const v = celda?.value;
  if (v == null) return '';
  if (typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map((t) => t.text).join('').trim();
  }
  if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim();
  return String(v).trim();
}

/**
 * Nombre de archivo → ruta relativa al montaje.
 *
 * El recorrido puede venir de dos lados. Con `--acervo` lo hace este script;
 * con `--lista` se lee un archivo de texto con una ruta por renglón, como el
 * que deja un `find`. La segunda forma existe porque **Docker Desktop no lista
 * de forma confiable un recurso de red montado en la Mac**: sobre el mismo
 * acervo, el contenedor veía 2,396 archivos donde el sistema veía 3,127. El
 * recorrido se hace donde el montaje es de verdad y aquí solo se lee el
 * resultado.
 *
 * En ambos casos los nombres se toman tal como vienen del sistema de archivos
 * y nunca se escriben a mano: en el acervo los acentos están descompuestos
 * ("Seccio" + acento + "n") y un montaje CIFS sobre Linux compara byte a byte.
 */
function indexarAcervo({ raiz, lista }) {
  const encontrados = new Map();

  const registrar = (relativa) => {
    const nombre = path.basename(relativa);
    if (!/\.pdf$/i.test(nombre)) return;
    encontrados.set(nombre.replace(/\.pdf$/i, ''), `${PREFIJO}/${relativa.split(path.sep).join('/')}`);
  };

  if (lista) {
    for (const linea of fs.readFileSync(lista, 'utf8').split('\n')) {
      const ruta = linea.trim();
      if (!ruta) continue;
      // Las rutas del listado son absolutas; se recortan contra la raíz para
      // dejarlas relativas al punto de montaje.
      registrar(raiz && ruta.startsWith(raiz) ? path.relative(raiz, ruta) : ruta);
    }
    return encontrados;
  }

  (function recorrer(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) { recorrer(completa); continue; }
      registrar(path.relative(raiz, completa));
    }
  })(raiz);
  return encontrados;
}

async function main() {
  if (!LISTA_ARCHIVOS && !fs.existsSync(DIR_ACERVO)) {
    console.error(`❌ No existe el acervo: ${DIR_ACERVO}`);
    console.error('   ¿Está montado el recurso compartido?');
    process.exit(1);
  }

  console.log(LISTA_ARCHIVOS
    ? `📂 Leyendo el recorrido ya hecho: ${LISTA_ARCHIVOS}`
    : `📂 Recorriendo el acervo en ${DIR_ACERVO} …`);
  const archivos = indexarAcervo({ raiz: DIR_ACERVO, lista: LISTA_ARCHIVOS });
  console.log(`   ${archivos.size.toLocaleString('es-MX')} PDF encontrados.`);

  const libros = fs.readdirSync(DIR_LISTADOS)
    .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
    // El "Listado General" es el índice por tomo, con otra estructura de
    // columnas; aquí solo se leen los detallados, que van por inscripción.
    .filter((f) => !/^Listado General/i.test(f))
    .sort();

  const renglones = [];
  let leidos = 0;

  for (const libro of libros) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR_LISTADOS, libro));
    for (const hoja of wb.worksheets) {
      const encabezado = hoja.getRow(1).values.slice(1).map((c) => String(c ?? '').trim());
      if (!COLUMNAS.every((c, i) => encabezado[i] === c)) {
        console.warn(`⚠️  ${libro} · hoja "${hoja.name}": encabezado inesperado, se omite`);
        console.warn(`    esperado: ${COLUMNAS.join(', ')}`);
        console.warn(`    recibido: ${encabezado.join(', ')}`);
        continue;
      }
      hoja.eachRow((fila, n) => {
        if (n === 1) return;
        const asignacion = texto(fila.getCell(3));
        if (!asignacion) return;
        leidos++;
        renglones.push({
          libro,
          hoja: hoja.name,
          tomo:       texto(fila.getCell(1)),
          volumen:    texto(fila.getCell(2)),
          asignacion,
          estatus:    texto(fila.getCell(4)),
          observaciones: texto(fila.getCell(5)),
        });
      });
    }
  }
  console.log(`📑 ${leidos.toLocaleString('es-MX')} renglones en ${libros.length} libros de Excel.`);

  const rotos      = renglones.filter((r) => r.asignacion === CELDA_ROTA);
  const utiles     = renglones.filter((r) => r.asignacion !== CELDA_ROTA);
  const vistos     = new Set();
  const conArchivo = [];
  const sinArchivo = [];

  for (const r of utiles) {
    if (vistos.has(r.asignacion)) continue;   // el listado repite algunos renglones
    vistos.add(r.asignacion);
    const ruta = archivos.get(r.asignacion);
    if (ruta) conArchivo.push({ ...r, ruta });
    else      sinArchivo.push(r);
  }

  // Lo que está en disco y nadie listó: no se carga, pero hay que saberlo.
  const listadas = new Set(utiles.map((r) => r.asignacion));
  const huerfanos = [...archivos.keys()].filter((a) => !listadas.has(a));

  const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync(SALIDA, conArchivo
    .map((r) => [CAMPANIA, r.asignacion, r.tomo, r.volumen, r.estatus, r.observaciones, r.ruta].map(escapar).join(','))
    .join('\n') + '\n');

  // Los listados cubren TODA la delegación, pero el acervo se entrega por
  // partes. Comparar lo copiado contra el listado completo diría que faltan
  // decenas de miles de documentos que simplemente no han llegado todavía.
  //
  // Así que "faltante" se mide solo dentro de los tomos que sí se entregaron:
  // un tomo con 80 de sus 81 documentos tiene un hueco real; uno del que no
  // llegó nada es, sencillamente, una entrega pendiente.
  const clave = (r) => `${r.tomo.toUpperCase()}|${r.volumen}|${r.asignacion.split('-')[1] ?? ''}`;
  const entregados = new Set(conArchivo.map(clave));

  const enTomosEntregados = sinArchivo.filter((r) => entregados.has(clave(r)));
  const porEntregar       = sinArchivo.length - enTomosEntregados.length;
  const inexistentes = enTomosEntregados.filter((r) => /INEXISTENTE/i.test(r.estatus));
  const huecos       = enTomosEntregados.filter((r) => !/INEXISTENTE/i.test(r.estatus));

  console.log('─'.repeat(66));
  console.log(`✅ Listas para cargar : ${conArchivo.length.toLocaleString('es-MX')}  → ${SALIDA}`);
  console.log(`   Tomos entregados   : ${entregados.size.toLocaleString('es-MX')}`);
  console.log('');
  console.log('   Dentro de esos tomos, sin archivo:');
  console.log(`     · marcadas INEXISTENTE por el proveedor : ${inexistentes.length.toLocaleString('es-MX')}  (documentado, no es un error)`);
  console.log(`     · sin explicación                       : ${huecos.length.toLocaleString('es-MX')}${huecos.length ? '  ← revisar' : ''}`);
  console.log('');
  console.log(`   En tomos que aún no se entregan : ${porEntregar.toLocaleString('es-MX')}`);
  if (rotos.length)     console.log(`   Celdas #REF! en el Excel        : ${rotos.length} (el proveedor debe corregirlas)`);
  if (huerfanos.length) console.log(`   En disco y sin listar           : ${huerfanos.length}  ← revisar`);

  for (const h of huecos.slice(0, 10))     console.log(`     falta: ${h.asignacion}  [${h.estatus}]`);
  for (const h of huerfanos.slice(0, 10))  console.log(`     sin listar: ${h}`);
}

main().catch((e) => { console.error('❌ ' + (e.message ?? e)); process.exit(1); });
