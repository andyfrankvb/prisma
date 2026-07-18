-- PostgreSQL init: extensions and performance settings
-- File: infra/postgres/init/01_extensions.sql
-- Runs automatically on first container start.

-- Useful extensions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- query performance monitoring
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";            -- UUID generation if needed

-- Timezone
SET timezone = 'America/Cancun';
