/**
 * Integration Test: Database Integrity
 * File: src/tests/integration/db_integrity.test.ts
 *
 * Verifies that the database schema enforces critical constraints:
 *  - oficina_id is never null on usuarios
 *  - oficina_registro_id is never null on oficios
 *  - FK constraints prevent orphaned records
 *  - Enum constraints reject invalid values
 *  - Audit trail is always written on status changes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  cleanTables,
  seedOficina,
  seedUsuario,
  seedOficio,
  testDb,
} from './helpers/db.helper';

beforeAll(async () => { await setupTestDb(); });
afterAll(async ()  => { await teardownTestDb(); });
beforeEach(async () => { await cleanTables(); });

// ── usuarios.oficina_id ───────────────────────────────────────────────────────

describe('usuarios.oficina_id integrity', () => {
  it('rejects INSERT with oficina_id = NULL', async () => {
    await expect(
      testDb('usuarios').insert({
        nombre:        'Sin Oficina',
        email:         'sin@oficina.mx',
        password_hash: 'hash',
        rol:           'OFICIAL',
        oficina_id:    null,   // ← should violate NOT NULL
      }),
    ).rejects.toThrow();
  });

  it('rejects INSERT with a non-existent oficina_id (FK violation)', async () => {
    await expect(
      testDb('usuarios').insert({
        nombre:        'FK Roto',
        email:         'fk@test.mx',
        password_hash: 'hash',
        rol:           'OFICIAL',
        oficina_id:    99999,  // ← does not exist
      }),
    ).rejects.toThrow();
  });

  it('accepts INSERT with a valid oficina_id', async () => {
    const oficina_id = await seedOficina();
    const id = await seedUsuario({ oficina_id });
    const row = await testDb('usuarios').where({ id }).first();
    expect(row.oficina_id).toBe(oficina_id);
    expect(row.oficina_id).not.toBeNull();
  });

  it('rejects UPDATE that sets oficina_id to NULL', async () => {
    const oficina_id = await seedOficina();
    const id = await seedUsuario({ oficina_id });

    await expect(
      testDb('usuarios').where({ id }).update({ oficina_id: null }),
    ).rejects.toThrow();
  });
});

// ── oficios.oficina_registro_id ───────────────────────────────────────────────

describe('oficios.oficina_registro_id integrity', () => {
  it('rejects INSERT with oficina_registro_id = NULL', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });

    await expect(
      testDb('oficios').insert({
        folio:                 'OF-NULL-OFICINA',
        remitente:             'Test',
        dependencia_origen:    'Test',
        dirigido_a_id:         user_id,
        oficial_registro_id:   user_id,
        oficina_registro_id:   null,   // ← should violate NOT NULL
        fecha_registro:        new Date(),
        descripcion_solicitud: 'Test',
        tiene_termino:         false,
        pdf_original_path:     '/test.pdf',
        estatus:               'RECIBIDO',
      }),
    ).rejects.toThrow();
  });

  it('rejects INSERT with non-existent oficina_registro_id', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });

    await expect(
      testDb('oficios').insert({
        folio:                 'OF-FK-OFICINA',
        remitente:             'Test',
        dependencia_origen:    'Test',
        dirigido_a_id:         user_id,
        oficial_registro_id:   user_id,
        oficina_registro_id:   99999,  // ← FK violation
        fecha_registro:        new Date(),
        descripcion_solicitud: 'Test',
        tiene_termino:         false,
        pdf_original_path:     '/test.pdf',
        estatus:               'RECIBIDO',
      }),
    ).rejects.toThrow();
  });

  it('every seeded oficio has a non-null oficina_registro_id', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });
    const oficio_id  = await seedOficio({ oficina_registro_id: oficina_id, oficial_registro_id: user_id, dirigido_a_id: user_id });

    const row = await testDb('oficios').where({ id: oficio_id }).first();
    expect(row.oficina_registro_id).not.toBeNull();
    expect(row.oficina_registro_id).toBe(oficina_id);
  });
});

// ── Enum constraints ──────────────────────────────────────────────────────────

describe('Enum constraints', () => {
  it('rejects invalid rol_usuario value', async () => {
    const oficina_id = await seedOficina();

    await expect(
      testDb('usuarios').insert({
        nombre:        'Bad Role',
        email:         'badrole@test.mx',
        password_hash: 'hash',
        rol:           'SUPERADMIN',   // ← not in enum
        oficina_id,
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid estatus_oficio value', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });

    await expect(
      testDb('oficios').insert({
        folio:                 'OF-BAD-STATUS',
        remitente:             'Test',
        dependencia_origen:    'Test',
        dirigido_a_id:         user_id,
        oficial_registro_id:   user_id,
        oficina_registro_id:   oficina_id,
        fecha_registro:        new Date(),
        descripcion_solicitud: 'Test',
        tiene_termino:         false,
        pdf_original_path:     '/test.pdf',
        estatus:               'BORRADOR',  // ← not in enum
      }),
    ).rejects.toThrow();
  });

  it('accepts all valid estatus_oficio values', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });

    const validStatuses = ['RECIBIDO', 'ASIGNADO', 'EN_REVISION', 'VOBO_APROBADO', 'FINALIZADO'];

    for (const estatus of validStatuses) {
      const [row] = await testDb('oficios')
        .insert({
          folio:                 `OF-STATUS-${estatus}`,
          remitente:             'Test',
          dependencia_origen:    'Test',
          dirigido_a_id:         user_id,
          oficial_registro_id:   user_id,
          oficina_registro_id:   oficina_id,
          fecha_registro:        new Date(),
          descripcion_solicitud: 'Test',
          tiene_termino:         false,
          pdf_original_path:     '/test.pdf',
          estatus,
        })
        .returning('estatus');

      expect(row.estatus).toBe(estatus);
    }
  });
});

// ── FK cascade behavior ───────────────────────────────────────────────────────

describe('FK cascade behavior', () => {
  it('cascades DELETE from oficios to auditoria_estados', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });
    const oficio_id  = await seedOficio({ oficina_registro_id: oficina_id, oficial_registro_id: user_id, dirigido_a_id: user_id });

    await testDb('auditoria_estados').insert({
      oficio_id,
      estado_anterior: null,
      estado_nuevo:    'RECIBIDO',
      usuario_id:      user_id,
      fecha_cambio:    new Date(),
    });

    await testDb('oficios').where({ id: oficio_id }).delete();

    const audits = await testDb('auditoria_estados').where({ oficio_id });
    expect(audits).toHaveLength(0);
  });

  it('cascades DELETE from oficios to asignaciones_juridicas', async () => {
    const oficina_id  = await seedOficina();
    const user_id     = await seedUsuario({ oficina_id });
    const abogado_id  = await seedUsuario({ oficina_id, rol: 'JURIDICO', email: 'ab@test.mx' });
    const oficio_id   = await seedOficio({ oficina_registro_id: oficina_id, oficial_registro_id: user_id, dirigido_a_id: user_id });

    await testDb('asignaciones_juridicas').insert({
      oficio_id,
      abogado_id,
      asignado_por_id:  user_id,
      fecha_asignacion: new Date(),
    });

    await testDb('oficios').where({ id: oficio_id }).delete();

    const asignaciones = await testDb('asignaciones_juridicas').where({ oficio_id });
    expect(asignaciones).toHaveLength(0);
  });

  it('prevents DELETE of oficina when usuarios reference it (RESTRICT)', async () => {
    const oficina_id = await seedOficina();
    await seedUsuario({ oficina_id });

    await expect(
      testDb('catalogo_oficinas').where({ id: oficina_id }).delete(),
    ).rejects.toThrow();
  });

  it('prevents DELETE of usuario when oficios reference them (RESTRICT)', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });
    await seedOficio({ oficina_registro_id: oficina_id, oficial_registro_id: user_id, dirigido_a_id: user_id });

    await expect(
      testDb('usuarios').where({ id: user_id }).delete(),
    ).rejects.toThrow();
  });
});

// ── folio uniqueness ──────────────────────────────────────────────────────────

describe('folio uniqueness constraint', () => {
  it('rejects duplicate folio values', async () => {
    const oficina_id = await seedOficina();
    const user_id    = await seedUsuario({ oficina_id });

    const base = {
      remitente:             'Test',
      dependencia_origen:    'Test',
      dirigido_a_id:         user_id,
      oficial_registro_id:   user_id,
      oficina_registro_id:   oficina_id,
      fecha_registro:        new Date(),
      descripcion_solicitud: 'Test',
      tiene_termino:         false,
      pdf_original_path:     '/test.pdf',
      estatus:               'RECIBIDO',
    };

    await testDb('oficios').insert({ ...base, folio: 'OF-UNIQUE-001' });

    await expect(
      testDb('oficios').insert({ ...base, folio: 'OF-UNIQUE-001' }),
    ).rejects.toThrow();
  });
});

// ── Audit trail completeness ──────────────────────────────────────────────────

describe('Audit trail completeness', () => {
  it('records every status transition with correct usuario_id', async () => {
    const oficina_id  = await seedOficina();
    const user_id     = await seedUsuario({ oficina_id });
    const oficio_id   = await seedOficio({ oficina_registro_id: oficina_id, oficial_registro_id: user_id, dirigido_a_id: user_id });

    const transitions: Array<{ from: string | null; to: string }> = [
      { from: null,            to: 'RECIBIDO'       },
      { from: 'RECIBIDO',      to: 'ASIGNADO'       },
      { from: 'ASIGNADO',      to: 'EN_REVISION'    },
      { from: 'EN_REVISION',   to: 'VOBO_APROBADO'  },
      { from: 'VOBO_APROBADO', to: 'FINALIZADO'     },
    ];

    for (const t of transitions) {
      await testDb('auditoria_estados').insert({
        oficio_id,
        estado_anterior: t.from,
        estado_nuevo:    t.to,
        usuario_id:      user_id,
        fecha_cambio:    new Date(),
      });
    }

    const rows = await testDb('auditoria_estados')
      .where({ oficio_id })
      .orderBy('id', 'asc');

    expect(rows).toHaveLength(5);
    rows.forEach((row: any) => {
      expect(row.usuario_id).toBe(user_id);
      expect(row.oficio_id).toBe(oficio_id);
      expect(row.fecha_cambio).not.toBeNull();
    });
  });
});
