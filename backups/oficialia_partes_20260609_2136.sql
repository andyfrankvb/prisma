--
-- PostgreSQL database dump
--

\restrict rD5dSezCzuNzwb2vEEn4MGy0fkfGIUPVLAts79xg45rNd9yslH1o16i6Pn43KqL

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.usuarios DROP CONSTRAINT IF EXISTS usuarios_oficina_id_fkey;
ALTER TABLE IF EXISTS ONLY public.usuario_modulos DROP CONSTRAINT IF EXISTS usuario_modulos_usuario_id_fkey;
ALTER TABLE IF EXISTS ONLY public.usuario_modulos DROP CONSTRAINT IF EXISTS usuario_modulos_modulo_id_fkey;
ALTER TABLE IF EXISTS ONLY public.usuario_modulos DROP CONSTRAINT IF EXISTS usuario_modulos_asignado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tramites DROP CONSTRAINT IF EXISTS tramites_unidad_creadora_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tramites DROP CONSTRAINT IF EXISTS tramites_creado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tramite_documentos DROP CONSTRAINT IF EXISTS tramite_documentos_tramite_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tramite_documentos DROP CONSTRAINT IF EXISTS tramite_documentos_subido_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tareas_evento DROP CONSTRAINT IF EXISTS tareas_evento_reasignado_a_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tareas_evento DROP CONSTRAINT IF EXISTS tareas_evento_evento_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tareas_evento DROP CONSTRAINT IF EXISTS tareas_evento_asignado_a_id_fkey;
ALTER TABLE IF EXISTS ONLY public.oficios DROP CONSTRAINT IF EXISTS oficios_oficina_registro_id_fkey;
ALTER TABLE IF EXISTS ONLY public.oficios DROP CONSTRAINT IF EXISTS oficios_oficial_registro_id_fkey;
ALTER TABLE IF EXISTS ONLY public.oficios DROP CONSTRAINT IF EXISTS oficios_dirigido_a_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tramite_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tarea_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_oficio_id_fkey;
ALTER TABLE IF EXISTS ONLY public.historial_revision_tarea DROP CONSTRAINT IF EXISTS historial_revision_tarea_tarea_id_fkey;
ALTER TABLE IF EXISTS ONLY public.historial_revision_tarea DROP CONSTRAINT IF EXISTS historial_revision_tarea_autor_id_fkey;
ALTER TABLE IF EXISTS ONLY public.gestiones_contestacion DROP CONSTRAINT IF EXISTS gestiones_contestacion_subido_por_secretaria_id_fkey;
ALTER TABLE IF EXISTS ONLY public.gestiones_contestacion DROP CONSTRAINT IF EXISTS gestiones_contestacion_oficio_id_fkey;
ALTER TABLE IF EXISTS ONLY public.eventos DROP CONSTRAINT IF EXISTS eventos_responsable_id_fkey;
ALTER TABLE IF EXISTS ONLY public.eventos DROP CONSTRAINT IF EXISTS eventos_creado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.evento_directores DROP CONSTRAINT IF EXISTS evento_directores_evento_id_fkey;
ALTER TABLE IF EXISTS ONLY public.evento_directores DROP CONSTRAINT IF EXISTS evento_directores_director_id_fkey;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS configuracion_flujos_usuario_id_fkey;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS configuracion_flujos_unidad_id_fkey;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS configuracion_flujos_modulo_clave_fkey;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS configuracion_flujos_actualizado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tramite DROP CONSTRAINT IF EXISTS comentarios_tramite_tramite_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tramite DROP CONSTRAINT IF EXISTS comentarios_tramite_autor_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tarea DROP CONSTRAINT IF EXISTS comentarios_tarea_tarea_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tarea DROP CONSTRAINT IF EXISTS comentarios_tarea_autor_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_reconsideracion DROP CONSTRAINT IF EXISTS comentarios_reconsideracion_oficio_id_fkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_reconsideracion DROP CONSTRAINT IF EXISTS comentarios_reconsideracion_encargado_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_tramites DROP CONSTRAINT IF EXISTS auditoria_tramites_usuario_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_tramites DROP CONSTRAINT IF EXISTS auditoria_tramites_tramite_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_estados DROP CONSTRAINT IF EXISTS auditoria_estados_usuario_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_estados DROP CONSTRAINT IF EXISTS auditoria_estados_oficio_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_configuracion_flujos DROP CONSTRAINT IF EXISTS auditoria_configuracion_flujos_usuario_id_nuevo_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_configuracion_flujos DROP CONSTRAINT IF EXISTS auditoria_configuracion_flujos_usuario_id_anterior_fkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_configuracion_flujos DROP CONSTRAINT IF EXISTS auditoria_configuracion_flujos_actualizado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.asignaciones_juridicas DROP CONSTRAINT IF EXISTS asignaciones_juridicas_oficio_id_fkey;
ALTER TABLE IF EXISTS ONLY public.asignaciones_juridicas DROP CONSTRAINT IF EXISTS asignaciones_juridicas_asignado_por_id_fkey;
ALTER TABLE IF EXISTS ONLY public.asignaciones_juridicas DROP CONSTRAINT IF EXISTS asignaciones_juridicas_abogado_id_fkey;
DROP INDEX IF EXISTS public.idx_usuario_modulos_usuario;
DROP INDEX IF EXISTS public.idx_usuario_modulos_modulo;
DROP INDEX IF EXISTS public.idx_tramites_unidad_creadora;
DROP INDEX IF EXISTS public.idx_tramites_folio;
DROP INDEX IF EXISTS public.idx_tramites_fecha_creacion;
DROP INDEX IF EXISTS public.idx_tramites_fecha_compromiso;
DROP INDEX IF EXISTS public.idx_tramites_estatus;
DROP INDEX IF EXISTS public.idx_tramite_docs_tramite;
DROP INDEX IF EXISTS public.idx_tareas_evento_reasignado;
DROP INDEX IF EXISTS public.idx_tareas_evento_fecha_prog;
DROP INDEX IF EXISTS public.idx_tareas_evento_fecha_comp;
DROP INDEX IF EXISTS public.idx_tareas_evento_evento;
DROP INDEX IF EXISTS public.idx_tareas_evento_estado;
DROP INDEX IF EXISTS public.idx_tareas_evento_asignado;
DROP INDEX IF EXISTS public.idx_oficios_ocr_procesado;
DROP INDEX IF EXISTS public.idx_oficios_folio;
DROP INDEX IF EXISTS public.idx_oficios_fecha_vencimiento;
DROP INDEX IF EXISTS public.idx_oficios_estatus;
DROP INDEX IF EXISTS public.idx_notificaciones_user_id;
DROP INDEX IF EXISTS public.idx_notificaciones_read;
DROP INDEX IF EXISTS public.idx_notificaciones_created_at;
DROP INDEX IF EXISTS public.idx_modulos_clave;
DROP INDEX IF EXISTS public.idx_modulos_activo;
DROP INDEX IF EXISTS public.idx_historial_rev_tarea;
DROP INDEX IF EXISTS public.idx_historial_rev_fecha;
DROP INDEX IF EXISTS public.idx_historial_rev_autor;
DROP INDEX IF EXISTS public.idx_eventos_responsable;
DROP INDEX IF EXISTS public.idx_eventos_fecha_creacion;
DROP INDEX IF EXISTS public.idx_eventos_estado;
DROP INDEX IF EXISTS public.idx_eventos_creado_por;
DROP INDEX IF EXISTS public.idx_evento_directores_evento;
DROP INDEX IF EXISTS public.idx_evento_directores_director;
DROP INDEX IF EXISTS public.idx_comentarios_tramite_tramite;
DROP INDEX IF EXISTS public.idx_comentarios_tramite_fecha;
DROP INDEX IF EXISTS public.idx_comentarios_tarea_tarea;
DROP INDEX IF EXISTS public.idx_comentarios_tarea_fecha;
DROP INDEX IF EXISTS public.idx_comentarios_tarea_autor;
DROP INDEX IF EXISTS public.idx_comentarios_recons_oficio;
DROP INDEX IF EXISTS public.idx_comentarios_recons_fecha;
DROP INDEX IF EXISTS public.idx_coment_recon_oficio;
DROP INDEX IF EXISTS public.idx_cfg_flujos_usuario_id;
DROP INDEX IF EXISTS public.idx_cfg_flujos_unidad_id;
DROP INDEX IF EXISTS public.idx_cfg_flujos_modulo_clave;
DROP INDEX IF EXISTS public.idx_cfg_flujos_actualizado_en;
DROP INDEX IF EXISTS public.idx_auditoria_tramites_tramite;
DROP INDEX IF EXISTS public.idx_auditoria_tramites_fecha;
DROP INDEX IF EXISTS public.idx_aud_cfg_flujos_modulo_clave;
DROP INDEX IF EXISTS public.idx_aud_cfg_flujos_actualizado_en;
ALTER TABLE IF EXISTS ONLY public.usuarios DROP CONSTRAINT IF EXISTS usuarios_pkey;
ALTER TABLE IF EXISTS ONLY public.usuarios DROP CONSTRAINT IF EXISTS usuarios_email_key;
ALTER TABLE IF EXISTS ONLY public.usuario_modulos DROP CONSTRAINT IF EXISTS usuario_modulos_pkey;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS uq_cfg_flujos_modulo_rol_unidad;
ALTER TABLE IF EXISTS ONLY public.tramites DROP CONSTRAINT IF EXISTS tramites_pkey;
ALTER TABLE IF EXISTS ONLY public.tramites DROP CONSTRAINT IF EXISTS tramites_folio_key;
ALTER TABLE IF EXISTS ONLY public.tramite_documentos DROP CONSTRAINT IF EXISTS tramite_documentos_pkey;
ALTER TABLE IF EXISTS ONLY public.tareas_evento DROP CONSTRAINT IF EXISTS tareas_evento_pkey;
ALTER TABLE IF EXISTS ONLY public.oficios DROP CONSTRAINT IF EXISTS oficios_pkey;
ALTER TABLE IF EXISTS ONLY public.oficios DROP CONSTRAINT IF EXISTS oficios_folio_key;
ALTER TABLE IF EXISTS ONLY public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_pkey;
ALTER TABLE IF EXISTS ONLY public.modulos DROP CONSTRAINT IF EXISTS modulos_pkey;
ALTER TABLE IF EXISTS ONLY public.modulos DROP CONSTRAINT IF EXISTS modulos_clave_key;
ALTER TABLE IF EXISTS ONLY public.historial_revision_tarea DROP CONSTRAINT IF EXISTS historial_revision_tarea_pkey;
ALTER TABLE IF EXISTS ONLY public.gestiones_contestacion DROP CONSTRAINT IF EXISTS gestiones_contestacion_pkey;
ALTER TABLE IF EXISTS ONLY public.eventos DROP CONSTRAINT IF EXISTS eventos_pkey;
ALTER TABLE IF EXISTS ONLY public.evento_directores DROP CONSTRAINT IF EXISTS evento_directores_pkey;
ALTER TABLE IF EXISTS ONLY public.evento_directores DROP CONSTRAINT IF EXISTS evento_directores_evento_id_director_id_key;
ALTER TABLE IF EXISTS ONLY public.configuracion_flujos DROP CONSTRAINT IF EXISTS configuracion_flujos_pkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tramite DROP CONSTRAINT IF EXISTS comentarios_tramite_pkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_tarea DROP CONSTRAINT IF EXISTS comentarios_tarea_pkey;
ALTER TABLE IF EXISTS ONLY public.comentarios_reconsideracion DROP CONSTRAINT IF EXISTS comentarios_reconsideracion_pkey;
ALTER TABLE IF EXISTS ONLY public.catalogo_unidades DROP CONSTRAINT IF EXISTS catalogo_unidades_clave_key;
ALTER TABLE IF EXISTS ONLY public.catalogo_unidades DROP CONSTRAINT IF EXISTS catalogo_oficinas_pkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_tramites DROP CONSTRAINT IF EXISTS auditoria_tramites_pkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_estados DROP CONSTRAINT IF EXISTS auditoria_estados_pkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_configuracion_flujos DROP CONSTRAINT IF EXISTS auditoria_configuracion_flujos_pkey;
ALTER TABLE IF EXISTS ONLY public.asignaciones_juridicas DROP CONSTRAINT IF EXISTS asignaciones_juridicas_pkey;
ALTER TABLE IF EXISTS public.usuarios ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tramites ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tramite_documentos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tareas_evento ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.oficios ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notificaciones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.modulos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.historial_revision_tarea ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.gestiones_contestacion ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.eventos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.evento_directores ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.configuracion_flujos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.comentarios_tramite ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.comentarios_tarea ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.comentarios_reconsideracion ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.catalogo_unidades ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.auditoria_tramites ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.auditoria_estados ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.auditoria_configuracion_flujos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.asignaciones_juridicas ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.usuarios_id_seq;
DROP TABLE IF EXISTS public.usuarios;
DROP TABLE IF EXISTS public.usuario_modulos;
DROP SEQUENCE IF EXISTS public.tramites_id_seq;
DROP TABLE IF EXISTS public.tramites;
DROP SEQUENCE IF EXISTS public.tramite_documentos_id_seq;
DROP TABLE IF EXISTS public.tramite_documentos;
DROP SEQUENCE IF EXISTS public.tareas_evento_id_seq;
DROP TABLE IF EXISTS public.tareas_evento;
DROP SEQUENCE IF EXISTS public.oficios_id_seq;
DROP TABLE IF EXISTS public.oficios;
DROP SEQUENCE IF EXISTS public.notificaciones_id_seq;
DROP TABLE IF EXISTS public.notificaciones;
DROP SEQUENCE IF EXISTS public.modulos_id_seq;
DROP TABLE IF EXISTS public.modulos;
DROP SEQUENCE IF EXISTS public.historial_revision_tarea_id_seq;
DROP TABLE IF EXISTS public.historial_revision_tarea;
DROP SEQUENCE IF EXISTS public.gestiones_contestacion_id_seq;
DROP TABLE IF EXISTS public.gestiones_contestacion;
DROP SEQUENCE IF EXISTS public.eventos_id_seq;
DROP TABLE IF EXISTS public.eventos;
DROP SEQUENCE IF EXISTS public.evento_directores_id_seq;
DROP TABLE IF EXISTS public.evento_directores;
DROP SEQUENCE IF EXISTS public.configuracion_flujos_id_seq;
DROP TABLE IF EXISTS public.configuracion_flujos;
DROP SEQUENCE IF EXISTS public.comentarios_tramite_id_seq;
DROP TABLE IF EXISTS public.comentarios_tramite;
DROP SEQUENCE IF EXISTS public.comentarios_tarea_id_seq;
DROP TABLE IF EXISTS public.comentarios_tarea;
DROP SEQUENCE IF EXISTS public.comentarios_reconsideracion_id_seq;
DROP TABLE IF EXISTS public.comentarios_reconsideracion;
DROP SEQUENCE IF EXISTS public.catalogo_oficinas_id_seq;
DROP TABLE IF EXISTS public.catalogo_unidades;
DROP SEQUENCE IF EXISTS public.auditoria_tramites_id_seq;
DROP TABLE IF EXISTS public.auditoria_tramites;
DROP SEQUENCE IF EXISTS public.auditoria_estados_id_seq;
DROP TABLE IF EXISTS public.auditoria_estados;
DROP SEQUENCE IF EXISTS public.auditoria_configuracion_flujos_id_seq;
DROP TABLE IF EXISTS public.auditoria_configuracion_flujos;
DROP SEQUENCE IF EXISTS public.asignaciones_juridicas_id_seq;
DROP TABLE IF EXISTS public.asignaciones_juridicas;
DROP TYPE IF EXISTS public.tipo_unidad;
DROP TYPE IF EXISTS public.rol_usuario;
DROP TYPE IF EXISTS public.estatus_tramite;
DROP TYPE IF EXISTS public.estatus_oficio;
DROP TYPE IF EXISTS public.estado_tarea;
DROP TYPE IF EXISTS public.estado_evento;
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pg_stat_statements;
--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: estado_evento; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.estado_evento AS ENUM (
    'ABIERTO',
    'CERRADO'
);


ALTER TYPE public.estado_evento OWNER TO postgres;

--
-- Name: estado_tarea; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.estado_tarea AS ENUM (
    'PENDIENTE',
    'EN_PROGRESO',
    'COMPLETADA',
    'EN_REVISION',
    'EN_REVISION_DG',
    'FINALIZADO',
    'DEVUELTO'
);


ALTER TYPE public.estado_tarea OWNER TO postgres;

--
-- Name: estatus_oficio; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.estatus_oficio AS ENUM (
    'RECIBIDO',
    'ASIGNADO',
    'EN_REVISION',
    'EN_RECONSIDERACION',
    'VOBO_APROBADO',
    'FINALIZADO'
);


ALTER TYPE public.estatus_oficio OWNER TO postgres;

--
-- Name: estatus_tramite; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.estatus_tramite AS ENUM (
    'NUEVO',
    'EN_REVISION',
    'EN_PROCESO',
    'FINALIZADO',
    'RECHAZADO',
    'DEVUELTO_DELEGADO',
    'DEVUELTO_JURIDICO'
);


ALTER TYPE public.estatus_tramite OWNER TO postgres;

--
-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rol_usuario AS ENUM (
    'OFICIAL',
    'ENCARGADO',
    'JURIDICO',
    'SECRETARIA',
    'DIRECTOR',
    'SUPERADMIN',
    'OPERATIVO',
    'PARTICULAR'
);


ALTER TYPE public.rol_usuario OWNER TO postgres;

--
-- Name: tipo_unidad; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tipo_unidad AS ENUM (
    'DIRECCION_GENERAL',
    'DIRECCION',
    'DELEGACION'
);


ALTER TYPE public.tipo_unidad OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: asignaciones_juridicas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asignaciones_juridicas (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    abogado_id integer NOT NULL,
    asignado_por_id integer NOT NULL,
    fecha_asignacion timestamp without time zone DEFAULT now() NOT NULL,
    observaciones text
);


ALTER TABLE public.asignaciones_juridicas OWNER TO postgres;

--
-- Name: asignaciones_juridicas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.asignaciones_juridicas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.asignaciones_juridicas_id_seq OWNER TO postgres;

--
-- Name: asignaciones_juridicas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.asignaciones_juridicas_id_seq OWNED BY public.asignaciones_juridicas.id;


--
-- Name: auditoria_configuracion_flujos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auditoria_configuracion_flujos (
    id integer NOT NULL,
    modulo_clave character varying(100) NOT NULL,
    rol_flujo character varying(100) NOT NULL,
    usuario_id_anterior integer,
    usuario_id_nuevo integer NOT NULL,
    actualizado_por_id integer NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auditoria_configuracion_flujos OWNER TO postgres;

--
-- Name: auditoria_configuracion_flujos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.auditoria_configuracion_flujos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.auditoria_configuracion_flujos_id_seq OWNER TO postgres;

--
-- Name: auditoria_configuracion_flujos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.auditoria_configuracion_flujos_id_seq OWNED BY public.auditoria_configuracion_flujos.id;


--
-- Name: auditoria_estados; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auditoria_estados (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    estado_anterior public.estatus_oficio,
    estado_nuevo public.estatus_oficio NOT NULL,
    usuario_id integer NOT NULL,
    fecha_cambio timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auditoria_estados OWNER TO postgres;

--
-- Name: auditoria_estados_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.auditoria_estados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.auditoria_estados_id_seq OWNER TO postgres;

--
-- Name: auditoria_estados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.auditoria_estados_id_seq OWNED BY public.auditoria_estados.id;


--
-- Name: auditoria_tramites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auditoria_tramites (
    id integer NOT NULL,
    tramite_id integer NOT NULL,
    estado_anterior public.estatus_tramite,
    estado_nuevo public.estatus_tramite NOT NULL,
    usuario_id integer NOT NULL,
    fecha_cambio timestamp without time zone DEFAULT now() NOT NULL,
    comentario text
);


ALTER TABLE public.auditoria_tramites OWNER TO postgres;

--
-- Name: auditoria_tramites_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.auditoria_tramites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.auditoria_tramites_id_seq OWNER TO postgres;

--
-- Name: auditoria_tramites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.auditoria_tramites_id_seq OWNED BY public.auditoria_tramites.id;


--
-- Name: catalogo_unidades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.catalogo_unidades (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    tipo public.tipo_unidad DEFAULT 'DELEGACION'::public.tipo_unidad NOT NULL,
    clave character varying(50)
);


ALTER TABLE public.catalogo_unidades OWNER TO postgres;

--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.catalogo_oficinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.catalogo_oficinas_id_seq OWNER TO postgres;

--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.catalogo_oficinas_id_seq OWNED BY public.catalogo_unidades.id;


--
-- Name: comentarios_reconsideracion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comentarios_reconsideracion (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    encargado_id integer NOT NULL,
    comentario text NOT NULL,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    resuelto boolean DEFAULT false NOT NULL
);


ALTER TABLE public.comentarios_reconsideracion OWNER TO postgres;

--
-- Name: comentarios_reconsideracion_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.comentarios_reconsideracion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.comentarios_reconsideracion_id_seq OWNER TO postgres;

--
-- Name: comentarios_reconsideracion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.comentarios_reconsideracion_id_seq OWNED BY public.comentarios_reconsideracion.id;


--
-- Name: comentarios_tarea; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comentarios_tarea (
    id integer NOT NULL,
    tarea_id integer NOT NULL,
    autor_id integer NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comentarios_tarea OWNER TO postgres;

--
-- Name: comentarios_tarea_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.comentarios_tarea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.comentarios_tarea_id_seq OWNER TO postgres;

--
-- Name: comentarios_tarea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.comentarios_tarea_id_seq OWNED BY public.comentarios_tarea.id;


--
-- Name: comentarios_tramite; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comentarios_tramite (
    id integer NOT NULL,
    tramite_id integer NOT NULL,
    autor_id integer NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comentarios_tramite OWNER TO postgres;

--
-- Name: comentarios_tramite_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.comentarios_tramite_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.comentarios_tramite_id_seq OWNER TO postgres;

--
-- Name: comentarios_tramite_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.comentarios_tramite_id_seq OWNED BY public.comentarios_tramite.id;


--
-- Name: configuracion_flujos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.configuracion_flujos (
    id integer NOT NULL,
    modulo_clave character varying(100) NOT NULL,
    rol_flujo character varying(100) NOT NULL,
    usuario_id integer NOT NULL,
    actualizado_por_id integer NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    unidad_id integer
);


ALTER TABLE public.configuracion_flujos OWNER TO postgres;

--
-- Name: configuracion_flujos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.configuracion_flujos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.configuracion_flujos_id_seq OWNER TO postgres;

--
-- Name: configuracion_flujos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.configuracion_flujos_id_seq OWNED BY public.configuracion_flujos.id;


--
-- Name: evento_directores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.evento_directores (
    id integer NOT NULL,
    evento_id integer NOT NULL,
    director_id integer NOT NULL,
    agregado_en timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.evento_directores OWNER TO postgres;

--
-- Name: evento_directores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.evento_directores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.evento_directores_id_seq OWNER TO postgres;

--
-- Name: evento_directores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.evento_directores_id_seq OWNED BY public.evento_directores.id;


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.eventos (
    id integer NOT NULL,
    titulo character varying(255) NOT NULL,
    descripcion text,
    estado public.estado_evento DEFAULT 'ABIERTO'::public.estado_evento NOT NULL,
    creado_por_id integer NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_cierre timestamp without time zone,
    fecha_programada date,
    responsable_id integer
);


ALTER TABLE public.eventos OWNER TO postgres;

--
-- Name: eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.eventos_id_seq OWNER TO postgres;

--
-- Name: eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.eventos_id_seq OWNED BY public.eventos.id;


--
-- Name: gestiones_contestacion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gestiones_contestacion (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    proyecto_url character varying(500) NOT NULL,
    escaneo_firmado_url character varying(500),
    vobo_encargado boolean DEFAULT false NOT NULL,
    fecha_vobo timestamp without time zone,
    subido_por_secretaria_id integer,
    version_proyecto integer DEFAULT 1 NOT NULL,
    texto_proyecto text
);


ALTER TABLE public.gestiones_contestacion OWNER TO postgres;

--
-- Name: gestiones_contestacion_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gestiones_contestacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.gestiones_contestacion_id_seq OWNER TO postgres;

--
-- Name: gestiones_contestacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gestiones_contestacion_id_seq OWNED BY public.gestiones_contestacion.id;


--
-- Name: historial_revision_tarea; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.historial_revision_tarea (
    id integer NOT NULL,
    tarea_id integer NOT NULL,
    autor_id integer NOT NULL,
    tipo character varying(20) NOT NULL,
    contenido text,
    documento_url text,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    nivel_revision integer DEFAULT 1 NOT NULL,
    CONSTRAINT historial_revision_tarea_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['AVANCE'::character varying, 'DEVOLUCION'::character varying, 'APROBACION_N1'::character varying, 'APROBACION_N2'::character varying])::text[])))
);


ALTER TABLE public.historial_revision_tarea OWNER TO postgres;

--
-- Name: historial_revision_tarea_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.historial_revision_tarea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.historial_revision_tarea_id_seq OWNER TO postgres;

--
-- Name: historial_revision_tarea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.historial_revision_tarea_id_seq OWNED BY public.historial_revision_tarea.id;


--
-- Name: modulos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.modulos (
    id integer NOT NULL,
    clave character varying(100) NOT NULL,
    nombre_display character varying(150) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.modulos OWNER TO postgres;

--
-- Name: modulos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.modulos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.modulos_id_seq OWNER TO postgres;

--
-- Name: modulos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.modulos_id_seq OWNED BY public.modulos.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notificaciones (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    body text NOT NULL,
    oficio_id integer,
    folio character varying(100),
    read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    tarea_id integer,
    evento_titulo character varying(255),
    tramite_id integer
);


ALTER TABLE public.notificaciones OWNER TO postgres;

--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notificaciones_id_seq OWNER TO postgres;

--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notificaciones_id_seq OWNED BY public.notificaciones.id;


--
-- Name: oficios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oficios (
    id integer NOT NULL,
    folio character varying(100) NOT NULL,
    remitente character varying(255) NOT NULL,
    dependencia_origen character varying(255) NOT NULL,
    dirigido_a_id integer NOT NULL,
    oficial_registro_id integer NOT NULL,
    unidad_registro_id integer NOT NULL,
    fecha_registro timestamp without time zone DEFAULT now() NOT NULL,
    descripcion_solicitud text NOT NULL,
    tiene_termino boolean DEFAULT false NOT NULL,
    fecha_vencimiento date,
    pdf_original_path character varying(500) NOT NULL,
    estatus public.estatus_oficio DEFAULT 'RECIBIDO'::public.estatus_oficio NOT NULL,
    texto_ocr text,
    ocr_procesado boolean DEFAULT false NOT NULL,
    ocr_fecha timestamp without time zone,
    ocr_metodo character varying(20)
);


ALTER TABLE public.oficios OWNER TO postgres;

--
-- Name: oficios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.oficios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.oficios_id_seq OWNER TO postgres;

--
-- Name: oficios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.oficios_id_seq OWNED BY public.oficios.id;


--
-- Name: tareas_evento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tareas_evento (
    id integer NOT NULL,
    evento_id integer NOT NULL,
    titulo character varying(255) NOT NULL,
    descripcion text,
    asignado_a_id integer NOT NULL,
    estado public.estado_tarea DEFAULT 'PENDIENTE'::public.estado_tarea NOT NULL,
    fecha_programada date NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT now() NOT NULL,
    reasignado_a_id integer,
    fecha_compromiso date
);


ALTER TABLE public.tareas_evento OWNER TO postgres;

--
-- Name: tareas_evento_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tareas_evento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tareas_evento_id_seq OWNER TO postgres;

--
-- Name: tareas_evento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tareas_evento_id_seq OWNED BY public.tareas_evento.id;


--
-- Name: tramite_documentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tramite_documentos (
    id integer NOT NULL,
    tramite_id integer NOT NULL,
    archivo_url character varying(500) NOT NULL,
    nombre_original character varying(255),
    subido_por_id integer NOT NULL,
    subido_en timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tramite_documentos OWNER TO postgres;

--
-- Name: tramite_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tramite_documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tramite_documentos_id_seq OWNER TO postgres;

--
-- Name: tramite_documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tramite_documentos_id_seq OWNED BY public.tramite_documentos.id;


--
-- Name: tramites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tramites (
    id integer NOT NULL,
    folio character varying(100) NOT NULL,
    titulo character varying(255),
    descripcion text NOT NULL,
    tipo_tramite character varying(100),
    estatus public.estatus_tramite DEFAULT 'NUEVO'::public.estatus_tramite NOT NULL,
    unidad_creadora_id integer NOT NULL,
    creado_por_id integer NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_compromiso date,
    fecha_cierre timestamp without time zone,
    numero_ticket character varying(100),
    nombre_solicitante character varying(255),
    correo_solicitante character varying(255),
    telefono_solicitante character varying(50),
    checklist_documentacion boolean DEFAULT false NOT NULL,
    checklist_proyecto boolean DEFAULT false NOT NULL,
    fecha_registro timestamp with time zone DEFAULT now() NOT NULL,
    comentarios text
);


ALTER TABLE public.tramites OWNER TO postgres;

--
-- Name: tramites_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tramites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tramites_id_seq OWNER TO postgres;

--
-- Name: tramites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tramites_id_seq OWNED BY public.tramites.id;


--
-- Name: usuario_modulos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuario_modulos (
    usuario_id integer NOT NULL,
    modulo_id integer NOT NULL,
    asignado_en timestamp without time zone DEFAULT now() NOT NULL,
    asignado_por_id integer NOT NULL
);


ALTER TABLE public.usuario_modulos OWNER TO postgres;

--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol public.rol_usuario NOT NULL,
    unidad_id integer NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.usuarios_id_seq OWNER TO postgres;

--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: asignaciones_juridicas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_juridicas ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_juridicas_id_seq'::regclass);


--
-- Name: auditoria_configuracion_flujos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos ALTER COLUMN id SET DEFAULT nextval('public.auditoria_configuracion_flujos_id_seq'::regclass);


--
-- Name: auditoria_estados id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_estados ALTER COLUMN id SET DEFAULT nextval('public.auditoria_estados_id_seq'::regclass);


--
-- Name: auditoria_tramites id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_tramites ALTER COLUMN id SET DEFAULT nextval('public.auditoria_tramites_id_seq'::regclass);


--
-- Name: catalogo_unidades id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_unidades ALTER COLUMN id SET DEFAULT nextval('public.catalogo_oficinas_id_seq'::regclass);


--
-- Name: comentarios_reconsideracion id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_reconsideracion ALTER COLUMN id SET DEFAULT nextval('public.comentarios_reconsideracion_id_seq'::regclass);


--
-- Name: comentarios_tarea id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tarea ALTER COLUMN id SET DEFAULT nextval('public.comentarios_tarea_id_seq'::regclass);


--
-- Name: comentarios_tramite id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tramite ALTER COLUMN id SET DEFAULT nextval('public.comentarios_tramite_id_seq'::regclass);


--
-- Name: configuracion_flujos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos ALTER COLUMN id SET DEFAULT nextval('public.configuracion_flujos_id_seq'::regclass);


--
-- Name: evento_directores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evento_directores ALTER COLUMN id SET DEFAULT nextval('public.evento_directores_id_seq'::regclass);


--
-- Name: eventos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.eventos ALTER COLUMN id SET DEFAULT nextval('public.eventos_id_seq'::regclass);


--
-- Name: gestiones_contestacion id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gestiones_contestacion ALTER COLUMN id SET DEFAULT nextval('public.gestiones_contestacion_id_seq'::regclass);


--
-- Name: historial_revision_tarea id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_revision_tarea ALTER COLUMN id SET DEFAULT nextval('public.historial_revision_tarea_id_seq'::regclass);


--
-- Name: modulos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modulos ALTER COLUMN id SET DEFAULT nextval('public.modulos_id_seq'::regclass);


--
-- Name: notificaciones id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_id_seq'::regclass);


--
-- Name: oficios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios ALTER COLUMN id SET DEFAULT nextval('public.oficios_id_seq'::regclass);


--
-- Name: tareas_evento id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tareas_evento ALTER COLUMN id SET DEFAULT nextval('public.tareas_evento_id_seq'::regclass);


--
-- Name: tramite_documentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramite_documentos ALTER COLUMN id SET DEFAULT nextval('public.tramite_documentos_id_seq'::regclass);


--
-- Name: tramites id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramites ALTER COLUMN id SET DEFAULT nextval('public.tramites_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Data for Name: asignaciones_juridicas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.asignaciones_juridicas (id, oficio_id, abogado_id, asignado_por_id, fecha_asignacion, observaciones) FROM stdin;
1	2	54	53	2026-05-07 14:27:09.948	j
2	1	56	53	2026-05-07 14:27:55.039	\N
4	1	54	53	2026-06-01 09:16:56.759	carga de trabajo
5	2	55	53	2026-06-01 14:26:32.799	carga
6	2	56	53	2026-06-01 15:26:10.255	carga
7	1	55	53	2026-06-01 15:51:40.678	carga
8	2	55	53	2026-06-04 12:13:18.684	carga de trabajo
9	4	55	53	2026-06-09 16:02:49.827	\N
10	5	54	53	2026-06-09 18:22:52.881	\N
11	6	55	53	2026-06-09 21:18:00.471	d
12	7	54	53	2026-06-09 21:22:14.033	e
\.


--
-- Data for Name: auditoria_configuracion_flujos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auditoria_configuracion_flujos (id, modulo_clave, rol_flujo, usuario_id_anterior, usuario_id_nuevo, actualizado_por_id, actualizado_en) FROM stdin;
18	tramites_seguimiento	FINALIZADOR	52	35	9	2026-05-07 21:52:40.528+00
21	oficialia_partes	OFICIAL	\N	62	9	2026-06-10 02:20:27.889+00
\.


--
-- Data for Name: auditoria_estados; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auditoria_estados (id, oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio) FROM stdin;
1	1	\N	RECIBIDO	55	2026-05-07 09:46:50.071
2	2	\N	RECIBIDO	65	2026-05-07 10:24:36.024
3	2	RECIBIDO	ASIGNADO	53	2026-05-07 14:27:09.951
4	1	RECIBIDO	ASIGNADO	53	2026-05-07 14:27:55.04
5	1	ASIGNADO	ASIGNADO	53	2026-06-01 09:16:56.767
6	2	ASIGNADO	EN_REVISION	54	2026-06-01 13:45:18.053
7	2	EN_REVISION	ASIGNADO	53	2026-06-01 14:26:32.803
8	2	ASIGNADO	ASIGNADO	53	2026-06-01 15:26:10.256
9	1	ASIGNADO	ASIGNADO	53	2026-06-01 15:51:40.683
10	1	ASIGNADO	EN_REVISION	55	2026-06-01 15:53:49.912
11	1	EN_REVISION	EN_RECONSIDERACION	53	2026-06-01 16:29:48.867
12	1	EN_RECONSIDERACION	EN_REVISION	55	2026-06-01 16:35:09.334
13	1	EN_REVISION	VOBO_APROBADO	53	2026-06-01 16:35:23.792
14	1	VOBO_APROBADO	FINALIZADO	35	2026-06-01 16:45:46.318
15	2	ASIGNADO	ASIGNADO	53	2026-06-04 12:13:18.691
16	2	ASIGNADO	EN_REVISION	55	2026-06-04 12:13:42.2
17	2	EN_REVISION	EN_RECONSIDERACION	53	2026-06-04 12:14:13.355
18	2	EN_RECONSIDERACION	EN_REVISION	55	2026-06-04 12:16:34.602
19	2	EN_REVISION	VOBO_APROBADO	53	2026-06-04 12:17:09.431
20	2	VOBO_APROBADO	FINALIZADO	35	2026-06-04 12:17:50.438
21	3	\N	RECIBIDO	65	2026-06-05 15:53:50.058
22	4	\N	RECIBIDO	65	2026-06-09 16:02:10.407
23	4	RECIBIDO	ASIGNADO	53	2026-06-09 16:02:49.833
24	5	\N	RECIBIDO	65	2026-06-09 18:20:36.511
25	5	RECIBIDO	ASIGNADO	53	2026-06-09 18:22:52.882
26	5	ASIGNADO	EN_REVISION	54	2026-06-09 18:23:24.629
27	5	EN_REVISION	VOBO_APROBADO	53	2026-06-09 18:23:53.277
28	5	VOBO_APROBADO	FINALIZADO	35	2026-06-09 18:24:34.849
29	6	\N	RECIBIDO	65	2026-06-09 21:17:25.089
30	6	RECIBIDO	ASIGNADO	53	2026-06-09 21:18:00.476
31	6	ASIGNADO	EN_REVISION	55	2026-06-09 21:18:32.017
32	6	EN_REVISION	VOBO_APROBADO	53	2026-06-09 21:19:04.376
33	6	VOBO_APROBADO	FINALIZADO	35	2026-06-09 21:19:33.715
34	7	\N	RECIBIDO	62	2026-06-09 21:21:47.828
35	7	RECIBIDO	ASIGNADO	53	2026-06-09 21:22:14.034
\.


--
-- Data for Name: auditoria_tramites; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auditoria_tramites (id, tramite_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio, comentario) FROM stdin;
1	1	\N	NUEVO	70	2026-05-05 08:39:13.024	\N
2	2	\N	NUEVO	70	2026-05-05 08:42:29.753	\N
3	2	NUEVO	EN_REVISION	53	2026-05-05 08:42:54.44	\N
4	2	EN_REVISION	EN_PROCESO	53	2026-05-05 08:54:26.341	ddddddd
5	3	\N	NUEVO	67	2026-05-05 16:28:43.161	\N
6	3	NUEVO	EN_REVISION	53	2026-05-05 17:45:23.854	\N
7	3	EN_REVISION	DEVUELTO_DELEGADO	53	2026-05-05 17:45:39.618	falta documentacion
8	4	\N	NUEVO	67	2026-05-06 11:00:10.713	\N
9	4	NUEVO	EN_REVISION	53	2026-05-06 11:02:34.703	\N
10	4	EN_REVISION	EN_PROCESO	53	2026-05-06 11:09:48.464	listo
11	1	NUEVO	EN_REVISION	53	2026-05-06 11:10:26.834	\N
12	4	EN_PROCESO	FINALIZADO	52	2026-05-06 11:12:24.998	hhhhh
13	5	\N	NUEVO	70	2026-05-12 21:12:01.741	\N
14	5	NUEVO	EN_REVISION	53	2026-05-12 21:12:19.484	\N
15	5	EN_REVISION	EN_PROCESO	53	2026-05-12 21:17:07.399	ffff
16	5	EN_PROCESO	FINALIZADO	52	2026-05-12 21:17:25.853	ddddd
17	2	EN_PROCESO	DEVUELTO_JURIDICO	52	2026-06-02 11:21:37.477	ddd
18	2	DEVUELTO_JURIDICO	EN_PROCESO	53	2026-06-02 14:54:12.169	ddddddd
19	1	EN_REVISION	EN_PROCESO	53	2026-06-02 14:58:11.165	hhhhhhh
20	3	DEVUELTO_DELEGADO	NUEVO	67	2026-06-02 15:41:58.408	\N
21	2	EN_PROCESO	DEVUELTO_JURIDICO	52	2026-06-02 15:43:34.635	fffffff
22	1	EN_PROCESO	FINALIZADO	52	2026-06-02 15:46:39.971	jjjjjjj
23	3	NUEVO	EN_REVISION	53	2026-06-04 12:59:16.703	\N
24	3	EN_REVISION	EN_PROCESO	53	2026-06-04 12:59:24.402	h
25	3	EN_PROCESO	FINALIZADO	52	2026-06-04 13:00:41.611	el folio creado es 879847
42	2	DEVUELTO_JURIDICO	EN_PROCESO	53	2026-06-09 17:29:13.705	e
43	10	\N	NUEVO	70	2026-06-09 21:02:26.267	\N
44	10	NUEVO	EN_REVISION	53	2026-06-09 21:02:53.011	\N
45	10	EN_REVISION	EN_PROCESO	53	2026-06-09 21:03:42.492	d
46	11	\N	NUEVO	70	2026-06-09 21:05:14.843	\N
65	11	NUEVO	EN_REVISION	53	2026-06-09 21:10:22.174	\N
66	11	EN_REVISION	EN_PROCESO	53	2026-06-09 21:10:22.176	e
67	11	EN_PROCESO	FINALIZADO	52	2026-06-09 21:10:35.255	e
68	10	EN_PROCESO	DEVUELTO_JURIDICO	52	2026-06-09 21:10:37.639	e
69	10	DEVUELTO_JURIDICO	EN_PROCESO	53	2026-06-09 21:10:48.889	e
\.


--
-- Data for Name: catalogo_unidades; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.catalogo_unidades (id, nombre, activo, tipo, clave) FROM stdin;
34	Dirección General	t	DIRECCION_GENERAL	dir_general
35	Dirección de Innovación, Informática y Archivo	t	DIRECCION	dir_tics
36	Dirección Jurídica	t	DIRECCION	dir_juridica
37	Delegación Othón P. Blanco	t	DELEGACION	del_opb
39	Delegación Playa del Carmen	t	DELEGACION	del_playa
40	Delegación Cozumel	t	DELEGACION	del_cozumel
41	Dirección Administrativa	t	DIRECCION	dir_admin
42	Delegación Benito Juárez	t	DELEGACION	del_cancun
\.


--
-- Data for Name: comentarios_reconsideracion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comentarios_reconsideracion (id, oficio_id, encargado_id, comentario, fecha, version, resuelto) FROM stdin;
4	1	53	falto	2026-06-01 16:29:48.865	1	f
5	2	53	falto....	2026-06-04 12:14:13.349	2	f
\.


--
-- Data for Name: comentarios_tarea; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comentarios_tarea (id, tarea_id, autor_id, contenido, creado_en) FROM stdin;
1	1	45	hfhfhf	2026-06-04 17:32:53.559786
2	27	57	e	2026-06-10 01:15:08.028944
3	27	60	e	2026-06-10 01:15:40.676862
\.


--
-- Data for Name: comentarios_tramite; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comentarios_tramite (id, tramite_id, autor_id, contenido, creado_en) FROM stdin;
1	3	53	falta documentacion	2026-05-05 17:45:39.616
2	4	52	hhhhh	2026-05-06 11:12:24.994
3	5	52	ddddd	2026-05-12 21:17:25.849
4	2	52	ddd	2026-06-02 11:21:37.472
5	2	53	ddddddd	2026-06-02 14:54:12.167
6	2	52	fffffff	2026-06-02 15:43:34.634
7	1	52	jjjjjjj	2026-06-02 15:46:39.968
8	3	52	el folio creado es 879847	2026-06-04 13:00:41.604
14	2	53	e	2026-06-09 17:29:13.705
20	11	52	e	2026-06-09 21:10:35.252
21	10	52	e	2026-06-09 21:10:37.639
22	10	53	e	2026-06-09 21:10:48.889
\.


--
-- Data for Name: configuracion_flujos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.configuracion_flujos (id, modulo_clave, rol_flujo, usuario_id, actualizado_por_id, actualizado_en, unidad_id) FROM stdin;
1	tramites_seguimiento	REVISOR	53	9	2026-05-05 21:34:50.72244+00	\N
2	tramites_seguimiento	FINALIZADOR	52	9	2026-05-07 21:52:40.527+00	\N
44	oficialia_partes	OFICIAL	68	9	2026-05-31 22:25:37.245543+00	\N
45	oficialia_partes	OFICIAL	63	9	2026-05-31 22:25:37.245543+00	\N
46	oficialia_partes	OFICIAL	65	9	2026-05-31 22:25:37.245543+00	\N
47	oficialia_partes	ENCARGADO	53	9	2026-05-31 22:25:37.245543+00	\N
48	oficialia_partes	JURIDICO	54	9	2026-05-31 22:25:37.245543+00	\N
49	oficialia_partes	JURIDICO	55	9	2026-05-31 22:25:37.245543+00	\N
50	oficialia_partes	JURIDICO	56	9	2026-05-31 22:25:37.245543+00	\N
51	oficialia_partes	JURIDICO	38	9	2026-05-31 22:25:37.245543+00	\N
52	oficialia_partes	SECRETARIA	35	9	2026-05-31 22:25:37.245543+00	\N
53	oficialia_partes	DIRECTOR_GENERAL	40	9	2026-05-31 22:25:37.245543+00	\N
55	oficialia_partes	OFICIAL	62	9	2026-06-10 02:20:27.888+00	42
\.


--
-- Data for Name: evento_directores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.evento_directores (id, evento_id, director_id, agregado_en) FROM stdin;
1	1	43	2026-06-03 15:13:39.650675+00
2	1	53	2026-06-03 15:13:39.650675+00
3	1	57	2026-06-03 15:13:39.650675+00
4	2	43	2026-06-04 17:23:56.234506+00
5	2	57	2026-06-04 17:23:56.234506+00
\.


--
-- Data for Name: eventos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.eventos (id, titulo, descripcion, estado, creado_por_id, fecha_creacion, fecha_cierre, fecha_programada, responsable_id) FROM stdin;
1	CEAR presentacion	\N	ABIERTO	40	2026-06-03 15:13:39.648134	\N	2026-06-30	\N
2	Presentacion CEAR V2	evento	ABIERTO	40	2026-06-04 17:23:56.228984	\N	2026-06-30	43
\.


--
-- Data for Name: gestiones_contestacion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gestiones_contestacion (id, oficio_id, proyecto_url, escaneo_firmado_url, vobo_encargado, fecha_vobo, subido_por_secretaria_id, version_proyecto, texto_proyecto) FROM stdin;
2	1	/oficios/proyectos/375f722e-8d6c-4491-a842-09a601b2b37a.pdf	/oficios/firmados/a3985340-da00-41dd-9612-fa8cc09a97cc.pdf	t	2026-06-01 16:35:23.79	35	2	\N
1	2	/oficios/proyectos/c7d83093-3fd9-49c5-87d3-ac53b8a391ee.pdf	/oficios/firmados/fe0f893e-4c6d-43c0-ae56-c250ca9939fe.pdf	t	2026-06-04 12:17:09.43	35	3	\N
3	5	/oficios/proyectos/66648205-588a-4f3f-9c71-a06363909dc9.pdf	/oficios/firmados/d4cbcbde-c93c-401c-a385-16eb2ff2acf1.pdf	t	2026-06-09 18:23:53.275	35	1	\N
4	6	/oficios/proyectos/d1d5c0aa-5020-463f-acf7-03879e509076.pdf	/oficios/firmados/c114cd8c-4f4b-40c2-8728-5ce9866f1dfd.pdf	t	2026-06-09 21:19:04.373	35	1	\N
\.


--
-- Data for Name: historial_revision_tarea; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.historial_revision_tarea (id, tarea_id, autor_id, tipo, contenido, documento_url, creado_en, nivel_revision) FROM stdin;
1	1	45	AVANCE	\N	/eventos/avances/93ab4538-04d6-47ad-8956-850f76aa61db.pdf	2026-06-04 17:33:15.270128	1
2	1	43	DEVOLUCION	la pelta	\N	2026-06-04 17:34:51.962792	1
3	1	45	AVANCE	\N	/eventos/avances/2c3843a3-ced9-4b8c-9be6-0640a4752cbc.pdf	2026-06-04 17:35:15.92769	1
4	1	43	APROBACION_N1	\N	\N	2026-06-04 17:35:41.693293	1
5	1	40	APROBACION_N2	\N	\N	2026-06-08 17:38:45.095987	2
8	7	45	AVANCE	1	\N	2026-06-09 21:37:29.621159	1
9	7	43	APROBACION_N1	\N	\N	2026-06-09 21:38:04.482698	1
10	7	40	APROBACION_N2	\N	\N	2026-06-09 21:38:17.109459	2
11	16	58	AVANCE	\N	/eventos/avances/8d282350-2e8b-4dd6-a3e7-7c13d43d8c2a.pdf	2026-06-10 00:52:56.995607	2
19	16	40	DEVOLUCION	falto	\N	2026-06-10 01:05:56.610797	2
20	16	58	AVANCE	ee	/eventos/avances/5a2ad54d-9740-4608-a7db-4bb411f1d4d0.pdf	2026-06-10 01:07:00.263486	1
21	27	60	AVANCE	e	/eventos/avances/8d93c364-6e5c-46dd-b8b7-4bd73afab17b.pdf	2026-06-10 01:15:57.58357	1
23	27	57	APROBACION_N1	\N	\N	2026-06-10 01:19:57.240327	1
24	27	40	DEVOLUCION	d	\N	2026-06-10 01:20:23.052805	2
31	16	57	DEVOLUCION	i	\N	2026-06-10 01:35:05.540921	1
32	31	60	AVANCE	e	\N	2026-06-10 01:36:55.182742	1
33	31	57	APROBACION_N1	\N	\N	2026-06-10 01:37:07.250508	1
34	31	40	DEVOLUCION	r	\N	2026-06-10 01:37:23.498601	2
35	31	60	AVANCE	j	/eventos/avances/e2337cfb-483d-4a4a-83a4-0d286f8a96b8.pdf	2026-06-10 01:39:28.141173	1
36	31	57	APROBACION_N1	\N	\N	2026-06-10 01:39:41.446711	1
37	31	40	APROBACION_N2	\N	\N	2026-06-10 01:39:50.999516	2
\.


--
-- Data for Name: modulos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.modulos (id, clave, nombre_display, descripcion, activo, orden) FROM stdin;
1	oficialia_partes	Oficialía de Partes	Recepción, registro y seguimiento de oficios oficiales.	t	1
2	supervision_eventos	Supervisión de Eventos	Gestión de eventos operativos y tareas por área.	t	2
34	tramites_seguimiento	Seguimiento de Trámites	Gestión y seguimiento de trámites entre delegaciones y la Dirección Jurídica.	t	3
36	tablero_direccion	Tablero de Dirección	Métricas, supervisión y monitoreo general de Dirección.	t	4
\.


--
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notificaciones (id, user_id, type, title, body, oficio_id, folio, read, created_at, tarea_id, evento_titulo, tramite_id) FROM stdin;
8	67	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 3 fue aprobado. Fecha compromiso: 2026-06-24	\N	3	f	2026-06-04 12:59:24.406	\N	\N	\N
9	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 3 está listo para cierre. Fecha compromiso: 2026-06-24	\N	3	f	2026-06-04 12:59:24.406	\N	\N	\N
10	67	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 3 fue cerrado el 4/6/2026	\N	3	f	2026-06-04 13:00:41.616	\N	\N	\N
3	43	TAREA_EN_REVISION	Avance enviado para revisión	Mariela envió avance en "Invitados y distribucion" (CEAR presentacion)	\N	\N	t	2026-06-04 12:33:15.276	1	CEAR presentacion	\N
5	43	TAREA_EN_REVISION	Avance enviado para revisión	Mariela envió avance en "Invitados y distribucion" (CEAR presentacion)	\N	\N	t	2026-06-04 12:35:15.93	1	CEAR presentacion	\N
1	40	TAREA_ESTADO	Tarea actualizada	Mariela cambió el estado de "Invitados y distribucion" a EN_PROGRESO	\N	\N	t	2026-06-03 10:21:40.117	1	CEAR presentacion	\N
2	40	TAREA_COMENTARIO	Nuevo comentario en tarea	Mariela comentó en "Invitados y distribucion": hfhfhf	\N	\N	t	2026-06-04 12:32:53.564	1	CEAR presentacion	\N
6	40	TAREA_EN_REVISION_DG	Tarea pendiente de aprobación final	Carlos Tah aprobó el avance de "Invitados y distribucion" en el evento "CEAR presentacion". Requiere tu aprobación final.	\N	\N	t	2026-06-04 12:35:41.695	1	CEAR presentacion	\N
11	53	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 3 fue cerrado el 4/6/2026	\N	3	t	2026-06-04 13:00:41.616	\N	\N	\N
16	43	TAREA_EN_REVISION	Avance enviado para revisión	Mariela envió avance en "Letrero CEAR" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 16:37:29.626	7	Presentacion CEAR V2	\N
4	45	TAREA_DEVUELTA	Tarea devuelta para corrección	Carlos Tah devolvió la tarea "Invitados y distribucion": la pelta	\N	\N	t	2026-06-04 12:34:51.967	1	CEAR presentacion	\N
7	45	TAREA_APROBADA_N1	Avance aprobado por el Director	Tu avance en "Invitados y distribucion" fue aprobado por Carlos Tah. Está pendiente de aprobación final de la Directora General.	\N	\N	t	2026-06-04 12:35:41.695	1	CEAR presentacion	\N
12	45	TAREA_COMPLETADA_DG	Actividad finalizada	La Directora General finalizó la actividad "Invitados y distribucion"	\N	\N	t	2026-06-08 12:38:45.102	1	CEAR presentacion	\N
18	45	TAREA_APROBADA_N1	Avance aprobado por el Director	Tu avance en "Letrero CEAR" fue aprobado por Carlos Tah. Está pendiente de aprobación final de la Directora General.	\N	\N	t	2026-06-09 16:38:04.484	7	Presentacion CEAR V2	\N
19	45	TAREA_COMPLETADA_DG	Actividad finalizada	La Directora General finalizó la actividad "Letrero CEAR"	\N	\N	t	2026-06-09 16:38:17.117	7	Presentacion CEAR V2	\N
15	40	TAREA_ESTADO	Tarea actualizada	Mariela cambió el estado de "Letrero CEAR" a EN_PROGRESO	\N	\N	t	2026-06-09 16:37:23.077	7	Presentacion CEAR V2	\N
17	40	TAREA_EN_REVISION_DG	Tarea pendiente de aprobación final	Carlos Tah aprobó el avance de "Letrero CEAR" en el evento "Presentacion CEAR V2". Requiere tu aprobación final.	\N	\N	t	2026-06-09 16:38:04.484	7	Presentacion CEAR V2	\N
21	61	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 6 fue aprobado. Fecha compromiso: 2026-06-14	\N	6	f	2026-06-09 17:25:30.702	\N	\N	\N
22	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 6 está listo para cierre. Fecha compromiso: 2026-06-14	\N	6	f	2026-06-09 17:25:30.702	\N	\N	\N
23	61	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 6 fue cerrado el 9/6/2026	\N	6	f	2026-06-09 17:25:30.849	\N	\N	\N
26	61	TRAMITE_RECHAZADO	Trámite rechazado	Tu trámite 6 fue rechazado. Motivo: no procede	\N	6	f	2026-06-09 17:26:04.59	\N	\N	\N
28	61	TRAMITE_DEVUELTO_DELEGADO	Trámite devuelto	Tu trámite 6 fue devuelto. Motivo: corrige	\N	6	f	2026-06-09 17:26:05.065	\N	\N	\N
30	61	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 6 fue aprobado. Fecha compromiso: 2026-06-14	\N	6	f	2026-06-09 17:26:05.636	\N	\N	\N
31	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 6 está listo para cierre. Fecha compromiso: 2026-06-14	\N	6	f	2026-06-09 17:26:05.636	\N	\N	\N
33	52	TRAMITE_APROBADO	Trámite listo para cierre	El trámite 6 fue reenviado y está listo para cierre.	\N	6	f	2026-06-09 17:26:05.907	\N	\N	\N
34	52	TRAMITE_APROBADO	Trámite listo para cierre	El trámite 2 fue reenviado y está listo para cierre.	\N	2	f	2026-06-09 17:29:13.711	\N	\N	\N
20	53	TRAMITE_NUEVO	Nuevo trámite recibido	Maria creó el trámite 6	\N	6	t	2026-06-09 17:25:30.425	\N	\N	\N
24	53	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 6 fue cerrado el 9/6/2026	\N	6	t	2026-06-09 17:25:30.849	\N	\N	\N
25	53	TRAMITE_NUEVO	Nuevo trámite recibido	Maria creó el trámite 6	\N	6	t	2026-06-09 17:26:04.317	\N	\N	\N
27	53	TRAMITE_NUEVO	Nuevo trámite recibido	Maria creó el trámite 6	\N	6	t	2026-06-09 17:26:04.793	\N	\N	\N
29	53	TRAMITE_NUEVO	Nuevo trámite recibido	Maria creó el trámite 6	\N	6	t	2026-06-09 17:26:05.396	\N	\N	\N
32	53	TRAMITE_DEVUELTO_JURIDICO	Trámite devuelto a Jurídico	El trámite 6 fue devuelto. Motivo: falta algo	\N	6	t	2026-06-09 17:26:05.777	\N	\N	\N
35	40	TAREA_ESTADO	Tarea actualizada	Raymundo Radilla cambió el estado de "camion2" a EN_PROGRESO	\N	\N	f	2026-06-09 19:25:51.45	14	Presentacion CEAR V2	\N
36	40	TAREA_ESTADO	Tarea actualizada	Raymundo Radilla cambió el estado de "sillas" a EN_PROGRESO	\N	\N	f	2026-06-09 19:41:20.355	16	Presentacion CEAR V2	\N
39	40	TAREA_EN_REVISION_DG	Avance pendiente de aprobación final	Sharely envió avance en "sillas" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 19:52:57.001	16	Presentacion CEAR V2	\N
56	57	TAREA_DEVUELTA_DG	Actividad devuelta por la Directora General	La DG devolvió "sillas": falto	\N	\N	f	2026-06-09 20:05:56.613	16	Presentacion CEAR V2	\N
57	57	TAREA_EN_REVISION	Avance enviado para revisión	Sharely envió avance en "sillas" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 20:07:00.265	16	Presentacion CEAR V2	\N
58	40	TAREA_COMENTARIO	Nuevo comentario en tarea	Raymundo Radilla comentó en "mesas": e	\N	\N	f	2026-06-09 20:15:08.032	27	Presentacion CEAR V2	\N
59	40	TAREA_FECHA_COMPROMISO	Fecha compromiso actualizada	Oliver estableció fecha compromiso 2026-06-24 en "mesas"	\N	\N	f	2026-06-09 20:15:33.28	27	Presentacion CEAR V2	\N
60	40	TAREA_COMENTARIO	Nuevo comentario en tarea	Oliver comentó en "mesas": e	\N	\N	f	2026-06-09 20:15:40.681	27	Presentacion CEAR V2	\N
61	40	TAREA_ESTADO	Tarea actualizada	Oliver cambió el estado de "mesas" a EN_PROGRESO	\N	\N	f	2026-06-09 20:15:43.175	27	Presentacion CEAR V2	\N
62	57	TAREA_EN_REVISION	Avance enviado para revisión	Oliver envió avance en "mesas" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 20:15:57.586	27	Presentacion CEAR V2	\N
66	57	TAREA_APROBADA_N1	Avance aprobado por el Director	Tu avance en "mesas" fue aprobado por Raymundo Radilla. Está pendiente de aprobación final de la Directora General.	\N	\N	f	2026-06-09 20:19:57.243	27	Presentacion CEAR V2	\N
65	40	TAREA_EN_REVISION_DG	Tarea pendiente de aprobación final	Raymundo Radilla aprobó el avance de "mesas" en el evento "Presentacion CEAR V2". Requiere tu aprobación final.	\N	\N	f	2026-06-09 20:19:57.243	27	Presentacion CEAR V2	\N
67	57	TAREA_DEVUELTA_DG	Actividad devuelta por la Directora General	La DG devolvió "mesas": d	\N	\N	f	2026-06-09 20:20:23.055	27	Presentacion CEAR V2	\N
78	58	TAREA_DEVUELTA	Tarea devuelta para corrección	Raymundo Radilla devolvió la tarea "sillas": i	\N	\N	f	2026-06-09 20:35:05.545	16	Presentacion CEAR V2	\N
79	40	TAREA_FECHA_COMPROMISO	Fecha compromiso actualizada	Oliver estableció fecha compromiso 2026-06-16 en "bolsas"	\N	\N	f	2026-06-09 20:36:47.769	31	Presentacion CEAR V2	\N
80	40	TAREA_ESTADO	Tarea actualizada	Oliver cambió el estado de "bolsas" a EN_PROGRESO	\N	\N	f	2026-06-09 20:36:50.263	31	Presentacion CEAR V2	\N
81	57	TAREA_EN_REVISION	Avance enviado para revisión	Oliver envió avance en "bolsas" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 20:36:55.186	31	Presentacion CEAR V2	\N
82	40	TAREA_EN_REVISION_DG	Tarea pendiente de aprobación final	Raymundo Radilla aprobó el avance de "bolsas" en el evento "Presentacion CEAR V2". Requiere tu aprobación final.	\N	\N	f	2026-06-09 20:37:07.252	31	Presentacion CEAR V2	\N
83	57	TAREA_APROBADA_N1	Avance aprobado por el Director	Tu avance en "bolsas" fue aprobado por Raymundo Radilla. Está pendiente de aprobación final de la Directora General.	\N	\N	f	2026-06-09 20:37:07.252	31	Presentacion CEAR V2	\N
84	60	TAREA_DEVUELTA_DG	Actividad devuelta por la Directora General	La DG devolvió "bolsas": r	\N	\N	f	2026-06-09 20:37:23.501	31	Presentacion CEAR V2	\N
85	57	TAREA_EN_REVISION	Avance enviado para revisión	Oliver envió avance en "bolsas" (Presentacion CEAR V2)	\N	\N	f	2026-06-09 20:39:28.143	31	Presentacion CEAR V2	\N
86	40	TAREA_EN_REVISION_DG	Tarea pendiente de aprobación final	Raymundo Radilla aprobó el avance de "bolsas" en el evento "Presentacion CEAR V2". Requiere tu aprobación final.	\N	\N	f	2026-06-09 20:39:41.449	31	Presentacion CEAR V2	\N
87	57	TAREA_APROBADA_N1	Avance aprobado por el Director	Tu avance en "bolsas" fue aprobado por Raymundo Radilla. Está pendiente de aprobación final de la Directora General.	\N	\N	f	2026-06-09 20:39:41.449	31	Presentacion CEAR V2	\N
88	57	TAREA_COMPLETADA_DG	Actividad finalizada	La Directora General finalizó la actividad "bolsas"	\N	\N	f	2026-06-09 20:39:51.002	31	Presentacion CEAR V2	\N
89	53	TRAMITE_NUEVO	Nuevo trámite recibido	Denisse Vazquez creó el trámite 6	\N	6	f	2026-06-09 21:02:26.273	\N	\N	\N
90	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 6 está listo para cierre. Fecha compromiso: 2026-06-16	\N	6	f	2026-06-09 21:03:42.495	\N	\N	\N
91	70	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 6 fue aprobado. Fecha compromiso: 2026-06-16	\N	6	f	2026-06-09 21:03:42.495	\N	\N	\N
92	53	TRAMITE_NUEVO	Nuevo trámite recibido	Denisse Vazquez creó el trámite 11	\N	11	f	2026-06-09 21:05:14.847	\N	\N	\N
93	53	TRAMITE_NUEVO	Nuevo trámite recibido	undefined creó el trámite 12	\N	12	f	2026-06-09 21:10:08.131	\N	\N	\N
94	61	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 12 fue aprobado. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:08.269	\N	\N	\N
95	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 12 está listo para cierre. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:08.269	\N	\N	\N
96	53	TRAMITE_NUEVO	Nuevo trámite recibido	undefined creó el trámite 12	\N	12	f	2026-06-09 21:10:08.462	\N	\N	\N
97	61	TRAMITE_RECHAZADO	Trámite rechazado	Tu trámite 12 fue rechazado. Motivo: no	\N	12	f	2026-06-09 21:10:08.599	\N	\N	\N
98	53	TRAMITE_NUEVO	Nuevo trámite recibido	undefined creó el trámite 12	\N	12	f	2026-06-09 21:10:08.805	\N	\N	\N
99	61	TRAMITE_DEVUELTO_DELEGADO	Trámite devuelto	Tu trámite 12 fue devuelto. Motivo: corrige	\N	12	f	2026-06-09 21:10:08.942	\N	\N	\N
100	53	TRAMITE_NUEVO	Nuevo trámite recibido	undefined creó el trámite 12	\N	12	f	2026-06-09 21:10:09.152	\N	\N	\N
101	61	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 12 fue aprobado. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:09.299	\N	\N	\N
102	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 12 está listo para cierre. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:09.299	\N	\N	\N
103	61	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 12 fue cerrado el 9/6/2026	\N	12	f	2026-06-09 21:10:09.444	\N	\N	\N
104	53	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 12 fue cerrado el 9/6/2026	\N	12	f	2026-06-09 21:10:09.444	\N	\N	\N
105	53	TRAMITE_NUEVO	Nuevo trámite recibido	undefined creó el trámite 12	\N	12	f	2026-06-09 21:10:09.642	\N	\N	\N
106	61	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 12 fue aprobado. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:09.782	\N	\N	\N
107	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 12 está listo para cierre. Fecha compromiso: 2026-06-15	\N	12	f	2026-06-09 21:10:09.782	\N	\N	\N
108	53	TRAMITE_DEVUELTO_JURIDICO	Trámite devuelto a Jurídico	El trámite 12 fue devuelto. Motivo: falta	\N	12	f	2026-06-09 21:10:09.918	\N	\N	\N
109	52	TRAMITE_APROBADO	Trámite listo para cierre	El trámite 12 fue reenviado y está listo para cierre.	\N	12	f	2026-06-09 21:10:10.059	\N	\N	\N
110	70	TRAMITE_APROBADO	Trámite aprobado	Tu trámite 11 fue aprobado. Fecha compromiso: 2026-06-17	\N	11	f	2026-06-09 21:10:22.177	\N	\N	\N
111	52	TRAMITE_APROBADO	Nuevo trámite para finalizar	El trámite 11 está listo para cierre. Fecha compromiso: 2026-06-17	\N	11	f	2026-06-09 21:10:22.177	\N	\N	\N
112	70	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 11 fue cerrado el 9/6/2026	\N	11	f	2026-06-09 21:10:35.258	\N	\N	\N
113	53	TRAMITE_FINALIZADO	Trámite finalizado	El trámite 11 fue cerrado el 9/6/2026	\N	11	f	2026-06-09 21:10:35.258	\N	\N	\N
114	53	TRAMITE_DEVUELTO_JURIDICO	Trámite devuelto a Jurídico	El trámite 6 fue devuelto. Motivo: e	\N	6	f	2026-06-09 21:10:37.642	\N	\N	\N
115	52	TRAMITE_APROBADO	Trámite listo para cierre	El trámite 6 fue reenviado y está listo para cierre.	\N	6	f	2026-06-09 21:10:48.891	\N	\N	\N
\.


--
-- Data for Name: oficios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.oficios (id, folio, remitente, dependencia_origen, dirigido_a_id, oficial_registro_id, unidad_registro_id, fecha_registro, descripcion_solicitud, tiene_termino, fecha_vencimiento, pdf_original_path, estatus, texto_ocr, ocr_procesado, ocr_fecha, ocr_metodo) FROM stdin;
6	OF-37-2026-0005	ana	Referencia: Dirección General.	43	65	37	2026-06-09 21:17:25.087	Dirección General.s	t	\N	/oficios/originales/984c919a-1504-4f92-be41-4f5ab1f229c4.pdf	FINALIZADO	y N\nNY\nRPPC QuINTana\nDE LA as Te E 0 FRANSEORMAY\nNANA\nReferencia: Dirección General.\nNúmero de Oficio: SEGOB/DGRPPC/1036/111/2025\nAsunto: Informe de recursos en el marco del programa de modernización\nChetumal, Quintana Roo a 27 de marzo de 2025\n“2025, Año del 50 Aniversario de la Constitución Política\ndel estado Libre y Soberano de Quintana Roo”\n| DRA EDNA ELENA VEGA RANGEL\nSECRETARIA DE DESARROLLO AGRARIO,\nTERRITORIAL Y URBANO\nPRESENTE\nPor medio de la presente y en cumplimiento al numeral 7.1 fracción XIV de los Lineamientos del\nPrograma de Modernización de los Registros Públicos de la Propiedad y Catastros 2025, por medio\nde la presente hago constar que el Gobierno del Estado de Quintana Roo, a través del Registro\nPúblico de la Propiedad y del Comercio no ha realizado devolución alguna de recursos autorizados\npor las personas integrantes del Comité de Evaluación dentro del Programa durante el ejercicio\nfiscal inmediato anterior. Se anexan para su pronta referencia las minutas de cierre\ncorrespondientes.\noí\nSin otro particular, le envío un cordial saludo. N\nA\nNDS, a\nATENTAMENTE > EDS €\nE.\n7 Ma 7 . “:cción “.-saral\n“t: gistro PM: «2 de\n.Ipiodad y comercio\n- oder Ejecutivo\n7 MTRA. MARIANN GONZÁLEZ PLIEGO CASTILLO +40 de Quintana Roo\n| DIRECTORA GENERAL DEL REGISTRO PÚBLICO DE LA PROPIEDAD Y\nDEL COMERCIO DEL ESTADO DE QUINTANA ROO |	t	2026-06-09 21:17:47.827	tesseract
1	OF-36-2026-0001	DELEGADA DEL REGISTRO PÚBLICO D PROPIEDAD Y DEL	rppc	43	55	36	2026-05-07 09:46:50.069	Acceso a VISOR.	t	\N	/oficios/originales/6f1ecdf9-d79f-4e43-888d-e706bab98503.pdf	FINALIZADO	\N	f	\N	\N
2	OF-37-2026-0001	DELEGADA DEL REGISTRO PÚBLICO D PROPIEDAD Y DEL	rppc	43	54	37	2026-05-07 10:24:36.023	Acceso a VISOR.	t	\N	/oficios/originales/50ca6539-5dde-447a-8760-e4f42ddeed63.pdf	FINALIZADO	\N	f	\N	\N
3	OF-37-2026-0002	SECRETARIA DE DESARROLLO URBANO	SEDATU	40	65	37	2026-06-05 15:53:50.054	QUINTANA 500 TUE Y DEL COMERCIO Sistema Inmobiliario de Quintana Roo	t	\N	/oficios/originales/97064265-db3c-41b0-a295-de0cad766b8f.pdf	RECIBIDO	\N	f	\N	\N
4	OF-37-2026-0003	DRA EDNA ELENA VEGA RANGEL	SECRETARIA DE DESARROLLO AGRARIO, TERRITORIAL Y URBANO	43	65	37	2026-06-09 16:02:10.405	Dirección General.	t	2026-06-25	/oficios/originales/5b96aa28-017f-4ae0-be59-8640cebf1545.pdf	ASIGNADO	\N	f	\N	\N
5	OF-37-2026-0004	DRA EDNA ELENA VEGA RANGEL	SECRETARIA DE DESARROLLO AGRARIO, TERRITORIAL Y URBANO	53	65	37	2026-06-09 18:20:36.509	Dirección General.	t	2026-06-16	/oficios/originales/23647e3b-c74a-427a-95d9-05b13f97cdb9.pdf	FINALIZADO	y N\nNY\nRPPC QuINTana\nDE LA as Te E 0 FRANSEORMAY\nNANA\nReferencia: Dirección General.\nNúmero de Oficio: SEGOB/DGRPPC/1036/111/2025\nAsunto: Informe de recursos en el marco del programa de modernización\nChetumal, Quintana Roo a 27 de marzo de 2025\n“2025, Año del 50 Aniversario de la Constitución Política\ndel estado Libre y Soberano de Quintana Roo”\n| DRA EDNA ELENA VEGA RANGEL\nSECRETARIA DE DESARROLLO AGRARIO,\nTERRITORIAL Y URBANO\nPRESENTE\nPor medio de la presente y en cumplimiento al numeral 7.1 fracción XIV de los Lineamientos del\nPrograma de Modernización de los Registros Públicos de la Propiedad y Catastros 2025, por medio\nde la presente hago constar que el Gobierno del Estado de Quintana Roo, a través del Registro\nPúblico de la Propiedad y del Comercio no ha realizado devolución alguna de recursos autorizados\npor las personas integrantes del Comité de Evaluación dentro del Programa durante el ejercicio\nfiscal inmediato anterior. Se anexan para su pronta referencia las minutas de cierre\ncorrespondientes.\noí\nSin otro particular, le envío un cordial saludo. N\nA\nNDS, a\nATENTAMENTE > EDS €\nE.\n7 Ma 7 . “:cción “.-saral\n“t: gistro PM: «2 de\n.Ipiodad y comercio\n- oder Ejecutivo\n7 MTRA. MARIANN GONZÁLEZ PLIEGO CASTILLO +40 de Quintana Roo\n| DIRECTORA GENERAL DEL REGISTRO PÚBLICO DE LA PROPIEDAD Y\nDEL COMERCIO DEL ESTADO DE QUINTANA ROO |	t	2026-06-09 18:21:21.997	tesseract
7	OF-42-2026-0001	emily	Delegacion Benito Juarez	43	62	42	2026-06-09 21:21:47.826	— Y DEL COMERCIO Sistema Inmobiliario de Quintana Roo	t	\N	/oficios/originales/a126b358-cd65-4059-93e3-8f0f1faa5062.pdf	ASIGNADO	>. SIGROO\nPÚBLICO DE LA PROPIEDAD\n— Y DEL COMERCIO Sistema Inmobiliario de Quintana Roo\n2022|2027\nREPORTE DE RESOLUCIONES PENDIENTES AL 1 DE JUNIO\nDEL 2026\nDelegacion Benito Juarez\nProyectos AEmeÑEn Es para enviar a Director AÑO Subtotal\nJuridico 2023 2024 2025 2026\nSin enviar - 2 9 12 23\nEnviados 2 1 19 8 30\nRezago 58 Decremento 2026 13 TOTAL 53\nDelegacion Playa del Carmen\nProyectos AEmeÑEn Es para enviar a Director AÑO Subtotal\nJuridico 2023 2024 2025 2026\nSin enviar - - 22 10 32\nEnviados - 4 6 2 12\nRezago 47 Decremento 2026 6 TOTAL 44\n\nDelegacion Othón P. Blanco\nProyectos pendientes para enviar a Director AÑO\ne: Subtotal\nJuridico 2023 2024 2025 2026\nSin enviar - - - 1 1\nEnviados - - - 4 4\nRezago 0 Decremento 2026 5 TOTAL 5\nDelegacion Cozumel\nPp t ¡ent ¡ar a Direct AÑ\nroyectos pendien - para enviar a Director O Subtotal\nJuridico 2023 2024 2025 2026\nSin enviar - - 3 2 5\nEnviados 1 - 3 3 7\nRezago 7 Decremento 2026 6 TOTAL 12\nProyectos sin enviar a Director Juridico 60\n2026 Proyectos enviados a Director Juridico 52\nRezago Decremento TOTAL GLOBAL RPPC 112\norigen 2026 42\n72 REZAGO 70\nAl corte del 5to mes del año hay un abatimiento global del rezago Dest y de:\n2023-2025 del 51%. Estaca E T6zag0 ae:\n» , e MA 3 resoluciónes de 2023\nPor Delegación como a continuación se indica: 7 resoluciones de 2024\nCancún: 54% , Playa: 40% , OPB: 100% y Coz: 61%	t	2026-06-09 21:21:50.29	tesseract
\.


--
-- Data for Name: tareas_evento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tareas_evento (id, evento_id, titulo, descripcion, asignado_a_id, estado, fecha_programada, fecha_actualizacion, reasignado_a_id, fecha_compromiso) FROM stdin;
2	1	Presentacion	presentacion	50	PENDIENTE	2026-06-09	2026-06-03 15:15:45.995155	\N	\N
3	1	Video de cronologia del tiempo	antes y despues	50	PENDIENTE	2026-06-19	2026-06-03 15:16:26.581255	\N	\N
4	1	SAR aplicativo	avances del programa del archivero del CEAR	44	PENDIENTE	2026-06-17	2026-06-03 15:17:06.033295	\N	\N
5	1	Camion del traslado	solicitud a segob	60	PENDIENTE	2026-06-05	2026-06-03 15:19:17.466011	\N	\N
6	2	Video CEAR	realizar cambios del video presentado a DG	50	PENDIENTE	2026-06-08	2026-06-04 17:25:00.59188	\N	\N
8	2	Aplicacion de SAR	Despliegue a produccion del aplicativo SAT	44	PENDIENTE	2026-06-08	2026-06-04 17:27:47.39603	\N	\N
9	2	Camion de traslado del acervo	Solcitud endientes de enviar a segob	59	PENDIENTE	2026-06-08	2026-06-04 17:29:14.196486	\N	\N
1	1	Invitados y distribucion	Lista de invitados y la distribucion de las sillas	45	FINALIZADO	2026-06-05	2026-06-08 17:38:45.095987	\N	\N
7	2	Letrero CEAR	Cordinar con proveedor e instalacion el lunes	45	FINALIZADO	2026-06-08	2026-06-09 21:38:17.109459	\N	\N
27	2	mesas	mesa	57	DEVUELTO	2026-06-30	2026-06-10 01:20:23.052805	60	2026-06-24
14	2	camion2	eeeee	57	EN_PROGRESO	2026-06-10	2026-06-10 00:39:19.447036	60	\N
16	2	sillas	sillas	57	DEVUELTO	2026-06-16	2026-06-10 01:35:05.540921	58	\N
31	2	bolsas	bolsas	57	FINALIZADO	2026-06-16	2026-06-10 01:39:50.999516	60	2026-06-16
\.


--
-- Data for Name: tramite_documentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tramite_documentos (id, tramite_id, archivo_url, nombre_original, subido_por_id, subido_en) FROM stdin;
\.


--
-- Data for Name: tramites; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tramites (id, folio, titulo, descripcion, tipo_tramite, estatus, unidad_creadora_id, creado_por_id, fecha_creacion, fecha_compromiso, fecha_cierre, numero_ticket, nombre_solicitante, correo_solicitante, telefono_solicitante, checklist_documentacion, checklist_proyecto, fecha_registro, comentarios) FROM stdin;
4	4	\N	ffffffff	\N	FINALIZADO	40	67	2026-05-06 11:00:10.71	2026-05-21	2026-05-06 11:12:24.994	242618	ana claudia	ana@gmail.com	98311100127	t	t	2026-05-06 16:00:10.709+00	\N
5	5	\N	fffff	\N	FINALIZADO	39	70	2026-05-12 21:12:01.734	2026-05-13	2026-05-12 21:17:25.849	33333	Ana Solis	ana@gmail.com	9983849373	t	t	2026-05-13 02:12:01.732+00	\N
1	TRM-39-2026-0001	\N	3333	\N	FINALIZADO	39	70	2026-05-05 08:39:13.019	2026-06-03	2026-06-02 15:46:39.968	11	ana	ana	983	t	t	2026-05-05 13:39:13.017+00	\N
3	3	\N	cuatro	\N	FINALIZADO	40	67	2026-05-05 16:28:43.158	2026-06-24	2026-06-04 13:00:41.604	4444	armando	armando	998	t	t	2026-05-05 21:28:43.157+00	jjjj
2	2	\N	aaaa	\N	EN_PROCESO	39	70	2026-05-05 08:42:29.75	2026-05-06	\N	222222	alan	alan	999	t	t	2026-05-05 13:42:29.748+00	\N
11	11	\N	ee	\N	FINALIZADO	39	70	2026-06-09 21:05:14.842	2026-06-17	2026-06-09 21:10:35.252	ee	ee	e	ee	t	t	2026-06-10 02:05:14.841+00	\N
10	6	\N	d	\N	EN_PROCESO	39	70	2026-06-09 21:02:26.263	2026-06-16	\N	1	d	d	d	t	t	2026-06-10 02:02:26.262+00	\N
\.


--
-- Data for Name: usuario_modulos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuario_modulos (usuario_id, modulo_id, asignado_en, asignado_por_id) FROM stdin;
38	2	2026-05-01 16:17:08.942383	9
40	2	2026-05-03 23:24:38.353238	9
43	2	2026-05-03 23:24:38.389656	9
44	2	2026-05-03 23:24:38.400383	9
45	2	2026-05-03 23:24:38.41121	9
46	2	2026-05-03 23:24:38.421474	9
47	2	2026-05-03 23:24:38.432407	9
48	2	2026-05-03 23:24:38.443146	9
49	2	2026-05-03 23:24:38.452431	9
50	2	2026-05-03 23:24:38.463271	9
51	2	2026-05-03 23:24:38.473559	9
53	2	2026-05-03 23:24:38.498529	9
54	2	2026-05-03 23:24:38.511539	9
55	2	2026-05-03 23:24:38.525097	9
56	2	2026-05-03 23:24:38.53832	9
57	2	2026-05-03 23:24:38.575182	9
58	2	2026-05-03 23:24:38.590188	9
59	2	2026-05-03 23:24:38.606769	9
60	2	2026-05-03 23:24:38.6225	9
52	34	2026-05-04 20:31:32.068939	9
53	34	2026-05-04 20:31:32.068939	9
61	2	2026-05-04 20:45:31.414598	9
61	34	2026-05-04 20:45:31.414598	9
62	34	2026-05-04 20:45:31.414598	9
63	2	2026-05-04 20:45:31.414598	9
63	34	2026-05-04 20:45:31.414598	9
64	2	2026-05-04 20:45:31.414598	9
64	34	2026-05-04 20:45:31.414598	9
66	2	2026-05-04 20:45:31.414598	9
66	34	2026-05-04 20:45:31.414598	9
67	34	2026-05-04 20:45:31.414598	9
68	2	2026-05-04 20:45:31.414598	9
68	34	2026-05-04 20:45:31.414598	9
70	2	2026-05-04 20:45:31.414598	9
70	34	2026-05-04 20:45:31.414598	9
71	34	2026-05-04 20:45:31.414598	9
57	1	2026-05-05 19:23:12.131721	9
57	34	2026-05-05 19:23:12.982644	9
43	1	2026-05-05 21:59:52.396715	9
43	34	2026-05-05 21:59:53.196288	9
34	2	2026-05-03 23:24:38.367907	9
35	2	2026-05-03 23:24:38.379659	9
53	1	2026-04-30 18:44:38.869543	9
65	1	2026-05-06 18:45:13.728623	9
54	1	2026-05-06 18:48:42.08499	9
54	34	2026-05-06 18:49:00.918876	9
55	1	2026-05-06 18:49:34.520124	9
55	34	2026-05-06 18:49:35.386076	9
56	1	2026-05-07 20:58:47.445751	9
56	34	2026-05-07 20:58:48.543606	9
44	1	2026-05-12 16:40:21.530292	9
40	34	2026-05-27 14:44:30.93433	9
40	1	2026-05-27 14:44:31.799827	9
35	1	2026-05-31 23:22:14.521246	9
35	34	2026-05-31 23:22:15.38745	9
63	1	2026-06-04 17:11:54.013135	9
40	36	2026-06-09 19:19:22.983476	9
44	34	2026-06-09 21:03:21.87423	9
69	34	2026-06-09 21:06:39.992641	9
34	1	2026-06-10 01:41:18.473315	9
34	34	2026-06-10 01:41:19.330447	9
34	36	2026-06-10 01:41:19.92795	9
35	36	2026-06-10 01:41:42.240286	9
62	1	2026-06-10 02:21:15.898584	9
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (id, nombre, email, password_hash, rol, unidad_id, activo) FROM stdin;
4	Rosa Secretaria	secretaria@demo.mx	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	SECRETARIA	34	t
44	Andy Frank	andyfrank@rppc.qroo	$2b$12$oE6V1ihAWOs61A4FPZv3iu/SlR.Tl.tU9LdEyy0XwkHS7RpEiTNM6	OPERATIVO	35	t
9	Super Admin	superadmin@demo.mx	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	SUPERADMIN	34	t
52	Claudina	claudina@rppc.qroo	$2b$12$vlcZfw2AnL8Cmz4L0zwMP.tkHuvmGKb4RFVp3U6gMYWbyOg8jBsZW	OPERATIVO	35	t
51	Victor	victor@rppc.qroo	$2b$12$di7LAhiTTUqttXj9ijJH7uQBTJMIbhXqV7MlPyeVh9hUATXgAzV6G	OPERATIVO	35	t
57	Raymundo Radilla	raymundoradilla@rppc.qroo	$2b$12$63mSQ.06xkTXix0EQ15t0.3F4l/Mr93IeWK/r1FgicetjX4BTpdie	DIRECTOR	41	t
34	Fabian Montiel	fabianmontiel@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	PARTICULAR	34	t
38	Op. Juridico 1	op.juridico1@demo.mx	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	36	t
65	Gloria	gloriavazquez@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	37	t
63	Melissa	melissa@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	42	t
46	Miguel	miguel@rppc.qroo	$2b$12$20pBFhgjzjQCv19bjok9GuSfEoAeNzg9HAbeMtlEc7xINvUw92qNO	OPERATIVO	35	t
61	Maria Peña	maria.pena@demo.mx	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	DIRECTOR	42	t
66	Grisel	grisel@demo.mx	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	37	t
53	Oscar Gopar	oscargopar@rppc.com	$2b$12$IT00S4yzgYR3n86v/k8tE.uhMLWS10AA8f91rbvjYXXKedowbAgyW	DIRECTOR	36	t
43	Carlos Tah	carlostah@rppc.qroo	$2b$12$E5ZSKj9Ecla.2CWHI9Gmcur42owoYvoovTY85oJTKG2Cbb0JixMvG	DIRECTOR	35	t
49	Gerardo	gerardo@rppc.qroo	$2b$12$QEaZOIhzbEcasC.G5EANPeGGVor1KCunhLMpg6kRec6L.3FkzmlnG	OPERATIVO	35	t
67	Armando Novelo	armando@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	DIRECTOR	40	t
35	Tania Huerta	taniahuerta@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	SECRETARIA	34	t
48	Emanuel	emanuel@rppc.qroo	$2b$12$5hQXJRWbzo8szQhWHSVbQO0jPWfCbiCSttlpJ4sQO4p7/7aVcHdSe	OPERATIVO	35	t
62	Emily	emily@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	42	t
47	Emiliano	emiliano@rppc.qroo	$2b$12$jgDQGHR0qSg9JwjFJfwWp.f4Wez.XRiioJPxkQJNNx2RvXsK7my2C	OPERATIVO	35	t
59	Jesus	jesus@rppc.qroo	$2b$12$MuqGAKcJquAzQaP/A7lB7.Y2m.to2NQiGVWbmBf9l47bROqXAbQVy	OPERATIVO	41	t
60	Oliver	oliver@rppc.qroo	$2b$12$gpL0WFeIKaIQrErsfDsZium6Ov0iOvR78CV8NIREwS.cHU5vD3QU2	OPERATIVO	41	t
64	Mary Camara	marycamara@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	DIRECTOR	37	t
50	Nohemy	nohemy@rppc.qroo	$2b$12$ZwNe98rhQP3KqjTNa0j3/e8R5cso2cBcRet724Mbv7TThoviyOhlm	OPERATIVO	35	t
58	Sharely	sharely@rppc.qroo	$2b$12$3U2VaC7pqtdsWmN3bK9F5eRjvaCQU9h4Du2FvVQe0qUgc3NKY5tgu	OPERATIVO	41	t
45	Mariela	mariela@rppc.qroo	$2b$12$oI3bER0xjl3chlJC.GWm5uA9/avyZE5MCAwSU5VDr/SH1811p1Dua	OPERATIVO	35	t
40	Mariann Gonzalez Pliego Castillo	mariann@rppc.qroo	$2b$12$LxA75NBrZsN.UVKLVwndd.lM.ApWAH.pQZcuWIjBqn.Lj18ZvAwAK	DIRECTOR	34	t
56	Erika	erika@rppc.qroo	$2b$12$qXKABX9U/Ny6V0BENml02evg4/juHn6xHyRF7aIo9XSlIbr./wrVW	OPERATIVO	36	t
55	Luis Betancourt	luisbetancourt@rppc.qroo	$2b$12$Bpri4obxlyV9.r8OIBoYvudTqPzM61LOSscx/g0lF7XQxr9q7fdUi	OPERATIVO	36	t
54	Tania Barea	taniabarea@rppc.qroo	$2b$12$YmgeRvgwaYto/j9.EaS9I.eeploUjE/qxn/.aA2ul18R/7PsNilqu	OPERATIVO	36	t
70	Denisse Vazquez	denisse@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	DIRECTOR	39	t
69	Guadalupe Vazquez	guadalupe@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	40	t
68	Wendy	wendy@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	40	t
71	Mariana	mariana@rppc.qroo	$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O	OPERATIVO	39	t
\.


--
-- Name: asignaciones_juridicas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.asignaciones_juridicas_id_seq', 12, true);


--
-- Name: auditoria_configuracion_flujos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.auditoria_configuracion_flujos_id_seq', 21, true);


--
-- Name: auditoria_estados_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.auditoria_estados_id_seq', 35, true);


--
-- Name: auditoria_tramites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.auditoria_tramites_id_seq', 69, true);


--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.catalogo_oficinas_id_seq', 42, true);


--
-- Name: comentarios_reconsideracion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.comentarios_reconsideracion_id_seq', 5, true);


--
-- Name: comentarios_tarea_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.comentarios_tarea_id_seq', 3, true);


--
-- Name: comentarios_tramite_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.comentarios_tramite_id_seq', 22, true);


--
-- Name: configuracion_flujos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.configuracion_flujos_id_seq', 55, true);


--
-- Name: evento_directores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.evento_directores_id_seq', 24, true);


--
-- Name: eventos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.eventos_id_seq', 17, true);


--
-- Name: gestiones_contestacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.gestiones_contestacion_id_seq', 4, true);


--
-- Name: historial_revision_tarea_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.historial_revision_tarea_id_seq', 37, true);


--
-- Name: modulos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.modulos_id_seq', 36, true);


--
-- Name: notificaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notificaciones_id_seq', 115, true);


--
-- Name: oficios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.oficios_id_seq', 7, true);


--
-- Name: tareas_evento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tareas_evento_id_seq', 31, true);


--
-- Name: tramite_documentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tramite_documentos_id_seq', 1, false);


--
-- Name: tramites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tramites_id_seq', 16, true);


--
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 71, true);


--
-- Name: asignaciones_juridicas asignaciones_juridicas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_pkey PRIMARY KEY (id);


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_pkey PRIMARY KEY (id);


--
-- Name: auditoria_estados auditoria_estados_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_pkey PRIMARY KEY (id);


--
-- Name: auditoria_tramites auditoria_tramites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_pkey PRIMARY KEY (id);


--
-- Name: catalogo_unidades catalogo_oficinas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_unidades
    ADD CONSTRAINT catalogo_oficinas_pkey PRIMARY KEY (id);


--
-- Name: catalogo_unidades catalogo_unidades_clave_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_unidades
    ADD CONSTRAINT catalogo_unidades_clave_key UNIQUE (clave);


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_pkey PRIMARY KEY (id);


--
-- Name: comentarios_tarea comentarios_tarea_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_pkey PRIMARY KEY (id);


--
-- Name: comentarios_tramite comentarios_tramite_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_pkey PRIMARY KEY (id);


--
-- Name: configuracion_flujos configuracion_flujos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_pkey PRIMARY KEY (id);


--
-- Name: evento_directores evento_directores_evento_id_director_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_evento_id_director_id_key UNIQUE (evento_id, director_id);


--
-- Name: evento_directores evento_directores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: gestiones_contestacion gestiones_contestacion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_pkey PRIMARY KEY (id);


--
-- Name: historial_revision_tarea historial_revision_tarea_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_pkey PRIMARY KEY (id);


--
-- Name: modulos modulos_clave_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_clave_key UNIQUE (clave);


--
-- Name: modulos modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: oficios oficios_folio_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_folio_key UNIQUE (folio);


--
-- Name: oficios oficios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_pkey PRIMARY KEY (id);


--
-- Name: tareas_evento tareas_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_pkey PRIMARY KEY (id);


--
-- Name: tramite_documentos tramite_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_pkey PRIMARY KEY (id);


--
-- Name: tramites tramites_folio_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_folio_key UNIQUE (folio);


--
-- Name: tramites tramites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_pkey PRIMARY KEY (id);


--
-- Name: configuracion_flujos uq_cfg_flujos_modulo_rol_unidad; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT uq_cfg_flujos_modulo_rol_unidad UNIQUE (modulo_clave, rol_flujo, unidad_id);


--
-- Name: usuario_modulos usuario_modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_pkey PRIMARY KEY (usuario_id, modulo_id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_aud_cfg_flujos_actualizado_en; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_aud_cfg_flujos_actualizado_en ON public.auditoria_configuracion_flujos USING btree (actualizado_en DESC);


--
-- Name: idx_aud_cfg_flujos_modulo_clave; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_aud_cfg_flujos_modulo_clave ON public.auditoria_configuracion_flujos USING btree (modulo_clave);


--
-- Name: idx_auditoria_tramites_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auditoria_tramites_fecha ON public.auditoria_tramites USING btree (fecha_cambio DESC);


--
-- Name: idx_auditoria_tramites_tramite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_auditoria_tramites_tramite ON public.auditoria_tramites USING btree (tramite_id);


--
-- Name: idx_cfg_flujos_actualizado_en; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cfg_flujos_actualizado_en ON public.configuracion_flujos USING btree (actualizado_en DESC);


--
-- Name: idx_cfg_flujos_modulo_clave; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cfg_flujos_modulo_clave ON public.configuracion_flujos USING btree (modulo_clave);


--
-- Name: idx_cfg_flujos_unidad_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cfg_flujos_unidad_id ON public.configuracion_flujos USING btree (unidad_id);


--
-- Name: idx_cfg_flujos_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cfg_flujos_usuario_id ON public.configuracion_flujos USING btree (usuario_id);


--
-- Name: idx_coment_recon_oficio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coment_recon_oficio ON public.comentarios_reconsideracion USING btree (oficio_id);


--
-- Name: idx_comentarios_recons_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_recons_fecha ON public.comentarios_reconsideracion USING btree (fecha DESC);


--
-- Name: idx_comentarios_recons_oficio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_recons_oficio ON public.comentarios_reconsideracion USING btree (oficio_id);


--
-- Name: idx_comentarios_tarea_autor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_tarea_autor ON public.comentarios_tarea USING btree (autor_id);


--
-- Name: idx_comentarios_tarea_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_tarea_fecha ON public.comentarios_tarea USING btree (creado_en DESC);


--
-- Name: idx_comentarios_tarea_tarea; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_tarea_tarea ON public.comentarios_tarea USING btree (tarea_id);


--
-- Name: idx_comentarios_tramite_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_tramite_fecha ON public.comentarios_tramite USING btree (creado_en DESC);


--
-- Name: idx_comentarios_tramite_tramite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comentarios_tramite_tramite ON public.comentarios_tramite USING btree (tramite_id);


--
-- Name: idx_evento_directores_director; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_evento_directores_director ON public.evento_directores USING btree (director_id);


--
-- Name: idx_evento_directores_evento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_evento_directores_evento ON public.evento_directores USING btree (evento_id);


--
-- Name: idx_eventos_creado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_eventos_creado_por ON public.eventos USING btree (creado_por_id);


--
-- Name: idx_eventos_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_eventos_estado ON public.eventos USING btree (estado);


--
-- Name: idx_eventos_fecha_creacion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_eventos_fecha_creacion ON public.eventos USING btree (fecha_creacion DESC);


--
-- Name: idx_eventos_responsable; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_eventos_responsable ON public.eventos USING btree (responsable_id);


--
-- Name: idx_historial_rev_autor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_historial_rev_autor ON public.historial_revision_tarea USING btree (autor_id);


--
-- Name: idx_historial_rev_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_historial_rev_fecha ON public.historial_revision_tarea USING btree (creado_en DESC);


--
-- Name: idx_historial_rev_tarea; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_historial_rev_tarea ON public.historial_revision_tarea USING btree (tarea_id);


--
-- Name: idx_modulos_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_modulos_activo ON public.modulos USING btree (activo);


--
-- Name: idx_modulos_clave; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_modulos_clave ON public.modulos USING btree (clave);


--
-- Name: idx_notificaciones_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificaciones_created_at ON public.notificaciones USING btree (created_at DESC);


--
-- Name: idx_notificaciones_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificaciones_read ON public.notificaciones USING btree (user_id, read);


--
-- Name: idx_notificaciones_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificaciones_user_id ON public.notificaciones USING btree (user_id);


--
-- Name: idx_oficios_estatus; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oficios_estatus ON public.oficios USING btree (estatus);


--
-- Name: idx_oficios_fecha_vencimiento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oficios_fecha_vencimiento ON public.oficios USING btree (fecha_vencimiento);


--
-- Name: idx_oficios_folio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oficios_folio ON public.oficios USING btree (folio);


--
-- Name: idx_oficios_ocr_procesado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oficios_ocr_procesado ON public.oficios USING btree (ocr_procesado);


--
-- Name: idx_tareas_evento_asignado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_asignado ON public.tareas_evento USING btree (asignado_a_id);


--
-- Name: idx_tareas_evento_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_estado ON public.tareas_evento USING btree (estado);


--
-- Name: idx_tareas_evento_evento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_evento ON public.tareas_evento USING btree (evento_id);


--
-- Name: idx_tareas_evento_fecha_comp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_fecha_comp ON public.tareas_evento USING btree (fecha_compromiso);


--
-- Name: idx_tareas_evento_fecha_prog; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_fecha_prog ON public.tareas_evento USING btree (fecha_programada);


--
-- Name: idx_tareas_evento_reasignado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tareas_evento_reasignado ON public.tareas_evento USING btree (reasignado_a_id);


--
-- Name: idx_tramite_docs_tramite; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramite_docs_tramite ON public.tramite_documentos USING btree (tramite_id);


--
-- Name: idx_tramites_estatus; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramites_estatus ON public.tramites USING btree (estatus);


--
-- Name: idx_tramites_fecha_compromiso; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramites_fecha_compromiso ON public.tramites USING btree (fecha_compromiso);


--
-- Name: idx_tramites_fecha_creacion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramites_fecha_creacion ON public.tramites USING btree (fecha_creacion DESC);


--
-- Name: idx_tramites_folio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramites_folio ON public.tramites USING btree (folio);


--
-- Name: idx_tramites_unidad_creadora; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tramites_unidad_creadora ON public.tramites USING btree (unidad_creadora_id);


--
-- Name: idx_usuario_modulos_modulo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usuario_modulos_modulo ON public.usuario_modulos USING btree (modulo_id);


--
-- Name: idx_usuario_modulos_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usuario_modulos_usuario ON public.usuario_modulos USING btree (usuario_id);


--
-- Name: asignaciones_juridicas asignaciones_juridicas_abogado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_abogado_id_fkey FOREIGN KEY (abogado_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asignaciones_juridicas asignaciones_juridicas_asignado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_asignado_por_id_fkey FOREIGN KEY (asignado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asignaciones_juridicas asignaciones_juridicas_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_actualizado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_actualizado_por_id_fkey FOREIGN KEY (actualizado_por_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_usuario_id_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_usuario_id_anterior_fkey FOREIGN KEY (usuario_id_anterior) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_usuario_id_nuevo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_usuario_id_nuevo_fkey FOREIGN KEY (usuario_id_nuevo) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: auditoria_estados auditoria_estados_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_estados auditoria_estados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: auditoria_tramites auditoria_tramites_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_tramites auditoria_tramites_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_encargado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_encargado_id_fkey FOREIGN KEY (encargado_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_tarea comentarios_tarea_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_tarea comentarios_tarea_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_tramite comentarios_tramite_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_tramite comentarios_tramite_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: configuracion_flujos configuracion_flujos_actualizado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_actualizado_por_id_fkey FOREIGN KEY (actualizado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_modulo_clave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_modulo_clave_fkey FOREIGN KEY (modulo_clave) REFERENCES public.modulos(clave) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evento_directores evento_directores_director_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: evento_directores evento_directores_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: eventos eventos_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eventos eventos_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: gestiones_contestacion gestiones_contestacion_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gestiones_contestacion gestiones_contestacion_subido_por_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_subido_por_secretaria_id_fkey FOREIGN KEY (subido_por_secretaria_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: historial_revision_tarea historial_revision_tarea_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: historial_revision_tarea historial_revision_tarea_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oficios oficios_dirigido_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_dirigido_a_id_fkey FOREIGN KEY (dirigido_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: oficios oficios_oficial_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_oficial_registro_id_fkey FOREIGN KEY (oficial_registro_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: oficios oficios_oficina_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_oficina_registro_id_fkey FOREIGN KEY (unidad_registro_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tareas_evento tareas_evento_asignado_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_asignado_a_id_fkey FOREIGN KEY (asignado_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tareas_evento tareas_evento_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tareas_evento tareas_evento_reasignado_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_reasignado_a_id_fkey FOREIGN KEY (reasignado_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tramite_documentos tramite_documentos_subido_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_subido_por_id_fkey FOREIGN KEY (subido_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tramite_documentos tramite_documentos_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tramites tramites_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tramites tramites_unidad_creadora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_unidad_creadora_id_fkey FOREIGN KEY (unidad_creadora_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_asignado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_asignado_por_id_fkey FOREIGN KEY (asignado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.modulos(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usuarios usuarios_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_oficina_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict rD5dSezCzuNzwb2vEEn4MGy0fkfGIUPVLAts79xg45rNd9yslH1o16i6Pn43KqL

