-- =============================================================
-- MIGRACIÓN: SEGUIMIENTO DE TRÁMITES — Actualización de schema
-- Script: 07_tramites_migration.sql
-- Aplica cambios incrementales a una BD existente (no recrea tablas)
-- =============================================================

-- 1. Agregar nuevos valores al enum estatus_tramite
ALTER TYPE estatus_tramite ADD VALUE IF NOT EXISTS 'DEVUELTO_DELEGADO';
ALTER TYPE estatus_tramite ADD VALUE IF NOT EXISTS 'DEVUELTO_JURIDICO';

-- 2. Agregar columnas nuevas a la tabla tramites
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS numero_ticket           VARCHAR(100);
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS nombre_solicitante      VARCHAR(255);
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS correo_solicitante      VARCHAR(255);
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS telefono_solicitante    VARCHAR(50);
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS checklist_documentacion BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS checklist_proyecto      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS fecha_registro          TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tramites ADD COLUMN IF NOT EXISTS fecha_cierre            TIMESTAMPTZ NULL;

-- 3. Agregar columna comentario a auditoria_tramites
ALTER TABLE auditoria_tramites ADD COLUMN IF NOT EXISTS comentario TEXT NULL;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
