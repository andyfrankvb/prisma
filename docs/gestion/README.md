# Búsqueda Gestión

Módulo aprobado en QA para consultar estatus de solicitudes, solicitudes por
folio o escritura, referencias de pago y nombres de imagen por delegación.
La pantalla está en `/busqueda-gestion` y su API en `/api/v1/gestion`.

## Integración

- La API utiliza la autenticación y el permiso `busqueda_gestion` de PRISMA.
  Los usuarios asignados ven la tarjeta en el selector. SUPERADMIN conserva su
  entrada a Administración y puede abrir la ruta de Gestión directamente.
- `2026-11-04_busqueda_gestion.sql` registra únicamente el módulo en la base
  principal. Se puede repetir y conserva las asignaciones y filas existentes.
- Gestión abre su pool al realizar la primera consulta autorizada. Si no hay
  una configuración válida, la API de Gestión devuelve 503.
- Se conserva la búsqueda de Referencias aprobada: coincidencia parcial literal,
  cruces por claves de referencia y un solo cálculo para total y página.

## Conexión

Agregar al entorno privado de `app_api` una URL PostgreSQL con una cuenta de
lectura para `consultas_rppc`:

```dotenv
GESTION_DATABASE_URL=postgresql://USUARIO:CLAVE@SERVIDOR:5432/consultas_rppc
```

Los nombres de esquema de la versión aprobada son `chetumal`, `cancun`,
`playa` y `cozumel`. Confirmar acceso de lectura a las tablas de Gestión
en esos esquemas. Codificar caracteres reservados de usuario y contraseña en
la URL; el formato admitido no usa parámetros. En Compose, la API ya consume
`.env.qa` para QA y `.env` para producción. En desarrollo local también se
admite el archivo privado `.env.gestion`. Mantener las credenciales fuera de
Git y del frontend.

El pool usa únicamente `GESTION_DATABASE_URL`, un máximo de tres conexiones
y transacciones de solo lectura. Se conserva la cancelación manual de QA.
Con varias réplicas de la API, la búsqueda y su cancelación necesitan llegar
a la misma instancia; el registro de consultas activas vive en el proceso.

## Despliegue

1. Revisar e integrar la rama mediante un PR contra `main`, según el flujo
   habitual del proyecto. Confirmar configuración de la API y acceso al
   origen de Gestión desde el entorno de despliegue.
2. Revisar las migraciones pendientes y aplicar la de Gestión con el
   procedimiento de PRISMA (`npm run db:migrate`, sobre su base principal).
   No ejecutar migraciones en la base registral.
3. Construir y desplegar las imágenes de API y web con el procedimiento
   vigente. Los archivos Compose, Dockerfiles y Nginx son los existentes.
4. Asignar Búsqueda Gestión a las cuentas autorizadas desde Administración.
   Verificar las cuatro delegaciones, los cuatro tipos de consulta, la lupa,
   la búsqueda parcial de Referencias, la paginación y la cancelación.
   Probar también acceso sin asignación (403), Acervo y el menú existente.

Verificación de esta entrega: compilación de la API y de la web con el layout
del Dockerfile, 25 pruebas de Gestión y 61 de Acervo correctas, migración
idempotente probada en PostgreSQL embebido y arranque de la API sin la conexión
registral. La suite unitaria completa también se comparó con la base
`4d9805b`: los siete fallos observados ya se reproducen en esa base (incluido
el caso aleatorio con la misma semilla).

```sh
npm run build
npx vitest run src/tests/unit/gestion.*.test.ts src/tests/unit/acervo --maxWorkers=1 --minWorkers=1
```

[qa-origen.json](qa-origen.json) registra el origen y los hashes del código
aprobado. Los instaladores locales, informes de diagnóstico, datos reales,
configuraciones privadas y scripts de recuperación de sesiones quedan fuera
de la entrega al repositorio.
