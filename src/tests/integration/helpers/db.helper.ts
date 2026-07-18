/**
 * Integration test DB helper
 * File: src/tests/integration/helpers/db.helper.ts
 *
 * Manages a real PostgreSQL connection for integration tests.
 * Uses a dedicated test database (TEST_DATABASE_URL env var).
 *
 * Each test suite calls:
 *   setupTestDb()   → in beforeAll
 *   teardownTestDb() → in afterAll
 *   cleanTables()   → in beforeEach (truncate in dependency order)
 */

import knex, { Knex } from 'knex';
import bcrypt          from 'bcrypt';

export let testDb: Knex;

export async function setupTestDb(): Promise<void> {
  testDb = knex({
    client:     'pg',
    connection: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/oficialia_test',
    pool:       { min: 1, max: 5 },
  });

  // Verify connection
  await testDb.raw('SELECT 1');
}

export async function teardownTestDb(): Promise<void> {
  await testDb?.destroy();
}

/** Truncate all module tables in reverse FK order */
export async function cleanTables(): Promise<void> {
  await testDb.raw(`
    TRUNCATE TABLE
      auditoria_estados,
      gestiones_contestacion,
      asignaciones_juridicas,
      notificaciones,
      oficios,
      usuarios,
      catalogo_oficinas
    RESTART IDENTITY CASCADE
  `);
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

export async function seedOficina(overrides: Partial<{
  nombre: string; activo: boolean;
}> = {}): Promise<number> {
  const [row] = await testDb('catalogo_oficinas')
    .insert({ nombre: 'Chetumal', activo: true, ...overrides })
    .returning('id');
  return row.id;
}

export async function seedUsuario(overrides: Partial<{
  nombre: string; email: string; password_hash: string;
  rol: string; oficina_id: number;
}> = {}): Promise<number> {
  const hash = await bcrypt.hash('password123', 4); // low rounds for speed
  const [row] = await testDb('usuarios')
    .insert({
      nombre:        'Test User',
      email:         `user_${Date.now()}@test.mx`,
      password_hash: hash,
      rol:           'OFICIAL',
      oficina_id:    1,
      ...overrides,
    })
    .returning('id');
  return row.id;
}

export async function seedOficio(overrides: Partial<{
  folio: string; remitente: string; dependencia_origen: string;
  dirigido_a_id: number; oficial_registro_id: number;
  oficina_registro_id: number; descripcion_solicitud: string;
  tiene_termino: boolean; fecha_vencimiento: string | null;
  pdf_original_path: string; estatus: string;
}> = {}): Promise<number> {
  const [row] = await testDb('oficios')
    .insert({
      folio:                 `OF-TEST-${Date.now()}`,
      remitente:             'Remitente Test',
      dependencia_origen:    'Dependencia Test',
      dirigido_a_id:         overrides.dirigido_a_id ?? 1,
      oficial_registro_id:   overrides.oficial_registro_id ?? 1,
      oficina_registro_id:   overrides.oficina_registro_id ?? 1,
      fecha_registro:        new Date(),
      descripcion_solicitud: 'Descripción de prueba',
      tiene_termino:         false,
      fecha_vencimiento:     null,
      pdf_original_path:     '/test/oficio.pdf',
      estatus:               'RECIBIDO',
      ...overrides,
    })
    .returning('id');
  return row.id;
}
