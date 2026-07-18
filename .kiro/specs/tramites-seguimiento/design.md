# Diseño Técnico — Seguimiento de Trámites

## Arquitectura General

El módulo sigue el mismo patrón que los módulos existentes (`oficialia_partes`, `supervision_eventos`):
- **Backend**: Express router + controller en `src/modules/tramites/`
- **Frontend**: Un único componente `Dashboard_Tramites.tsx` con vistas por rol
- **BD**: Tablas nuevas en PostgreSQL, script SQL idempotente
- **Notificaciones**: Usa el dispatcher existente con nuevos tipos de evento

---

## 1. Base de Datos

### Enum `estatus_tramite`
```sql
CREATE TYPE estatus_tramite AS ENUM (
  'NUEVO', 'EN_REVISION', 'EN_PROCESO', 'FINALIZADO', 'RECHAZADO'
);
```

### Tabla `tramites`
```sql
CREATE TABLE tramites (
  id                SERIAL PRIMARY KEY,
  folio             VARCHAR(100) NOT NULL UNIQUE,
  titulo            VARCHAR(255) NOT NULL,
  descripcion       TEXT NOT NULL,
  tipo_tramite      VARCHAR(100) NOT NULL,
  estatus           estatus_tramite NOT NULL DEFAULT 'NUEVO',
  unidad_creadora_id INTEGER NOT NULL REFERENCES catalogo_unidades(id),
  creado_por_id     INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_creacion    TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_compromiso  DATE,
  fecha_cierre      TIMESTAMP
);
```

### Tabla `tramite_documentos`
```sql
CREATE TABLE tramite_documentos (
  id          SERIAL PRIMARY KEY,
  tramite_id  INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  archivo_url VARCHAR(500) NOT NULL,
  nombre_original VARCHAR(255),
  subido_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  subido_en   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabla `comentarios_tramite`
```sql
CREATE TABLE comentarios_tramite (
  id         SERIAL PRIMARY KEY,
  tramite_id INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  autor_id   INTEGER NOT NULL REFERENCES usuarios(id),
  contenido  TEXT NOT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabla `auditoria_tramites`
```sql
CREATE TABLE auditoria_tramites (
  id              SERIAL PRIMARY KEY,
  tramite_id      INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  estado_anterior estatus_tramite,
  estado_nuevo    estatus_tramite NOT NULL,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_cambio    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 2. Backend API

### Archivo: `src/modules/tramites/tramites.routes.ts`
```
POST   /tramites                        → crearTramite
GET    /tramites                        → listarTramites
GET    /tramites/:id                    → obtenerTramite
PATCH  /tramites/:id/aprobar            → aprobarTramite
PATCH  /tramites/:id/rechazar           → rechazarTramite
PATCH  /tramites/:id/finalizar          → finalizarTramite
POST   /tramites/:id/comentarios        → agregarComentario
GET    /tramites/:id/comentarios        → listarComentarios
```

### Reglas de autorización por endpoint

| Endpoint | Quién puede |
|----------|-------------|
| `POST /tramites` | DIRECTOR de DELEGACION + OPERATIVO de DELEGACION |
| `GET /tramites` | Todos los roles del módulo (filtrado por rol) |
| `GET /tramites/:id` | Según visibilidad del listado |
| `PATCH /tramites/:id/aprobar` | Solo Oscar Gopar (unidad_id=36, DIRECTOR) |
| `PATCH /tramites/:id/rechazar` | Solo Oscar Gopar (unidad_id=36, DIRECTOR) |
| `PATCH /tramites/:id/finalizar` | Solo Claudina (unidad_id=35, OPERATIVO) |
| `POST /tramites/:id/comentarios` | Creador + Revisor + Finalizador |
| `GET /tramites/:id/comentarios` | Mismos que pueden ver el trámite |

### Lógica de visibilidad en `listarTramites`
```typescript
// Delegado (DIRECTOR de DELEGACION) → sus trámites
// Operativo de DELEGACION → trámites de su unidad
// Oscar Gopar (unidad_id=36) → todos
// Claudina (unidad_id=35) → solo EN_PROCESO
// Mariann (DIRECCION_GENERAL) → todos
```

### Generación de folio
```typescript
// TRM-{unidad_id}-{año}-{secuencia 4 dígitos}
// Ejemplo: TRM-42-2026-0001
const anio = new Date().getFullYear();
const [{ seq }] = await db('tramites')
  .where('unidad_creadora_id', user.oficina_id)
  .whereRaw('EXTRACT(YEAR FROM fecha_creacion) = ?', [anio])
  .count('id as seq');
const folio = `TRM-${user.oficina_id}-${anio}-${String(Number(seq)+1).padStart(4,'0')}`;
```

---

## 3. Frontend

### Componente: `src/frontend/views/Dashboard_Tramites.tsx`

Vista única con secciones según el rol del usuario autenticado:

#### Vista Delegado / Operativo de delegación
- Lista de sus trámites con estado y folio
- Botón "Nuevo Trámite" → modal con formulario
- Formulario: título, descripción, tipo (select), adjuntos opcionales
- Ver detalle de trámite con historial y comentarios

#### Vista Revisor (Oscar Gopar, unidad_id=36)
- Lista de todos los trámites
- Filtros por estatus
- Detalle: botones "Aprobar" (con fecha compromiso) y "Rechazar" (con comentario)
- Panel de comentarios con formulario de escritura

#### Vista Finalizador (Claudina, unidad_id=35)
- Lista de trámites EN_PROCESO
- Detalle: botón "Finalizar" con comentario de cierre obligatorio

#### Vista Supervisora (Mariann, DIRECCION_GENERAL)
- Lista de todos los trámites (solo lectura)
- Filtros por estatus, delegación, tipo
- Ver detalle con historial completo

### Detección de rol en el frontend
```typescript
// En Dashboard_Tramites.tsx
const userStr = localStorage.getItem('user');
const user = JSON.parse(userStr);

// Revisor: DIRECTOR con unidad_id=36 (Dirección Jurídica)
const esRevisor = user.rol === 'DIRECTOR' && user.oficina_id === 36;

// Finalizador: OPERATIVO con unidad_id=35 (TICS)
const esFinalizador = user.rol === 'OPERATIVO' && user.oficina_id === 35;

// Supervisora: DIRECTOR de DIRECCION_GENERAL
// (se detecta consultando /usuarios/:id para obtener unidad_tipo)

// Delegado/Creador: DIRECTOR o OPERATIVO de DELEGACION
```

### Tipos de trámite (catálogo fijo)
```typescript
const TIPOS_TRAMITE = [
  'Convenio', 'Contrato', 'Consulta Jurídica',
  'Acuerdo', 'Resolución', 'Otro'
];
```

### Badges de estatus
```typescript
const ESTATUS_CFG = {
  NUEVO:        { bg: '#DBEAFE', text: '#1E40AF', label: 'Nuevo' },
  EN_REVISION:  { bg: '#FEF3C7', text: '#92400E', label: 'En Revisión' },
  EN_PROCESO:   { bg: '#D1FAE5', text: '#065F46', label: 'En Proceso' },
  FINALIZADO:   { bg: '#F3F4F6', text: '#374151', label: 'Finalizado' },
  RECHAZADO:    { bg: '#FEE2E2', text: '#991B1B', label: 'Rechazado' },
};
```

---

## 4. Module Registry

```typescript
// En src/modules/tramites/tramites.registry.ts
import { moduleRegistry } from '../module-registry/module.registry';
import { db } from '../../db';

export function registerTramitesSeguimiento(): void {
  moduleRegistry.register('tramites_seguimiento', async () => {
    const [activos]   = await db('tramites').whereIn('estatus', ['NUEVO','EN_REVISION','EN_PROCESO']).count('id as n');
    const [pendientes] = await db('tramites').where('estatus', 'NUEVO').count('id as n');
    const [alertas]   = await db('tramites').where('estatus', 'EN_PROCESO').andWhereRaw('fecha_compromiso < CURRENT_DATE').count('id as n');
    return {
      activos:    Number(activos.n),
      pendientes: Number(pendientes.n),
      alertas:    Number(alertas.n),
    };
  });
}
```

---

## 5. Notificaciones

Nuevos tipos de evento en `notification.types.ts`:
```typescript
| 'TRAMITE_NUEVO'
| 'TRAMITE_APROBADO'
| 'TRAMITE_RECHAZADO'
| 'TRAMITE_FINALIZADO'
```

Función helper en `notification.dispatcher.ts`:
```typescript
export async function notifyTramite(payload: {
  recipient_id: number;
  event: NotificationEventType;
  title: string;
  body: string;
  tramite_id: number;
  folio: string;
}): Promise<void>
```

---

## 6. Script SQL de inicialización

Archivo: `infra/postgres/init/06_tramites_seguimiento.sql`

Contiene (todo idempotente con IF NOT EXISTS):
1. Enum `estatus_tramite`
2. Tabla `tramites` con índices
3. Tabla `tramite_documentos`
4. Tabla `comentarios_tramite`
5. Tabla `auditoria_tramites`
6. INSERT del módulo en `modulos`
7. Asignación del módulo a usuarios relevantes

---

## 7. Registro en server.ts

```typescript
import { registerTramitesSeguimiento } from './modules/tramites/tramites.registry';
// ...
registerTramitesSeguimiento();
```

Y montar el router:
```typescript
import tramitesRouter from './modules/tramites/tramites.routes';
app.use('/api/v1/tramites', tramitesRouter);
```
