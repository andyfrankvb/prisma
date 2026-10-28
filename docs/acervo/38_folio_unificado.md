# Campo Folio con búsqueda en ambas numeraciones

En **Por inmueble** hay un solo campo **Folio**. El mismo valor se busca como
folio GISNET o como folio RPP asociado mediante el cruce de antecedentes ya
implementado. La búsqueda precisa compara terminaciones; la aproximada compara
contenido. Los demás filtros se combinan con AND.

Las tablas de Inmueble y Antecedente presentan **Folio** (GISNET) y **F.R.E.**
(RPP). El detalle usa las mismas etiquetas. Un inmueble coincidente por ambos
números aparece una sola vez. Si el mismo número es Folio de un inmueble y
F.R.E. de otro, se muestran ambos resultados con sus numeraciones respectivas.
Se conservan los cinco encabezados ordenables aprobados; F.R.E. no añade una
sexta opción de orden.

El parámetro de la API es `folio`; se elimina el filtro separado `folio_rpp`.
Los campos de respuesta `folio`, `folio_gisnet`, `folios_rpp` y `rpp_estado`
conservan la separación de datos. Los nombres técnicos no son encabezados de UI.

La relación continúa exigiendo antecedentes completos y unicidad en ambos
sentidos. Los duplicados del mismo folio se deduplican; los vínculos ambiguos
no se presentan como equivalencias confirmadas. Si falta la fuente RPP de una
delegación, Folio permanece habilitado para buscar en GISNET y la columna
F.R.E. informa que la fuente no está disponible.

La información de F.R.E. se obtiene en conjunto para los resultados de la
página y las sugerencias. Se incluye en la misma sentencia SQL que filtra,
cuenta y pagina, conservando el control existente de cancelación manual. No se
agregan consultas individuales por cada fila ni modificaciones a la base.

## Verificación

- API completa: compila.
- Empaquetado de producción con Vite y tipado estricto de Acervo: correctos.
- 59 pruebas unitarias de Acervo aprobadas.
- 13 grupos SQL con datos sintéticos en PostgreSQL embebido: ambos números y
  terminaciones, resultados por propietario y antecedente, números coincidentes
  en inmuebles distintos, coincidencia doble sin duplicados, aproximación,
  duplicados de origen, oficinas, ambigüedad, varios F.R.E., filtros combinados,
  paginación, claves incompletas y fuente RPP ausente.
- Chromium con API simulada: campo único, encabezados y datos, detalle, cinco
  opciones de orden, oficina sin fuente RPP, escritorio y móvil.

El tipado global del frontend registra errores previos fuera de Acervo,
incluido `VisorDocumentos.tsx`; también se reproducen en el `main` base sin
esta ampliación. No se modificaron esos componentes. La comprobación de tipos
de Acervo y el empaquetado con Vite se ejecutaron por separado.

El verificador SQL reproducible es `docs/acervo/verificar-rpp.mjs`, sobre una
base exclusiva terminada en `_test` o `_pruebas`. No usa las variables de las
conexiones principal o de Acervo como alternativa.

El servidor privado debe comprobarse desde la computadora del usuario. El
paquete de QA incluye una comprobación de solo lectura con 107301 y 509254.
Esta entrega no modifica conexiones, dependencias, Docker, Oficialía ni Gestión,
ni publica o fusiona la rama automáticamente.
