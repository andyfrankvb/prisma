# Traer una copia de la base de producción a la Mac

Para probar con datos reales sin tocar producción y sin perder los datos de prueba
locales.

## Cómo queda montado

En la Mac conviven **dos bases**, y se cambia de una a otra con un comando:

| | Contenedor | Base | Qué tiene |
|---|---|---|---|
| Pruebas | `db` (PostgreSQL 15) | `oficialia_partes` | Los datos con los que se trabaja a diario |
| Copia real | `db16` (PostgreSQL 16) | `prisma_prod` | La foto de producción |

Son dos porque **producción corre PostgreSQL 16 y el local es 15**. Un respaldo de
16 no se restaura en un 15 —PostgreSQL no va hacia atrás y `pg_restore` puede
fallar a media carga—, así que la copia vive en su propio contenedor de la misma
versión. De paso, la base de pruebas nunca se pisa.

Si `db16` no existe todavía, se crea una sola vez:

```bash
docker run -d --name db16 --network odg_app_net -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=prisma_prod -p 5433:5432 -v prisma_db16:/var/lib/postgresql/data postgres:16-alpine
```

---

## EN EL SERVIDOR

Por SSH a la VM, dentro de `/opt/prisma`.

**1. Generar el respaldo.**

```bash
docker run --rm --env-file .env -v "$HOME:/respaldo" postgres:16-alpine sh -c 'pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f /respaldo/prisma-$(date +%Y%m%d-%H%M).dump'
```

`--no-owner --no-privileges` evita que el respaldo arrastre al usuario `sentinel`
y los permisos de producción, que en la Mac no existen.

**2. Comprobar que salió.**

```bash
ls -lh ~/prisma-*.dump
```

---

## EN LA MAC

Terminal local, sin SSH.

**3. Preparar la carpeta.** Va fuera del repositorio a propósito: el `.gitignore`
no excluye los `.dump` y el archivo trae todos los datos de producción.

```bash
mkdir -p ~/respaldos-prisma
```

**4. Bajarlo.** Las comillas simples son necesarias: sin ellas zsh intenta
expandir el `*` en la Mac, no encuentra nada y aborta con `no matches found`.

```bash
scp 'maquina@10.1.100.155:~/prisma-*.dump' ~/respaldos-prisma/
```

**5. Cargarlo.** Toma automáticamente el respaldo más reciente.

```bash
DUMP=$(ls -t ~/respaldos-prisma/prisma-*.dump | head -1) && docker run --rm --network odg_app_net -v "$HOME/respaldos-prisma:/r" postgres:16-alpine pg_restore -d postgresql://postgres:postgres@db16:5432/prisma_prod --no-owner --no-privileges --clean --if-exists "/r/$(basename "$DUMP")"
```

**6. Verificar que llegaron los datos.**

```bash
docker exec -i db16 psql -U postgres -d prisma_prod -c "SELECT (SELECT count(*) FROM oficios) oficios, (SELECT count(*) FROM usuarios) usuarios, (SELECT count(*) FROM eventos) eventos;"
```

**7. Apuntar la API a la copia.** Dentro de la carpeta del proyecto.

```bash
DATABASE_URL=postgresql://postgres:postgres@db16:5432/prisma_prod docker compose up -d app_api && docker restart app_web
```

---

## Volver a la base de pruebas

```bash
DATABASE_URL=postgresql://postgres:postgres@db:5432/oficialia_partes docker compose up -d app_api && docker restart app_web
```

---

## Las tres trampas

**El `.env` local apunta a PRODUCCIÓN.** Tiene `DATABASE_URL` con la dirección de
`10.1.100.133`. Un `docker compose up -d app_api` **sin** la variable al principio
hace que la API local escriba en la base real. La variable de la línea de comandos
gana sobre el `.env`, pero hay que ponerla siempre.

**Reiniciar nginx después de cambiar de base.** `docker compose up -d app_api` no
reinicia el contenedor: lo **recrea**, y al recrearse cambia de IP. Nginx resuelve
el nombre `app_api` una sola vez, al arrancar, así que se queda apuntando al
contenedor viejo y todo responde **502 Bad Gateway** — aunque la API esté perfecta
y conteste bien si se le habla directo al puerto 3000. Por eso los comandos de los
pasos 7 y de vuelta llevan `&& docker restart app_web`.

**Los PDF no van a abrir.** Viven en la carpeta compartida SMB del servidor, no en
la base. Los renglones apuntan a archivos que la Mac no tiene. Los datos están
completos; los documentos no.

---

## Otras notas

- Con la copia cargada se entra con **las cuentas y contraseñas de producción**.
  Las del local no sirven ahí.
- El respaldo es una foto del momento. Para refrescarlo se repiten los pasos 1 a 5;
  el `--clean --if-exists` reemplaza lo anterior sin borrar nada a mano.
- `docker stop db16` lo apaga cuando no se use y `docker start db16` lo devuelve
  con todo dentro.
