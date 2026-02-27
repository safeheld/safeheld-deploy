# Safeheld — Deployment Package

Self-contained deployment package for the Safeheld safeguarding platform.
One `docker-compose up` command starts every service: **PostgreSQL 16**, **Redis 7**, **MinIO** (S3-compatible storage), the **Node.js API**, and the **React web UI** (served via Nginx).

---

## Contents

```
safeheld-deploy/
├── packages/
│   ├── api/              Node.js / Express / Prisma backend
│   └── web/              React + Vite frontend
├── nginx/
│   └── nginx.conf        Nginx SPA + API proxy config
├── docker-compose.yml    Full production stack
├── .env.example          Environment variable template
├── scripts/
│   ├── generate-secrets.sh   Generate cryptographically-secure secrets
│   └── healthcheck.sh        Verify all services are healthy
└── Makefile              Convenience shortcuts
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker | 24+ |
| Docker Compose v2 (`docker compose`) | 2.20+ |
| Git | any |
| (Optional) `gh` CLI | for GitHub Actions setup |

---

## Option A — DigitalOcean Droplet (recommended for full control)

### 1. Create the droplet

In the DigitalOcean control panel, create a **Basic** droplet:

- **Image**: Ubuntu 24.04 LTS
- **Size**: 4 GB RAM / 2 vCPUs minimum (8 GB recommended — Puppeteer/Chromium needs memory)
- **Region**: closest to your users
- **Authentication**: SSH key (recommended) or password
- **Enable**: Monitoring

### 2. Install Docker on the droplet

```bash
ssh root@YOUR_DROPLET_IP

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Verify
docker --version
docker compose version
```

### 3. Copy the code to the droplet

From your local machine:

```bash
git clone https://github.com/YOUR_ORG/safeheld-deploy.git
scp -r safeheld-deploy root@YOUR_DROPLET_IP:/opt/safeheld
```

Or on the droplet directly:

```bash
cd /opt
git clone https://github.com/YOUR_ORG/safeheld-deploy.git safeheld
cd safeheld
```

### 4. Configure environment variables

```bash
cd /opt/safeheld
cp .env.example .env
nano .env          # or: vim .env
```

**Fill in every `CHANGE_ME` value.** Generate secrets with:

```bash
bash scripts/generate-secrets.sh
```

Copy the output into `.env`.

Required fields:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong password for PostgreSQL |
| `MINIO_ROOT_PASSWORD` | Strong password for MinIO |
| `JWT_SECRET` | ≥ 32 random chars (use `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | ≥ 32 random chars (different from JWT_SECRET) |
| `MFA_ENCRYPTION_KEY` | Exactly 32 chars |
| `SESSION_SECRET` | ≥ 32 random chars |
| `ADMIN_EMAIL` | Email for the initial admin account |
| `ADMIN_PASSWORD` | Strong initial admin password |
| `FRONTEND_URL` | `http://YOUR_DROPLET_IP` (or your domain) |

### 5. Start everything

```bash
cd /opt/safeheld

# Build images and start all services in the background
docker compose up -d --build

# Watch logs (Ctrl-C to stop watching, services keep running)
docker compose logs -f
```

Docker starts services in the correct dependency order:
`postgres` → `redis` → `minio` → `minio-init` → `api` → `web`

### 6. First-time database setup

Wait ~60 s for the API health check to pass, then:

```bash
# Run Prisma migrations
docker compose exec api npm run migrate

# Seed the admin user
docker compose exec api npm run seed
```

### 7. Verify everything is working

```bash
bash scripts/healthcheck.sh YOUR_DROPLET_IP
```

Or manually:

```bash
# API health endpoint
curl http://YOUR_DROPLET_IP:3001/api/v1/health

# Web UI (should return HTML)
curl -I http://YOUR_DROPLET_IP
```

Open `http://YOUR_DROPLET_IP` in your browser and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`.

### 8. (Optional) Add a domain + TLS with Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# /etc/caddy/Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
yourdomain.com {
    reverse_proxy localhost:80
}
EOF

systemctl reload caddy
```

Update `FRONTEND_URL=https://yourdomain.com` in `.env`, then `docker compose up -d`.

---

## Option B — Render

Render does not natively run Docker Compose, so deploy each service individually using its managed offerings.

### 1. Create services in the Render dashboard

Go to [dashboard.render.com](https://dashboard.render.com) and create:

| Service type | Name | Config |
|---|---|---|
| PostgreSQL | `safeheld-db` | Plan: Starter+ |
| Redis | `safeheld-redis` | Plan: Starter |
| Web Service | `safeheld-api` | Docker, repo root, `packages/api/Dockerfile` |
| Web Service | `safeheld-web` | Docker, repo root, `packages/web/Dockerfile` |

### 2. Create the PostgreSQL database

1. **New → PostgreSQL**
2. Name: `safeheld-db`
3. After creation, copy the **Internal Database URL** — you'll use it as `DATABASE_URL`.

### 3. Create the Redis instance

1. **New → Redis**
2. Name: `safeheld-redis`
3. Copy the **Internal Redis URL**.

### 4. Deploy the API

1. **New → Web Service**
2. Connect your GitHub repo `safeheld-deploy`
3. Settings:
   - **Name**: `safeheld-api`
   - **Environment**: Docker
   - **Dockerfile path**: `packages/api/Dockerfile`
   - **Docker build context**: `.` (repo root)
   - **Instance type**: Standard (1 GB RAM minimum; 2 GB for Puppeteer)
4. Add all environment variables from `.env.example` under **Environment**:
   - `DATABASE_URL` → the Internal Database URL from step 2
   - `REDIS_URL` → the Internal Redis URL from step 3
   - `FILE_STORAGE_TYPE=s3`
   - All JWT/MFA/SESSION secrets
   - SMTP settings
   - For file storage either use AWS S3 credentials **or** deploy a separate MinIO instance

> **MinIO on Render**: Render does not offer a managed S3-compatible store. Use **AWS S3** (free tier available) or **Cloudflare R2** instead. Set `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REPORTS_BUCKET`, `S3_DOCUMENTS_BUCKET` accordingly, and remove `S3_FORCE_PATH_STYLE` (or set to `false`).

### 5. Deploy the Web UI

1. **New → Web Service**
2. Connect the same repo
3. Settings:
   - **Name**: `safeheld-web`
   - **Environment**: Docker
   - **Dockerfile path**: `packages/web/Dockerfile`
   - **Docker build context**: `.`
4. No additional environment variables needed (Nginx proxies `/api/` to the API).

> The Nginx config (`nginx/nginx.conf`) hard-codes the proxy target as `http://api:3001`.
> On Render, update the `proxy_pass` line to use the API's **Render internal URL**, e.g. `http://safeheld-api:3001`, or replace with the public URL: `https://safeheld-api.onrender.com`.

### 6. Run migrations

In the Render dashboard, open the **safeheld-api** service → **Shell**:

```bash
npm run migrate
npm run seed
```

---

## Option C — Railway

Railway supports Docker Compose-style multi-service deploys via its config file.

### 1. Install the Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Create a new project

```bash
cd safeheld-deploy
railway init          # creates a new Railway project
```

### 3. Add managed services

In the Railway dashboard for your project:

1. **Add Service → Database → PostgreSQL**
   Note the `DATABASE_URL` from the Variables tab.

2. **Add Service → Database → Redis**
   Note the `REDIS_URL` from the Variables tab.

3. For file storage, add a **MinIO** service via a custom Dockerfile, or use **AWS S3** / **Cloudflare R2** externally.

### 4. Create a `railway.json`

```bash
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "packages/api/Dockerfile"
  },
  "deploy": {
    "startCommand": "node packages/api/dist/index.js",
    "healthcheckPath": "/api/v1/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
EOF
```

### 5. Set environment variables

In the Railway dashboard → your service → **Variables**, add all variables from `.env.example`.
Use the `DATABASE_URL` and `REDIS_URL` that Railway auto-injects from the managed services.

### 6. Deploy

```bash
railway up
```

### 7. Deploy the web service

Create a second Railway service for the frontend:

```bash
railway service create safeheld-web
# Set Dockerfile path to packages/web/Dockerfile in dashboard
railway up
```

### 8. Run migrations

In the Railway dashboard → API service → **Deploy** → **Shell**:

```bash
npm run migrate
npm run seed
```

---

## Updating the application

```bash
# Pull latest code
git pull

# Rebuild and restart only changed containers
docker compose up -d --build

# Run any new migrations
docker compose exec api npm run migrate
```

---

## Useful commands

```bash
# View logs for a specific service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f postgres

# Restart a single service
docker compose restart api

# Open a shell in the API container
docker compose exec api sh

# Run database migrations manually
docker compose exec api npm run migrate

# Re-seed the admin user
docker compose exec api npm run seed

# Stop everything (preserves data volumes)
docker compose down

# Stop and DELETE all data (irreversible!)
docker compose down -v

# Check service status and health
docker compose ps
```

---

## Backup and restore PostgreSQL

```bash
# Backup
docker compose exec postgres pg_dump -U safeheld safeheld > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260101.sql | docker compose exec -T postgres psql -U safeheld safeheld
```

---

## Architecture overview

```
Browser
  │
  ▼
[Nginx :80]  ──── /api/* ────►  [API :3001]
  │                                │
  ▼                          ┌─────┴──────┐
[React SPA]             [PostgreSQL]   [Redis]
                              │
                          [MinIO :9000]
```

- **Nginx** serves the React SPA and proxies `/api/*` requests to the Express API.
- **API** uses **Prisma** to talk to PostgreSQL and **Bull** (via Redis) for async CSV processing.
- **MinIO** provides S3-compatible file storage for CSV uploads, PDF reports, and documents.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `POSTGRES_PASSWORD is required` on `docker compose up` | Copy `.env.example` to `.env` and fill in all `CHANGE_ME` values |
| API stuck in `starting` health check | Give it 60–90 s; Chromium/Puppeteer install takes time on first build |
| `Prisma Client not found` | Run `docker compose exec api npm run migrate` |
| Cannot log in | Run `docker compose exec api npm run seed` to create the admin user |
| Files not uploading | Check MinIO is healthy: `docker compose ps`; verify bucket init ran |
| Port 80 already in use | Stop the conflicting service or change the web port mapping in `docker-compose.yml` |

---

## Security checklist before going live

- [ ] All `CHANGE_ME` values replaced with strong, unique secrets
- [ ] `ADMIN_PASSWORD` changed after first login
- [ ] Droplet firewall: only ports 22, 80, 443 open to the internet
- [ ] Ports 3001, 5432, 6379, 9000, 9001 NOT exposed to the internet (already localhost-only in `docker-compose.yml`)
- [ ] TLS configured (Caddy or Nginx + Let's Encrypt)
- [ ] `FRONTEND_URL` set to your actual domain with `https://`
- [ ] Regular database backups scheduled (cron + `pg_dump`)
