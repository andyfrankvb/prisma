# Resultados sobre RUTA-DE-TRABAJO.md

**Agente:** Claude Code (Opus 5), dentro del repositorio · **Commit:** `4d9805b` · **Fecha:** 2026-11-03

---

## 1. Reparto para tres personas

| Persona | Frente | Primera tarea | Cómo se mide | Depende de |
|---|---|---|---|---|
| **A** · entre semana | Seguridad, trazabilidad y CI | Límite de intentos y bloqueo de cuenta | Intentos necesarios para bloquear una cuenta: hoy infinitos | Nadie |
| **B** · entre semana | Estabilidad y velocidad | **Techo de memoria en el compose, tope de concurrencia en subidas, y subir el pool con un `acquireConnectionTimeout` corto** | Peticiones simultáneas antes del primer 504 | Nadie |
| **C** · **fines de semana** | Migración completa SID → PRISMA | Liberar disco (79 % de 37.6 GB) | % del acervo visible: hoy 21 % | Nadie |

---

## 2. Por qué a C le toca la migración

Es el único frente hecho de **bloques largos y autocontenidos**: cargas por lotes,
idempotentes y reanudables, sobre una producción que en sábado y domingo está tranquila.
No necesita coordinarse a media tarea, no bloquea a nadie y nadie lo bloquea a él.

Si en su sesión aparece algo que toca el compose o el código de la API, lo anota y lo pasa
el lunes.

Los otros dos frentes son lo contrario: cambios chicos, frecuentes, y que conviene
verificar con alguien despierto del otro lado.

**Reglas para sus sesiones de fin de semana:**

- Cargas en lotes, siempre reanudables. Los cargadores son idempotentes por `origen_id`
  único más `ON CONFLICT DO NOTHING`.
- **Cuidado con reanudar por cursor.** Un `WHERE id > max(origen_id)` salta hacia adelante
  y **no recupera los huecos de en medio**. Para rellenar, anti-join.
- Antes de la primera carga masiva, un respaldo: tres millones de filas no se deshacen con
  un `DELETE` a ojo.
- Dejar escrito al terminar cada sesión qué lote quedó cargado y cuál sigue.

---

## 3. El cambio que propongo a la ruta actual

**La primera tarea de B deja de ser la medición y pasa a ser contener la memoria y el
pool.** El motivo es el hallazgo principal de mi evaluación:

> El pool de la base principal es de **10 conexiones para toda la aplicación**
> (`src/db.ts:10`), sin `acquireConnectionTimeout`, así que rige el de knex: **60 s**,
> el mismo orden que el corte de nginx.

Diez consultas pesadas dejan a todas las demás esperando hasta un minuto, y mueren en 504
en pantallas que no tienen nada que ver con reportes. Sumado a las subidas que entran
enteras a memoria —hasta 1.2 GB por una petición de oficio, sin `mem_limit` en el
contenedor—, es la explicación más plausible de que el sistema se sienta caído.

Son **horas de trabajo** y quitan el riesgo de caída completa. La medición viene
inmediatamente después, en la misma semana.

---

## 4. Las dependencias que hay que respetar

- **C empieza por el disco.** Va a cargar millones de filas con el servidor al 79 %.
- **B monta el acervo en el worker antes de encolar** cualquier cosa que lea documentos:
  `app_worker` hoy solo tiene `storage_prisma` y fallaría con archivo no encontrado.
- **A necesita la CI antes** de poder fijar el techo de los 658 `any`.
- **El compose es de B.** Si A o C lo necesitan, se lo piden.
- **Una migración de esquema por persona**, archivo numerado propio.
- Antes de un índice o una vista materializada sobre las tablas del Visor, avisar a C:
  son las que van a crecer 4.7x.

**Nadie más depende de nadie.** Esa es la condición para que el esquema de fin de semana
funcione, y la ruta actual ya la cumple.
