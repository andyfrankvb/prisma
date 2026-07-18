-- Migration: add SUPERADMIN role and activo column to usuarios
-- File: src/notifications/migrations/add_superadmin.sql

-- 1. Add activo column (soft-delete / disable)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Add SUPERADMIN to the rol_usuario enum
-- PostgreSQL requires ALTER TYPE outside a transaction for enum changes
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'SUPERADMIN';

-- 3. All existing users remain active
UPDATE usuarios SET activo = TRUE WHERE activo IS NULL;
