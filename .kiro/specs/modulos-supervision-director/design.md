# Documento de Diseño Técnico

## Módulos de Supervisión y Director

**Sistema de Gestión de Oficios — Oficialía de Partes, Gobierno del Estado de Quintana Roo**

---

## Descripción General

Este documento describe el diseño técnico para la funcionalidad de **Módulos de Supervisión y Director**, que extiende el sistema existente con tres capacidades nuevas:

1. **Gestión de módulos por usuario** (SuperAdmin): asignación y revocación de acceso a módulos funcionales del sistema.
2. **Panel de supervisión del Director General**: vista unificada del estado de todos los módulos activos mediante el patrón `ModuleRegistry`.
3. **Módulo de Supervisión de Eventos**: segundo módulo funcional del sistema, que permite a la Directora General crear eventos operativos, asignar tareas a directores de área y supervisar su avance.

El diseño sigue los patrones ya establecidos en el proyecto: Express 4 + TypeScript + Knex.js en el backend, React 18 + CSS-in-JS con el theme institucional en el frontend, y JWT Bearer para autenticación.

---

## Arquitectura General


```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Navegador)                                  │
│                                                                             │
│  Dashboard_SuperAdmin.tsx          Dashboard_Director.tsx                   │
│  ┌──────────────────────┐          ┌──────────────────────────────────────┐ │
│  │ Sidebar + módulos    │          │ Sección Supervisión (tarjetas)       │ │
│  │ ┌──────────────────┐ │          │ Sección Eventos (lista + detalle)    │ │
│  │ │ SeccionModulos   │ │          └──────────────────────────────────────┘ │
│  │ │ (tabla usuarios  │ │                                                   │
│  │ │  + panel toggles)│ │          Dashboard_DirectorArea.tsx (nuevo)       │
│  │ └──────────────────┘ │          ┌──────────────────────────────────────┐ │
│  └──────────────────────┘          │ Tareas asignadas + filtros + estado  │ │
│                                    └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                │ HTTP/REST (JWT Bearer)                │
                ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express 4 + TypeScript)                     │
│                                                                             │
│  /api/v1/admin/modulos          /api/v1/director/supervision                │
│  /api/v1/admin/usuarios/:id/modulos   /api/v1/eventos/**                   │
│                                                                             │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │  admin.controller    │   │  director.controller (extendido)         │   │
│  │  (módulos endpoints) │   │  eventos.controller (nuevo)              │   │
│  └──────────────────────┘   └──────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    ModuleRegistry (Singleton)                        │  │
│  │  register(clave, fn)  ──►  Map<string, ModuleMetricsFn>             │  │
│  │  computeAll()         ──►  Promise<ResumenModulo[]>                 │  │
│  │                                                                      │  │
│  │  Registro al arrancar:                                               │  │
│  │    oficialia_partes  ──► fn: consulta tabla oficios                 │  │
│  │    supervision_eventos ► fn: consulta tablas eventos + tareas_evento│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  authenticate middleware (JWT)   requireRole guard                          │
└─────────────────────────────────────────────────────────────────────────────┘
                │ Knex.js (pg)
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL 15                                        │
│                                                                             │
│  Tablas existentes:                  Tablas nuevas:                         │
│  usuarios, oficios,                  modulos                                │
│  asignaciones_juridicas,             usuario_modulos                        │
│  auditoria_estados, ...              eventos                                │
│                                      tareas_evento                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Base de Datos

### DDL Completo — Tablas Nuevas

Las tablas existentes (`usuarios`, `oficios`, `asignaciones_juridicas`, `auditoria_estados`, etc.) no se modifican. Se agregan cuatro tablas nuevas.

#### Tabla `modulos`

```sql
-- Catálogo de módulos funcionales del sistema
CREATE TABLE modulos (
    id             SERIAL PRIMARY KEY,
    clave          VARCHAR(100) NOT NULL UNIQUE,
    nombre_display VARCHAR(150) NOT NULL,
    descripcion    TEXT,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    orden          INTEGER      NOT NULL DEFAULT 0
);

CREATE INDEX idx_modulos_clave  ON modulos (clave);
CREATE INDEX idx_modulos_activo ON modulos (activo);
```

#### Tabla `usuario_modulos`

```sql
-- Asignaciones de módulos a usuarios (muchos a muchos)
CREATE TABLE usuario_modulos (
    usuario_id      INTEGER   NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE,
    modulo_id       INTEGER   NOT NULL
                        REFERENCES modulos (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    asignado_en     TIMESTAMP NOT NULL DEFAULT NOW(),
    asignado_por_id INTEGER   NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    PRIMARY KEY (usuario_id, modulo_id)
);

CREATE INDEX idx_usuario_modulos_usuario ON usuario_modulos (usuario_id);
CREATE INDEX idx_usuario_modulos_modulo  ON usuario_modulos (modulo_id);
```

La restricción `PRIMARY KEY (usuario_id, modulo_id)` garantiza la unicidad del par y reemplaza la necesidad de un índice `UNIQUE` separado.

#### Tabla `eventos`

```sql
-- Eventos operativos creados por la Directora General
CREATE TYPE estado_evento AS ENUM ('ABIERTO', 'CERRADO');

CREATE TABLE eventos (
    id              SERIAL       PRIMARY KEY,
    titulo          VARCHAR(255) NOT NULL,
    descripcion     TEXT,
    estado          estado_evento NOT NULL DEFAULT 'ABIERTO',
    creado_por_id   INTEGER      NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),
    fecha_cierre    TIMESTAMP
);

CREATE INDEX idx_eventos_estado        ON eventos (estado);
CREATE INDEX idx_eventos_creado_por    ON eventos (creado_por_id);
CREATE INDEX idx_eventos_fecha_creacion ON eventos (fecha_creacion DESC);
```

#### Tabla `tareas_evento`

```sql
-- Tareas asociadas a eventos, asignadas a directores de área
CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA');

CREATE TABLE tareas_evento (
    id                 SERIAL       PRIMARY KEY,
    evento_id          INTEGER      NOT NULL
                           REFERENCES eventos (id)
                           ON UPDATE CASCADE
                           ON DELETE CASCADE,
    titulo             VARCHAR(255) NOT NULL,
    descripcion        TEXT,
    asignado_a_id      INTEGER      NOT NULL
                           REFERENCES usuarios (id)
                           ON UPDATE CASCADE
                           ON DELETE RESTRICT,
    estado             estado_tarea NOT NULL DEFAULT 'PENDIENTE',
    fecha_programada   DATE         NOT NULL,
    fecha_actualizacion TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tareas_evento_evento       ON tareas_evento (evento_id);
CREATE INDEX idx_tareas_evento_asignado     ON tareas_evento (asignado_a_id);
CREATE INDEX idx_tareas_evento_estado       ON tareas_evento (estado);
CREATE INDEX idx_tareas_evento_fecha_prog   ON tareas_evento (fecha_programada);
```

### Datos Semilla

```sql
-- Módulos iniciales del sistema
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden) VALUES
    ('oficialia_partes',    'Oficialía de Partes',    'Recepción, registro y seguimiento de oficios oficiales.', TRUE, 1),
    ('supervision_eventos', 'Supervisión de Eventos', 'Gestión de eventos operativos y tareas por área.',        TRUE, 2)
ON CONFLICT (clave) DO NOTHING;
```

### Nota sobre el ENUM `rol_usuario`

El schema existente define `rol_usuario` sin incluir `SUPERADMIN`. La migración debe extender el tipo:

```sql
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'SUPERADMIN';
```

---

## ModuleRegistry — Patrón Singleton

El `ModuleRegistry` es el componente central que desacopla el panel de supervisión del Director de los módulos concretos. Cada módulo se registra al arrancar el servidor con su función de métricas; el endpoint de supervisión simplemente llama a `computeAll()`.

### Interfaz y Clase

```typescript
// src/modules/module-registry/module.registry.ts

export interface ModuleMetricsFn {
  (): Promise<{ activos: number; pendientes: number; alertas: number }>;
}

export interface ResumenModulo {
  clave:      string;
  nombre:     string;
  orden:      number;
  activos:    number | null;
  pendientes: number | null;
  alertas:    number | null;
  error?:     string;
}

class ModuleRegistry {
  private static instance: ModuleRegistry;
  private registry = new Map<string, ModuleMetricsFn>();

  private constructor() {}

  static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry();
    }
    return ModuleRegistry.instance;
  }

  register(clave: string, fn: ModuleMetricsFn): void {
    this.registry.set(clave, fn);
  }

  async computeAll(): Promise<ResumenModulo[]> {
    // Obtener módulos activos de la BD ordenados por `orden`
    const modulos = await db('modulos')
      .where({ activo: true })
      .select('clave', 'nombre_display as nombre', 'orden')
      .orderBy('orden', 'asc');

    return Promise.all(
      modulos.map(async (m) => {
        const fn = this.registry.get(m.clave);
        if (!fn) {
          return { ...m, activos: 0, pendientes: 0, alertas: 0 };
        }
        try {
          const metrics = await fn();
          return { ...m, ...metrics };
        } catch (err: any) {
          return {
            ...m,
            activos: null, pendientes: null, alertas: null,
            error: err.message ?? 'Error al calcular métricas',
          };
        }
      }),
    );
  }
}

export const moduleRegistry = ModuleRegistry.getInstance();
```

### Registro del módulo Oficialía de Partes

```typescript
// src/modules/oficialia_partes/oficios.registry.ts

import { moduleRegistry } from '../module-registry/module.registry';
import { db } from '../../db';

export function registerOficialiaPartes(): void {
  moduleRegistry.register('oficialia_partes', async () => {
    const [activos] = await db('oficios')
      .whereNot('estatus', 'FINALIZADO')
      .count('id as count');

    const [pendientes] = await db('oficios')
      .whereIn('estatus', ['RECIBIDO', 'ASIGNADO'])
      .count('id as count');

    const [alertas] = await db('oficios')
      .where('tiene_termino', true)
      .whereNot('estatus', 'FINALIZADO')
      .whereRaw('fecha_vencimiento::date <= CURRENT_DATE')
      .count('id as count');

    return {
      activos:    Number(activos.count),
      pendientes: Number(pendientes.count),
      alertas:    Number(alertas.count),
    };
  });
}
```

### Registro del módulo Supervisión de Eventos

```typescript
// src/modules/eventos/eventos.registry.ts

import { moduleRegistry } from '../module-registry/module.registry';
import { db } from '../../db';

export function registerSupervisionEventos(): void {
  moduleRegistry.register('supervision_eventos', async () => {
    const [activos] = await db('eventos')
      .where('estado', 'ABIERTO')
      .count('id as count');

    const [pendientes] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNot('t.estado', 'COMPLETADA')
      .count('t.id as count');

    const [alertas] = await db('tareas_evento as t')
      .join('eventos as e', 'e.id', 't.evento_id')
      .where('e.estado', 'ABIERTO')
      .whereNot('t.estado', 'COMPLETADA')
      .whereRaw('t.fecha_programada < CURRENT_DATE')
      .count('t.id as count');

    return {
      activos:    Number(activos.count),
      pendientes: Number(pendientes.count),
      alertas:    Number(alertas.count),
    };
  });
}
```

### Inicialización en `server.ts`

```typescript
// Al final de los imports en src/server.ts
import { registerOficialiaPartes }    from './modules/oficialia_partes/oficios.registry';
import { registerSupervisionEventos } from './modules/eventos/eventos.registry';

// Antes de app.listen():
registerOficialiaPartes();
registerSupervisionEventos();
```

---

## Componentes e Interfaces

### Nuevos Endpoints API

#### Módulos (Admin — SUPERADMIN)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/admin/modulos` | Lista todos los módulos del catálogo |
| GET | `/api/v1/admin/usuarios/:id/modulos` | Módulos del catálogo con estado habilitado/no para el usuario |
| POST | `/api/v1/admin/usuarios/:id/modulos/:moduloId` | Habilita un módulo para el usuario |
| DELETE | `/api/v1/admin/usuarios/:id/modulos/:moduloId` | Revoca un módulo del usuario |

#### Supervisión (Director — DIRECTOR)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/director/supervision` | Resumen de todos los módulos activos (via ModuleRegistry) |

#### Eventos (mixto — DIRECTOR crea/cierra, DIRECTOR lee detalle, DIRECTOR_AREA actualiza tareas)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/eventos` | Crea un evento (solo DIRECTOR) |
| GET | `/api/v1/eventos` | Lista eventos con métricas de tareas |
| GET | `/api/v1/eventos/:id` | Detalle de evento con lista completa de tareas |
| POST | `/api/v1/eventos/:id/tareas` | Agrega una tarea a un evento (solo DIRECTOR) |
| PATCH | `/api/v1/eventos/:id/tareas/:tareaId/estado` | Actualiza estado de tarea (solo el asignado) |
| PATCH | `/api/v1/eventos/:id/cerrar` | Cierra un evento (solo DIRECTOR) |

### Interfaces TypeScript

```typescript
// ── Módulos ───────────────────────────────────────────────────

export interface Modulo {
  id:             number;
  clave:          string;
  nombre_display: string;
  descripcion:    string | null;
  activo:         boolean;
  orden:          number;
}

export interface ModuloConEstado extends Modulo {
  habilitado: boolean;
  asignado_en?: string | null;
}

// GET /admin/modulos
export interface ListarModulosResponse {
  data: Modulo[];
}

// GET /admin/usuarios/:id/modulos
export interface UsuarioModulosResponse {
  data: ModuloConEstado[];
}

// POST /admin/usuarios/:id/modulos/:moduloId  (body vacío)
// DELETE /admin/usuarios/:id/modulos/:moduloId
export interface ModuloToggleResponse {
  message:    string;
  habilitado: boolean;
}

// ── Supervisión ───────────────────────────────────────────────

export interface ResumenModulo {
  clave:      string;
  nombre:     string;
  orden:      number;
  activos:    number | null;
  pendientes: number | null;
  alertas:    number | null;
  error?:     string;
}

// GET /director/supervision
export interface SupervisionResponse {
  data: ResumenModulo[];
}

// ── Eventos ───────────────────────────────────────────────────

export type EstadoEvento = 'ABIERTO' | 'CERRADO';
export type EstadoTarea  = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA';

export interface TareaEvento {
  id:                  number;
  evento_id:           number;
  titulo:              string;
  descripcion:         string | null;
  asignado_a_id:       number;
  asignado_a_nombre:   string;
  estado:              EstadoTarea;
  fecha_programada:    string;   // ISO date
  fecha_actualizacion: string;   // ISO timestamp
  vencida:             boolean;
  proxima_a_vencer:    boolean;
}

export interface EventoResumen {
  id:                  number;
  titulo:              string;
  descripcion:         string | null;
  estado:              EstadoEvento;
  creado_por_id:       number;
  fecha_creacion:      string;
  fecha_cierre:        string | null;
  total_tareas:        number;
  tareas_pendiente:    number;
  tareas_en_progreso:  number;
  tareas_completada:   number;
  tareas_vencidas:     number;
  tareas_proximas:     number;
}

export interface EventoDetalle extends EventoResumen {
  tareas: TareaEvento[];
}

// POST /eventos — body
export interface CrearEventoBody {
  titulo:      string;
  descripcion?: string;
}

// POST /eventos/:id/tareas — body
export interface CrearTareaBody {
  titulo:           string;
  descripcion?:     string;
  asignado_a_id:    number;
  fecha_programada: string;   // ISO date YYYY-MM-DD
}

// PATCH /eventos/:id/tareas/:tareaId/estado — body
export interface ActualizarEstadoTareaBody {
  estado: EstadoTarea;
}

// GET /eventos
export interface ListarEventosResponse {
  data: EventoResumen[];
}

// GET /eventos/:id
export interface DetalleEventoResponse {
  data: EventoDetalle;
}
```

---

## Modelos de Datos

### Diagrama de relaciones (nuevas tablas)

```
usuarios (existente)
    │
    ├──< usuario_modulos >──── modulos
    │       usuario_id FK          id PK
    │       modulo_id FK           clave UNIQUE
    │       asignado_en            nombre_display
    │       asignado_por_id FK     activo
    │                              orden
    │
    └──< eventos
             id PK
             titulo
             estado (ABIERTO|CERRADO)
             creado_por_id FK → usuarios
             fecha_creacion
             fecha_cierre
                 │
                 └──< tareas_evento
                          id PK
                          evento_id FK
                          titulo
                          asignado_a_id FK → usuarios
                          estado (PENDIENTE|EN_PROGRESO|COMPLETADA)
                          fecha_programada
                          fecha_actualizacion
```

### Máquina de estados de `tareas_evento`

```
PENDIENTE ──► EN_PROGRESO ──► COMPLETADA
```

Solo se permiten transiciones hacia adelante. Cualquier otra transición devuelve HTTP 422.

### Máquina de estados de `eventos`

```
ABIERTO ──► CERRADO
```

Un evento cerrado no puede reabrirse (fuera del alcance de esta funcionalidad).

---

## Componentes Frontend Nuevos

### 1. Sección "Módulos" en `Dashboard_SuperAdmin`

Se agrega una nueva entrada al sidebar con clave `'modulos'` y se crea el componente `SeccionModulos`.

**Estructura del componente:**

```
SeccionModulos
├── Tabla de usuarios (nombre, email, rol, oficina, módulos habilitados como pills)
│   └── Al hacer clic en una fila → selecciona el usuario
└── Panel lateral de detalle (aparece cuando hay usuario seleccionado)
    ├── Nombre y rol del usuario
    └── Lista de módulos del catálogo con toggle ON/OFF por módulo
        └── Al cambiar toggle → POST o DELETE /admin/usuarios/:id/modulos/:moduloId
```

**Decisiones de diseño:**
- El panel de detalle se muestra como un panel deslizable a la derecha dentro del mismo contenedor, sin modal, para mantener la visibilidad de la tabla.
- Los toggles usan el mismo patrón visual del theme institucional (guinda para activo, gris para inactivo).
- Los errores de API se muestran inline junto al toggle afectado, sin alterar el estado visual previo.
- La tabla de usuarios reutiliza la misma llamada a `GET /admin/usuarios` ya existente.

### 2. Sección "Supervisión" en `Dashboard_Director`

Se agrega una nueva pestaña/sección al dashboard existente del Director. El componente `SeccionSupervision` muestra tarjetas por módulo.

**Estructura del componente:**

```
SeccionSupervision
└── Grid de tarjetas (una por módulo activo)
    └── TarjetaModulo
        ├── Nombre del módulo
        ├── Métrica "Activos" (número grande)
        ├── Métrica "Pendientes" (con color de alerta si > 0)
        ├── Métrica "Alertas" (con color rojo si > 0)
        └── Si error → mensaje de error en lugar de métricas
```

**Decisiones de diseño:**
- Las tarjetas se ordenan según el campo `orden` devuelto por la API (Oficialía de Partes primero, Supervisión de Eventos segundo).
- Si `alertas > 0`, la tarjeta muestra un borde izquierdo rojo.
- Si `pendientes > 0`, la tarjeta muestra un borde izquierdo amarillo.
- Si todo está en cero, borde verde.

### 3. Sección "Eventos" en `Dashboard_Director`

Se agrega una segunda sección al dashboard del Director para gestionar eventos.

**Estructura del componente:**

```
SeccionEventos
├── Botón "Nuevo Evento" → abre modal de creación
├── Lista de EventoCard (uno por evento)
│   ├── Título, estado (ABIERTO/CERRADO)
│   ├── Barra de progreso de tareas (pendiente/en_progreso/completada)
│   ├── Indicador de alertas (tareas vencidas)
│   └── Al hacer clic → expande detalle con lista de tareas
│       ├── TareaRow (título, asignado a, estado, fecha_programada, indicador vencida)
│       └── Botón "Agregar Tarea" → abre modal de creación de tarea
└── Modal CrearEvento (titulo, descripcion)
    └── Modal CrearTarea (titulo, descripcion, asignado_a_id, fecha_programada)
```

**Decisiones de diseño:**
- Los eventos CERRADOS se muestran con opacidad reducida al final de la lista.
- El botón "Cerrar Evento" aparece solo en eventos ABIERTOS, con confirmación antes de ejecutar.
- Los selectores de `asignado_a_id` en el modal de tarea muestran solo usuarios con rol `DIRECTOR` (excluyendo a la Directora General creadora).

### 4. Vista `Dashboard_DirectorArea` (nueva)

Vista independiente para directores de área. Se registra en `App.tsx` bajo la ruta del rol `DIRECTOR` cuando el usuario no es la Directora General (distinción por `oficina_id` o por un campo adicional).

**Nota de diseño:** Dado que todos los directores de área tienen el mismo rol `DIRECTOR`, la distinción entre "Directora General" y "Director de Área" se hace por `oficina_id`. La Directora General tiene `oficina_id` correspondiente a "DIRECCION GENERAL"; los directores de área tienen `oficina_id` de sus respectivas direcciones (JURIDICA, TICS, ADMINISTRATIVA).

**Estructura del componente:**

```
Dashboard_DirectorArea
├── Filtros (por estado: PENDIENTE/EN_PROGRESO/COMPLETADA, por evento)
├── Lista de TareaAsignada
│   ├── Título del evento (encabezado de grupo)
│   └── TareaRow
│       ├── Título de la tarea
│       ├── Estado actual (badge)
│       ├── Fecha programada + indicador vencida/próxima
│       └── Botón "Avanzar estado" (PENDIENTE→EN_PROGRESO o EN_PROGRESO→COMPLETADA)
│           └── Al hacer clic → PATCH /eventos/:id/tareas/:tareaId/estado
└── Mensaje de error inline si la actualización falla
```

---

## Propiedades de Corrección

*Una propiedad es una característica o comportamiento que debe ser verdadero en todas las ejecuciones válidas del sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre las especificaciones legibles por humanos y las garantías de corrección verificables por máquina.*

### Property 1: Completitud del listado de módulos

*Para cualquier* conjunto de módulos almacenados en la tabla `modulos` (incluyendo módulos con `activo = false`), la respuesta de `GET /api/v1/admin/modulos` debe contener exactamente ese conjunto de módulos, sin omitir ninguno.

**Validates: Requirements 1.2, 1.3**

---

### Property 2: Unicidad de clave de módulo

*Para cualquier* clave de módulo ya existente en el catálogo, intentar insertar un segundo módulo con la misma clave debe resultar en un error de restricción de unicidad (HTTP 409 o error de BD).

**Validates: Requirements 1.4**

---

### Property 3: Corrección del estado habilitado por usuario

*Para cualquier* usuario y cualquier subconjunto de módulos asignados a ese usuario, la respuesta de `GET /api/v1/admin/usuarios/:id/modulos` debe contener todos los módulos del catálogo, con `habilitado = true` exactamente para los módulos asignados y `habilitado = false` para los demás.

**Validates: Requirements 2.1**

---

### Property 4: Round-trip de asignación y revocación de módulo

*Para cualquier* par (usuario, módulo), habilitar el módulo con `POST /admin/usuarios/:id/modulos/:moduloId` y luego revocarlo con `DELETE /admin/usuarios/:id/modulos/:moduloId` debe dejar el estado del usuario exactamente igual al estado previo a la asignación (módulo con `habilitado = false`).

**Validates: Requirements 2.2, 2.3**

---

### Property 5: Restricción de acceso por rol en endpoints de módulos

*Para cualquier* rol en `{OFICIAL, ENCARGADO, JURIDICO, SECRETARIA, DIRECTOR}`, todos los endpoints bajo `/api/v1/admin/modulos` y `/api/v1/admin/usuarios/:id/modulos` deben devolver HTTP 403.

**Validates: Requirements 2.6, 8.3**

---

### Property 6: Completitud del panel de supervisión

*Para cualquier* conjunto de módulos con `activo = true` registrados en el `ModuleRegistry`, la respuesta de `GET /api/v1/director/supervision` debe contener exactamente un `ResumenModulo` por cada módulo activo, sin omitir ninguno.

**Validates: Requirements 4.3, 5.1**

---

### Property 7: Corrección de métricas de Oficialía de Partes

*Para cualquier* conjunto de oficios con distintos estatus en la base de datos, las métricas calculadas por el `ModuleRegistry` para el módulo `oficialia_partes` deben satisfacer simultáneamente:
- `activos` = count(oficios con estatus distinto de `FINALIZADO`)
- `pendientes` = count(oficios con estatus `RECIBIDO` o `ASIGNADO`)
- `alertas` = count(oficios con `tiene_termino = true`, estatus distinto de `FINALIZADO` y `fecha_vencimiento <= CURRENT_DATE`)

**Validates: Requirements 6.1, 6.2, 6.3**

---

### Property 8: Corrección de métricas de Supervisión de Eventos

*Para cualquier* conjunto de eventos y tareas en la base de datos, las métricas calculadas por el `ModuleRegistry` para el módulo `supervision_eventos` deben satisfacer simultáneamente:
- `activos` = count(eventos con `estado = 'ABIERTO'`)
- `pendientes` = count(tareas con `estado != 'COMPLETADA'` pertenecientes a eventos `ABIERTO`)
- `alertas` = count(tareas con `estado != 'COMPLETADA'`, `fecha_programada < CURRENT_DATE` y evento `ABIERTO`)

**Validates: Requirements 13.1, 13.2, 13.3**

---

### Property 9: Estado inicial de eventos creados

*Para cualquier* evento creado con título y descripción válidos mediante `POST /api/v1/eventos`, el evento devuelto y el evento consultado posteriormente deben tener `estado = 'ABIERTO'`.

**Validates: Requirements 9.1**

---

### Property 10: Estado inicial de tareas creadas

*Para cualquier* tarea creada con datos válidos mediante `POST /api/v1/eventos/:id/tareas`, la tarea devuelta y la tarea consultada posteriormente deben tener `estado = 'PENDIENTE'`.

**Validates: Requirements 9.2**

---

### Property 11: Validez de transiciones de estado de tareas

*Para cualquier* tarea en cualquier estado, solo las transiciones `PENDIENTE → EN_PROGRESO` y `EN_PROGRESO → COMPLETADA` deben ser aceptadas (HTTP 200). Cualquier otra transición (`COMPLETADA → PENDIENTE`, `COMPLETADA → EN_PROGRESO`, `PENDIENTE → COMPLETADA`, etc.) debe ser rechazada con HTTP 422.

**Validates: Requirements 10.1, 10.2, 10.3**

---

### Property 12: Autorización de actualización de tareas

*Para cualquier* tarea asignada al usuario A, un usuario B distinto de A que intente actualizar el estado de esa tarea debe recibir HTTP 403, independientemente del estado actual de la tarea o la transición solicitada.

**Validates: Requirements 10.4**

---

### Property 13: Corrección de métricas en el listado de eventos

*Para cualquier* conjunto de eventos con sus tareas asociadas, los conteos devueltos en `GET /api/v1/eventos` (`total_tareas`, `tareas_pendiente`, `tareas_en_progreso`, `tareas_completada`, `tareas_vencidas`, `tareas_proximas`) deben ser exactamente iguales a los conteos calculados directamente sobre las tareas de cada evento.

**Validates: Requirements 11.1, 11.5**

---

### Reflexión sobre redundancia de propiedades

Tras revisar las 13 propiedades:

- **Property 9 y 10** son independientes (eventos vs tareas) y no se solapan.
- **Property 7 y 8** son independientes (módulos distintos) y no se solapan.
- **Property 11** cubre completamente el requisito 10.3 (edge case de transición inválida), por lo que no se necesita una propiedad separada para ese edge case.
- **Property 3** cubre completamente el requisito 2.1 incluyendo el caso de módulos no asignados.
- **Property 4** (round-trip) cubre los requisitos 2.2 y 2.3 de forma más completa que dos propiedades separadas.

No se identifican redundancias entre las propiedades restantes. Cada una valida un aspecto distinto del sistema.

---

## Manejo de Errores

### Errores de negocio esperados

| Situación | HTTP | Mensaje |
|-----------|------|---------|
| Módulo ya habilitado para el usuario | 409 | "El módulo ya está habilitado para este usuario" |
| Módulo no habilitado al intentar revocar | 404 | "El módulo no está habilitado para este usuario" |
| SuperAdmin intenta modificar sus propios módulos | 422 | "No puedes modificar los módulos de tu propia sesión" |
| Evento sin título | 422 | "El título del evento es obligatorio" |
| Tarea sin fecha_programada | 422 | "La fecha programada es obligatoria" |
| Tarea asignada a usuario sin rol DIRECTOR | 422 | "El usuario asignado debe tener rol DIRECTOR" |
| Transición de estado inválida | 422 | "Transición inválida: {estado_actual} → {estado_nuevo}" |
| Director de área intenta actualizar tarea de otro | 403 | "No tienes permiso para actualizar esta tarea" |
| Evento ya cerrado al intentar cerrar | 409 | "El evento ya está cerrado" |
| Usuario no encontrado | 404 | "Usuario no encontrado" |
| Módulo no encontrado | 404 | "Módulo no encontrado" |
| Evento no encontrado | 404 | "Evento no encontrado" |
| Tarea no encontrada | 404 | "Tarea no encontrada" |

### Errores de infraestructura

- Si la función de métricas de un módulo lanza una excepción, el `ModuleRegistry` la captura y devuelve el `ResumenModulo` con `activos: null`, `pendientes: null`, `alertas: null` y `error: <mensaje>`. El endpoint de supervisión nunca falla por un módulo individual.
- Todos los errores no manejados son capturados por el middleware global de Express y devuelven HTTP 500 sin exponer el stack trace.

### Validaciones de entrada

- `titulo` de evento: string no vacío, máximo 255 caracteres.
- `titulo` de tarea: string no vacío, máximo 255 caracteres.
- `fecha_programada`: string en formato `YYYY-MM-DD`, debe ser una fecha válida.
- `asignado_a_id`: entero positivo, debe corresponder a un usuario existente con rol `DIRECTOR`.
- `estado` en PATCH de tarea: debe ser uno de `PENDIENTE`, `EN_PROGRESO`, `COMPLETADA`.

---

## Estrategia de Testing

### Enfoque dual

La estrategia combina tests unitarios para casos concretos y tests basados en propiedades para verificar invariantes universales.

### Librería de property-based testing

Se usará **fast-check** (npm), la librería de PBT más madura para TypeScript/JavaScript. Es compatible con Vitest (el runner ya configurado en el proyecto).

```
npm install --save-dev fast-check
```

Cada test de propiedad se configura con mínimo **100 iteraciones** (`numRuns: 100`).

### Tests unitarios (Vitest)

Ubicación: `src/tests/unit/`

Casos a cubrir:

1. **Validación de transiciones de estado** (`isValidTransition`):
   - PENDIENTE → EN_PROGRESO: válido
   - EN_PROGRESO → COMPLETADA: válido
   - PENDIENTE → COMPLETADA: inválido
   - COMPLETADA → PENDIENTE: inválido
   - COMPLETADA → EN_PROGRESO: inválido

2. **Cálculo de `vencida` y `proxima_a_vencer`** en tareas:
   - Tarea con fecha pasada y estado != COMPLETADA → vencida = true
   - Tarea con fecha en los próximos 3 días y estado != COMPLETADA → proxima = true
   - Tarea COMPLETADA con fecha pasada → vencida = false

3. **ModuleRegistry**:
   - `register` + `computeAll` con función mock que devuelve métricas fijas
   - `computeAll` cuando la función lanza error → devuelve error en el resumen
   - `computeAll` cuando el módulo no tiene función registrada → devuelve ceros

### Tests de integración (Vitest + supertest)

Ubicación: `src/tests/integration/`

Casos a cubrir:

1. **Flujo completo de módulos**: crear usuario → asignar módulo → verificar estado → revocar → verificar estado
2. **Flujo completo de eventos**: crear evento → agregar tareas → avanzar estados → cerrar evento
3. **Autorización**: verificar que cada endpoint devuelve 403 para roles no autorizados
4. **Errores de negocio**: duplicado de módulo (409), transición inválida (422), tarea de otro usuario (403)

### Tests de propiedades (fast-check + Vitest)

Ubicación: `src/tests/unit/` o `src/tests/property/`

Cada test referencia la propiedad del diseño con el tag:
`// Feature: modulos-supervision-director, Property N: <texto>`

**Configuración mínima:**
```typescript
import fc from 'fast-check';

// Ejemplo de estructura de test de propiedad
it('Property 11: solo transiciones válidas son aceptadas', () => {
  // Feature: modulos-supervision-director, Property 11: Validez de transiciones de estado de tareas
  fc.assert(
    fc.property(
      fc.constantFrom('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA'),
      fc.constantFrom('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA'),
      (estadoActual, estadoNuevo) => {
        const validas = new Set(['PENDIENTE->EN_PROGRESO', 'EN_PROGRESO->COMPLETADA']);
        const esValida = validas.has(`${estadoActual}->${estadoNuevo}`);
        const resultado = isValidTransition(estadoActual, estadoNuevo);
        return resultado === esValida;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Propiedades a implementar como tests PBT:**

| Property | Tipo de generador | Qué se verifica |
|----------|-------------------|-----------------|
| 1 (completitud módulos) | `fc.array(fc.record({clave, nombre, activo}))` | listado contiene exactamente los módulos insertados |
| 3 (estado habilitado) | `fc.array(fc.integer)` (subconjunto de módulos asignados) | campo `habilitado` correcto para cada módulo |
| 4 (round-trip asignación) | `fc.integer` (moduloId) | habilitar+revocar = estado original |
| 5 (restricción por rol) | `fc.constantFrom(roles no SUPERADMIN)` | todos devuelven 403 |
| 7 (métricas oficialía) | `fc.array(fc.record({estatus, tiene_termino, fecha_vencimiento}))` | activos/pendientes/alertas correctos |
| 8 (métricas eventos) | `fc.array(fc.record({estado_evento, estado_tarea, fecha_programada}))` | activos/pendientes/alertas correctos |
| 11 (transiciones tarea) | `fc.constantFrom(estados) x fc.constantFrom(estados)` | solo transiciones válidas aceptadas |
| 12 (autorización tarea) | `fc.integer` (usuarioId distinto del asignado) | devuelve 403 |
| 13 (métricas listado eventos) | `fc.array(fc.record({tareas con distintos estados}))` | conteos correctos |

---

## Decisiones de Diseño Clave

### 1. ModuleRegistry como singleton en proceso

El `ModuleRegistry` vive en memoria del proceso Node.js. Esto es suficiente porque:
- El registro ocurre al arrancar el servidor (una sola vez).
- No hay necesidad de persistir el registro entre reinicios; los módulos siempre se registran al arrancar.
- La tabla `modulos` en PostgreSQL es la fuente de verdad para el catálogo; el registry solo almacena las funciones de métricas.

### 2. Distinción Director General vs Director de Área

Dado que ambos tienen rol `DIRECTOR`, la distinción se hace por `oficina_id`:
- `oficina_id` correspondiente a "DIRECCION GENERAL" → Directora General (puede crear eventos, ver todos).
- Cualquier otro `oficina_id` de dirección → Director de Área (solo ve sus tareas asignadas).

Esta lógica se implementa en el middleware de los endpoints de eventos y en el frontend para decidir qué vista mostrar.

### 3. Cascada en `usuario_modulos`

`ON DELETE CASCADE` en `usuario_id` garantiza que al eliminar un usuario, sus asignaciones de módulos se eliminan automáticamente. `ON DELETE RESTRICT` en `modulo_id` previene eliminar un módulo que tenga usuarios asignados (requeriría revocar primero).

### 4. Orden de módulos en el panel de supervisión

El campo `orden` en la tabla `modulos` controla el orden de las tarjetas en el panel del Director. Oficialía de Partes tiene `orden = 1`, Supervisión de Eventos tiene `orden = 2`. Módulos futuros se agregan con `orden` mayor.

### 5. No se modifica el schema de `usuarios`

No se agrega ningún campo a la tabla `usuarios` para distinguir Director General de Director de Área. La distinción por `oficina_id` es suficiente y evita una migración de schema en una tabla central.

### 6. Endpoints de eventos bajo `/api/v1/eventos`

Se crea un nuevo router independiente (no bajo `/director`) porque los directores de área también consumen estos endpoints. El router aplica autenticación JWT a todos los endpoints y verifica el rol específico en cada handler.

---

