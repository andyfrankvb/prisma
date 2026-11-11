# Prompt de evaluación arquitectónica de PRISMA

Para ejecutar con un agente de IA **dentro de una copia del repositorio**, no en un chat
sin acceso al código. Cada integrante del equipo lo corre con un agente distinto y las
tres respuestas se comparan con el formato de la sección 7.

Antes de ejecutarlo hay que llenar los `[POR LLENAR]` de la sección 5.

---

## El prompt

Actúa como arquitecto de software senior con experiencia en sistemas de gobierno: alto
volumen documental, datos registrales, varias fuentes de datos y requisitos de seguridad
y trazabilidad. Vas a evaluar un sistema **en producción**, del que tienes el código.

No escribas código todavía. El entregable es un diagnóstico con evidencia y **decisiones
justificadas contra alternativas**.

Tienes que responder cuatro cosas, en este orden:

1. **Deuda técnica.** Qué impide hoy que esto sea un sistema profesional.
2. **Seguridad.** Qué tendría que ser cierto para custodiar datos registrales sin riesgo
   inaceptable, y qué falta.
3. **Arquitectura destino.** A qué forma hay que llevarlo, elegida contra alternativas
   reales, no por moda.
4. **Reparto.** Cómo se divide ese trabajo entre tres personas.

### 1. Regla principal: verifica antes de afirmar

**Toda afirmación sobre el estado actual debe citar `archivo:línea`.** Si no puedes
verificar algo, decláralo como desconocido en vez de suponerlo. No propongas nada que ya
exista: primero compruébalo en el código.

**Empieza leyendo `docs/arquitectura/DEUDA-TECNICA.md`**, que es el inventario ya
verificado. No lo repitas: **confírmalo, corrígelo y complétalo**. Si algo de ahí cambió o
está mal, repórtalo primero: es un hallazgo, no un estorbo. Lo que agregues tiene que ser
deuda que ese documento no tenga.

### 2. Regla de las alternativas

En cada decisión **presenta al menos dos caminos reales**, con su costo, su riesgo y qué
tan reversible es cada uno, y **elige uno**. No basta con recomendar: hay que decir contra
qué se comparó y por qué perdió la otra opción. Si la opción barata y aburrida es la
correcta, dilo; esa también es una decisión.

### 3. El sistema, en corto

- **Backend** Node 20 + Express + TypeScript. 269 archivos, ~69,700 líneas, 23 módulos,
  ~250 endpoints, 25 controladores. API versionada bajo `/api/v1`. Solo 19 dependencias
  de producción.
- **Frontend** React con Vite, **ya separado** en su propia imagen servida por nginx 1.25,
  con healthcheck y puerto propios.
- **Despliegue** `docker-compose.prod.yml`, on-premise, cuatro contenedores: API, web,
  un worker que hoy solo corre un `node-cron` de vencimientos, y Redis **desplegado y sin
  cablear**.
- **Datos: cinco fuentes distintas desde un solo proceso** — `DATABASE_URL`,
  `SID_DATABASE_URL`, `SID_CATALOGO_DATABASE_URL`, `ACERVO_DATABASE_URL` y
  `VISAR_DATABASE_URL`. PostgreSQL 16.15 **en otro servidor**, fuera del compose.
  Migraciones propias (`db/migrate.mjs`), acceso por *query builder* con parámetros ligados.
- **Integraciones externas dentro del monolito**: sincronización con SID —que impone 60
  peticiones por minuto y responde 429— y con SIQROO (`src/integraciones/`).
- **Procesamiento pesado en el proceso HTTP**: Tesseract, Poppler y Ghostscript viven en
  la imagen de la API. Hay además un adaptador de OCR en la nube
  (`OCR_PROVIDER=google-vision`) documentado como "producción": **verifica qué valor tiene
  en el `.env` del servidor antes de opinar sobre arquitectura**, porque si está activo los
  documentos salen de la infraestructura del estado.
- **Ya existe superficie pública sin sesión**: las rutas `/publico/:token` de
  correspondencia, que abre el QR desde la cámara de un teléfono, con POST que registran
  traslado, relevo y entrega (`src/modules/correspondencia/paquetes.routes.ts:35-43`).
  No hay límite de tasa en todo el sistema. **Mide la entropía de ese token**: no está
  verificada.
- **Archivos** dos recursos SMB por CIFS; el acervo del Visor en solo lectura, 22.6 GB.
  No se copian archivos: se leen donde el sistema anterior los dejó. `app_worker` **no
  monta el acervo**.
- **Migración en curso** desde un sistema anterior (*strangler fig*). El Visor muestra
  **827,287 de 3,919,193 imágenes: el 21 %**. Faltan 3,090,618 de las secciones Primera y
  Segunda. El acervo crece **4.7x sobre datos que ya existen y cuyo ingreso ya está
  comprometido**: no es proyección, es trabajo pendiente.
- **En producción**: HTTP 504 en reportes (origen: consultas, no OCR); disco al 79 % de
  37.6 GB; la VM se apagó tres veces en un día por causas externas.

### 4. Hacia dónde puede ir: las opciones que debes evaluar

Evalúa **todas** y elige una, con la regla de la sección 2. Si tienes una mejor que no
esté aquí, agrégala y compárala igual.

- **A. Monolito modular reforzado.** Se queda en un proceso, pero se ordenan los límites
  entre módulos, se endurecen seguridad y pruebas, y se saca solo el trabajo pesado a un
  worker con cola. La opción barata: hay que descartarla con evidencia, no por reflejo.
- **B. Separar el procesamiento.** Un servicio aparte para OCR, conversión y generación de
  documentos, con Redis como cola. El núcleo de oficios no se toca.
- **C. Separar por fuente de datos.** Un servicio de acervo y Visor —que es el que crece
  4.7x y habla con tres de las cinco bases— aparte del núcleo de oficios y flujos.
- **D. API pública versionada para aplicaciones externas.** Ya hay `/api/v1` y ya hay
  clientes sin sesión; formalizarlo como contrato para una app móvil o para otras
  dependencias, con autenticación propia, cuotas y versionado.
- **E. Microservicios por dominio.** Di honestamente qué costo operativo implica con un
  equipo de tres personas, sin personal de operaciones y en un solo servidor.

Para la que elijas, responde: **qué se parte primero, qué contrato queda entre las partes,
cómo se despliega sin apagar el sistema, y cómo se revierte si sale mal.**

### 5. Números que debes exigir antes de responder  `[POR LLENAR]`

- Usuarios totales y **concurrentes en hora pico**: `[POR LLENAR]`
- Oficios creados por día y por mes: `[POR LLENAR]`
- Documentos con OCR por día, y tamaño medio: `[POR LLENAR]`
- Crecimiento esperado a 12 meses, en delegaciones y usuarios: `[POR LLENAR]`
- Latencia aceptable, p95, por tipo de operación: `[POR LLENAR]`
- Ventana de mantenimiento, si existe: `[POR LLENAR]`
- Tiempo máximo tolerable de caída y de pérdida de datos (RTO y RPO): `[POR LLENAR]`
- ¿Habrá app móvil o consumo por terceros? ¿Cuándo?: `[POR LLENAR]`

Si quedan vacíos, **dilo explícitamente y responde con escenarios** ("hasta N usuarios
concurrentes esto alcanza; a partir de N hace falta X"), en vez de recomendar una
arquitectura sin sustento.

### 6. Restricciones no negociables

- **On-premise.** Sin nube pública: los datos no salen de la infraestructura del estado.
  No propongas CDN ni servicios administrados. (El adaptador de Google Vision es una
  excepción heredada que hay que verificar y resolver, no un permiso.)
- **Equipo de tres personas, sin personal de operaciones.** Lo que exija un operador de
  Kubernetes de tiempo completo queda descartado por inviable.
- **Un servidor de aplicación**, VM de 37.6 GB ya al 79 %.
- **Cero interrupciones.** Hay oficinas usándolo a diario.
- **Cambios aditivos.** No se rompen contratos públicos.

### 7. Formato de salida obligatorio

Se van a comparar tres respuestas de agentes distintos. Respeta la forma.

**7.1 Correcciones al inventario.** Qué de `DEUDA-TECNICA.md` está mal o cambió, con
evidencia. Si no encontraste nada, dilo.

**7.2 Deuda técnica adicional**, lo que ese documento no tiene:

| # | Deuda | Evidencia (archivo:línea) | Eje | Severidad | Explotabilidad | Esfuerzo | Qué la paga |
|---|---|---|---|---|---|---|---|

Eje: `seguridad` / `rendimiento` / `datos` / `calidad` / `arquitectura` / `operación`.
Severidad: `crítica` / `alta` / `media` / `baja`.
Explotabilidad: `remota sin credenciales` / `con credenciales` / `solo con acceso al servidor` / `no aplica`.
Esfuerzo: `horas` / `días` / `semanas` / `meses`.

**7.3 Techos de capacidad:**

| Recurso | Uso actual | Techo estimado | Qué lo satura primero | Cómo lo calculé |
|---|---|---|---|---|

Cubre al menos: CPU y memoria del contenedor, disco de la VM, conexiones a cada una de las
cinco bases, ancho de banda del montaje SMB, y el servidor de base externo.

**7.4 Decisión de arquitectura:**

| Opción | Qué resuelve | Qué cuesta | Riesgo | Reversible | Veredicto |
|---|---|---|---|---|---|
| A. Monolito modular reforzado | | | | | |
| B. Separar procesamiento | | | | | |
| C. Separar por fuente de datos | | | | | |
| D. API pública versionada | | | | | |
| E. Microservicios por dominio | | | | | |

Debajo, en 300 palabras máximo: **cuál eliges, qué se parte primero, qué contrato queda
entre las partes, y cómo se revierte.**

**7.5 Reparto para tres personas.** Tres frentes que no se pisen, cada uno con su primera
tarea y cómo se mide el avance. **Condición dura: una de las tres personas solo avanza en
fines de semana**, así que su frente tiene que ser de bloques largos y autocontenidos, no
puede bloquear a nadie ni depender de nadie. Di qué frente le toca y por qué.

| Persona | Frente | Primera tarea | Cómo se mide | Depende de |
|---|---|---|---|---|

**7.6 Plan en tres fases**, cada una con: qué se hace, qué riesgo quita, **cómo se revierte
si sale mal**, y en qué se nota. La fase 1 debe poder empezar esta semana sin interrumpir
a nadie.

**7.7 Cierra con tres secciones cortas:**
- **Lo que NO haría**, con el motivo. Obligatoria.
- **Lo que no pude verificar** y qué haría falta.
- **En qué discrepo del enunciado**, si aplica.

### 8. Cómo quiero que escribas

Directo y crítico. Si algo está bien hecho, dilo en una línea y sigue. Si una práctica
común no aplica aquí, explica por qué en vez de recomendarla por defecto. Prefiere la
solución simple cuando resuelva el problema, y cuando recomiendes la compleja, justifica
qué gana sobre la simple. Nada de listas de buenas prácticas genéricas: todo tiene que
aterrizar en este repositorio y en estas restricciones.
