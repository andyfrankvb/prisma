# Búsqueda Acervo

Consulta de inmuebles y antecedentes de las cuatro delegaciones, con el diseño
y las búsquedas aprobados por QA. API: `/api/v1/acervo`. Pantalla:
`/busqueda-acervo`.

La identificación permite consultar ambas numeraciones desde el único campo **Folio**.
Los resultados y el detalle presentan **Folio** y **F.R.E.**, enlazados por un
antecedente completo y único en cada fuente. El comportamiento vigente y sus
pruebas se describen en [38_folio_unificado.md](38_folio_unificado.md).

## Integración

- La API usa `authenticate` y `requireModulo('busqueda_acervo', ...)` de PRISMA.
- La pantalla está dentro de `ProtectedRoute` y `AppShell`. El menú obtiene el
  módulo del catálogo y de las asignaciones existentes; no agrega accesos ficticios.
- `2026-10-26_busqueda_acervo.sql` agrega únicamente la entrada al catálogo
  `modulos`, de forma idempotente. Las asignaciones se hacen desde Administración
  > Usuarios. No se otorgan permisos automáticamente.
- El pool de Acervo se crea en la primera petición autorizada. Una configuración
  ausente devuelve 503 solo en Acervo y no impide arrancar PRISMA.

## Conexión independiente

Configurar las variables de `variables.ejemplo` en el archivo de entorno que ya
consume `app_api`. Mantener la URL y los esquemas usados en QA. Las credenciales
reales permanecen fuera de Git.

`ACERVO_DATABASE_URL` configura exclusivamente el pool de Acervo. `DATABASE_URL`,
`src/db.ts`, el pool principal y las conexiones de otros módulos permanecen
sin cambios. En producción solo se admite el origen `gisnet` y la base
`consultas_gisnet`; una variable ausente nunca provoca una conexión a la base
principal por sustitución.

La conexión registral conserva los límites y las opciones de QA: pool máximo
de tres conexiones, sesiones de solo lectura, JIT desactivado y consultas sin
cancelación automática por duración. No se crean tablas, vistas, funciones ni
índices en GISNET.

## Publicación

La rama `feat/busqueda-acervo` se revisa contra `main`. Publicar la rama no
ejecuta migraciones ni despliega contenedores.

Al autorizar la integración y el despliegue:

1. Configurar las variables exclusivas de Acervo en el entorno de la API.
2. Aplicar el procedimiento de migraciones de PRISMA (`npm run db:migrate`,
   conectado a su base principal). La migración nueva solo registra el módulo;
   no se ejecuta sobre `consultas_gisnet`.
3. Construir/publicar las imágenes de API y web con el procedimiento vigente.
   No se requieren cambios en los archivos Docker ni en Nginx para esta ruta.
4. Asignar el módulo a las personas autorizadas y comprobar búsquedas, orden,
   paginación, detalle y cancelación desde el acceso de producción.

La cancelación identifica la sesión PostgreSQL y al usuario de cada búsqueda.
El registro de búsquedas activas es local al proceso de API. La composición
actual utiliza una instancia; un despliegue con varias réplicas necesita
afinidad para que GET y cancelación lleguen al mismo proceso.

## Verificación

```sh
npm ci --ignore-scripts
npm run build
npx vitest run src/tests/unit/acervo --maxWorkers=1 --minWorkers=1
```

El frontend se compila con el Dockerfile web existente, que copia
`src/frontend` como `src_frontend`. Se conservan sin cambios los componentes
de resultados, estilos, ordenamiento SQL y cancelación de la entrega QA.

`qa-origen.json` registra la captura aprobada, sus hashes y los ajustes de
integración. El paquete de exportación, configuraciones privadas, datos de
prueba locales y código de Búsqueda Gestión no forman parte de esta rama.
