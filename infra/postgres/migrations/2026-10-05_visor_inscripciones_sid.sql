-- Prepara `visor_inscripciones` para recibir el acervo de inscripciones del SID.
--
-- La tabla llegó del prototipo VISAR, donde las inscripciones se capturaban a
-- mano desde un Excel de control. El acervo del SID es otra cosa: 189,793
-- inscripciones con su propio PDF, catalogadas en `sid_inscripciones_control`,
-- de las secciones Primera y Segunda de las cuatro delegaciones. Para
-- recibirlas faltan tres cosas, y las tres se agregan sin tocar lo existente.
--
-- ── 1. Un ancla de origen que no choque con la del prototipo ───────────────
-- `origen_id` ya guarda el id de VISAR: en producción son los valores 1 a 434.
-- Los ids de `sid_inscripciones_control` van de 1 a 190,405, así que usar la
-- misma columna haría que las primeras 434 inscripciones reales se
-- descartaran en silencio por el UNIQUE. Son dos catálogos distintos y cada
-- uno lleva su columna.
ALTER TABLE visor_inscripciones
  ADD COLUMN IF NOT EXISTS origen_sid_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_inscripciones_origen_sid
  ON visor_inscripciones (origen_sid_id);

-- ── 2. El número de inscripción tal como lo nombra el acervo ───────────────
-- `numero_inscripcion` es `integer`, y el acervo del SID no siempre trae un
-- entero: hay rangos ("0001_1857", cuando un PDF cubre varias inscripciones) y
-- sufijos ("0056b"). En vez de cambiarle el tipo a una columna que ya usan la
-- búsqueda y el ordenamiento, se guarda:
--
--   · `numero_inscripcion`       el número de arranque, que es lo que ordena y
--                                lo que compara la búsqueda por rango. Sigue
--                                siendo entero y sigue sirviendo igual.
--   · `numero_inscripcion_texto` el nombre literal del acervo, que es lo que
--                                hay que mostrar y lo que permite volver al
--                                archivo.
--   · `numero_final`             el cierre del rango, nulo cuando el PDF cubre
--                                una sola inscripción.
--
-- Así la búsqueda que ya existe (`inscripciones.service.ts`) no cambia de
-- comportamiento, y lo que se gana es poder representar lo que el acervo trae.
ALTER TABLE visor_inscripciones
  ADD COLUMN IF NOT EXISTS numero_inscripcion_texto varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS numero_final             integer;

-- El nombre del acervo se guarda LITERAL, y para eso hay que ensanchar
-- `visor_fojas.numero_foja`, que venía de 50 caracteres.
--
-- La tentación era recortarlo al número de inscripción y dejar fuera lo que
-- parece basura de captura ("0086_0017___________", "0003_0322_uncompresed").
-- Sería un error: en Playa del Carmen, tomo Ib, volumen 01_01, conviven
-- `0513_0513_`, `0513_0513_G4` y `0513_0513_jpg`, que son ARCHIVOS DISTINTOS
-- —variantes de formato y compresión de la misma inscripción— y al recortarlos
-- los tres colapsarían en uno: la clave única de la foja se quedaría con el
-- primero y los otros dos desaparecerían sin dejar rastro.
--
-- Ensanchar un varchar en Postgres es un cambio de catálogo, no reescribe la
-- tabla: sobre las 641,654 fojas de producción es inmediato.
ALTER TABLE visor_fojas
  ALTER COLUMN numero_foja TYPE varchar(100);

-- Para las 434 del prototipo, el texto es el propio número.
UPDATE visor_inscripciones
   SET numero_inscripcion_texto = lpad(numero_inscripcion::text, 4, '0')
 WHERE numero_inscripcion_texto = '';

-- ── 3. Una imagen por foja y versión ──────────────────────────────────────
-- Cada inscripción del SID tiene su propio PDF, así que entra al Visor como
-- una foja con su imagen: de ese modo reutiliza tal cual el camino que ya
-- funciona —resolución de versión, marca de agua, dictamen, transcripción— sin
-- modificar una línea del servicio de imágenes.
--
-- Esa carga necesita un ancla para ser idempotente. `visor_imagenes_foja`
-- tiene `origen_id`, pero ya está ocupado por el catálogo de libros
-- (`visor_pdf_index`, valores 1 a 638,171) y los ids de las inscripciones
-- vuelven a empezar en 1. En vez de inventar un desplazamiento, se declara la
-- regla que de hecho ya se cumple: una foja no puede tener dos imágenes de la
-- misma versión. Verificado en producción antes de crearlo —cero pares
-- repetidos entre las 641,654 imágenes— y es además el criterio correcto: las
-- versiones son las campañas de digitalización, y de cada una hay una sola.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_imagenes_foja_version
  ON visor_imagenes_foja (foja_id, version);

-- ── 4. La oficina, parte de la identidad del tomo ──────────────────────────
-- Hasta ahora un tomo se identificaba por delegación, sección, número romano y
-- volumen. Con el acervo de inscripciones eso no alcanza: en la carpeta de
-- Cozumel conviven `12-02-02-01_01-0135.pdf` y `12-02-04-01_01-0135.pdf`, que
-- son ARCHIVOS DISTINTOS y solo se diferencian en el tercer segmento del
-- nombre, el código de oficina. Sin él, los dos caían en la misma foja, que
-- tiene una sola imagen: la segunda inscripción mostraría el documento de la
-- primera. Son 291 combinaciones de tomo con más de una oficina y 713 fojas
-- que habrían quedado compartidas.
--
-- El código se toma del nombre del archivo —antepenúltimo segmento, contado
-- desde la derecha porque hay tomos cuyo nombre termina en espacio y corren
-- las posiciones— y coincide con la columna `oficina_codigo` del catálogo en
-- los 189,793 renglones.
--
-- Queda vacío para el acervo de libros, cuyas rutas no llevan código de
-- oficina (`Secciones/Cancun/SECCION 4/CCLXXVI/1_1/...`), y por eso la columna
-- es NOT NULL con default: los 751 tomos ya cargados no necesitan tocarse.
ALTER TABLE visor_tomos
  ADD COLUMN IF NOT EXISTS oficina_codigo varchar(10) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS uq_visor_tomos_acervo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_tomos_acervo
  ON visor_tomos (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo);
