# Ruta de trabajo: PRISMA a nivel profesional

Tres frentes en paralelo que no se pisan: seguridad, velocidad y migración de datos.
La persona C trabaja en fines de semana, así que su frente está armado con tareas que
se sacan en bloques largos, no dependen de que los otros dos avancen, y aprovechan que
en sábado y domingo la producción está tranquila.

**Regla cero: medir antes de cambiar.** Hoy no hay métricas ni registro de consultas
lentas. Cada frente mide lo suyo antes de tocar nada, y nadie depende de que otro mida
primero.

---

## Persona A — Seguridad, trazabilidad y CI · entre semana

**Qué se busca:** que el sistema pueda custodiar datos registrales sin riesgo
inaceptable, y que no entre código roto.

**De dónde parte.** Ya hay cosas bien hechas que no hay que rehacer: contraseñas con
`bcrypt` costo 12, comparación contra un *hash* señuelo en el login para no filtrar qué
cuentas existen, JWT con caducidad de 8 h verificado también en el WebSocket, `helmet`,
`cors` y autorización por módulo.

1. **Límite de intentos y bloqueo de cuenta.** Hoy no hay nada: se pueden probar
   contraseñas sin freno. El hueco más explotable y el más barato de tapar.
2. **Credenciales en texto plano** fuera de `.env.save` y `.env.respaldo-*` del servidor.
3. **CI mínima**: `npx tsc --noEmit` y pruebas en cada PR. No existe ningún pipeline y
   quedan ~6 pruebas en rojo (5 estables y 1 intermitente, a la que hay que fijarle la
   semilla).
4. **Auditoría general.** Hoy solo existen `auditoria_configuracion_flujos` y
   `auditoria_estados`, escritas por **4 de los 25 controladores**, y ninguna registra IP
   ni agente. Definir qué se asienta, por cuánto tiempo y cómo se evita que se altere.
5. **Revocación de token.** Hoy un JWT robado sirve las 8 horas completas.
6. **Validación por esquema** (`zod`) empezando por los endpoints que escriben, no por
   los ~250 de golpe.
7. **Hacer valer la regla del propio proyecto sobre `any`.** CLAUDE.md lo prohíbe y hay
   **658 usos** (oficios 55, satq 46, programas-sociales 32). Una vez que exista la CI,
   fijar el número actual como techo y no dejar que suba; bajarlo módulo por módulo.
8. **Revisar las escrituras sin transacción.** Solo 10 de los 25 controladores usan
   `.transaction()`; el resto puede dejar operaciones de varios pasos a medias.

**Archivos propios:** `src/middleware/`, `src/server.ts` (login), `src/modules/usuarios/`,
`src/modules/admin/`, `.github/workflows/`, y migraciones nuevas de auditoría.

**Cómo se mide:** intentos fallidos necesarios para bloquear una cuenta (hoy, infinitos);
controladores que asientan auditoría (hoy 4 de 25); PRs que ya no pueden entrar en rojo.

---

## Persona B — Velocidad y procesamiento asíncrono · entre semana

**Qué se busca:** que el sistema deje de caerse, que desaparezcan los 504 y que el
trabajo pesado deje de competir con las peticiones de los usuarios.

1. **Contener la memoria de las subidas.** Es lo primero porque una caída completa pesa
   más que un reporte lento, y cuesta horas. Hoy los 6 módulos que reciben archivos usan
   `multer.memoryStorage()` —oficios y eventos con 200 MB— y una sola petición de oficio
   acepta 6 archivos a la vez: hasta **1.2 GB de montón** en el proceso que atiende a
   todos. El contenedor **no tiene `mem_limit` ni `--max-old-space-size`**. Tres medidas:
   techo de memoria en el compose, tope de concurrencia en las subidas, y bajar los
   límites de tamaño a lo que de verdad se usa.
2. **Encender la medición**, que es su propio desbloqueo: `log_min_duration_statement`
   en el servidor de base y un cronómetro por petición en la API. Cuesta horas.
3. **Arreglar la tabla de paso de carga-datos.** `stg_satq_ingresos_carga` es global y se
   trunca, sin transacción: dos cargas simultáneas se corrompen entre sí y los conteos
   salen mal. Acotarla por carga y envolver todo en una transacción.
4. **Los 504 de reportes**, empezando por "Universo de Actos Registrales": paginar y
   transmitir en flujo, más agregados materializados que refresque el worker. Ya hay
   precedente: la exportación a Excel de SATQ nunca funcionó porque faltaba
   `pg-query-stream` (commit `ec1e5e1`).
5. **Montarle el acervo al worker.** `app_worker` solo monta `storage_prisma`; el acervo
   del Visor lo tiene únicamente `app_api`. **Va antes de encolar nada** que lea
   documentos, o falla con archivo no encontrado.
6. **Cablear Redis y sacar del proceso HTTP todo el trabajo pesado**: el OCR, y también
   el análisis de documentos que hoy corre ahí mismo —`extractFieldsFromPdf` sobre el
   buffer del PDF y `mammoth.extractRawText` sobre el del Word—. Redis está desplegado
   sin usar: no hay `bullmq` ni `ioredis` en `package.json`.
7. **Cache del Visor, con cuidado.** La marca de agua lleva nombre, IP y hora de quien
   consulta: cachear el PDF final le mostraría al segundo lector los datos del primero.
   Lo cacheable es solo el paso ráster→PDF.
8. **Desenredar el frontend** (`src/frontend/` → `frontend/src_frontend/`), que es lo que
   mantiene invisibles 11 errores de tipos: Vite transpila sin verificar.

**Archivos propios:** `src/modules/*/*.controller.ts` y repositorios,
`src/modules/visor_documentos/`, el worker, `frontend/`, `docker-compose.prod.yml`,
y migraciones nuevas de índices y vistas materializadas.

**Cómo se mide:** p95 del reporte que hoy da 504; respuesta del Visor con 50 peticiones
simultáneas; CPU de `prisma_api` durante un OCR.

---

## Persona C — Migración completa SID → PRISMA · fines de semana

**Qué se busca:** certeza, con evidencia, de que toda la información de SID está en
PRISMA o está explicado por qué no.

Este frente encaja en fin de semana: son cargas largas, la producción está tranquila, y
no hay que coordinarse con nadie a media tarea.

### Lo que ya se sabe

| Módulo | En SID | En PRISMA | Estado |
|---|---|---|---|
| Imágenes de libros | 638,171 | 638,171 | ✅ completo, cada una en su propia foja |
| Inscripciones | 190,404 | 189,116 | ⚠️ faltan 1,288, **todas explicadas** |
| Universo del Visor | 3,919,193 | 827,287 | ❌ **21 %** |
| Consultas | — | — | ❌ 3,076 huecos desde el id 76,768 |
| Folios | — | — | ❌ 24,228 sin migrar |
| Tickets | — | — | ⚠️ falta mapear identidad de 38 usuarios |

Las 1,288 inscripciones faltantes se descomponen en 611 en estado PENDIENTE que ni en SID
tienen PDF convertido, 676 copias con la misma `asignacion` que el cargador descarta a
propósito, y 1 incompleta. **Cero sin explicar**: ese módulo está cerrado.

El hueco grande es el Visor: faltan **3,090,618 imágenes** de las secciones Primera y
Segunda, repartidas en 4,108 libros (sección 1: 3,151 libros y 2,339,583 imágenes;
sección 2: 957 libros y 751,035). SID las sirve desde `Libros_PDF/`, que **el montaje
actual ya alcanza**: no hace falta volumen nuevo.

### El método, para que sea certeza y no impresión

1. **Inventario de las dos bases, tabla por tabla.** `db/verificar-migracion-sid.mjs` ya
   lo hace y marca cada tabla de SID como "con migrador" o "⬜ SIN migrador". Para cada
   una sin migrador hay que decidir por escrito: se migra, no aplica, o queda pendiente.
2. **Anti-join real, no comparación de máximos.** El verificador compara el id más alto
   de origen y destino en varios módulos, y así **no ve los huecos a media tabla** — por
   eso los 3,076 de consultas pasaron desapercibidos. Lo correcto es
   `NOT EXISTS` contra la clave de trazabilidad de cada módulo:
   `origen_id` en consultas, tickets e imágenes del Visor;
   `(origen_sid_tabla, origen_sid_id)` en folios.
3. **Toda fila faltante termina migrada o explicada**, con el motivo escrito. Como se
   hizo con las 1,288 inscripciones.
4. **Un reporte por módulo**, con los conteos de antes y después, para poder enseñarlo.

### Tareas, en orden

1. **Disco.** El servidor está al 79 % de 37.6 GB y hay un reinicio pendiente. Antes de
   cargar millones de filas hay que resolverlo, o la carga lo tumba.
2. **Corregir `db/migrate-visor-sid.mjs`.** Su `ON CONFLICT` apunta a
   `(delegacion_id, seccion_id, numero_romano, volumen)`, cuatro columnas, pero el índice
   único real es `uq_visor_tomos_acervo`, de **cinco**, con `oficina_codigo`. Hasta que
   eso cuadre, la carga del acervo no es confiablemente idempotente.
3. **Verificar el montaje SMB** en producción y listar `Libros_PDF/` para confirmar que
   los 3,090,618 PDF están donde se espera.
4. **Reescribir las comprobaciones del verificador** para que usen anti-join. Dos de los
   arreglos ya están hechos sin commitear en `db/verificar-migracion-sid.mjs`.
5. **Cargar las secciones Primera y Segunda**, por lotes, un libro a la vez, con conteo
   antes y después de cada lote.
6. **Cerrar los módulos chicos**: los 3,076 huecos de consultas con un relleno por
   `NOT EXISTS`, los 24,228 folios y la secuencia que quedó por encima de 4,378, y el
   mapeo de identidad de los 38 usuarios de tickets.

### Reglas para trabajar en fin de semana

- **Cargas en lotes, siempre reanudables.** Los cargadores son idempotentes por
  `origen_id` único más `ON CONFLICT DO NOTHING`, así que se pueden volver a correr.
- **Cuidado con reanudar por cursor.** Un `WHERE id > max(origen_id)` salta hacia
  adelante y **no recupera los huecos de en medio**. Para rellenar, anti-join.
- **Nada que requiera a los otros dos.** Si aparece algo que toca el compose o el código
  de la API, se anota y se pasa a B el lunes; no se edita.
- Antes de la primera carga masiva conviene un respaldo, aunque producción siga siendo de
  pruebas: tres millones de filas no se deshacen con un `DELETE` a ojo.
- Dejar escrito al terminar cada sesión: qué lote quedó cargado y cuál sigue.

**Cómo se mide:** porcentaje del acervo de SID visible en PRISMA (hoy 21 %); tablas de
SID sin migrador que siguen sin decisión; filas faltantes sin explicación (meta: cero).

---

## Para no chocar

- **El compose es de B.** Si A o C lo necesitan, se lo piden.
- **Una migración de esquema por persona**, archivo numerado propio. Nadie edita la del otro.
- **Cambios aditivos.** No se rompen interfaces públicas.
- Los tres tocan la base. Antes de un índice o una vista materializada sobre las tablas
  del Visor, avisar a C: son las que van a crecer 4.7x.
- **C no bloquea a nadie y nadie bloquea a C.** Es la condición para que el esquema de
  fin de semana funcione.

---

## Cómo comparar lo que devuelvan los agentes

Cada quien corre [el prompt](PROMPT-EVALUACION-ARQUITECTURA.md) con su propio agente,
dentro de una copia del repositorio. Luego:

1. **Primero las discrepancias de hecho.** Si dos agentes describen distinto el mismo
   archivo, uno se equivocó. Se resuelve mirando el código, no votando.
2. **Crucen la tabla de hallazgos.** Lo que aparece en las tres respuestas con la misma
   evidencia es real. Lo que aparece en una sola hay que ir a verificarlo.
3. **Comparen la tabla de alternativas, no las recomendaciones sueltas.** Lo interesante
   no es qué eligió cada agente, sino contra qué lo comparó.
4. **Descarten al que no pidió los números.** Quien recomienda una arquitectura sin
   preguntar cuántos usuarios concurrentes hay, está adivinando.
5. **Lean "Lo que NO haría".** Si alguno propone nube pública, CDN o Kubernetes, no leyó
   las restricciones.
6. **La tabla de techos de capacidad es el entregable central.** Si viene vacía o llena
   de "depende", esa respuesta no sirve aunque esté bien escrita.

Al final, una sola tabla de acuerdos entre los tres. Lo que quede en desacuerdo se
resuelve midiendo.
