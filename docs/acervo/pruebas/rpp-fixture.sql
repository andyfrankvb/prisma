CREATE SCHEMA __ESQUEMA__;
CREATE TABLE __ESQUEMA__.oficinas (id_oficina numeric, nom_oficina text);
INSERT INTO __ESQUEMA__.oficinas VALUES (1, 'CHETUMAL');
CREATE TABLE __ESQUEMA__.unidades_medida (id_unidad numeric, desc_unidad text);
INSERT INTO __ESQUEMA__.unidades_medida VALUES (1, 'm2');
CREATE TABLE __ESQUEMA__.inmobiliario (
  nu_folio numeric, nu_ofic numeric, expcat text, superficie_total text, unidad_medida numeric,
  calle text, colonia text, lote text, manzana text, medcol text, localidad text,
  num_ext text, num_int text, supermanzana text, fraccionamiento text, condominio text, predio_conocido text
);
INSERT INTO __ESQUEMA__.inmobiliario (nu_folio, nu_ofic, superficie_total, unidad_medida) VALUES (509254, 1, '128', 1);
CREATE TABLE __ESQUEMA__.propietarios (id_prop numeric, nom_tit text, patern text, matern text);
INSERT INTO __ESQUEMA__.propietarios VALUES (1, 'PERSONA', 'DE', 'PRUEBA');
CREATE TABLE __ESQUEMA__.prop_inmob (nu_folio numeric, nu_ofic numeric, id_prop numeric, nu_secuen numeric, status numeric);
INSERT INTO __ESQUEMA__.prop_inmob VALUES (509254, 1, 1, 1, 1);
CREATE TABLE __ESQUEMA__.tipo_acto (id_acto text, desc_acto text);
INSERT INTO __ESQUEMA__.tipo_acto VALUES ('BI1', 'ACTO DE PRUEBA'), ('BI17', 'SEGUNDO ACTO DE PRUEBA');
CREATE TABLE __ESQUEMA__.mesa_control (
 id_mc numeric, folio numeric, id_ofi numeric, seccion text, tomo text, volumen text,
 doc_inicial text, doc_final text, foja_inicial numeric, foja_final numeric,
 acto text, consecutivo numeric, fecha_insc timestamp
);
INSERT INTO __ESQUEMA__.mesa_control VALUES
 (367102, 509254, 1, '01', 'XLIV', '01_01', '0365', NULL, 366, 366, 'BI1', 1, '1987-03-13'),
 (396870, 509254, 1, '02', 'XXXI', '01_01', '0345', NULL, 0, 0, 'BI17', 2, '1987-03-13');
CREATE TABLE __ESQUEMA__.mov_inmob (
 nu_folio numeric, nu_ofic numeric, nu_consec numeric, nu_prelac numeric, fe_prelac timestamp,
 hr_prelac timestamp, fe_regist timestamp, acto text, status text, status_mov text, id_mov numeric
);
INSERT INTO __ESQUEMA__.mov_inmob VALUES
 (509254, 1, 1, 365, '1987-03-13', '1987-03-13', '1987-03-13', 'BI1', '1', '1', 1),
 (509254, 1, 2, 345, '1987-03-13', '1987-03-13', '1987-03-13', 'BI17', '1', '1', 2);
CREATE TABLE __ESQUEMA__.lista_tomos_gisnet (
 nu_folio numeric, nu_ofic numeric, acto text, nu_consec numeric, tomo text, seccion text,
 volumen text, nu_prelac numeric, foja_inicial numeric, foja_final numeric, fe_prelac timestamp, id_imagen numeric
);
CREATE TABLE __ESQUEMA__.lista_tomos_rpp (LIKE __ESQUEMA__.lista_tomos_gisnet);
INSERT INTO __ESQUEMA__.lista_tomos_gisnet VALUES
 (509254, 1, 'BI1', 1, 'XLIV', '01', '01_01', 365, 366, 366, '1987-03-13', 362829),
 (509254, 1, 'BI17', 2, 'XXXI', '02', '01_01', 345, 0, 0, '1987-03-13', 372161);
INSERT INTO __ESQUEMA__.lista_tomos_rpp VALUES
 (107301, 1, 'BI1', 1, 'XLIV', '1', '01_01', 365, 366, 366, '1987-03-13', 371521);
