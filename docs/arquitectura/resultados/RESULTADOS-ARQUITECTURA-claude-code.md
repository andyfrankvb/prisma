# Resultados sobre PROMPT-EVALUACION-ARQUITECTURA.md

**Agente:** Claude Code (Opus 5), dentro del repositorio · **Commit:** `4d9805b` · **Fecha:** 2026-11-03

**Los `[POR LLENAR]` siguen vacíos.** Nadie midió usuarios concurrentes en hora pico,
oficios por día, documentos con OCR ni objetivos de latencia. Respondo con escenarios y
marco lo que es supuesto. **Dos de los techos de abajo no dependen de esos datos** porque
están escritos en el código: esos sí son duros.

---

## 1. Techos de capacidad

| Recurso | Uso actual | Techo estimado | Qué lo satura primero | Cómo lo calculé |
|---|---|---|---|---|
| **Conexiones a la base principal** | sin medir | **10 simultáneas** | Cualquier consulta lenta; con 10 en curso, todo lo demás espera hasta 60 s | Dato duro: `src/db.ts:10` |
| **Conexiones al acervo** | sin medir | **3 simultáneas** | Tres consultas del Visor; la cuarta falla en 5 s | Dato duro: `acervo.connection.ts:98-99` |
| **CPU de la API** | sin medir | **1 núcleo efectivo** para JavaScript | OCR, Ghostscript, análisis de PDF y Word, marca de agua del Visor | Un solo proceso Node, sin `cluster`; el compose no declara `cpus` |
| **Memoria de la API** | sin medir | **sin techo declarado** | Una petición de oficio con 6 archivos: hasta 1.2 GB de montón | `oficios.routes.ts:109-124`; el compose no declara `mem_limit` ni `--max-old-space-size` |
| **Disco de la VM** | **79 % de 37.6 GB** | ~7.9 GB libres | La migración de 3,090,618 imágenes (índices y metadatos) | Reportado del servidor |
| **Montaje SMB** | sin medir | **desconocido** | — | No se puede estimar desde el código: hay que medirlo |
| **Servidor de base externo** | sin medir | **desconocido** | — | Fuera del compose. Hace falta su `max_connections` y su carga |

**El techo que llega primero son las 10 conexiones**, mucho antes que la CPU o la memoria.
Es también el más barato de mover.

---

## 2. Decisión de arquitectura

| Opción | Qué resuelve | Qué cuesta | Riesgo | Reversible | Veredicto |
|---|---|---|---|---|---|
| **A. Monolito modular reforzado** | Memoria, pool, timeouts, seguridad, CI. Todo lo que hoy duele | Semanas de trabajo, cero infraestructura nueva | Bajo | Sí, cambio por cambio | ✅ **Elegida** |
| **B. Separar el procesamiento** | Saca OCR, Ghostscript y análisis de documentos del proceso HTTP | Cablear Redis y dar al worker el montaje del acervo | Medio: una cola más que operar | Sí, se vuelve a llamada directa | ✅ **Elegida, inmediatamente después de A** |
| **C. Separar por fuente de datos** | Nada que A y B no resuelvan: **su premisa era falsa**, el proceso abre dos bases, no cinco | Un servicio más, contrato nuevo, despliegue nuevo | Alto | Difícil | ❌ Descartada |
| **D. API pública versionada** | Ordena lo que ya existe sin sesión | Autenticación propia, cuotas, versionado | Medio | Sí | ⏳ **Parcial, ya**: asegurar `/publico` con límite de tasa y token verificado. El contrato formal, cuando haya fecha de app |
| **E. Microservicios por dominio** | Nada que esté en la lista de problemas reales | Varios despliegues, red entre servicios, observabilidad distribuida | Muy alto | No | ❌ Descartada |

### Elijo A, con B pegado atrás

Ninguno de los problemas medibles de PRISMA es un problema de forma arquitectónica. Son
tres problemas de recursos dentro de un proceso: un pool de 10 conexiones, memoria sin
techo con subidas de hasta 1.2 GB, y trabajo pesado compitiendo con las peticiones. Los
tres se arreglan sin partir nada.

**Qué se parte primero, cuando se parta:** el procesamiento. El corte es natural porque ya
existe el worker, ya existe Redis, y la frontera es un trabajo encolado, no un contrato de
negocio.

**Qué contrato queda entre las partes:** la cola. La API encola
`{tipo, id_documento, ruta}` y el worker escribe el resultado en la base. No se llaman por
HTTP entre ellos.

**Cómo se despliega sin apagar:** el primer paso es dual. El worker consume de la cola y
la API conserva el camino directo como respaldo, detrás de una bandera.

**Cómo se revierte:** apagando la bandera. La API vuelve a procesar en línea y la cola se
vacía sola.

**Lo que no haría ahora:** partir el acervo. Es el componente que crece 4.7x, y partir
algo mientras se multiplica por cinco es la peor secuencia posible. Primero termina la
migración, después se mide, y recién entonces se decide si merece servicio propio.

---

## 3. Plan en tres fases

### Fase 1 — Que deje de caerse · esta semana, horas de trabajo

Techo de memoria y de CPU en el compose. Tope de concurrencia en subidas y límites de
tamaño acordes a lo que de verdad se sube. `acquireConnectionTimeout` corto y pool más
grande. `statement_timeout` en ambas bases. `proxy_read_timeout` explícito en nginx.

- **Qué riesgo quita:** la caída completa por agotamiento de memoria o de conexiones
- **Cómo se revierte:** son valores de configuración; se vuelven atrás en un despliegue
- **En qué se nota:** la petición número once deja de morir en 504 y empieza a responder

### Fase 2 — Que deje de competir consigo mismo · semanas

Medición encendida. Reportes en flujo con agregados materializados. Montaje del acervo en
el worker. Redis cableado, con OCR y análisis de documentos encolados detrás de una
bandera. CI con `tsc --noEmit` y pruebas.

- **Qué riesgo quita:** que un trabajo pesado degrade a todos los usuarios
- **Cómo se revierte:** la bandera devuelve el procesamiento en línea
- **En qué se nota:** los reportes dejan de dar 504; el Visor responde igual durante un OCR

### Fase 3 — Que aguante el 4.7x · meses

Migración de las secciones Primera y Segunda, por lotes. Índices y vistas sobre las tablas
del Visor ya con datos reales. Auditoría general. Validación por esquema. Y recién aquí,
con números en la mano, decidir si el acervo merece proceso propio.

- **Qué riesgo quita:** que el crecimiento comprometido tire el sistema
- **Cómo se revierte:** las cargas son idempotentes y reanudables; los índices se tiran
- **En qué se nota:** el Visor pasa de 21 % a 100 % del acervo sin degradarse

---

## 4. Cierre

### Lo que NO haría

- **Microservicios.** Ningún problema medido de PRISMA se resuelve partiendo el sistema, y
  tres personas sin operaciones no sostienen varios despliegues.
- **Separar el acervo ahora.** Está multiplicándose por cinco. Partirlo en pleno
  crecimiento es la peor secuencia posible.
- **Optimizar consultas antes de medir.** No hay registro de consultas lentas; cualquier
  optimización hoy es adivinanza, y además el pool de 10 puede ser la causa real.
- **Reescribir los 658 `any` de un golpe.** Fijar el número como techo en la CI y bajarlo
  módulo por módulo cuando se toquen por otra razón.
- **GraphQL.** Hay 250 endpoints REST versionados y funcionando; cambiar de protocolo no
  está en la lista de problemas.

### Lo que no pude verificar

- **El valor real de `OCR_PROVIDER` en el `.env` del servidor.** Si es `google-vision`,
  los documentos salen de la infraestructura del estado. Se resuelve mirando el archivo.
- **La entropía del token de `/publico/:token`.** No está en el esquema base; vive en una
  migración posterior. Es lo único que protege cuatro endpoints POST sin sesión.
- **`max_connections` y la carga del servidor de base externo.**
- **El ancho de banda y la latencia del montaje SMB.**
- **Si la API es realmente sin estado:** no revisé los WebSockets a fondo, y eso decide si
  se puede escalar horizontalmente.

### En qué discrepo del enunciado

1. **"Cinco fuentes de datos desde un solo proceso" es falso:** son dos. Lo escribí yo en
   el inventario y lo corrijo. Debilita la opción C que el propio enunciado propone.
2. **El enunciado pone la seguridad por encima de la velocidad.** Con la evidencia a la
   vista yo invertiría el orden en la fase 1: la fragilidad de memoria y de conexiones es
   explotable por cualquier usuario autenticado, cuesta horas arreglarla, y hoy se está
   manifestando como caídas reales. La seguridad va inmediatamente después, en paralelo.
3. **El enunciado da los 504 por consultas lentas.** Son, al menos en parte, agotamiento
   del pool de 10 conexiones: un fallo de configuración, no de SQL.
