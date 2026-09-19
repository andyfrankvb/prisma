-- Nuevo módulo de menú: Consulta Pública (histórico de búsquedas + catálogo
-- de vigilancia). El acceso por usuario se otorga aparte, vía
-- `usuario_modulos` (Admin > Usuarios) — esta migración solo da de alta el
-- módulo en el catálogo, igual que el resto de `modulos`.
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'consultas',
  'Consulta Pública',
  'Histórico de búsquedas de Consulta Pública SIQROO y catálogo de vigilancia.',
  true,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos)
)
ON CONFLICT (clave) DO NOTHING;
