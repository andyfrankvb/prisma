-- PostgreSQL init: load application schema
-- File: infra/postgres/init/02_schema.sql
--
-- El schema principal está en 00_schema.sql.
-- Este archivo carga tablas adicionales en el orden correcto.

\i /docker-entrypoint-initdb.d/create_notificaciones.sql
\i /docker-entrypoint-initdb.d/04_modulos_supervision.sql
