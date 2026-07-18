/**
 * Database connection
 * File: src/db.ts
 */
import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/oficialia_partes',
  pool: { min: 2, max: 10 },
});
