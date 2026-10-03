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
docker run -d --name db16 --network prisma_app_net -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=prisma_prod -p 5433:5432 -v prisma_db16:/var/lib/postgresql/data postgres:16-alpine
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
DUMP=$(ls -t ~/respaldos-prisma/prisma-*.dump | head -1) && docker run --rm --network prisma_app_net -v "$HOME/respaldos-prisma:/r" postgres:16-alpine pg_restore -d postgresql://postgres:postgres@db16:5432/prisma_prod --no-owner --no-privileges --clean --if-exists "/r/$(basename "$DUMP")"
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

## Atajo: sin pasar por el servidor

Cuando la VPN alcanza la base de producción desde la Mac —se comprueba con
`nc -z 10.1.100.133 5432`— los pasos 1, 2 y 4 sobran: el respaldo se genera
directo y se ahorra el SSH y el `scp`.

```bash
cd /Users/andyfrank/projects/prisma && PGURL=$(grep -E '^#DATABASE_URL=postgres' .env | head -1 | sed 's/^#//; s/^DATABASE_URL=//') && mkdir -p ~/respaldos-prisma && docker run --rm -e PGURL="$PGURL" -v "$HOME/respaldos-prisma:/respaldo" postgres:16-alpine sh -c 'pg_dump "$PGURL" -Fc --no-owner --no-privileges --exclude-table-data=actos_rpp --exclude-table-data="satq_*" --exclude-table-data="productividad_*" --exclude-table-data=fre_folios -f /respaldo/prisma-$(date +%Y%m%d-%H%M).dump'
```

Toma la cadena de conexión de la línea comentada del `.env`, así que la
contraseña no se escribe en la terminal ni queda en el historial.

### Por qué deja fuera los datos de los reportes

Producción pesa 2,833 MB y **el 83% son cuatro familias de tablas de reportes**:

| | |
|---|---|
| `actos_rpp` | 1,261 MB |
| `satq_*` | 495 MB |
| `productividad_*` | 411 MB |
| `fre_folios` | 181 MB |
| Tablas del Visor | 412 MB |
| Todo lo demás | ~70 MB |

`--exclude-table-data` trae su **estructura pero no su contenido**, así que la
aplicación funciona completa y esas pantallas salen vacías. El respaldo baja de
2,833 MB a 22 MB comprimidos y tarda minuto y medio en vez de una hora larga por
la VPN. Para diagnosticar los 504 del reporte *Universo de Actos Registrales* sí
hace falta la copia completa: se quitan esas cuatro opciones.

---

## Volver a la base de pruebas

```bash
DATABASE_URL=postgresql://postgres:postgres@db:5432/oficialia_partes docker compose up -d app_api && docker restart app_web
```

---

## Las trampas

**El `.env` local no debe apuntar a PRODUCCIÓN.** Si tiene `DATABASE_URL` con la
dirección de `10.1.100.133`, un `docker compose up -d app_api` **sin** la variable
al principio hace que la API local escriba en la base real. En la Mac esa línea
está comentada con `#`, así que sin variable se usa la base de pruebas; aun así,
ponerla en los pasos 7 y de vuelta deja claro a qué base se conecta.

**Reiniciar nginx después de cambiar de base.** `docker compose up -d app_api` no
reinicia el contenedor: lo **recrea**, y al recrearse cambia de IP. Nginx resuelve
el nombre `app_api` una sola vez, al arrancar, así que se queda apuntando al
contenedor viejo y todo responde **502 Bad Gateway** — aunque la API esté perfecta
y conteste bien si se le habla directo al puerto 3000. Por eso los comandos de los
pasos 7 y de vuelta llevan `&& docker restart app_web`.

**El `pg_dump` de la Mac es más nuevo que el `pg_restore` del contenedor.**
Homebrew instala PostgreSQL 18 y los contenedores son 16. Un respaldo hecho con
el `pg_dump` de la Mac falla al restaurarse con
`unsupported version (1.16) in file header`, y falla **al instante**, lo que
parece que no hizo nada. Por eso todos los comandos de arriba generan el
respaldo **dentro de un contenedor `postgres:16-alpine`**, igualando la versión
de producción. Se comprueba con `pg_dump --version` contra
`docker exec db16 pg_restore --version`.

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
