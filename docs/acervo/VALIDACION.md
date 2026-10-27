# Verificación de la integración inicial de Acervo (26/10/2026)

Base: `ec1e5e1d3344c5b88f4d9d046651d7cbdc6361ec` de `origin/main`.
Fuente: captura QA aprobada `acervo-qa-aprobado-20261026-135125-f1e1ea.zip`.

## Resultados

- Los 50 archivos de la captura coinciden con sus hashes de entrega.
- API completa: `npm run build`, correcto.
- Web completa: compilación de producción con Vite, correcta. Se usó la misma
  distribución física de `src_frontend` que utiliza el Dockerfile existente.
- Tipado estricto de la pantalla y los componentes de Acervo, correcto.
- Pruebas unitarias de Acervo: 49 aprobadas en cuatro archivos.
- Suite unitaria general: 150 aprobadas y cinco fallidas. Las mismas cinco
  fallan al ejecutar los dos archivos afectados sobre `origin/main` sin Acervo:
  dos en `eventos.utils.test.ts` y tres en `permission.guard.test.ts`.
- La migración nueva se ejecutó dos veces en PostgreSQL embebido (PGlite),
  con datos sintéticos: no duplicó el módulo, ni modificó otros módulos,
  asignaciones existentes o los datos registrales de prueba.
- `git diff --check`, correcto.

## Alcance

Se conserva el contenido de QA en 24 archivos de funcionamiento. Cinco archivos
reciben los ajustes de acceso, configuración de producción y tipado indicados en
`qa-origen.json`. Los únicos cambios en código compartido son diez líneas
añadidas entre `src/server.ts`, `src/frontend/App.tsx` y
`src/frontend/views/SeleccionModulo.tsx`. `.gitignore` excluye adicionalmente
los archivos privados `.env.acervo*`.

No se modificaron `src/db.ts`, las dependencias y sus archivos de bloqueo,
Docker, Nginx, los mecanismos compartidos de autenticación ni otros módulos.
Búsqueda Gestión y los cuatro archivos compartidos completos de la captura QA
no se copiaron sobre el código principal.

No se accedió a las bases reales, no se ejecutaron migraciones en PRISMA ni
GISNET y no se desplegó ni reinició ningún contenedor. La conectividad y los
tiempos contra el servidor real se comprobarán durante el despliegue autorizado.
