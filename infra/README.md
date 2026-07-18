# Infraestructura — Oficialía de Partes

## Stack

| Componente | Tecnología | Puerto |
|---|---|---|
| Reverse Proxy / Static | Nginx 1.25 | 80, 443 |
| API | Node.js 20 | 3000 (interno) |
| Worker | Node.js 20 (Notificaciones) | — |
| Base de datos | PostgreSQL 15 | 5432 (interno) |
| Cache / Queue | Redis 7 | 6379 (interno) |
| Storage | Volumen local o S3 | — |
| SSL | Certbot / Let's Encrypt | — |

---

## Despliegue con Docker Compose

### 1. Configurar variables de entorno

```bash
cp infra/.env.example infra/.env
nano infra/.env   # Llenar todos los valores CHANGE_ME
```

### 2. Emitir certificado SSL (primera vez)

```bash
# Asegurarse de que el DNS apunte al servidor y el puerto 80 esté libre
chmod +x infra/scripts/init-ssl.sh
./infra/scripts/init-ssl.sh
```

### 3. Levantar todos los servicios

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 4. Verificar estado

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f app_api
```

### Actualizar (rolling deploy)

```bash
chmod +x infra/scripts/deploy.sh
./infra/scripts/deploy.sh
```

---

## Despliegue con Kubernetes

### Prerrequisitos

```bash
# nginx-ingress-controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
```

### Aplicar manifiestos

```bash
# Namespace primero
kubectl apply -f infra/k8s/namespace.yaml

# Secrets (llenar valores reales antes)
kubectl apply -f infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/configmap.yaml

# Infraestructura
kubectl apply -f infra/k8s/postgres.yaml
kubectl apply -f infra/k8s/redis.yaml

# Aplicación
kubectl apply -f infra/k8s/api.yaml
kubectl apply -f infra/k8s/worker.yaml
kubectl apply -f infra/k8s/web.yaml

# Ingress + TLS
kubectl apply -f infra/k8s/ingress.yaml
```

### Verificar

```bash
kubectl get pods -n oficialia-partes
kubectl get ingress -n oficialia-partes
kubectl logs -f deployment/app-api -n oficialia-partes
```

---

## Backup

- **Docker Compose**: El servicio `db_backup` ejecuta `backup.sh` diariamente a las 02:00.
- **Kubernetes**: El `CronJob` `db-backup` hace lo mismo de forma nativa.
- Los dumps se guardan en `/backups/db/YYYY-MM-DD_HH-MM-SS.sql.gz`.
- Si `BACKUP_S3_BUCKET` está configurado, se suben automáticamente a S3.
- Retención configurable con `BACKUP_RETENTION_DAYS` (default: 7 días).

### Restaurar un backup

```bash
# Docker Compose
docker compose -f infra/docker-compose.yml exec db_prod \
  psql -U $POSTGRES_USER -d $POSTGRES_DB \
  < /backups/db/2026-04-23_02-00-00.sql.gz

# O descomprimir primero
gunzip -c /backups/db/2026-04-23_02-00-00.sql.gz | \
  psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB
```

---

## Estructura de archivos

```
infra/
├── docker/
│   ├── Dockerfile.api        # Node.js API (multi-stage)
│   ├── Dockerfile.worker     # Notification worker
│   └── Dockerfile.web        # Next.js → Nginx
├── nginx/
│   ├── nginx.conf                # Configuración principal
│   ├── app.conf.template         # Virtual host + SSL + proxy rules (producción)
│   ├── app.dev.conf.template     # Virtual host HTTP (desarrollo local)
│   └── docker-entrypoint.sh     # Ejecuta envsubst antes de arrancar Nginx
├── postgres/
│   └── init/
│       ├── 01_extensions.sql
│       └── 02_schema.sql
├── k8s/
│   ├── namespace.yaml
│   ├── secrets.yaml
│   ├── configmap.yaml
│   ├── postgres.yaml         # StatefulSet + PVC
│   ├── redis.yaml
│   ├── api.yaml              # Deployment + HPA
│   ├── worker.yaml           # Deployment + CronJob backup
│   ├── web.yaml
│   └── ingress.yaml          # cert-manager + Let's Encrypt
├── scripts/
│   ├── backup.sh             # Daily pg_dump + S3 upload
│   ├── init-ssl.sh           # First-time certificate issuance
│   └── deploy.sh             # Zero-downtime rolling deploy
├── docker-compose.yml
├── .env.example
└── README.md
```
