# Deuda técnica de PRISMA — inventario verificado

Verificado contra el repositorio el 2026-10-31. Cada punto cita dónde se comprueba.
Este documento es el **punto de partida** de la evaluación con agentes: no es la
verdad final, es lo que ya está comprobado para que nadie gaste tiempo redescubriéndolo.
Si un agente encuentra que algo de aquí cambió, eso es un hallazgo.

Severidad: 🔴 crítica · 🟠 alta · 🟡 media · ⚪ baja

---

## 1. Seguridad

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🔴 | **Sin límite de intentos ni bloqueo de cuenta.** No hay *rate limiting* en ninguna forma | Ausencia en `package.json` y en `src/` | Se pueden probar contraseñas sin freno. Agravado por el punto siguiente |
| 🔴 | **API pública sin autenticación para teléfonos.** `/publico/:token` y cuatro POST que registran traslado, relevo y entrega | `src/modules/correspondencia/paquetes.routes.ts:35-43` | Superficie abierta a internet sin sesión ni límite de tasa. La entropía del token **no está verificada**: es lo primero que hay que medir |
| 🟠 | **Sin revocación de token.** Un JWT robado sirve hasta que caduca | `src/middleware/auth.middleware.ts:29` · caducidad 8 h en `src/server.ts:152` | No hay forma de cerrar una sesión comprometida |
| 🟠 | **Auditoría parcial.** Solo `auditoria_configuracion_flujos` y `auditoria_estados`, escritas por **4 de 25 controladores**; ninguna registra IP ni agente | `db/baseline/schema.sql:173` y `:208` | Para datos registrales no alcanza: no hay bitácora de quién consultó qué |
| 🟠 | **Credenciales en texto plano** en `.env.save` y `.env.respaldo-*` del servidor, fuera de `.gitignore` | servidor de producción | Cualquiera con acceso al disco se lleva las contraseñas de todas las bases |
| 🟡 | **Validación de entrada escrita a mano** en ~250 endpoints; sin `zod`, `joi` ni equivalente | `package.json` | Inconsistente por definición; cada endpoint es una oportunidad distinta de equivocarse |
| 🟡 | **Llave de API en la URL** al llamar a Google Vision | `src/services/ocr/google-vision.adapter.ts:87` | Las URLs se registran en logs y proxies; el secreto viaja en la línea de petición |

**Lo que sí está bien hecho** y no hay que rehacer: `bcrypt` costo 12
(`src/modules/usuarios/usuarios.controller.ts:207`), comparación contra un *hash* señuelo
en el login para no filtrar qué cuentas existen (`src/server.ts:130-131`), JWT verificado
también en el WebSocket (`src/notifications/ws.server.ts:51`), autorización por módulo
(`src/middleware/modulo.middleware.ts`), `helmet` y `cors`, API versionada bajo `/api/v1`,
y **sin SQL armado con valores del usuario**: las interpolaciones que hay son de
identificadores (`src/modules/satq/satq.controller.ts:177`, tipado a dos valores).

---

## 2. Rendimiento

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🔴 | **HTTP 504 en reportes**, sobre todo "Universo de Actos Registrales"; nginx corta a los 60 s | reportes en producción | Único problema de rendimiento ya reportado por usuarios |
| 🟠 | **OCR en el proceso que atiende HTTP.** Tesseract, Poppler y Ghostscript viven en la imagen de la API | `infra/docker/Dockerfile.api:46` | Un OCR pesado compite por CPU con las peticiones de los usuarios |
| 🟠 | **Redis desplegado y sin cablear.** `REDIS_URL` solo aparece en `src/utils/env.ts`; no hay `bullmq` ni `ioredis` | `package.json`, `docker-compose.prod.yml` | Se paga un contenedor que no hace nada, teniendo el problema que resolvería |
| 🟠 | **El worker no monta el acervo.** `app_worker` solo tiene `storage_prisma` | `docker-compose.prod.yml` | Bloquea mover trabajo del Visor a una cola: fallaría con archivo no encontrado |
| 🟡 | **Sin cache en el Visor.** Marca de agua con `pdf-lib` y conversión con `sharp` en cada petición | `src/modules/visor_documentos/services/imagen.service.ts` | La marca lleva nombre, IP y hora, así que el PDF final **no es cacheable**; solo lo es el paso ráster→PDF |
| 🟡 | **Sin control de concurrencia.** Nada limita cuántas peticiones pesadas corren a la vez | — | Bajo pico, el sistema se cae en vez de hacer cola |

---

## 3. Datos y migración

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🔴 | **El Visor muestra el 21 % del acervo de SID**: 827,287 de 3,919,193 imágenes. Faltan 3,090,618 de las secciones Primera y Segunda, en 4,108 libros | conteos sobre ambas bases | Es el trabajo dominante de los próximos meses y multiplica los datos por 4.7 |
| 🟠 | **El verificador compara máximos, no conjuntos.** Por eso no vio 3,076 huecos de consultas a media tabla desde el id 76,768 | `db/verificar-migracion-sid.mjs` | Da falsa sensación de completitud. Lo correcto es anti-join por la clave de trazabilidad |
| 🟠 | **`ON CONFLICT` que no corresponde al índice real.** El migrador usa cuatro columnas; `uq_visor_tomos_acervo` tiene cinco, con `oficina_codigo` | `db/migrate-visor-sid.mjs:135` | La carga del acervo no es confiablemente idempotente |
| 🟠 | **24,228 folios sin migrar** y la secuencia por encima de 4,378 | módulo de folios | Riesgo de colisión de folios |
| 🟡 | **38 usuarios de tickets sin mapeo de identidad** | módulo de tickets | Registros huérfanos de autor |
| ⚪ | **1,288 inscripciones faltantes, todas explicadas** (611 PENDIENTE sin PDF ni en SID, 676 copias deduplicadas a propósito, 1 incompleta) | reconciliación cerrada | Módulo cerrado: sirve de modelo para los demás |

---

## 4. Calidad y entrega

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🔴 | **Ningún pipeline de CI** | ausencia de `.github/workflows/` | Cada despliegue es un acto de fe |
| 🟠 | **~6 pruebas en rojo**, 5 estables y 1 intermitente | 17 archivos de prueba | Una suite en rojo deja de avisar: se normaliza el fallo |
| 🟠 | **El frontend se copia dentro de sí mismo para compilar**: el código vive en `src/frontend/` y el proyecto de Vite en `frontend/` | `infra/docker/Dockerfile.web`, `frontend/vite.config.ts` | Mantiene invisibles **11 errores de tipos**: Vite transpila sin verificar |
| 🟡 | **Sin métricas ni trazas ni registro de consultas lentas.** Hay `pino` conectado, pero solo logs | `src/utils/logger.ts`, `src/server.ts` | No se puede responder "¿cuánto tardó esto ayer a las 11?" |

---

## 5. Arquitectura y acoplamiento

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🟠 | **Cinco fuentes de datos desde un solo proceso**: `DATABASE_URL`, `SID_DATABASE_URL`, `SID_CATALOGO_DATABASE_URL`, `ACERVO_DATABASE_URL`, `VISAR_DATABASE_URL` | `src/`, `db/` | Es el argumento más fuerte a favor de separar servicios, y el que hay que evaluar con números |
| 🟠 | **Integraciones externas dentro del monolito**: sincronización con SID (que impone 60 peticiones por minuto y responde 429) y con SIQROO | `src/integraciones/consultas.sync.ts:54`, `siqroo.sync.ts` | Una integración lenta o caída arrastra al proceso que atiende usuarios |
| 🟡 | **Contradicción pendiente de resolver: OCR en la nube.** `OCR_PROVIDER=google-vision` está documentado como "producción", con llamada saliente a `vision.googleapis.com` | `src/services/ocr/ocr.engine.ts:6-10`, `google-vision.adapter.ts` | Si está activo, los documentos salen de la infraestructura del estado. **Hay que verificar qué valor tiene en el `.env` del servidor** antes de discutir arquitectura |
| 🟡 | **23 módulos, ~250 endpoints, 25 controladores en un proceso** | `src/modules/` | Monolito modular por módulos, no por capas. No es deuda por sí mismo; lo es si impide crecer |

**A favor:** solo 19 dependencias de producción y 18 de desarrollo. La superficie de
terceros es pequeña, y eso vale mucho en un sistema de gobierno.

---

## 6. Carga de archivos para reportes

**Cómo funciona hoy** (`src/modules/carga-datos/carga-datos.controller.ts`): el Excel de
SATQ se sube a memoria, se lee completo con ExcelJS, sus filas se insertan **en lotes de
2,000** en una tabla de paso `stg_satq_ingresos_carga`, y de ahí sale **un solo**
`INSERT … ON CONFLICT (no_operacion, id_concepto) DO UPDATE` hacia `satq_ingresos`.
Luego la tabla de paso se vacía. Hay modo `dry_run` y bitácora en `carga_datos_log`.

**No inserta fila por fila**, y volver a subir el mismo periodo no duplica. Eso está
bien resuelto.

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🟠 | **Tabla de paso global que se trunca**, sin acotarla por usuario ni por carga y sin transacción | `carga-datos.controller.ts:159` y `:220` | **Dos cargas simultáneas se corrompen entre sí**: una vacía la tabla mientras la otra cuenta o hace el upsert. Los conteos de "filas nuevas" y "actualizadas" salen mal, o se mezclan datos de dos archivos |
| 🟠 | **El archivo entero vive en la memoria de la API.** `multer.memoryStorage()` con tope de 80 MB, más `wb.xlsx.load(buffer)`, que expande el libro a objetos | `carga-datos.routes.ts:26-27`, `controller:69-72` | Un xlsx de 80 MB puede superar 1 GB de montón de JavaScript **en el mismo proceso que atiende a los usuarios**. Sin límite de concurrencia, dos cargas a la vez lo multiplican. Es el mismo problema que el OCR |
| 🟡 | **Sin transacción.** Los lotes y el upsert no van envueltos | `controller:159-205` | Un fallo a la mitad deja la tabla de paso a medias |
| 🟡 | **No se conserva el archivo ni su huella.** La bitácora guarda nombre, usuario, conteos y rango de fechas, pero no el archivo ni un hash | `controller:207-219` | En una conciliación de ingresos no se puede volver a auditar qué se cargó exactamente |

**Lo que está bien hecho y no hay que tocar:** lotes de 2,000, upsert idempotente,
`dry_run` antes de confirmar, bitácora con usuario y conteos, llave de API de SIQROO
cifrada y no expuesta al consultarla, y verificación de módulo antes de permitir la carga.

**Falta revisar con el mismo criterio** los otros módulos que leen Excel:
`actos`, `productividad`, `fre` y `satq`.

---

## 7. Operación

| | Deuda | Evidencia |
|---|---|---|
| 🟠 | Disco del servidor al **79 % de 37.6 GB**, con 3 millones de filas por cargar | servidor |
| 🟠 | **Nunca se ha probado restaurar** un respaldo | — |
| 🟡 | Reinicio pendiente y actualizaciones sin aplicar; la VM se apagó 3 veces en un día | servidor |

---

## 8. Barrido por módulos (2026-10-31)

Revisión de los 23 módulos buscando deuda que no estuviera en las secciones anteriores.

| | Deuda | Evidencia | Por qué importa |
|---|---|---|---|
| 🔴 | **Subidas enteras en memoria, sin techo de memoria en el contenedor.** Los 6 módulos que reciben archivos usan `multer.memoryStorage()`: oficios y eventos con **200 MB**, carga-datos 80 MB, recursos 50 MB, trámites 10 MB. Y una petición de oficio acepta **6 archivos a la vez** (`anexos`, `identificacion`, `oficio`, `recibos`, `solicitud`, `boleta`) | `oficios.routes.ts:109-124` con `OFICIO_DOC_FIELDS` en `oficios.controller.ts:32`; `eventos.routes.ts:62`; `docker-compose.prod.yml` **no declara `mem_limit` ni `--max-old-space-size`** | **Hasta 1.2 GB de montón por una sola petición**, en el proceso que atiende a todos. Sin límite de tasa ni de concurrencia, y sin techo en el contenedor, unas pocas subidas simultáneas tumban la API. Es candidato directo a explicar las tres caídas de la VM en un día |
| 🟠 | **Análisis de documentos dentro del proceso HTTP.** `extractFieldsFromPdf(req.file.buffer)` y `mammoth.extractRawText({ buffer })` | `oficios.controller.ts:470` y `:2972` | Mismo problema que el OCR: trabajo pesado compitiendo con las peticiones |
| 🟠 | **658 usos de `any`**, que CLAUDE.md prohíbe explícitamente. Los peores: `oficios.controller.ts` 55, `satq.controller.ts` 46, `programas-sociales.controller.ts` 32 | barrido sobre `src/` | Es la regla de arquitectura del propio proyecto incumplida a escala. Anula la ventaja del tipado estricto justo donde más valdría |
| 🟠 | **Solo 10 de 25 controladores usan transacciones** | barrido de `.transaction(` en `src/modules/` | Escrituras de varios pasos que pueden quedar a medias |

**Lo que el barrido confirmó que está bien, y no hay que tocar:**

- **Ninguna ruta de archivos arma su ruta con entrada del usuario.** No hay *path traversal* en el sistema.
- `recursos/:slot/archivo` es pública a propósito, y está bien hecha: slot en lista blanca, salvaguarda de traversal, y transmite en flujo en vez de cargar a memoria (`recursos.controller.ts:106-123`).
- El acervo protege todas sus rutas con `router.use(authenticate)` (`acervo.routes.ts:10`).
- La exportación a Excel de SATQ sí usa flujo (`ExcelJS.stream.xlsx.WorkbookWriter` sobre `res`, `satq.controller.ts:532`): no carga el libro a memoria.
- Los oficios calculan huella del archivo (`hashArchivo`, `oficios.controller.ts:1679`).
- Las 5 rutas públicas de correspondencia son deliberadas y están documentadas en la cabecera de su archivo.
- La tabla de paso global es **solo** de carga-datos; ningún otro módulo repite ese patrón.
