-- Alta del módulo en el catálogo de PRISMA. No modifica conexiones, usuarios,
-- permisos existentes ni tablas de los esquemas registrales GISNET.
-- La asignación a personas se realiza desde Administración > Usuarios.
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'busqueda_acervo',
  'Búsqueda Acervo',
  'Consulta de folios, titulares y antecedentes registrales por delegación.',
  true,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos)
)
ON CONFLICT (clave) DO NOTHING;
