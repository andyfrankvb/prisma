/**
 * k6 — Prueba de carga E2E · PRISMA (Seguimiento de Resoluciones)
 * File: tests/load/flujo-prisma.js
 *
 * Cubre 3 roles reales del sistema, mapeados a los abstractos del requerimiento:
 *   ADMIN   → DIRECCION_GENERAL / SUPERADMIN  (supervisora, lectura global)
 *   EDITOR  → DELEGACION DIRECTOR             (creador: LOGIN → POST trámite → GET lista)
 *   VISITOR → DELEGACION OPERATIVO            (observador: LOGIN → GET lista)
 *
 * Auth: JWT Bearer. El login usa bcrypt (costoso a propósito), por eso el token
 * se CACHEA por VU y solo se renueva al expirar → no medimos bcrypt, medimos el flujo.
 *
 * Ejecutar:
 *   cp users.example.json users.json   # y completa las contraseñas reales
 *   k6 run -e BASE_URL=http://localhost tests/load/flujo-prisma.js
 *
 * ⚠️ El flujo EDITOR ESCRIBE en la BD (crea trámites). Corré contra una base
 *    desechable/de staging, nunca contra producción.
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';

// ── Configuración ─────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const API      = `${BASE_URL}/api/v1`;
// JWT del sistema dura 8h; dentro de una corrida nunca expira. Margen de seguridad:
const TOKEN_TTL_MS = Number(__ENV.TOKEN_TTL_MS || 7 * 60 * 60 * 1000); // 7h

// ── Datos dinámicos de usuarios (SharedArray = 1 sola copia en memoria) ──
// SharedArray evita que cada VU duplique el dataset (clave con 50+ VUs).
const RAW = JSON.parse(open('./users.json'));

const admins   = new SharedArray('admins',   () => RAW.filter((u) => u.role === 'ADMIN'));
const editors  = new SharedArray('editors',  () => RAW.filter((u) => u.role === 'EDITOR'));
const visitors = new SharedArray('visitors', () => RAW.filter((u) => u.role === 'VISITOR'));

// ── Métricas personalizadas ───────────────────────────────────
const errorRate     = new Rate('errores_negocio');       // fallos lógicos (checks)
const loginTrend    = new Trend('login_duracion', true);  // aísla el costo de bcrypt
const flowTrend     = new Trend('flujo_duracion', true);  // el flujo sin el login
const tramitesCreados = new Counter('tramites_creados');

// ── Opciones / escenarios (50 VUs repartidos por rol) ─────────
export const options = {
  scenarios: {
    admin_supervision: {
      executor:   'ramping-vus',
      exec:       'flujoAdmin',
      startVUs:   0,
      stages:     [
        { duration: '30s', target: 10 },
        { duration: '1m',  target: 10 },
        { duration: '15s', target: 0 },
      ],
      tags:       { rol: 'admin' },
    },
    editor_creacion: {
      executor:   'ramping-vus',
      exec:       'flujoEditor',
      startVUs:   0,
      stages:     [
        { duration: '30s', target: 20 },
        { duration: '1m',  target: 20 },
        { duration: '15s', target: 0 },
      ],
      tags:       { rol: 'editor' },
    },
    visitor_lectura: {
      executor:   'ramping-vus',
      exec:       'flujoVisitor',
      startVUs:   0,
      stages:     [
        { duration: '30s', target: 20 },
        { duration: '1m',  target: 20 },
        { duration: '15s', target: 0 },
      ],
      tags:       { rol: 'visitor' },
    },
  },
  thresholds: {
    // Nginx corta a los 60s; exigimos MUCHO mejor.
    'http_req_duration{tipo:flujo}': ['p(95)<800', 'p(99)<1500'],
    'http_req_failed':               ['rate<0.01'],
    'errores_negocio':               ['rate<0.01'],
    'checks':                        ['rate>0.99'],
    'login_duracion':                ['p(95)<2000'], // bcrypt: se tolera más
  },
};

// ── Persistencia del token: caché por VU ──────────────────────
// Objeto a nivel de módulo → vive durante toda la corrida del VU. Cada VU se ancla
// a UN usuario (índice determinista), así que su token siempre le corresponde.
const tokenCache = {}; // { [vuId]: { token, obtenidoEn } }

function pickUser(pool) {
  if (pool.length === 0) fail('users.json no tiene usuarios para este rol');
  // Selección determinista por VU: el mismo VU usa siempre el mismo usuario.
  return pool[exec.vu.idInTest % pool.length];
}

function login(user) {
  const t0 = Date.now();
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { tipo: 'login' } },
  );
  loginTrend.add(Date.now() - t0);

  const ok = check(res, {
    'login: status 200':      (r) => r.status === 200,
    'login: devuelve token':  (r) => !!(r.json() && r.json().token),
  });
  errorRate.add(!ok);
  if (!ok) fail(`Login falló para ${user.email} (status ${res.status})`);

  return res.json().token;
}

/** Devuelve un Bearer válido reutilizando el token cacheado del VU. */
function authHeaders(user) {
  const id     = exec.vu.idInTest;
  const cached = tokenCache[id];
  const vencido = !cached || (Date.now() - cached.obtenidoEn) > TOKEN_TTL_MS;

  if (vencido) {
    tokenCache[id] = { token: login(user), obtenidoEn: Date.now() };
  }
  return {
    headers: {
      Authorization: `Bearer ${tokenCache[id].token}`,
      'Content-Type': 'application/json',
    },
  };
}

// ── Pasos reutilizables ───────────────────────────────────────
function listarTramites(params) {
  const res = http.get(`${API}/tramites?page=1&limit=20`, {
    ...params,
    tags: { ...params.tags, tipo: 'flujo', paso: 'listar' },
  });
  const ok = check(res, {
    'GET lista: status 200':        (r) => r.status === 200,
    'GET lista: data es arreglo':   (r) => Array.isArray(r.json('data')),
    'GET lista: trae meta.total':   (r) => r.json('meta') && typeof r.json('meta').total === 'number',
  });
  errorRate.add(!ok);
  return res;
}

function crearTramite(params) {
  const uid = `LOAD-${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Date.now()}`;
  const body = JSON.stringify({
    descripcion:             `Trámite de carga ${uid}`,
    numero_ticket:           uid,
    nombre_solicitante:      'Prueba Carga',
    correo_solicitante:      'carga@example.com',
    telefono_solicitante:    '9990000000',
    checklist_documentacion: true,
    checklist_proyecto:      true,
  });
  const res = http.post(`${API}/tramites`, body, {
    ...params,
    tags: { ...params.tags, tipo: 'flujo', paso: 'crear' },
  });
  const ok = check(res, {
    'POST trámite: status 201':      (r) => r.status === 201,
    'POST trámite: devuelve id':     (r) => r.json('data') && !!r.json('data').id,
  });
  errorRate.add(!ok);
  if (ok) tramitesCreados.add(1);
  return res;
}

// ── Flujos por rol (exec de cada escenario) ───────────────────
export function flujoAdmin() {
  const user = pickUser(admins);
  const auth = authHeaders(user);
  const t0 = Date.now();

  group('ADMIN · Supervisión (lectura)', () => {
    listarTramites(auth);
  });

  flowTrend.add(Date.now() - t0);
  sleep(Math.random() * 2 + 1); // think time 1-3s
}

export function flujoEditor() {
  const user = pickUser(editors);
  const auth = authHeaders(user);
  const t0 = Date.now();

  group('EDITOR · Crear resolución', () => {
    const creado = crearTramite(auth);
    if (creado.status === 201) {
      group('EDITOR · Verificar en lista', () => listarTramites(auth));
    }
  });

  flowTrend.add(Date.now() - t0);
  sleep(Math.random() * 3 + 2); // think time 2-5s (flujo de escritura)
}

export function flujoVisitor() {
  const user = pickUser(visitors);
  const auth = authHeaders(user);
  const t0 = Date.now();

  group('VISITOR · Consulta (lectura)', () => {
    listarTramites(auth);
  });

  flowTrend.add(Date.now() - t0);
  sleep(Math.random() * 2 + 1);
}
