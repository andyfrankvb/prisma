# Inventario del acervo del Visor (recurso compartido del SID)

Levantado el 2026-10-02 contra `\\10.1.100.175\direccion_tics\SID\VISOR` y el
catálogo del SID (`sid_catalogo`: `visor_pdf_index`, `sid_inscripciones_control`).

El propósito es saber qué hay en el acervo antes de seguir cargándolo: cuánto
está publicado, cuánto está catalogado y listo, y cuánto existe en disco sin que
el SID lo registre.

## 1. Lo que ya está publicado en PRISMA

| | |
|---|---|
| Archivos | 638,171 PDF |
| Tomos | 746 |
| Delegaciones | Cancún, Chetumal, Cozumel, Playa del Carmen |
| Secciones | 3, 4, 5, 6 y 7 |
| Ubicación | `VISOR/Secciones/...` |

**Verificado:** de 400 rutas tomadas al azar del catálogo cargado, **400 existen
en el recurso compartido y tienen contenido**. Ningún archivo vacío, ninguno
faltante.

**Verificado:** las 746 carpetas distintas del disco corresponden a 746 tomos en
PRISMA. Un tomo, una carpeta: la unificación por número romano y volumen no
mezcló material de carpetas distintas.

## 2. Inscripciones catalogadas y listas

`sid_inscripciones_control` tiene **190,404** renglones: 189,793 en estado `OK` y
611 `PENDIENTE` (conversión sin terminar del lado del SID).

Viven en las carpetas de delegación, **no** bajo `Secciones`:

| Carpeta | Archivos |
|---|---|
| `VISOR/CANCUN` | 132,454 |
| `VISOR/CHETUMAL` | 38,812 |
| `VISOR/COZUMEL` | 8,008 |
| `VISOR/CHETUMAL/chetumal_abril09/ImgsNotInOracle` | 5,741 |
| `VISOR/PLAYA` | 4,754 |
| otras subcarpetas sueltas | 24 |

Por delegación y sección (solo estado `OK`):

| Delegación | Sección 1 | Sección 2 | Otras |
|---|---|---|---|
| Cancún | 113,649 | 18,805 | — |
| Chetumal | 36,483 | 8,049 | 21 (secc. 4,5,6,7) |
| Cozumel | 4,157 | 3,849 | 8 (secc. 4) |
| Playa del Carmen | 4,604 | 168 | — |

**Verificado:** de 150 rutas de destino tomadas al azar, **150 existen en el
recurso compartido**. El catálogo trae ruta, tomo, sección, volumen y número de
inscripción, así que se puede cargar sin recorrer el disco.

Esto cubre **secciones 1 y 2**, que son justo las que no tiene el acervo de
libros ya publicado.

## 3. Acervo en disco que el SID no registra

Tres carpetas de primer nivel quedan fuera de `visor_pdf_index`:

| Carpeta | Archivos | Formato |
|---|---|---|
| `PEM2023` | 187,347 | PDF |
| `PEM2024` | 7,147 | PDF |
| `INSCRIPCIONES` | 63,198 | TIFF (63,191 `.tif`) |

### 3.1 PEM2023 y PEM2024 — PDF ya convertidos

Cada lote se divide en `LIBRO` e `INSCRIPCIONES`:

| Lote | Rama | Archivos |
|---|---|---|
| PEM2023 | Cozumel / LIBRO | 73,966 |
| PEM2023 | Chetumal / LIBRO | 63,400 |
| PEM2023 | Chetumal / INSCRIPCIONES | 40,502 |
| PEM2023 | Cozumel / INSCRIPCIONES | 9,479 |
| PEM2024 | Benito Juárez / Inscripciones | 4,442 |
| PEM2024 | Benito Juárez / Libros | 2,705 |

**Libros: 140,071 PDF en 734 combinaciones de tomo y volumen, todas de
secciones 01 y 02.** Cero cruce con lo publicado, que va de la 3 a la 7. Es
acervo nuevo, no una segunda copia.

**Inscripciones: 54,423 nombres distintos. 33,650 de ellos no existen en
`sid_inscripciones_control`.** Es decir, alrededor del 62% son inscripciones
digitalizadas que el catálogo del SID no conoce.

### 3.2 INSCRIPCIONES — origen TIFF, no material nuevo

| Rama | Archivos | Oficina |
|---|---|---|
| `Img_Multitiff` | 57,058 | 01 Chetumal y 02 Cancún |
| `Cozumel multitiff inscripciones` | 3,873 | 04 Cozumel |
| `Playa del Carmen` | 2,266 | 03 Playa del Carmen |

Son 590 combinaciones de delegación, sección y tomo. **539 ya están publicadas
como PDF**; solo 51 no:

| Delegación | Sección | Tomos sin publicar |
|---|---|---|
| Cancún | 4 | 43 |
| Chetumal | 7 | 6 |
| Cancún | 3 | 1 |
| Chetumal | 4 | 1 |

Esta carpeta es el insumo de escaneo, no acervo por publicar. Lo que sí vale es
esa lista de 51 tomos: son el hueco concreto de la conversión.

## 4. Nomenclatura del acervo

Todo el material fuera de `Secciones` nombra sus archivos igual, y el nombre
basta para colocarlo:

```
XVIII-02-01-01_01-0078.pdf
  │     │  │   │     └── inscripción (o foja, en la rama de libros)
  │     │  │   └──────── volumen
  │     │  └──────────── oficina
  │     └─────────────── sección
  └───────────────────── tomo en número romano
```

Códigos de oficina, confirmados cruzando carpetas con el catálogo:

| Código | Delegación |
|---|---|
| 01 | Chetumal |
| 02 | Cancún / Benito Juárez |
| 03 | Playa del Carmen |
| 04 | Cozumel |

Hay variantes que habrá que tratar aparte al cargar: tomos que no son número
romano (`Ca`), sufijos de foja (`0056b`) y rangos (`2154_2154`).

## 5. Lo que hay que preguntarle al área

1. **¿El visor del SID muestra PEM2023, PEM2024 e INSCRIPCIONES?** Si no, hay
   194,494 PDF digitalizados que hoy nadie consulta.
2. **¿PEM es un programa anual?** Si habrá PEM2025, la carga tiene que admitir
   lotes nuevos, no ser una corrida única.
3. **¿Las inscripciones de PEM que no están en el catálogo son definitivas o
   trabajo en revisión?** Son 33,650 y de eso depende si se publican.
4. **¿Por dónde busca la gente, por tomo y foja o por número de inscripción?**
   Define si pesa más el acervo de libros o el de inscripciones.

## 6. Verificaciones hechas y lo que quedó sin verificar

### Comprobado

| Qué | Resultado |
|---|---|
| Catálogo del SID cargado completo | 638,171 renglones en `visor_pdf_index`, 638,171 cargados, 0 omitidos, 0 inactivos, todos con `origen_id` único |
| Un tomo, una carpeta | 746 carpetas distintas en disco ↔ 746 tomos |
| Rutas del catálogo contra disco | 400 al azar: 400 existen y tienen contenido |
| PDF válidos | 120 al azar: 120 con cabecera `%PDF-` |
| Muestra estratificada desde el contenedor | 225 rutas, 15 por cada combinación de delegación y sección, incluidos los 6 tomos sin volumen y las secciones 5, 6 y 7: **225 resueltas y válidas, 0 fallas** |
| Inscripciones: catálogo ↔ disco | Cancún, Cozumel y Playa con **igualdad exacta de conjuntos**; Chetumal con 1 archivo de más en disco y 0 renglones sin archivo |
| Marca de agua con `pdf-lib` sobre PDF reales | 24 de 24 sin fallas; los archivos del acervo son de **una sola página**; peor tiempo 2.2 s leyendo por VPN, salida máxima 142 KB |
| Tiempos de consulta del Visor | Fojas de un tomo de 2,120: 0.18 ms. Búsqueda de tomo por romano: 0.34 ms. Sin problema a este volumen |
| Libros: catálogo ↔ disco, cruce exacto | `VISOR/Secciones` tiene 638,171 PDF en disco y el catálogo 638,171: **igualdad exacta de conjuntos, 0 archivos sin registrar y 0 registros sin archivo** |

El único archivo de más en disco es
`VISOR/CHETUMAL/215326_29-01-2013_14-57-01.pdf`, con un nombre fuera de la
convención del acervo.

### Choques de clave en las inscripciones

189,793 renglones con 189,793 rutas distintas —ningún archivo sirve a dos
inscripciones— pero solo **189,117 claves de negocio** distintas (tomo, sección,
oficina, volumen, inscripción). Son **674 claves repetidas, 1,350 renglones**:

| Motivo | Claves |
|---|---|
| Copia también en `chetumal_abril09/ImgsNotInOracle` | 550 |
| Copia en la carpeta de otra delegación | 106 |
| Otro | 18 |

Son copias del mismo documento, no inscripciones distintas. Al cargarlas hay que
elegir una a propósito —la de la carpeta de la delegación, no la de
`ImgsNotInOracle`— y registrar la descartada. Una restricción única sobre la
clave de negocio, sin esa decisión, se quedaría con la que entrara al final.

### Sin verificar

1. **Coincidencia byte a byte de los nombres acentuados.** El montaje de
   producción **sí expone** los nombres con acento: `ls` sobre `PEM2024` lista
   `Benito Juárez` correctamente desde el contenedor. Lo que eso no prueba es
   que una ruta *escrita a mano* en el código coincida con la del disco, porque
   el acervo guarda los acentos en forma descompuesta (`Seccio` + acento
   combinante + `n`) y un montaje CIFS sobre Linux compara byte a byte. La regla
   al cargar sigue siendo la misma, y así se evita el problema por completo:
   tomar los nombres del listado del directorio y nunca volver a escribirlos.

2. **Búsqueda de inscripciones a escala.** La búsqueda de tomo por número romano
   hoy es un recorrido secuencial; sobre 751 renglones no se nota. Con las
   190,404 inscripciones encima, una búsqueda con `ILIKE '%...%'` necesita índice
   propio para no repetir lo que ya pasa con los reportes.

## 7. Estado en producción

El catálogo del acervo se cargó en producción el 2026-10-02:

| | Antes | Después |
|---|---|---|
| Delegaciones | 1 | 4 |
| Tomos | 5 | 751 |
| Fojas | 3,483 | 641,654 |
| Imágenes | 3,483 | 641,654 |
| Del acervo del SID | 0 | 638,171 |

Se cargó con [`db/cargar-visor-sid.sql`](../db/cargar-visor-sid.sql), que hace lo
mismo que `db/migrate-visor-sid.mjs` pero con sentencias de conjunto: el script
de Node hace tres viajes a la base por archivo, y contra producción, al otro
lado de la VPN, eso son casi dos millones de idas y vueltas. Antes de usarlo se
ensayó sobre una copia exacta del estado de producción y se comparó contra el
resultado del script de Node: **638,171 renglones, cero diferencias** en origen,
delegación, sección, tomo, volumen, foja, orden, versión, formato y ruta.

Verificado después de la carga: 100 rutas al azar de la base de producción
apuntan a PDF reales y válidos en el recurso compartido, y el contenedor de
producción lista el acervo.

### Pendiente de decisión

Producción conserva los datos de prueba del prototipo VISAR: **5 tomos en
Cozumel, Sección Primera, con 3,483 fojas y 434 inscripciones inventadas**. No
chocan con el acervo real —el Cozumel verdadero es de las secciones 3, 4 y 5—
pero se ven en pantalla, y estorbarán al cargar las inscripciones, que son justo
de las secciones 1 y 2.
