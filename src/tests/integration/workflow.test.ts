/**
 * Integration Test: Full Workflow Simulation
 * File: src/tests/integration/workflow.test.ts
 *
 * Simulates the complete lifecycle of an oficio:
 *
 *   POST /oficios          (OFICIAL)       → RECIBIDO
 *   PATCH /:id/asignar     (ENCARGADO)     → ASIGNADO
 *   POST /:id/subir-proyecto (JURIDICO)    → EN_REVISION
 *   PATCH /:id/vobo        (ENCARGADO)     → VOBO_APROBADO
 *   POST /:id/finalizar    (SECRETARIA)    → FINALIZADO
 *
 * Uses a real PostgreSQL test database.
 * Set TEST_DATABASE_URL in your .env.test file.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request  from 'supertest';
import path     from 'path';
import fs       from 'fs';
import os       from 'os';

import {
  setupTestDb,
  teardownTestDb,
  cleanTables,
  seedOficina,
  seedUsuario,
  testDb,
} from './helpers/db.helper';
import { buildTestApp, setTestUser } from './helpers/app.helper';
import type { AuthUser } from '../../modules/oficialia_partes/oficios.types';

// ── Mock external services (storage + notifications) ─────────────────────────

vi.mock('../../services/storage.service', () => ({
  storage: {
    save: vi.fn().mockImplementation((_file: any, folder: string) =>
      Promise.resolve(`/${folder}/mock-${Date.now()}.pdf`),
    ),
  },
}));

vi.mock('../../notifications/notification.dispatcher', () => ({
  notifyVoboAprobado: vi.fn().mockResolvedValue(undefined),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

let app: ReturnType<typeof buildTestApp>;
let oficina_id: number;
let oficial_id: number;
let encargado_id: number;
let abogado_id: number;
let secretaria_id: number;
let director_id: number;

let oficialUser:    AuthUser;
let encargadoUser:  AuthUser;
let juridicoUser:   AuthUser;
let secretariaUser: AuthUser;

/** Temp PDF file used as upload fixture */
let tempPdfPath: string;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupTestDb();
  app = buildTestApp();

  // Create a minimal valid PDF buffer for file upload tests
  tempPdfPath = path.join(os.tmpdir(), 'test_oficio.pdf');
  fs.writeFileSync(tempPdfPath, '%PDF-1.4 test content');
});

afterAll(async () => {
  fs.unlinkSync(tempPdfPath);
  await teardownTestDb();
});

beforeEach(async () => {
  await cleanTables();

  // Seed base data
  oficina_id    = await seedOficina({ nombre: 'Chetumal' });
  oficial_id    = await seedUsuario({ rol: 'OFICIAL',    oficina_id, email: 'oficial@test.mx'    });
  encargado_id  = await seedUsuario({ rol: 'ENCARGADO',  oficina_id, email: 'encargado@test.mx'  });
  abogado_id    = await seedUsuario({ rol: 'JURIDICO',   oficina_id, email: 'abogado@test.mx'    });
  secretaria_id = await seedUsuario({ rol: 'SECRETARIA', oficina_id, email: 'secretaria@test.mx' });
  director_id   = await seedUsuario({ rol: 'DIRECTOR',   oficina_id, email: 'director@test.mx'   });

  oficialUser    = { id: oficial_id,    nombre: 'Oficial',    email: 'oficial@test.mx',    rol: 'OFICIAL',    oficina_id };
  encargadoUser  = { id: encargado_id,  nombre: 'Encargado',  email: 'encargado@test.mx',  rol: 'ENCARGADO',  oficina_id };
  juridicoUser   = { id: abogado_id,    nombre: 'Abogado',    email: 'abogado@test.mx',    rol: 'JURIDICO',   oficina_id };
  secretariaUser = { id: secretaria_id, nombre: 'Secretaria', email: 'secretaria@test.mx', rol: 'SECRETARIA', oficina_id };
});

// ── Full workflow ─────────────────────────────────────────────────────────────

describe('Full Workflow: POST /oficios → POST /finalizar', () => {
  it('completes the full lifecycle and ends with estatus FINALIZADO', async () => {

    // ── Step 1: OFICIAL registers a new oficio ────────────────
    setTestUser(oficialUser);

    const createRes = await request(app)
      .post('/api/v1/oficios')
      .field('folio',                 'OF-2026-INTEG-001')
      .field('remitente',             'Secretaría de Finanzas')
      .field('dependencia_origen',    'SEFIN')
      .field('dirigido_a_id',         String(director_id))
      .field('descripcion_solicitud', 'Solicitud de información presupuestal')
      .field('tiene_termino',         'false')
      .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.folio).toBe('OF-2026-INTEG-001');
    expect(createRes.body.data.estatus).toBe('RECIBIDO');

    const oficio_id = createRes.body.data.id;

    // Verify audit log was created
    const audit1 = await testDb('auditoria_estados').where({ oficio_id }).orderBy('id', 'asc');
    expect(audit1).toHaveLength(1);
    expect(audit1[0].estado_anterior).toBeNull();
    expect(audit1[0].estado_nuevo).toBe('RECIBIDO');

    // ── Step 2: ENCARGADO assigns to abogado ──────────────────
    setTestUser(encargadoUser);

    const asignarRes = await request(app)
      .patch(`/api/v1/oficios/${oficio_id}/asignar`)
      .send({ abogado_id, observaciones: 'Revisar con urgencia' });

    expect(asignarRes.status).toBe(200);
    expect(asignarRes.body.message).toMatch(/asignado/i);

    const oficio2 = await testDb('oficios').where({ id: oficio_id }).first();
    expect(oficio2.estatus).toBe('ASIGNADO');

    const asignacion = await testDb('asignaciones_juridicas').where({ oficio_id }).first();
    expect(asignacion).toBeDefined();
    expect(asignacion.abogado_id).toBe(abogado_id);
    expect(asignacion.observaciones).toBe('Revisar con urgencia');

    // ── Step 3: JURIDICO uploads draft ────────────────────────
    setTestUser(juridicoUser);

    const subirRes = await request(app)
      .post(`/api/v1/oficios/${oficio_id}/subir-proyecto`)
      .attach('file', tempPdfPath, { contentType: 'application/pdf' });

    expect(subirRes.status).toBe(200);

    const oficio3 = await testDb('oficios').where({ id: oficio_id }).first();
    expect(oficio3.estatus).toBe('EN_REVISION');

    const gestion = await testDb('gestiones_contestacion').where({ oficio_id }).first();
    expect(gestion).toBeDefined();
    expect(gestion.vobo_encargado).toBe(false);

    // ── Step 4: ENCARGADO approves VoBo ───────────────────────
    setTestUser(encargadoUser);

    const voboRes = await request(app)
      .patch(`/api/v1/oficios/${oficio_id}/vobo`);

    expect(voboRes.status).toBe(200);

    const oficio4 = await testDb('oficios').where({ id: oficio_id }).first();
    expect(oficio4.estatus).toBe('VOBO_APROBADO');

    const gestion2 = await testDb('gestiones_contestacion').where({ oficio_id }).first();
    expect(gestion2.vobo_encargado).toBe(true);
    expect(gestion2.fecha_vobo).not.toBeNull();

    // ── Step 5: SECRETARIA uploads signed document ────────────
    setTestUser(secretariaUser);

    const finalizarRes = await request(app)
      .post(`/api/v1/oficios/${oficio_id}/finalizar`)
      .attach('file', tempPdfPath, { contentType: 'application/pdf' });

    expect(finalizarRes.status).toBe(200);

    const oficio5 = await testDb('oficios').where({ id: oficio_id }).first();
    expect(oficio5.estatus).toBe('FINALIZADO');

    const gestion3 = await testDb('gestiones_contestacion').where({ oficio_id }).first();
    expect(gestion3.escaneo_firmado_url).not.toBeNull();
    expect(gestion3.subido_por_secretaria_id).toBe(secretaria_id);

    // ── Verify complete audit trail ───────────────────────────
    const auditTrail = await testDb('auditoria_estados')
      .where({ oficio_id })
      .orderBy('id', 'asc');

    expect(auditTrail).toHaveLength(5);

    const transitions = auditTrail.map((a: any) => ({
      from: a.estado_anterior,
      to:   a.estado_nuevo,
    }));

    expect(transitions).toEqual([
      { from: null,           to: 'RECIBIDO'      },
      { from: 'RECIBIDO',     to: 'ASIGNADO'      },
      { from: 'ASIGNADO',     to: 'EN_REVISION'   },
      { from: 'EN_REVISION',  to: 'VOBO_APROBADO' },
      { from: 'VOBO_APROBADO', to: 'FINALIZADO'   },
    ]);
  });

  // ── Guard: wrong status transitions ──────────────────────────

  it('rejects VoBo when oficio is not EN_REVISION', async () => {
    setTestUser(oficialUser);
    const createRes = await request(app)
      .post('/api/v1/oficios')
      .field('folio', 'OF-GUARD-001')
      .field('remitente', 'Test')
      .field('dependencia_origen', 'Test')
      .field('dirigido_a_id', String(director_id))
      .field('descripcion_solicitud', 'Test')
      .field('tiene_termino', 'false')
      .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    const oficio_id = createRes.body.data.id;

    setTestUser(encargadoUser);
    const voboRes = await request(app).patch(`/api/v1/oficios/${oficio_id}/vobo`);

    expect(voboRes.status).toBe(422);
    expect(voboRes.body.message).toMatch(/EN_REVISION/);
  });

  it('rejects finalizar when oficio is not VOBO_APROBADO', async () => {
    setTestUser(oficialUser);
    const createRes = await request(app)
      .post('/api/v1/oficios')
      .field('folio', 'OF-GUARD-002')
      .field('remitente', 'Test')
      .field('dependencia_origen', 'Test')
      .field('dirigido_a_id', String(director_id))
      .field('descripcion_solicitud', 'Test')
      .field('tiene_termino', 'false')
      .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    const oficio_id = createRes.body.data.id;

    setTestUser(secretariaUser);
    const finRes = await request(app)
      .post(`/api/v1/oficios/${oficio_id}/finalizar`)
      .attach('file', tempPdfPath, { contentType: 'application/pdf' });

    expect(finRes.status).toBe(422);
    expect(finRes.body.message).toMatch(/VOBO_APROBADO/);
  });

  it('rejects duplicate folio on POST /oficios', async () => {
    setTestUser(oficialUser);

    const body = () =>
      request(app)
        .post('/api/v1/oficios')
        .field('folio', 'OF-DUP-001')
        .field('remitente', 'Test')
        .field('dependencia_origen', 'Test')
        .field('dirigido_a_id', String(director_id))
        .field('descripcion_solicitud', 'Test')
        .field('tiene_termino', 'false')
        .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    const first  = await body();
    const second = await body();

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/ya existe/i);
  });

  it('rejects POST /oficios without PDF file', async () => {
    setTestUser(oficialUser);

    const res = await request(app)
      .post('/api/v1/oficios')
      .send({
        folio: 'OF-NOPDF-001', remitente: 'Test',
        dependencia_origen: 'Test', dirigido_a_id: director_id,
        descripcion_solicitud: 'Test', tiene_termino: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PDF/i);
  });

  it('rejects POST /oficios with tiene_termino=true but no fecha_vencimiento', async () => {
    setTestUser(oficialUser);

    const res = await request(app)
      .post('/api/v1/oficios')
      .field('folio', 'OF-NODATE-001')
      .field('remitente', 'Test')
      .field('dependencia_origen', 'Test')
      .field('dirigido_a_id', String(director_id))
      .field('descripcion_solicitud', 'Test')
      .field('tiene_termino', 'true')
      // intentionally omitting fecha_vencimiento
      .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fecha_vencimiento/i);
  });

  it('rejects assignment by non-ENCARGADO role', async () => {
    setTestUser(oficialUser);
    const createRes = await request(app)
      .post('/api/v1/oficios')
      .field('folio', 'OF-PERM-001')
      .field('remitente', 'Test')
      .field('dependencia_origen', 'Test')
      .field('dirigido_a_id', String(director_id))
      .field('descripcion_solicitud', 'Test')
      .field('tiene_termino', 'false')
      .attach('pdf', tempPdfPath, { contentType: 'application/pdf' });

    const oficio_id = createRes.body.data.id;

    // JURIDICO tries to assign — should be rejected
    setTestUser(juridicoUser);
    const res = await request(app)
      .patch(`/api/v1/oficios/${oficio_id}/asignar`)
      .send({ abogado_id });

    expect(res.status).toBe(403);
  });
});
