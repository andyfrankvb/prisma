-- ── 10 oficios con diferentes estatus ────────────────────────

INSERT INTO oficios (folio, remitente, dependencia_origen, dirigido_a_id, oficial_registro_id, oficina_registro_id, fecha_registro, descripcion_solicitud, tiene_termino, fecha_vencimiento, pdf_original_path, estatus) VALUES
  ('OF-2026-001', 'Lic. Roberto Méndez',     'Secretaría de Finanzas',           5, 1, 1, NOW() - INTERVAL '10 days', 'Solicitud de información sobre presupuesto asignado al área de infraestructura para el ejercicio fiscal 2026.',           false, NULL,                              '/oficios/originales/of-2026-001.pdf', 'RECIBIDO'),
  ('OF-2026-002', 'Ing. Patricia Solis',     'IMSS Delegación Cancún',           5, 1, 1, NOW() - INTERVAL '8 days',  'Requerimiento de documentación médica y expedientes clínicos del personal adscrito a la delegación regional.',           true,  (NOW() + INTERVAL '1 day')::date,  '/oficios/originales/of-2026-002.pdf', 'RECIBIDO'),
  ('OF-2026-003', 'Dr. Alejandro Torres',    'Secretaría de Salud',              5, 1, 1, NOW() - INTERVAL '15 days', 'Solicitud de convenio de colaboración interinstitucional para programas de salud preventiva en zonas rurales.',           false, NULL,                              '/oficios/originales/of-2026-003.pdf', 'ASIGNADO'),
  ('OF-2026-004', 'Mtra. Carmen Villanueva', 'Contraloría del Estado',           2, 1, 1, NOW() - INTERVAL '20 days', 'Auditoría de recursos federales transferidos durante el primer trimestre. Se requiere respuesta en plazo perentorio.',    true,  (NOW() - INTERVAL '2 days')::date, '/oficios/originales/of-2026-004.pdf', 'ASIGNADO'),
  ('OF-2026-005', 'C. Mario Gutiérrez',      'Presidencia Municipal Cancún',     2, 1, 1, NOW() - INTERVAL '12 days', 'Consulta jurídica sobre procedimiento de licitación pública para obra de pavimentación en colonias del norte.',           true,  (NOW() + INTERVAL '3 days')::date, '/oficios/originales/of-2026-005.pdf', 'EN_REVISION'),
  ('OF-2026-006', 'Lic. Sandra Morales',     'Tribunal Superior de Justicia',    5, 1, 1, NOW() - INTERVAL '25 days', 'Notificación de resolución judicial en expediente 2025/4421. Requiere acuse de recibo y respuesta formal.',              false, NULL,                              '/oficios/originales/of-2026-006.pdf', 'EN_REVISION'),
  ('OF-2026-007', 'Ing. Felipe Ramírez',     'CONAGUA Región Sureste',           5, 1, 1, NOW() - INTERVAL '30 days', 'Solicitud de opinión técnica sobre proyecto de infraestructura hidráulica en municipios de la zona maya.',              true,  (NOW() + INTERVAL '5 days')::date, '/oficios/originales/of-2026-007.pdf', 'VOBO_APROBADO'),
  ('OF-2026-008', 'Dra. Lucía Hernández',    'SEP Delegación Quintana Roo',      2, 1, 1, NOW() - INTERVAL '35 days', 'Requerimiento de información sobre plantilla docente y contratos vigentes en escuelas de educación básica.',            false, NULL,                              '/oficios/originales/of-2026-008.pdf', 'VOBO_APROBADO'),
  ('OF-2026-009', 'Lic. Jorge Castillo',     'Procuraduría General de Justicia', 5, 1, 1, NOW() - INTERVAL '45 days', 'Solicitud de colaboración en investigación ministerial. Requiere entrega de documentos en plazo de 5 días hábiles.',   true,  (NOW() - INTERVAL '5 days')::date, '/oficios/originales/of-2026-009.pdf', 'FINALIZADO'),
  ('OF-2026-010', 'Mtra. Ana Pérez',         'SEMARNAT Delegación Federal',      2, 1, 1, NOW() - INTERVAL '50 days', 'Consulta sobre impacto ambiental de proyecto de desarrollo turístico en zona costera protegida del estado.',             false, NULL,                              '/oficios/originales/of-2026-010.pdf', 'FINALIZADO');

-- ── Asignaciones jurídicas ────────────────────────────────────

INSERT INTO asignaciones_juridicas (oficio_id, abogado_id, asignado_por_id, fecha_asignacion, observaciones)
SELECT o.id, 3, 2,
  o.fecha_registro + INTERVAL '1 day',
  CASE o.folio
    WHEN 'OF-2026-003' THEN 'Revisar antecedentes del convenio anterior de 2023.'
    WHEN 'OF-2026-004' THEN 'URGENTE: responder antes del vencimiento. Coordinar con contraloría interna.'
    WHEN 'OF-2026-005' THEN 'Analizar bases de licitación adjuntas y emitir opinión jurídica.'
    WHEN 'OF-2026-006' THEN 'Preparar acuse formal y respuesta al tribunal.'
    WHEN 'OF-2026-007' THEN 'Revisar normativa ambiental aplicable al proyecto.'
    WHEN 'OF-2026-008' THEN 'Solicitar información a RH antes de responder.'
    WHEN 'OF-2026-009' THEN 'Coordinación con área de transparencia para entrega de documentos.'
    ELSE NULL
  END
FROM oficios o
WHERE o.folio IN ('OF-2026-003','OF-2026-004','OF-2026-005','OF-2026-006','OF-2026-007','OF-2026-008','OF-2026-009');

-- ── Gestiones de contestación ─────────────────────────────────

INSERT INTO gestiones_contestacion (oficio_id, proyecto_url, escaneo_firmado_url, vobo_encargado, fecha_vobo, subido_por_secretaria_id)
SELECT
  o.id,
  '/oficios/proyectos/' || lower(replace(o.folio, '-', '_')) || '_borrador.pdf',
  CASE WHEN o.estatus IN ('VOBO_APROBADO','FINALIZADO')
    THEN '/oficios/firmados/' || lower(replace(o.folio, '-', '_')) || '_firmado.pdf'
    ELSE NULL END,
  CASE WHEN o.estatus IN ('VOBO_APROBADO','FINALIZADO') THEN true ELSE false END,
  CASE WHEN o.estatus IN ('VOBO_APROBADO','FINALIZADO')
    THEN o.fecha_registro + INTERVAL '7 days'
    ELSE NULL END,
  CASE WHEN o.estatus = 'FINALIZADO' THEN 4 ELSE NULL END
FROM oficios o
WHERE o.folio IN ('OF-2026-005','OF-2026-006','OF-2026-007','OF-2026-008','OF-2026-009','OF-2026-010');

-- ── Auditoría de estados ──────────────────────────────────────

INSERT INTO auditoria_estados (oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio)
SELECT o.id, NULL, 'RECIBIDO', 1, o.fecha_registro
FROM oficios o WHERE o.folio LIKE 'OF-2026-%';

INSERT INTO auditoria_estados (oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio)
SELECT o.id, 'RECIBIDO', 'ASIGNADO', 2, o.fecha_registro + INTERVAL '1 day'
FROM oficios o
WHERE o.folio IN ('OF-2026-003','OF-2026-004','OF-2026-005','OF-2026-006','OF-2026-007','OF-2026-008','OF-2026-009','OF-2026-010');

INSERT INTO auditoria_estados (oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio)
SELECT o.id, 'ASIGNADO', 'EN_REVISION', 3, o.fecha_registro + INTERVAL '3 days'
FROM oficios o
WHERE o.folio IN ('OF-2026-005','OF-2026-006','OF-2026-007','OF-2026-008','OF-2026-009','OF-2026-010');

INSERT INTO auditoria_estados (oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio)
SELECT o.id, 'EN_REVISION', 'VOBO_APROBADO', 2, o.fecha_registro + INTERVAL '7 days'
FROM oficios o
WHERE o.folio IN ('OF-2026-007','OF-2026-008','OF-2026-009','OF-2026-010');

INSERT INTO auditoria_estados (oficio_id, estado_anterior, estado_nuevo, usuario_id, fecha_cambio)
SELECT o.id, 'VOBO_APROBADO', 'FINALIZADO', 4, o.fecha_registro + INTERVAL '10 days'
FROM oficios o
WHERE o.folio IN ('OF-2026-009','OF-2026-010');
