---
name: project-overview
description: Descripción general del proyecto ODG — stack, módulos, arquitectura y propósito
metadata:
  type: project
---

Sistema de gestión de oficios para la Oficialía de Partes de una institución gubernamental (PRISMA).

**Why:** Manejo digital del flujo de oficios entrantes: registro, asignación jurídica, contestación, VoBo y cierre. También incluye módulos de eventos/tareas y trámites.

**How to apply:** Toda sugerencia de features o cambios debe respetar los roles y flujos de negocio ya establecidos.

## Stack técnico
- **Backend:** Node.js + Express + TypeScript, Knex ORM, PostgreSQL 15
- **Frontend:** React + TypeScript + Vite (en `src/frontend/`, compartido; también `frontend/` con solo `main.tsx`)
- **Infraestructura:** Docker Compose (prod: Nginx, API, Worker, PostgreSQL, Redis, Certbot, DB Backup), Kubernetes manifests en `infra/k8s/`
- **Testing:** Vitest (unit + integration), fast-check para property-based testing
- **Notificaciones:** WebSocket (ws) + canal email + canal in-app; scheduler `node-cron` en proceso Worker separado
- **OCR:** Tesseract.js (local) / Google Vision (producción), pluggable via `ocr.engine.ts`
- **AI Extract:** `ai-extract.service.ts` (extracción de datos de documentos)

## Módulos backend (`src/modules/`)
| Módulo | Descripción |
|---|---|
| `oficialia_partes` | Núcleo: CRUD oficios, asignación jurídica, gestión de contestación, auditoría de estados |
| `director` | Panel de supervisión del Director General; usa `ModuleRegistry` singleton |
| `admin` | Administración de módulos y usuarios del sistema |
| `usuarios` | CRUD de usuarios |
| `eventos` | Eventos con tareas asignables, historial de avances |
| `tramites` | Seguimiento de trámites con flujo de aprobación |
| `notificaciones` | Notificaciones in-app |
| `files` | Upload de PDFs (multer) |

## Roles (`RolUsuario`)
`OFICIAL` | `ENCARGADO` | `JURIDICO` | `SECRETARIA` | `DIRECTOR` | `OPERATIVO` | `SUPERADMIN` | `PARTICULAR`

## Estatus de un oficio (`EstatusOficio`)
`RECIBIDO` → `ASIGNADO` → `EN_REVISION` → `EN_RECONSIDERACION` → `VOBO_APROBADO` → `FINALIZADO`

## Estructura de rutas frontend
- `/login` — Login
- `/seleccionar-modulo` — Selector de módulos post-login
- `/dashboard/oficial` — Dashboard Oficial
- `/dashboard/gestion` — Dashboard Gestión/Secretaría
- `/dashboard/juridico` — Dashboard Jurídico
- `/dashboard/director` — Dashboard Director General
- `/dashboard/superadmin` — Dashboard SuperAdmin
- `/dashboard/director-area` — Dashboard Director de Área
- `/dashboard/tramites` — Dashboard Trámites

## Patrones clave
- `ModuleRegistry` singleton: cada módulo registra su función de métricas al arrancar; el endpoint de supervisión llama `computeAll()` sin tocar el frontend.
- Auth via JWT (bcrypt + timing-safe compare); token incluye `id, nombre, email, rol, oficina_id, unidad_id`.
- Worker separado para cron de vencimientos (SIGTERM/SIGINT manejados).
- OCR procesado en background (fire-and-forget) tras guardar el oficio.
