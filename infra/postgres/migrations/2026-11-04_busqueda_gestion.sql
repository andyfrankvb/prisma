-- Alta de Búsqueda Gestión en la base principal de PRISMA.
-- Las asignaciones se gestionan desde Administración > Usuarios.
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'busqueda_gestion',
  'Búsqueda Gestión',
  'Consulta de solicitudes, referencias y nombres de imagen',
  true,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos)
)
ON CONFLICT (clave) DO NOTHING;
