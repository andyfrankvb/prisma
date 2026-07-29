-- Datos de referencia para una BD de producción nueva.
-- Generado del catálogo de dev; los FK de usuario van NULL (no hay usuarios aún).

--
-- PostgreSQL database dump
--


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
-- Data for Name: catalogo_unidades; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (34, 'Dirección General', true, 'DIRECCION_GENERAL', 'dir_general', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (35, 'Dirección de Innovación, Informática y Archivo', true, 'DIRECCION', 'dir_tics', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (36, 'Dirección Jurídica', true, 'DIRECCION', 'dir_juridica', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (39, 'Delegación Playa del Carmen', true, 'DELEGACION', 'del_playa', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (40, 'Delegación Cozumel', true, 'DELEGACION', 'del_cozumel', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (41, 'Dirección Administrativa', true, 'DIRECCION', 'dir_admin', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (37, 'Delegación Othón P. Blanco', true, 'DELEGACION', 'del_opb', 'DELEGADO');
INSERT INTO public.catalogo_unidades (id, nombre, activo, tipo, clave, vobo_por) VALUES (42, 'Delegación Benito Juárez', true, 'DELEGACION', 'del_cancun', 'ENCARGADO');


--
-- Data for Name: modulos; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.modulos (id, clave, nombre_display, descripcion, activo, orden) VALUES (2, 'supervision_eventos', 'Supervisión de Eventos', 'Gestión de eventos operativos y tareas por área.', true, 2);
INSERT INTO public.modulos (id, clave, nombre_display, descripcion, activo, orden) VALUES (36, 'tablero_direccion', 'Tablero de Dirección', 'Métricas, supervisión y monitoreo general de Dirección.', true, 4);
INSERT INTO public.modulos (id, clave, nombre_display, descripcion, activo, orden) VALUES (34, 'tramites_seguimiento', 'Seguimiento de Resoluciones', 'Gestión y seguimiento de resoluciones entre delegaciones y la Dirección Jurídica.', true, 3);
INSERT INTO public.modulos (id, clave, nombre_display, descripcion, activo, orden) VALUES (1, 'oficialia_partes', 'Recepción de Oficios', 'Recepción, registro y seguimiento de oficios oficiales.', true, 1);


--
-- Name: catalogo_oficinas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.catalogo_oficinas_id_seq', 42, true);


--
-- Name: modulos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.modulos_id_seq', 36, true);


--
-- PostgreSQL database dump complete
--



INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (7,'SECRETARIA DE GOBIERNO DE QUINTANA ROO (SEGOB)','t',NULL,'2026-07-24 17:22:21.18367');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (8,'SECRETARÍA DE DESARROLLO AGRARIO, TERRITORIAL Y URBANO','t',NULL,'2026-07-27 16:51:21.492812');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (11,'SECRETARÍA DE FINANZAS Y PLANEACIÓN DEL ESTADO DE QUINTANA ROO','t',NULL,'2026-07-28 16:17:20.63998');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (13,'SERVICIO DE ADMINISTRACIÓN TRIBUTARIA DE QUINTANA ROO (SEFIPLAN))','t',NULL,'2026-07-28 16:43:00.490473');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (14,'REGISTRO PÚBLICO DE LA PROPIEDAD Y DEL COMERCIO DE  QUINTANA ROO.','t',NULL,'2026-07-28 19:23:03.702893');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (15,'SECRETARÍA DE FINANZAS Y PLANEACIÓN','t',NULL,'2026-07-28 21:49:55.087142');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (16,'PODER JUDICIAL DEL ESTADO DE QUINTANA ROO','t',NULL,'2026-07-28 22:27:23.294081');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (17,'ORGANO DE ADMINISTRACIÓN JUDICIAL (FEDERAL)','t',NULL,'2026-07-28 22:28:13.89047');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (18,'XXVII CIRCUITO (QUINTANA ROO)','t',NULL,'2026-07-28 22:29:29.632396');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (19,'JUNTA LOCAL DE CONCILIACIÓN Y ARBITRAJE','t',NULL,'2026-07-28 22:31:03.848122');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (20,'FISCALÍA GENERAL DEL ESTADO DE QUINTANA ROO','t',NULL,'2026-07-28 22:32:07.742125');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (21,'FISCALÍA GENERAL DE LA REPÚBLICA','t',NULL,'2026-07-28 22:36:03.732856');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (22,'AGENCIA DE PROYECTOS ESTRATÉGICOS DEL ESTADO DE QUINTANA ROO','t',NULL,'2026-07-28 22:38:30.475652');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (23,'SECRETARÍA DE DESARROLLO TERRITORIAL URBANO SUSTENTABLE','t',NULL,'2026-07-28 22:40:50.858218');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (25,'SERVICIO DE ADMINISTRACIÓN TRIBUTARIA','t',NULL,'2026-07-28 22:43:14.546278');
INSERT INTO catalogo_dependencias (id,nombre,activo,creado_por_id,creado_en) VALUES (26,'SECRETARÍA DE DESARROLLO TERRITORIAL URBANO SUSTENTABLE (SEDETUS)','t',NULL,'2026-07-29 16:27:30.235552');

INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (1,'SUBDIRECCIÓN DE RECAUDACIÓN ZONA SUR',15,'t',NULL,'2026-07-28 17:09:51.872103');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (4,'JUZGADO FAMILIAR DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (5,'JUZGADO CIVIL DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (6,'JUZGADO PENAL DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (7,'JUZGADO MERCANTIL DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (8,'JUZGADO CIVIL ORAL DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (9,'JUZGADO FAMILIAR ORAL DE PRIMERA INSTANCIA DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (10,'JUZGADO DE JUICIO ORAL PENAL DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (11,'JUEZ LABORAL DEL TRIBUNAL LABORAL DEL DISTRITO JUDICIAL DE CHETUMAL, Q. ROO',16,'t',NULL,'2026-07-28 22:27:23.296462');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (12,'PRIMER TRIBUNAL COLEGIADO DEL VIGÉSIMO SÉPTIMO CIRCUITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (13,'SEGUNDO TRIBUNAL COLEGIADO DEL VIGÉSIMO SÉPTIMO CIRCUITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (14,'TERCER TRIBUNAL COLEGIADO DEL VIGÉSIMO SÉPTIMO CIRCUITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (15,'JUZGADO PRIMERO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (16,'JUZGADO SEGUNDO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (17,'JUZGADO TERCERO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (18,'JUZGADO CUARTO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (19,'JUZGADO QUINTO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (20,'JUZGADO SEXTO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (21,'JUZGADO SÉPTIMO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (22,'JUZGADO OCTAVO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (23,'JUZGADO NOVENO DE DISTRITO',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (24,'JUZGADO DE DISTRITO EN MATERIA MERCANTIL FEDERAL EN EL ESTADO DE QUINTANA ROO, ESPECIALIZADO EN JUICIOS ORALES',18,'t',NULL,'2026-07-28 22:29:29.634547');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (25,'FISCALÍA ESPECIALIZADA PARA LA ATENCIÓN DE DELITOS CONTRA LA MUJER Y POR RAZONES DE GÉNERO',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (26,'FISCALÍA ESPECIALIZADA EN LA INVESTIGACIÓN DE SECUESTROS',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (27,'FISCALÍA ESPECIALIZADA EN INVESTIGACIÓN DE DELITOS CONTRA LA SALUD, EN SU MODALIDAD DE NARCOMENUDEO',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (28,'FISCALÍA ESPECIALIZADA EN COMBATE A LA CORRUPCIÓN',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (29,'POLICÍA DE INVESTIGACIÓN, ADSCRITO A LA FISCALÍA ESPECIALIZADA EN COMBATE A LA CORRUPCIÓN',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (30,'FISCALÍA DE EXTINCIÓN DE DOMINIO',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (31,'FISCALÍA ESPECIALIZADA EN COMBATE A DELITOS PATRIMONIALES, DISTRITO SUR',20,'t',NULL,'2026-07-28 22:32:48.503747');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (32,'AGENTE DEL MINISTERIO PUBLICO DE LA FEDERACION, TITULAR DE LA CELULA B-II-2 CIUDAD DE MÉXICO',21,'t',NULL,'2026-07-28 22:36:47.024409');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (33,'OFICIAL INVESTIGADOR “B”',21,'t',NULL,'2026-07-28 22:36:47.024409');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (34,'AGENTE DEL MINISTERIO PÚBLICO DE LA FEDERACIÓN, FISCAL EN FUNCIONES DE SUPERVISOR DE VENTANILLA UNICA DE ATENCIÓN EN QUINTANA ROO EN APOYO A LA SUPERVISIÓN DE EXHORTOS',21,'t',NULL,'2026-07-28 22:36:47.024409');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (35,'AGENTE DEL MINISTERIO PÚBLICO DE LA FEDERACIÓN, TITULAR DE LA CÉLULA C-I-3 FEIDCSAJ, CIUDAD DE MÉXICO',21,'t',NULL,'2026-07-28 22:36:47.024409');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (36,'AGENTE DE LA POLICIA FEDERAL MINISTERIAL',21,'t',NULL,'2026-07-28 22:36:47.024409');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (37,'DIRECTOR ESTATAL',22,'t',NULL,'2026-07-28 22:38:30.478162');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (38,'COORDINADOR JURÍDICO',22,'t',NULL,'2026-07-28 22:38:30.478162');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (39,'COORDINADOR DE RESERVAS TERRITORIALES',22,'t',NULL,'2026-07-28 22:38:30.478162');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (40,'SUBSECRETARÍA DE VIVIENDA',23,'t',NULL,'2026-07-28 22:40:50.861901');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (41,'DIRECTORA DE REGULARIZACIÓN DE SUELO',23,'t',NULL,'2026-07-28 22:40:50.861901');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (42,'DIRECTOR GENERAL DE INVENTARIOS Y MODERNIZACIÓN REGISTRAL Y CATASTRAL',8,'t',NULL,'2026-07-28 22:42:42.322079');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (43,'DIRECTOR DE TERRENOS NACIONALES',8,'t',NULL,'2026-07-28 22:42:42.322079');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (44,'ADMINISTRADOR(A) DESCONCENTRADA DE RECAUDACIÓN DE QUINTANA ROO “2”',25,'t',NULL,'2026-07-28 22:43:14.547927');
INSERT INTO catalogo_unidades_internas (id,nombre,dependencia_id,activo,creado_por_id,creado_en) VALUES (45,'ASESORES INMOBILIARIOS',26,'t',NULL,'2026-07-29 16:27:42.937202');

-- Realinear las secuencias tras insertar con IDs explícitos
SELECT setval(pg_get_serial_sequence('catalogo_dependencias','id'),      (SELECT COALESCE(MAX(id),1) FROM catalogo_dependencias));
SELECT setval(pg_get_serial_sequence('catalogo_unidades_internas','id'), (SELECT COALESCE(MAX(id),1) FROM catalogo_unidades_internas));
SELECT setval(pg_get_serial_sequence('catalogo_unidades','id'),          (SELECT COALESCE(MAX(id),1) FROM catalogo_unidades));
