# Dar de alta un área nueva

Se decidió no construir una pantalla para esto: en cuatro meses de proyecto se
creó una sola área, y esa pantalla tocaría la columna vertebral del sistema —de
`catalogo_unidades` cuelgan oficios, usuarios, turnos, paquetes y trámites— para
usarse dos veces al año. Se hace por SQL, con este procedimiento.

> El `sh -c` no es adorno: sin él, `$DATABASE_URL` la expande el shell de la VM
> —que no la tiene— y `psql` termina buscando un servidor local que no existe.

**No hace falta desplegar nada.** Desde que el código del folio es una columna, un
área nueva es un renglón de datos.

---

## 1. Crear el área

En el servidor, dentro de `/opt/prisma`. Ajusta los seis valores antes de correrlo.

```bash
docker run --rm -i --env-file .env postgres:16-alpine sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -' <<'SQL'
INSERT INTO catalogo_unidades
  (nombre,                    clave,          tipo,        codigo_folio, vobo_por,    activo, recibe_direcciones_area)
VALUES
  ('Dirección de Cultura',    'dir_cultura',  'DIRECCION', 'DC',         'ENCARGADO', true,   false)
ON CONFLICT DO NOTHING;

SELECT id, nombre, clave, tipo, codigo_folio, vobo_por FROM catalogo_unidades ORDER BY id;
SQL
```

Qué significa cada campo:

| Campo | Qué poner |
|---|---|
| `nombre` | Como se nombra el área en los documentos. Es lo que ve la gente. |
| `clave` | Identificador interno, sin espacios ni acentos: `dir_algo` o `del_algo`. No se muestra. |
| `tipo` | `DIRECCION`, `DELEGACION` o `DIRECCION_GENERAL` (esta última ya existe y es única). |
| `codigo_folio` | De 2 a 4 letras. Es lo que aparece en el folio: `DC-10_09_2026-0001`. **Único entre áreas activas**; la base lo rechaza si se repite. |
| `vobo_por` | Quién da el visto bueno: `ENCARGADO` o `DELEGADO`. Se puede cambiar después desde Administración. |
| `recibe_direcciones_area` | `true` en delegaciones que reciben oficios de las direcciones de área; `false` en las direcciones. |

---

## 2. Nombrarle encargado

**Este paso no es opcional.** Sin encargado, los oficios dirigidos a esa área
**no caen con nadie**: no aparecen en ninguna bandeja y nadie se entera. Ya pasó
una vez con la Dirección General.

Se hace desde la aplicación, con el superadmin: **Configuración de Flujos** →
módulo Recepción de Oficios → rol `ENCARGADO` → elegir el área y la persona.

---

## 3. Darle sus usuarios

Desde **Administración de Usuarios**, con el superadmin. Al crear cada uno se
elige su área, su rol y sus módulos.

La contraseña que se les ponga al darlos de alta es temporal por diseño: al
entrar, el sistema les exige cambiarla antes de dejarlos hacer nada.

---

## Lo que NO hay que configurar

**Los destinos de turnado.** `configuracion_destinos` es una lista de vetos, no de
permisos: sin renglones, el área nueva puede turnar a todas y recibir de todas. Si
hiciera falta prohibir alguna combinación, se hace desde Administración.

---

## Desactivar un área

Nunca se borra: hay oficios, usuarios y turnos colgando de ella, y `DELETE`
arrastraría o rompería todo eso.

```bash
docker run --rm -i --env-file .env postgres:16-alpine sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -' <<'SQL'
UPDATE catalogo_unidades SET activo = false WHERE clave = 'dir_cultura';
SQL
```

Deja de aparecer como destino y su historia queda intacta. Su `codigo_folio` se
libera para que otra área pueda heredarlo, pero los folios ya emitidos con él no
cambian: un folio es una identidad, no un dato que se recalcula.
