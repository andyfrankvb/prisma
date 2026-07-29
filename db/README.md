# Base de datos — migraciones y despliegue

Control de versiones de la base de datos: construir una BD nueva y llevarla, versión
tras versión, sin romperla.

## Estructura

- `db/baseline/schema.sql` — estructura completa (punto de partida para una BD nueva).
- `db/baseline/seed_reference.sql` — datos de referencia (módulos, oficinas, catálogo de
  dependencias/sub-unidades). **Sin** usuarios ni datos de prueba.
- `db/baseline/baselined.txt` — migraciones ya "horneadas" en el baseline.
- `db/migrate.mjs` — runner (aplica lo pendiente, con registro en `schema_migrations`).
- `db/seed-admin.mjs` — crea el usuario SuperAdmin inicial.
- `infra/postgres/migrations/*.sql` — migraciones (una por cambio; ordenadas por fecha).

## Variables de entorno

| Variable | Para qué | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Conexión a la BD (servidor externo) | `postgres://user:pass@10.x.x.x:5432/prisma` |
| `SUPERADMIN_INITIAL_PASSWORD` | Contraseña inicial del admin (solo al sembrar) | *(en el `.env`, nunca en git)* |
| `SUPERADMIN_EMAIL` | Usuario del admin (opcional) | `ticsadmin` |

## Desplegar una BD NUEVA (producción por primera vez)

```bash
npm run db:migrate        # construye el schema + catálogo de referencia
npm run db:seed:admin     # crea el SuperAdmin (usa SUPERADMIN_INITIAL_PASSWORD)
```

## Subir una versión nueva (v2, v3, …)

1. Agrega el cambio como un archivo nuevo en `infra/postgres/migrations/`
   (ej. `2026-08-10_nueva_columna.sql`). **Nunca edites una migración ya aplicada.**
2. Despliega el código nuevo.
3. Corre:

```bash
npm run db:migrate        # aplica SOLO las migraciones nuevas, sin repetir
```

El runner lleva registro en `schema_migrations`, así que es seguro correrlo siempre:
si no hay nada pendiente, no hace nada.

## Reglas de oro

- **Solo hacia adelante:** cada cambio es una migración nueva; no se editan las viejas.
- **Aditivo primero (expand/contract):** agrega lo nuevo, despliega, migra datos, y hasta
  una versión después quitas lo viejo. Así el código viejo y nuevo conviven durante el deploy.
- **Respaldo antes de migrar en producción** (`pg_dump`). Es tu red de seguridad.
- **Prueba en una copia** antes de estrenar una migración en producción.
