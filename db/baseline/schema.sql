--
-- PostgreSQL database dump
--

\restrict ObrUsVAHbJEHfemCUbCPQPzPLLl7hRcoC3izjuwJLcxmAhk1famM7waCSeDYDfG

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

--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: estado_evento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_evento AS ENUM (
    'ABIERTO',
    'CERRADO'
);


--
-- Name: estado_tarea; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_tarea AS ENUM (
    'PENDIENTE',
    'EN_PROGRESO',
    'COMPLETADA',
    'EN_REVISION',
    'EN_REVISION_DG',
    'FINALIZADO',
    'DEVUELTO',
    'DEVUELTO_DG'
);


--
-- Name: estatus_oficio; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estatus_oficio AS ENUM (
    'RECIBIDO',
    'ASIGNADO',
    'EN_REVISION',
    'EN_RECONSIDERACION',
    'VOBO_APROBADO',
    'FINALIZADO'
);


--
-- Name: estatus_tramite; Type: TYPE; Schema: public; Owner: -
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


--
-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: -
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


--
-- Name: tipo_unidad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_unidad AS ENUM (
    'DIRECCION_GENERAL',
    'DIRECCION',
    'DELEGACION'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: asignaciones_juridicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asignaciones_juridicas (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    abogado_id integer NOT NULL,
    asignado_por_id integer NOT NULL,
    fecha_asignacion timestamp without time zone DEFAULT now() NOT NULL,
    observaciones text
);


--
-- Name: asignaciones_juridicas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.asignaciones_juridicas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: asignaciones_juridicas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.asignaciones_juridicas_id_seq OWNED BY public.asignaciones_juridicas.id;


--
-- Name: auditoria_configuracion_flujos; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: auditoria_configuracion_flujos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_configuracion_flujos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_configuracion_flujos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_configuracion_flujos_id_seq OWNED BY public.auditoria_configuracion_flujos.id;


--
-- Name: auditoria_estados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_estados (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    estado_anterior public.estatus_oficio,
    estado_nuevo public.estatus_oficio NOT NULL,
    usuario_id integer NOT NULL,
    fecha_cambio timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: auditoria_estados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_estados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_estados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_estados_id_seq OWNED BY public.auditoria_estados.id;


--
-- Name: auditoria_tramites; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: auditoria_tramites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_tramites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_tramites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_tramites_id_seq OWNED BY public.auditoria_tramites.id;


--
-- Name: catalogo_dependencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_dependencias (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por_id integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: catalogo_dependencias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_dependencias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_dependencias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_dependencias_id_seq OWNED BY public.catalogo_dependencias.id;


--
-- Name: catalogo_unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_unidades (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    tipo public.tipo_unidad DEFAULT 'DELEGACION'::public.tipo_unidad NOT NULL,
    clave character varying(50),
    vobo_por character varying(20) DEFAULT 'DELEGADO'::character varying NOT NULL,
    CONSTRAINT catalogo_unidades_vobo_por_chk CHECK (((vobo_por)::text = ANY ((ARRAY['DELEGADO'::character varying, 'ENCARGADO'::character varying])::text[])))
);


--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_oficinas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_oficinas_id_seq OWNED BY public.catalogo_unidades.id;


--
-- Name: catalogo_remitentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_remitentes (
    id integer NOT NULL,
    dependencia_id integer,
    nombre character varying(255) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por_id integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: catalogo_remitentes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_remitentes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_remitentes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_remitentes_id_seq OWNED BY public.catalogo_remitentes.id;


--
-- Name: catalogo_unidades_internas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_unidades_internas (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_por_id integer,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    dependencia_id integer
);


--
-- Name: catalogo_unidades_internas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_unidades_internas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_unidades_internas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_unidades_internas_id_seq OWNED BY public.catalogo_unidades_internas.id;


--
-- Name: comentarios_reconsideracion; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: comentarios_reconsideracion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comentarios_reconsideracion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comentarios_reconsideracion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comentarios_reconsideracion_id_seq OWNED BY public.comentarios_reconsideracion.id;


--
-- Name: comentarios_tarea; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios_tarea (
    id integer NOT NULL,
    tarea_id integer NOT NULL,
    autor_id integer NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: comentarios_tarea_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comentarios_tarea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comentarios_tarea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comentarios_tarea_id_seq OWNED BY public.comentarios_tarea.id;


--
-- Name: comentarios_tramite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comentarios_tramite (
    id integer NOT NULL,
    tramite_id integer NOT NULL,
    autor_id integer NOT NULL,
    contenido text NOT NULL,
    creado_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: comentarios_tramite_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comentarios_tramite_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comentarios_tramite_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comentarios_tramite_id_seq OWNED BY public.comentarios_tramite.id;


--
-- Name: configuracion_flujos; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: configuracion_flujos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_flujos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_flujos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_flujos_id_seq OWNED BY public.configuracion_flujos.id;


--
-- Name: evento_directores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento_directores (
    id integer NOT NULL,
    evento_id integer NOT NULL,
    director_id integer NOT NULL,
    agregado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evento_directores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evento_directores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evento_directores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evento_directores_id_seq OWNED BY public.evento_directores.id;


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
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
    responsable_id integer,
    requiere_aprobacion_dg boolean DEFAULT true NOT NULL,
    justificacion_cierre text,
    cerrado_por_id integer
);


--
-- Name: eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eventos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eventos_id_seq OWNED BY public.eventos.id;


--
-- Name: gestiones_contestacion; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gestiones_contestacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gestiones_contestacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gestiones_contestacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gestiones_contestacion_id_seq OWNED BY public.gestiones_contestacion.id;


--
-- Name: historial_revision_tarea; Type: TABLE; Schema: public; Owner: -
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
    CONSTRAINT historial_revision_tarea_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('AVANCE'::character varying)::text, ('DEVOLUCION'::character varying)::text, ('APROBACION_N1'::character varying)::text, ('APROBACION_N2'::character varying)::text, ('REASIGNACION'::character varying)::text])))
);


--
-- Name: historial_revision_tarea_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historial_revision_tarea_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historial_revision_tarea_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historial_revision_tarea_id_seq OWNED BY public.historial_revision_tarea.id;


--
-- Name: modulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modulos (
    id integer NOT NULL,
    clave character varying(100) NOT NULL,
    nombre_display character varying(150) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL
);


--
-- Name: modulos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.modulos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: modulos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.modulos_id_seq OWNED BY public.modulos.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_id_seq OWNED BY public.notificaciones.id;


--
-- Name: oficio_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oficio_documentos (
    id integer NOT NULL,
    oficio_id integer NOT NULL,
    tipo character varying(40) NOT NULL,
    archivo_url character varying(255) NOT NULL,
    nombre_original character varying(255),
    subido_por_id integer,
    subido_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_oficio_documentos_tipo CHECK (((tipo)::text = ANY ((ARRAY['anexos'::character varying, 'identificacion'::character varying, 'oficio'::character varying, 'recibos'::character varying, 'solicitud'::character varying])::text[])))
);


--
-- Name: oficio_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oficio_documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oficio_documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oficio_documentos_id_seq OWNED BY public.oficio_documentos.id;


--
-- Name: oficios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oficios (
    id integer NOT NULL,
    folio character varying(100) NOT NULL,
    remitente character varying(255) NOT NULL,
    dependencia_origen character varying(255) NOT NULL,
    dirigido_a_id integer,
    oficial_registro_id integer NOT NULL,
    unidad_registro_id integer NOT NULL,
    fecha_registro timestamp without time zone DEFAULT now() NOT NULL,
    descripcion_solicitud text NOT NULL,
    tiene_termino boolean DEFAULT false NOT NULL,
    fecha_vencimiento date,
    pdf_original_path character varying(500),
    estatus public.estatus_oficio DEFAULT 'RECIBIDO'::public.estatus_oficio NOT NULL,
    texto_ocr text,
    ocr_procesado boolean DEFAULT false NOT NULL,
    ocr_fecha timestamp without time zone,
    ocr_metodo character varying(20),
    siqroo_aplica boolean DEFAULT false NOT NULL,
    siqroo_control_interno character varying(255),
    siqroo_boleta_url character varying(255),
    numero_oficio_origen character varying(120),
    unidad_interna character varying(255),
    fecha_oficio date
);


--
-- Name: oficios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oficios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oficios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oficios_id_seq OWNED BY public.oficios.id;


--
-- Name: tareas_evento; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: tareas_evento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tareas_evento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tareas_evento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tareas_evento_id_seq OWNED BY public.tareas_evento.id;


--
-- Name: tramite_documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tramite_documentos (
    id integer NOT NULL,
    tramite_id integer NOT NULL,
    archivo_url character varying(500) NOT NULL,
    nombre_original character varying(255),
    subido_por_id integer NOT NULL,
    subido_en timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tramite_documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tramite_documentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tramite_documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tramite_documentos_id_seq OWNED BY public.tramite_documentos.id;


--
-- Name: tramites; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: tramites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tramites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tramites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tramites_id_seq OWNED BY public.tramites.id;


--
-- Name: usuario_modulos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_modulos (
    usuario_id integer NOT NULL,
    modulo_id integer NOT NULL,
    asignado_en timestamp without time zone DEFAULT now() NOT NULL,
    asignado_por_id integer NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    rol public.rol_usuario NOT NULL,
    unidad_id integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    cargo character varying(255)
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: asignaciones_juridicas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_juridicas ALTER COLUMN id SET DEFAULT nextval('public.asignaciones_juridicas_id_seq'::regclass);


--
-- Name: auditoria_configuracion_flujos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos ALTER COLUMN id SET DEFAULT nextval('public.auditoria_configuracion_flujos_id_seq'::regclass);


--
-- Name: auditoria_estados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_estados ALTER COLUMN id SET DEFAULT nextval('public.auditoria_estados_id_seq'::regclass);


--
-- Name: auditoria_tramites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_tramites ALTER COLUMN id SET DEFAULT nextval('public.auditoria_tramites_id_seq'::regclass);


--
-- Name: catalogo_dependencias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_dependencias ALTER COLUMN id SET DEFAULT nextval('public.catalogo_dependencias_id_seq'::regclass);


--
-- Name: catalogo_remitentes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_remitentes ALTER COLUMN id SET DEFAULT nextval('public.catalogo_remitentes_id_seq'::regclass);


--
-- Name: catalogo_unidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades ALTER COLUMN id SET DEFAULT nextval('public.catalogo_oficinas_id_seq'::regclass);


--
-- Name: catalogo_unidades_internas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades_internas ALTER COLUMN id SET DEFAULT nextval('public.catalogo_unidades_internas_id_seq'::regclass);


--
-- Name: comentarios_reconsideracion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_reconsideracion ALTER COLUMN id SET DEFAULT nextval('public.comentarios_reconsideracion_id_seq'::regclass);


--
-- Name: comentarios_tarea id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tarea ALTER COLUMN id SET DEFAULT nextval('public.comentarios_tarea_id_seq'::regclass);


--
-- Name: comentarios_tramite id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tramite ALTER COLUMN id SET DEFAULT nextval('public.comentarios_tramite_id_seq'::regclass);


--
-- Name: configuracion_flujos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos ALTER COLUMN id SET DEFAULT nextval('public.configuracion_flujos_id_seq'::regclass);


--
-- Name: evento_directores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_directores ALTER COLUMN id SET DEFAULT nextval('public.evento_directores_id_seq'::regclass);


--
-- Name: eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos ALTER COLUMN id SET DEFAULT nextval('public.eventos_id_seq'::regclass);


--
-- Name: gestiones_contestacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestiones_contestacion ALTER COLUMN id SET DEFAULT nextval('public.gestiones_contestacion_id_seq'::regclass);


--
-- Name: historial_revision_tarea id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_revision_tarea ALTER COLUMN id SET DEFAULT nextval('public.historial_revision_tarea_id_seq'::regclass);


--
-- Name: modulos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos ALTER COLUMN id SET DEFAULT nextval('public.modulos_id_seq'::regclass);


--
-- Name: notificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_id_seq'::regclass);


--
-- Name: oficio_documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficio_documentos ALTER COLUMN id SET DEFAULT nextval('public.oficio_documentos_id_seq'::regclass);


--
-- Name: oficios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios ALTER COLUMN id SET DEFAULT nextval('public.oficios_id_seq'::regclass);


--
-- Name: tareas_evento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas_evento ALTER COLUMN id SET DEFAULT nextval('public.tareas_evento_id_seq'::regclass);


--
-- Name: tramite_documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramite_documentos ALTER COLUMN id SET DEFAULT nextval('public.tramite_documentos_id_seq'::regclass);


--
-- Name: tramites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramites ALTER COLUMN id SET DEFAULT nextval('public.tramites_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: asignaciones_juridicas asignaciones_juridicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_pkey PRIMARY KEY (id);


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_pkey PRIMARY KEY (id);


--
-- Name: auditoria_estados auditoria_estados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_pkey PRIMARY KEY (id);


--
-- Name: auditoria_tramites auditoria_tramites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_pkey PRIMARY KEY (id);


--
-- Name: catalogo_dependencias catalogo_dependencias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_dependencias
    ADD CONSTRAINT catalogo_dependencias_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_dependencias catalogo_dependencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_dependencias
    ADD CONSTRAINT catalogo_dependencias_pkey PRIMARY KEY (id);


--
-- Name: catalogo_unidades catalogo_oficinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades
    ADD CONSTRAINT catalogo_oficinas_pkey PRIMARY KEY (id);


--
-- Name: catalogo_remitentes catalogo_remitentes_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_remitentes
    ADD CONSTRAINT catalogo_remitentes_nombre_key UNIQUE (nombre);


--
-- Name: catalogo_remitentes catalogo_remitentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_remitentes
    ADD CONSTRAINT catalogo_remitentes_pkey PRIMARY KEY (id);


--
-- Name: catalogo_unidades catalogo_unidades_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades
    ADD CONSTRAINT catalogo_unidades_clave_key UNIQUE (clave);


--
-- Name: catalogo_unidades_internas catalogo_unidades_internas_dep_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades_internas
    ADD CONSTRAINT catalogo_unidades_internas_dep_nombre_key UNIQUE (dependencia_id, nombre);


--
-- Name: catalogo_unidades_internas catalogo_unidades_internas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades_internas
    ADD CONSTRAINT catalogo_unidades_internas_pkey PRIMARY KEY (id);


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_pkey PRIMARY KEY (id);


--
-- Name: comentarios_tarea comentarios_tarea_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_pkey PRIMARY KEY (id);


--
-- Name: comentarios_tramite comentarios_tramite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_pkey PRIMARY KEY (id);


--
-- Name: configuracion_flujos configuracion_flujos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_pkey PRIMARY KEY (id);


--
-- Name: evento_directores evento_directores_evento_id_director_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_evento_id_director_id_key UNIQUE (evento_id, director_id);


--
-- Name: evento_directores evento_directores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: gestiones_contestacion gestiones_contestacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_pkey PRIMARY KEY (id);


--
-- Name: historial_revision_tarea historial_revision_tarea_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_pkey PRIMARY KEY (id);


--
-- Name: modulos modulos_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_clave_key UNIQUE (clave);


--
-- Name: modulos modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modulos
    ADD CONSTRAINT modulos_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: oficio_documentos oficio_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficio_documentos
    ADD CONSTRAINT oficio_documentos_pkey PRIMARY KEY (id);


--
-- Name: oficios oficios_folio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_folio_key UNIQUE (folio);


--
-- Name: oficios oficios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_pkey PRIMARY KEY (id);


--
-- Name: tareas_evento tareas_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_pkey PRIMARY KEY (id);


--
-- Name: tramite_documentos tramite_documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_pkey PRIMARY KEY (id);


--
-- Name: tramites tramites_folio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_folio_key UNIQUE (folio);


--
-- Name: tramites tramites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_pkey PRIMARY KEY (id);


--
-- Name: configuracion_flujos uq_cfg_flujos_modulo_rol_unidad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT uq_cfg_flujos_modulo_rol_unidad UNIQUE (modulo_clave, rol_flujo, unidad_id);


--
-- Name: usuario_modulos usuario_modulos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_pkey PRIMARY KEY (usuario_id, modulo_id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_aud_cfg_flujos_actualizado_en; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aud_cfg_flujos_actualizado_en ON public.auditoria_configuracion_flujos USING btree (actualizado_en DESC);


--
-- Name: idx_aud_cfg_flujos_modulo_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aud_cfg_flujos_modulo_clave ON public.auditoria_configuracion_flujos USING btree (modulo_clave);


--
-- Name: idx_auditoria_tramites_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_tramites_fecha ON public.auditoria_tramites USING btree (fecha_cambio DESC);


--
-- Name: idx_auditoria_tramites_tramite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_tramites_tramite ON public.auditoria_tramites USING btree (tramite_id);


--
-- Name: idx_catalogo_remitentes_dep; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalogo_remitentes_dep ON public.catalogo_remitentes USING btree (dependencia_id);


--
-- Name: idx_cfg_flujos_actualizado_en; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfg_flujos_actualizado_en ON public.configuracion_flujos USING btree (actualizado_en DESC);


--
-- Name: idx_cfg_flujos_modulo_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfg_flujos_modulo_clave ON public.configuracion_flujos USING btree (modulo_clave);


--
-- Name: idx_cfg_flujos_unidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfg_flujos_unidad_id ON public.configuracion_flujos USING btree (unidad_id);


--
-- Name: idx_cfg_flujos_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfg_flujos_usuario_id ON public.configuracion_flujos USING btree (usuario_id);


--
-- Name: idx_coment_recon_oficio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coment_recon_oficio ON public.comentarios_reconsideracion USING btree (oficio_id);


--
-- Name: idx_comentarios_recons_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_recons_fecha ON public.comentarios_reconsideracion USING btree (fecha DESC);


--
-- Name: idx_comentarios_recons_oficio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_recons_oficio ON public.comentarios_reconsideracion USING btree (oficio_id);


--
-- Name: idx_comentarios_tarea_autor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_tarea_autor ON public.comentarios_tarea USING btree (autor_id);


--
-- Name: idx_comentarios_tarea_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_tarea_fecha ON public.comentarios_tarea USING btree (creado_en DESC);


--
-- Name: idx_comentarios_tarea_tarea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_tarea_tarea ON public.comentarios_tarea USING btree (tarea_id);


--
-- Name: idx_comentarios_tramite_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_tramite_fecha ON public.comentarios_tramite USING btree (creado_en DESC);


--
-- Name: idx_comentarios_tramite_tramite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comentarios_tramite_tramite ON public.comentarios_tramite USING btree (tramite_id);


--
-- Name: idx_evento_directores_director; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_directores_director ON public.evento_directores USING btree (director_id);


--
-- Name: idx_evento_directores_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evento_directores_evento ON public.evento_directores USING btree (evento_id);


--
-- Name: idx_eventos_creado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_creado_por ON public.eventos USING btree (creado_por_id);


--
-- Name: idx_eventos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_estado ON public.eventos USING btree (estado);


--
-- Name: idx_eventos_fecha_creacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_fecha_creacion ON public.eventos USING btree (fecha_creacion DESC);


--
-- Name: idx_eventos_responsable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_responsable ON public.eventos USING btree (responsable_id);


--
-- Name: idx_historial_rev_autor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_rev_autor ON public.historial_revision_tarea USING btree (autor_id);


--
-- Name: idx_historial_rev_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_rev_fecha ON public.historial_revision_tarea USING btree (creado_en DESC);


--
-- Name: idx_historial_rev_tarea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_rev_tarea ON public.historial_revision_tarea USING btree (tarea_id);


--
-- Name: idx_modulos_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modulos_activo ON public.modulos USING btree (activo);


--
-- Name: idx_modulos_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modulos_clave ON public.modulos USING btree (clave);


--
-- Name: idx_notificaciones_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_created_at ON public.notificaciones USING btree (created_at DESC);


--
-- Name: idx_notificaciones_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_read ON public.notificaciones USING btree (user_id, read);


--
-- Name: idx_notificaciones_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_user_id ON public.notificaciones USING btree (user_id);


--
-- Name: idx_oficio_documentos_oficio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oficio_documentos_oficio ON public.oficio_documentos USING btree (oficio_id);


--
-- Name: idx_oficios_estatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oficios_estatus ON public.oficios USING btree (estatus);


--
-- Name: idx_oficios_fecha_vencimiento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oficios_fecha_vencimiento ON public.oficios USING btree (fecha_vencimiento);


--
-- Name: idx_oficios_folio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oficios_folio ON public.oficios USING btree (folio);


--
-- Name: idx_oficios_ocr_procesado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oficios_ocr_procesado ON public.oficios USING btree (ocr_procesado);


--
-- Name: idx_tareas_evento_asignado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_asignado ON public.tareas_evento USING btree (asignado_a_id);


--
-- Name: idx_tareas_evento_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_estado ON public.tareas_evento USING btree (estado);


--
-- Name: idx_tareas_evento_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_evento ON public.tareas_evento USING btree (evento_id);


--
-- Name: idx_tareas_evento_fecha_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_fecha_comp ON public.tareas_evento USING btree (fecha_compromiso);


--
-- Name: idx_tareas_evento_fecha_prog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_fecha_prog ON public.tareas_evento USING btree (fecha_programada);


--
-- Name: idx_tareas_evento_reasignado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tareas_evento_reasignado ON public.tareas_evento USING btree (reasignado_a_id);


--
-- Name: idx_tramite_docs_tramite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramite_docs_tramite ON public.tramite_documentos USING btree (tramite_id);


--
-- Name: idx_tramites_estatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramites_estatus ON public.tramites USING btree (estatus);


--
-- Name: idx_tramites_fecha_compromiso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramites_fecha_compromiso ON public.tramites USING btree (fecha_compromiso);


--
-- Name: idx_tramites_fecha_creacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramites_fecha_creacion ON public.tramites USING btree (fecha_creacion DESC);


--
-- Name: idx_tramites_folio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramites_folio ON public.tramites USING btree (folio);


--
-- Name: idx_tramites_unidad_creadora; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tramites_unidad_creadora ON public.tramites USING btree (unidad_creadora_id);


--
-- Name: idx_unidades_internas_dep; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unidades_internas_dep ON public.catalogo_unidades_internas USING btree (dependencia_id);


--
-- Name: idx_usuario_modulos_modulo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_modulos_modulo ON public.usuario_modulos USING btree (modulo_id);


--
-- Name: idx_usuario_modulos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_modulos_usuario ON public.usuario_modulos USING btree (usuario_id);


--
-- Name: asignaciones_juridicas asignaciones_juridicas_abogado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_abogado_id_fkey FOREIGN KEY (abogado_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asignaciones_juridicas asignaciones_juridicas_asignado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_asignado_por_id_fkey FOREIGN KEY (asignado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asignaciones_juridicas asignaciones_juridicas_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asignaciones_juridicas
    ADD CONSTRAINT asignaciones_juridicas_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_actualizado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_actualizado_por_id_fkey FOREIGN KEY (actualizado_por_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_usuario_id_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_usuario_id_anterior_fkey FOREIGN KEY (usuario_id_anterior) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: auditoria_configuracion_flujos auditoria_configuracion_flujos_usuario_id_nuevo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_configuracion_flujos
    ADD CONSTRAINT auditoria_configuracion_flujos_usuario_id_nuevo_fkey FOREIGN KEY (usuario_id_nuevo) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: auditoria_estados auditoria_estados_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_estados auditoria_estados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_estados
    ADD CONSTRAINT auditoria_estados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: auditoria_tramites auditoria_tramites_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auditoria_tramites auditoria_tramites_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_tramites
    ADD CONSTRAINT auditoria_tramites_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: catalogo_dependencias catalogo_dependencias_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_dependencias
    ADD CONSTRAINT catalogo_dependencias_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id);


--
-- Name: catalogo_remitentes catalogo_remitentes_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_remitentes
    ADD CONSTRAINT catalogo_remitentes_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id);


--
-- Name: catalogo_unidades_internas catalogo_unidades_internas_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades_internas
    ADD CONSTRAINT catalogo_unidades_internas_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id);


--
-- Name: catalogo_unidades_internas catalogo_unidades_internas_dependencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_unidades_internas
    ADD CONSTRAINT catalogo_unidades_internas_dependencia_id_fkey FOREIGN KEY (dependencia_id) REFERENCES public.catalogo_dependencias(id) ON DELETE CASCADE;


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_encargado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_encargado_id_fkey FOREIGN KEY (encargado_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_reconsideracion comentarios_reconsideracion_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_reconsideracion
    ADD CONSTRAINT comentarios_reconsideracion_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_tarea comentarios_tarea_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_tarea comentarios_tarea_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tarea
    ADD CONSTRAINT comentarios_tarea_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comentarios_tramite comentarios_tramite_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comentarios_tramite comentarios_tramite_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comentarios_tramite
    ADD CONSTRAINT comentarios_tramite_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: configuracion_flujos configuracion_flujos_actualizado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_actualizado_por_id_fkey FOREIGN KEY (actualizado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_modulo_clave_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_modulo_clave_fkey FOREIGN KEY (modulo_clave) REFERENCES public.modulos(clave) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: configuracion_flujos configuracion_flujos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_flujos
    ADD CONSTRAINT configuracion_flujos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: evento_directores evento_directores_director_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_director_id_fkey FOREIGN KEY (director_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: evento_directores evento_directores_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_directores
    ADD CONSTRAINT evento_directores_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: eventos eventos_cerrado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_cerrado_por_id_fkey FOREIGN KEY (cerrado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: eventos eventos_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: eventos eventos_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: gestiones_contestacion gestiones_contestacion_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gestiones_contestacion gestiones_contestacion_subido_por_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestiones_contestacion
    ADD CONSTRAINT gestiones_contestacion_subido_por_secretaria_id_fkey FOREIGN KEY (subido_por_secretaria_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: historial_revision_tarea historial_revision_tarea_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: historial_revision_tarea historial_revision_tarea_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_revision_tarea
    ADD CONSTRAINT historial_revision_tarea_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_tarea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas_evento(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: oficio_documentos oficio_documentos_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficio_documentos
    ADD CONSTRAINT oficio_documentos_oficio_id_fkey FOREIGN KEY (oficio_id) REFERENCES public.oficios(id) ON DELETE CASCADE;


--
-- Name: oficio_documentos oficio_documentos_subido_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficio_documentos
    ADD CONSTRAINT oficio_documentos_subido_por_id_fkey FOREIGN KEY (subido_por_id) REFERENCES public.usuarios(id);


--
-- Name: oficios oficios_dirigido_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_dirigido_a_id_fkey FOREIGN KEY (dirigido_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: oficios oficios_oficial_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_oficial_registro_id_fkey FOREIGN KEY (oficial_registro_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: oficios oficios_oficina_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oficios
    ADD CONSTRAINT oficios_oficina_registro_id_fkey FOREIGN KEY (unidad_registro_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tareas_evento tareas_evento_asignado_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_asignado_a_id_fkey FOREIGN KEY (asignado_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tareas_evento tareas_evento_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tareas_evento tareas_evento_reasignado_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tareas_evento
    ADD CONSTRAINT tareas_evento_reasignado_a_id_fkey FOREIGN KEY (reasignado_a_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tramite_documentos tramite_documentos_subido_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_subido_por_id_fkey FOREIGN KEY (subido_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tramite_documentos tramite_documentos_tramite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramite_documentos
    ADD CONSTRAINT tramite_documentos_tramite_id_fkey FOREIGN KEY (tramite_id) REFERENCES public.tramites(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tramites tramites_creado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_creado_por_id_fkey FOREIGN KEY (creado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tramites tramites_unidad_creadora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramites
    ADD CONSTRAINT tramites_unidad_creadora_id_fkey FOREIGN KEY (unidad_creadora_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_asignado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_asignado_por_id_fkey FOREIGN KEY (asignado_por_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_modulo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES public.modulos(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: usuario_modulos usuario_modulos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_modulos
    ADD CONSTRAINT usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usuarios usuarios_oficina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_oficina_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.catalogo_unidades(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict ObrUsVAHbJEHfemCUbCPQPzPLLl7hRcoC3izjuwJLcxmAhk1famM7waCSeDYDfG

