/**
 * Seed de datos de prueba — Recepción de Oficios (flujo completo)
 * File: tests/manual/seed-oficios-flujo.js
 *
 * Crea 6 oficios recorriendo TODO el flujo vía la API real (no inserts directos),
 * de modo que se ejecutan validaciones, transiciones, auditoría y notificaciones.
 * Deja un oficio en cada estado:
 *   RECIBIDO · ASIGNADO · EN_REVISION · EN_RECONSIDERACION · VOBO_APROBADO · FINALIZADO
 *
 * Actores (roles de flujo reales, resueltos por configuracion_flujos):
 *   OFICIAL     Gloria (65)          registra
 *   ENCARGADO   Oscar Gopar (53)     asigna / VoBo / reconsidera
 *   JURIDICO    Op. Juridico 1 (38)  sube proyecto
 *   SECRETARIA  Tania Huerta (35)    finaliza
 *
 * Ejecutar dentro del contenedor (tiene JWT_SECRET, jsonwebtoken y red):
 *   docker exec app_api node tests/manual/seed-oficios-flujo.js
 */

const jwt = require('jsonwebtoken');
const fs  = require('fs');

const SECRET = process.env.JWT_SECRET;
const BASE   = 'http://localhost:3000/api/v1';

// PDF real ya existente en storage → subida y OCR válidos
const SAMPLE_PDF = fs.readFileSync(
  '/app/storage/oficios/originales/a126b358-cd65-4059-93e3-8f0f1faa5062.pdf',
);

const A = {
  oficial:    { id: 65, nombre: 'Gloria',         email: 'gloriavazquez@rppc.qroo', rol: 'OPERATIVO',  unidad_id: 37, unidad_tipo: 'DELEGACION' },
  encargado:  { id: 53, nombre: 'Oscar Gopar',    email: 'oscargopar@rppc.com',     rol: 'DIRECTOR',   unidad_id: 36, unidad_tipo: 'DIRECCION' },
  juridico:   { id: 38, nombre: 'Op. Juridico 1', email: 'op.juridico1@demo.mx',    rol: 'OPERATIVO',  unidad_id: 36, unidad_tipo: 'DIRECCION' },
  secretaria: { id: 35, nombre: 'Tania Huerta',   email: 'taniahuerta@rppc.qroo',   rol: 'SECRETARIA', unidad_id: 34, unidad_tipo: 'DIRECCION_GENERAL' },
};

const mint = (a) => jwt.sign(
  { id: a.id, nombre: a.nombre, email: a.email, rol: a.rol,
    oficina_id: a.unidad_id, unidad_id: a.unidad_id, unidad_tipo: a.unidad_tipo },
  SECRET, { expiresIn: '1h' },
);
const T = {
  oficial:    mint(A.oficial),
  encargado:  mint(A.encargado),
  juridico:   mint(A.juridico),
  secretaria: mint(A.secretaria),
};

const pdfBlob = (name) => {
  const fd = new FormData();
  return { fd, add: (field) => fd.append(field, new Blob([SAMPLE_PDF], { type: 'application/pdf' }), name) };
};

async function must(res, label) {
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

// ── Pasos del flujo ───────────────────────────────────────────
async function crear(i) {
  const fd = new FormData();
  fd.append('pdf', new Blob([SAMPLE_PDF], { type: 'application/pdf' }), `oficio-${i}.pdf`);
  fd.append('remitente',             `Remitente de Prueba ${i}`);
  fd.append('dependencia_origen',    'Dependencia de Prueba QA');
  fd.append('dirigido_a_id',         String(A.encargado.id));
  fd.append('descripcion_solicitud', `Oficio de prueba #${i} para validar el flujo completo del módulo.`);
  fd.append('tiene_termino',         'false');
  const r = await fetch(`${BASE}/oficios`, { method: 'POST', headers: { Authorization: `Bearer ${T.oficial}` }, body: fd });
  const j = await must(r, `crear #${i}`);
  return j.data;
}

async function asignar(id) {
  const r = await fetch(`${BASE}/oficios/${id}/asignar`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${T.encargado}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ abogado_id: A.juridico.id, observaciones: 'Asignación de prueba QA' }),
  });
  await must(r, `asignar ${id}`);
}

async function proyecto(id) {
  const fd = new FormData();
  fd.append('file', new Blob([SAMPLE_PDF], { type: 'application/pdf' }), `proyecto-${id}.pdf`);
  const r = await fetch(`${BASE}/oficios/${id}/subir-proyecto`, { method: 'POST', headers: { Authorization: `Bearer ${T.juridico}` }, body: fd });
  await must(r, `proyecto ${id}`);
}

async function vobo(id) {
  const r = await fetch(`${BASE}/oficios/${id}/vobo`, { method: 'PATCH', headers: { Authorization: `Bearer ${T.encargado}` } });
  await must(r, `vobo ${id}`);
}

async function reconsiderar(id) {
  const r = await fetch(`${BASE}/oficios/${id}/reconsiderar`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${T.encargado}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comentario: 'Favor de corregir el proyecto de contestación (prueba QA).' }),
  });
  await must(r, `reconsiderar ${id}`);
}

async function finalizar(id) {
  const fd = new FormData();
  fd.append('file', new Blob([SAMPLE_PDF], { type: 'application/pdf' }), `firmado-${id}.pdf`);
  const r = await fetch(`${BASE}/oficios/${id}/finalizar`, { method: 'POST', headers: { Authorization: `Bearer ${T.secretaria}` }, body: fd });
  await must(r, `finalizar ${id}`);
}

const PASOS = { asignar, proyecto, vobo, reconsiderar, finalizar };

// ── Plan: un oficio por estado ────────────────────────────────
const PLAN = [
  { estado: 'RECIBIDO',           steps: [] },
  { estado: 'ASIGNADO',           steps: ['asignar'] },
  { estado: 'EN_REVISION',        steps: ['asignar', 'proyecto'] },
  { estado: 'EN_RECONSIDERACION', steps: ['asignar', 'proyecto', 'reconsiderar'] },
  { estado: 'VOBO_APROBADO',      steps: ['asignar', 'proyecto', 'vobo'] },
  { estado: 'FINALIZADO',         steps: ['asignar', 'proyecto', 'vobo', 'finalizar'] },
];

(async () => {
  console.log('Seed Recepción de Oficios — flujo completo\n');
  const creados = [];
  for (let i = 0; i < PLAN.length; i++) {
    const p = PLAN[i];
    const of = await crear(i + 1);
    for (const step of p.steps) await PASOS[step](of.id);
    creados.push({ id: of.id, folio: of.folio, estado: p.estado });
    console.log(`  ✓ #${of.id}  ${of.folio.padEnd(22)} → ${p.estado}`);
  }
  console.log(`\nListo: ${creados.length} oficios creados cubriendo los 6 estados.`);
})().catch((e) => { console.error('\n✗ ERROR:', e.message); process.exit(1); });
