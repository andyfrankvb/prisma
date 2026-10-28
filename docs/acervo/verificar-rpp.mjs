// Pruebas contra una base exclusiva de pruebas; no usa DATABASE_URL ni ACERVO_DATABASE_URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import knex from 'knex';
import pg from 'pg';
import { PostgresAcervoSearchRepository } from '../../dist/modules/acervo/acervo.search.repository.js';

export async function verificarRpp(ejecutar) {
  const schema = 'acervo_rpp_test_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const namespace = '"' + schema + '"';
  const compiler = knex({ client: 'pg', pool: { min: 0, max: 1 } });
  const connection = { raw: (sql, bindings = []) => {
    const query = compiler.raw(sql, bindings).toSQL().toNative();
    return ejecutar(query.sql, query.bindings);
  } };
  const origen = { modo: 'servidor', base_de_datos: 'consultas_gisnet', esquema: 'acervo_prisma',
    esquemas: { 1: schema, 2: schema + '_2', 3: schema + '_3', 4: schema + '_4' } };
  const nuevo = () => new PostgresAcervoSearchRepository(connection, origen);
  const filtros = (extra = {}) => ({ delegacion_id: 1, pagina: 1, tamano_pagina: 10, tipo_busqueda: 'precisa', ...extra });
  const aprobadas = [];
  try {
    const fixture = (await readFile(new URL('./pruebas/rpp-fixture.sql', import.meta.url), 'utf8')).replaceAll('__ESQUEMA__', namespace);
    await ejecutar(fixture);
    const repo = nuevo();
    assert.equal((await repo.delegaciones())[0].rpp_disponible, true);
    const porRpp = await repo.inmuebles(filtros({ folio: '107301' }));
    assert.deepEqual(porRpp.resultados.map(r => r.folio), ['509254']);
    assert.deepEqual(porRpp.resultados[0].folios_rpp, ['107301']);
    assert.deepEqual((await repo.inmuebles(filtros({ folio: '301' }))).resultados.map(r => r.folio), ['509254']);
    const porGisnet = await repo.inmuebles(filtros({ folio: '9254' }));
    assert.deepEqual(porGisnet.resultados.map(r => r.folio), ['509254']);
    const detalle = await repo.detalle('50925401', 1);
    assert.equal(detalle.inmueble.folio_gisnet, '509254');
    assert.deepEqual(detalle.inmueble.folios_rpp, ['107301']);
    assert.equal(detalle.inmueble.rpp_estado, 'vinculado');
    assert.equal(detalle.actos.length, 2);
    aprobadas.push('Caso 509254/107301; búsqueda por ambos folios y sus terminaciones; datos y actos preservados');

    const antecedente = await repo.antecedentes({ delegacion_id: 1, pagina: 1, tamano_pagina: 10, seccion: 1, tomo: 'XLIV' });
    assert.deepEqual(antecedente.resultados[0].folios_rpp, ['107301']);
    assert.deepEqual((await repo.inmuebles(filtros({ propietario: 'PERSONA DE PRUEBA' }))).resultados[0].folios_rpp, ['107301']);
    aprobadas.push('Resultados por antecedente y propietario incluyen Folio y F.R.E. sin filtrar por folio');

    await ejecutar(`INSERT INTO ${namespace}.inmobiliario (nu_folio, nu_ofic) VALUES (107301, 1);`);
    const colision = await repo.inmuebles(filtros({ folio: '107301' }));
    assert.equal(colision.total_resultados, 2);
    assert.deepEqual(colision.resultados.map(r => r.folio), ['107301', '509254']);
    await ejecutar(`DELETE FROM ${namespace}.inmobiliario WHERE nu_folio = 107301;`);
    aprobadas.push('Un número que es Folio de un inmueble y F.R.E. de otro devuelve ambos sin escoger arbitrariamente');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_rpp VALUES
      (509254, 1, 'BI17', 2, 'XXXI', '02', '01_01', 345, 0, 0, '1987-03-13', 999);`);
    const doble = await repo.inmuebles(filtros({ folio: '509254' }));
    assert.equal(doble.total_resultados, 1);
    assert.deepEqual(doble.resultados[0].folios_rpp, ['107301', '509254']);
    await ejecutar(`DELETE FROM ${namespace}.lista_tomos_rpp WHERE nu_folio = 509254;`);
    aprobadas.push('Si el mismo inmueble coincide por ambos identificadores se cuenta y presenta una sola vez');

    assert.equal((await repo.inmuebles(filtros({ folio: '073', tipo_busqueda: 'precisa' }))).total_resultados, 0);
    assert.equal((await repo.inmuebles(filtros({ folio: '073', tipo_busqueda: 'aproximada' }))).resultados[0].folio, '509254');
    aprobadas.push('Búsqueda precisa por terminación y aproximada por contenido en cualquiera de las numeraciones');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet SELECT * FROM ${namespace}.lista_tomos_gisnet;
      INSERT INTO ${namespace}.lista_tomos_rpp SELECT * FROM ${namespace}.lista_tomos_rpp;`);
    assert.equal((await repo.inmuebles(filtros({ folio: '107301' }))).total_resultados, 1);
    assert.deepEqual((await repo.detalle('50925401', 1)).inmueble.folios_rpp, ['107301']);
    aprobadas.push('Duplicados de la misma correspondencia no multiplican inmuebles ni folios RPP');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet VALUES
      (888888, 2, 'BI1', 1, 'XLIV', '01', '01_01', 365, 366, 366, '1987-03-13', 1);`);
    assert.deepEqual((await repo.detalle('50925401', 1)).inmueble.folios_rpp, ['107301']);
    aprobadas.push('Una coincidencia de otra oficina no se asigna a Chetumal ni crea ambigüedad');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet VALUES
      (700000, 1, 'BI1', 1, 'XLIV', '01', '01_01', 365, 366, 366, '1987-03-13', 2);`);
    const ambiguo = await repo.inmuebles(filtros({ folio: '107301' }));
    assert.equal(ambiguo.total_resultados, 0); assert.match(ambiguo.mensaje, /ambiguas/);
    assert.deepEqual((await repo.detalle('50925401', 1)).inmueble.folios_rpp, []);
    assert.equal((await repo.detalle('50925401', 1)).inmueble.rpp_estado, 'ambiguo');
    assert.equal((await repo.inmuebles(filtros({ folio: '509254' }))).total_resultados, 1);
    await ejecutar(`DELETE FROM ${namespace}.lista_tomos_gisnet WHERE nu_folio = 700000;`);
    aprobadas.push('Una misma clave para varios GISNET se rechaza en búsqueda y detalle');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_rpp VALUES
      (207301, 1, 'BI1', 1, 'XLIV', '01', '01_01', 365, 366, 366, '1987-03-13', 3);`);
    assert.equal((await repo.detalle('50925401', 1)).inmueble.rpp_estado, 'ambiguo');
    assert.equal((await repo.inmuebles(filtros({ folio: '207301' }))).total_resultados, 0);
    await ejecutar(`DELETE FROM ${namespace}.lista_tomos_rpp WHERE nu_folio = 207301;`);
    aprobadas.push('Una misma clave para varios RPP tampoco se presenta como equivalencia confirmada');

    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_rpp VALUES
      (207301, 1, 'BI17', 2, 'XXXI', '02', '01_01', 345, 0, 0, '1987-03-13', 4);`);
    assert.deepEqual((await repo.detalle('50925401', 1)).inmueble.folios_rpp, ['107301', '207301']);
    assert.equal((await repo.inmuebles(filtros({ folio: '207301' }))).total_resultados, 1);
    assert.equal((await repo.inmuebles(filtros({ folio: '107301', superficie_total: '999' }))).total_resultados, 0);
    aprobadas.push('Varios F.R.E. se muestran en los resultados; Folio y superficie se combinan con AND');

    for (const [gisnet, rpp, pre] of [[600001, 100001, 101], [600002, 100021, 102]]) {
      await ejecutar(`INSERT INTO ${namespace}.inmobiliario (nu_folio, nu_ofic) VALUES ($1, 1)`, [gisnet]);
      await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet VALUES
        ($1, 1, 'BI1', 1, 'TEST', '01', '01_01', $2, 1, 1, '2000-01-01', 0)`, [gisnet, pre]);
      await ejecutar(`INSERT INTO ${namespace}.lista_tomos_rpp VALUES
        ($1, 1, 'BI1', 1, 'TEST', '01', '01_01', $2, 1, 1, '2000-01-01', 0)`, [rpp, pre]);
    }
    const page = await repo.inmuebles(filtros({ folio: '1', tamano_pagina: 1, orden_por: 'folio', orden_direccion: 'desc' }));
    assert.equal(page.total_resultados, 3); assert.equal(page.resultados[0].folio, '600002');
    assert.equal((await repo.inmuebles(filtros({ folio: '1', tamano_pagina: 1, pagina: 2, orden_por: 'folio', orden_direccion: 'desc' }))).resultados[0].folio, '600001');
    aprobadas.push('El orden y la paginación se aplican al conjunto GISNET obtenido por RPP');

    await ejecutar(`UPDATE ${namespace}.lista_tomos_rpp SET tomo = NULL WHERE nu_folio = 107301;`);
    assert.equal((await repo.inmuebles(filtros({ folio: '107301' }))).total_resultados, 0);
    assert.deepEqual((await repo.detalle('50925401', 1)).inmueble.folios_rpp, ['207301']);
    aprobadas.push('Un antecedente incompleto no crea una correspondencia');

    // Un conjunto aislado comprueba el orden global, precisión y valores ausentes.
    const filasFre = [[810001, '100'], [810002, '2'], [810003, '10'],
      [810004, '9007199254740993'], [810005, '9007199254740992'],
      [810006, null], [810007, null], [810008, '42'], [810009, '42']];
    for (const [gisnet, fre] of filasFre) {
      const pre = gisnet - 800000;
      await ejecutar(`INSERT INTO ${namespace}.inmobiliario (nu_folio, nu_ofic, localidad) VALUES ($1, 1, 'ORDEN FRE')`, [gisnet]);
      await ejecutar(`INSERT INTO ${namespace}.mesa_control VALUES
        ($1, $1, 1, '01', 'SORTFRE', '01_01', '1', NULL, 1, 1, 'BI1', 1, '2000-01-01')`, [gisnet]);
      await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet VALUES
        ($1, 1, 'BI1', 1, 'SORTFRE', '01', '01_01', $2, 1, 1, '2000-01-01', 0)`, [gisnet, pre]);
      if (fre) await ejecutar(`INSERT INTO ${namespace}.lista_tomos_rpp VALUES
        ($1, 1, 'BI1', 1, 'SORTFRE', '01', '01_01', $2, 1, 1, '2000-01-01', 0)`, [fre, pre]);
    }
    await ejecutar(`INSERT INTO ${namespace}.lista_tomos_gisnet VALUES
      (810002, 1, 'BI17', 2, 'SORTFRE', '01', '01_01', 20002, 1, 1, '2000-01-01', 0);
      INSERT INTO ${namespace}.lista_tomos_rpp VALUES
      (20, 1, 'BI17', 2, 'SORTFRE', '01', '01_01', 20002, 1, 1, '2000-01-01', 0),
      (21, 1, 'BI1', 1, 'SORTFRE', '01', '01_01', 10007, 1, 1, '2000-01-01', 0),
      (22, 1, 'BI1', 1, 'SORTFRE', '01', '01_01', 10007, 1, 1, '2000-01-01', 0);`);
    const esperadosFre = {
      asc: ['810002', '810003', '810008', '810009', '810001', '810005', '810004', '810006', '810007'],
      desc: ['810004', '810005', '810001', '810008', '810009', '810003', '810002', '810006', '810007'],
    };
    for (const orden_direccion of ['asc', 'desc']) {
      for (const tipo of ['inmuebles', 'antecedentes']) {
        const consultas = tipo === 'inmuebles' ? filtros({ localidad: 'ORDEN FRE' })
          : { delegacion_id: 1, pagina: 1, tamano_pagina: 10, seccion: 1, tomo: 'SORTFRE' };
        const opciones = { ...consultas, orden_por: 'fre', orden_direccion, tamano_pagina: 2 };
        const reunidos = [];
        for (let pagina = 1; pagina <= 5; pagina++) {
          const resultado = await repo[tipo]({ ...opciones, pagina });
          assert.equal(resultado.total_resultados, 9);
          assert.equal(resultado.orden.campo, 'fre');
          for (const fila of resultado.resultados) {
            assert.equal(Object.hasOwn(fila, 'fre_orden'), false);
            reunidos.push(fila.folio);
          }
        }
        assert.deepEqual(reunidos, esperadosFre[orden_direccion]);
      }
    }
    aprobadas.push('F.R.E. ordena numéricamente en ambos sentidos y ambas tablas, con paginación global, empates estables, varios F.R.E., enteros grandes y ausentes/ambiguos al final');

    await ejecutar(`DROP TABLE ${namespace}.lista_tomos_rpp;`);
    const sinFuente = nuevo();
    assert.equal((await sinFuente.delegaciones())[0].rpp_disponible, false);
    assert.equal((await sinFuente.inmuebles(filtros({ folio: '509254' }))).total_resultados, 1);
    assert.equal((await sinFuente.detalle('50925401', 1)).inmueble.rpp_estado, 'no_disponible');
    assert.equal((await sinFuente.inmuebles(filtros({ folio: '107301' }))).total_resultados, 0);
    assert.equal((await sinFuente.inmuebles(filtros({ folio: '509254', orden_por: 'fre', orden_direccion: 'desc' }))).resultados[0].folio, '509254');
    aprobadas.push('Sin fuente RPP compatible, el campo Folio sigue buscando en GISNET');
    return { pruebas: aprobadas.length, aprobadas };
  } finally {
    await ejecutar(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    await compiler.destroy();
  }
}

async function main() {
  const configured = process.env.ACERVO_TEST_DATABASE_URL;
  if (!configured) throw new Error('Define ACERVO_TEST_DATABASE_URL para una base exclusiva terminada en _test o _pruebas.');
  const url = new URL(configured);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/_(test|pruebas)$/.test(database)) {
    throw new Error('Esta verificación solo crea datos sintéticos en una base exclusiva de pruebas.');
  }
  const client = new pg.Client({ host: url.hostname, port: Number(url.port || 5432), database,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
  await client.connect();
  try { console.log(JSON.stringify(await verificarRpp((sql, values) => client.query(sql, values)), null, 2)); }
  finally { await client.end(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
