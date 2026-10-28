# Búsqueda por folios GISNET y RPP

La pantalla de Inmueble incorpora dos campos separados: Folio GISNET y Folio
RPP. Cualquiera permite buscar por terminación en el modo preciso; el modo
aproximado conserva la búsqueda por contenido. Si se capturan ambos, deben
corresponder al mismo inmueble. Los filtros de propietario y ubicación, la
paginación y las cinco columnas ordenables se conservan.

El detalle de un resultado muestra Folio GISNET y Folio RPP. Si hay varios
RPP vinculados mediante antecedentes distintos, presenta todos. El número
GISNET conserva el parámetro `folio` de la API; el nuevo filtro es `folio_rpp`.
`folio_id` continúa siendo un identificador interno.

## Fuentes y criterio

Se cruzan `lista_tomos_gisnet` y `lista_tomos_rpp` dentro del esquema de la
delegación. La clave exige coincidencia de oficina, acto, consecutivo, tomo,
sección, volumen, número de prelación, fojas inicial/final y fecha de prelación.
No se enlaza por número de imagen: el caso 509254/107301 tiene imágenes
distintas, pero comparte el antecedente BI1 de la sección 1, tomo XLIV,
volumen 01_01, número 365 y foja 366, con fecha 13/03/1987.

La sección numérica se normaliza sin convertir tomos romanos; los textos se
comparan sin diferencias de mayúsculas y espacios exteriores. Se requieren
valores completos y un número de folio positivo entero. Para cada clave se
cuentan los folios distintos en **ambas** fuentes completas: si hay más de uno
en cualquiera de los lados, esa clave no genera una equivalencia confirmada.
Los duplicados del mismo folio se deduplican.

La unicidad se comprueba durante la consulta; no se presupone que todos los
folios tengan una correspondencia de uno a uno. El detalle distingue vínculo
encontrado, ausencia de coincidencia, ambigüedad, coincidencia parcial y fuente
no disponible. Las candidatas ambiguas no se muestran como folios confirmados.

Cada delegación anuncia `rpp_disponible` cuando dispone de ambas fuentes con
columnas y tipos compatibles. Cuando no es así, solo se deshabilita su campo
RPP y se conserva la búsqueda GISNET. El cruce no se calcula en las búsquedas
GISNET habituales; se ejecuta al buscar por RPP o al abrir el detalle.

## Operación

Esta ampliación no agrega migraciones ni modifica tablas, vistas, índices,
usuarios o permisos. Utiliza el pool independiente de Acervo y sus sesiones
de solo lectura. `DATABASE_URL`, `src/db.ts`, Docker, Nginx y las dependencias
compartidas conservan sus configuraciones. No se incluye Búsqueda Gestión.
Las búsquedas mantienen la cancelación manual existente, sin corte automático
por duración.

La rama se prepara sobre `main` en
`861033485712ed53ab595a39b6b9d10c60710638`, que ya contiene la integración
inicial de Acervo. El despliegue corresponde al procedimiento del project
manager; publicar una rama no ejecuta este despliegue.

## Validación

- API completa, frontend de producción y tipado estricto de Acervo: correctos.
- 59 pruebas unitarias de Acervo aprobadas.
- Interfaz en Chromium con cliente simulado: dos campos y detalle con ambas
  numeraciones, filtros enviados, cinco columnas ordenables, delegación sin RPP
  y visualización móvil sin desbordamiento global ni errores JavaScript.
- Nueve grupos de comprobaciones SQL sobre PostgreSQL embebido, con datos
  sintéticos: caso 509254/107301, terminaciones, duplicados, oficinas, ambigüedad
  en ambos sentidos, varios RPP, filtros combinados, orden/paginación,
  antecedentes incompletos y fuentes ausentes.

La suite general de unidades registra seis fallos ajenos a Acervo, también
reproducidos en `main` sin esta ampliación: dos en Eventos, tres en el guard de
permisos y uno en la propiedad de Supervisión. No se modificaron esos módulos.
La suite específica de Acervo pasa completa.

La verificación SQL es reproducible sobre una base exclusiva terminada en
`_test` o `_pruebas`:

```sh
npm run build
ACERVO_TEST_DATABASE_URL='postgresql://USUARIO:CLAVE@SERVIDOR/prisma_test' node docs/acervo/verificar-rpp.mjs
```

El verificador crea y elimina un esquema de prueba de nombre aleatorio. No
usa las variables de las conexiones principal o de Acervo como alternativa.
El caso real fue aportado mediante el diagnóstico de solo lectura del usuario;
no se ha ejecutado el código nuevo contra el servidor interno desde este entorno.
