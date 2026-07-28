# Law Firm Management System — MVP

A monorepo law firm practice management application with role-based access control.

## Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend:** NestJS 11, TypeScript, JWT Auth
- **Database:** PostgreSQL 16, Prisma ORM

## Project Structure

```
lawfirm/
├── apps/
│   ├── api/          # NestJS REST API (port 3001)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   └── shared/       # Shared enums & types
└── docker-compose.yml
```

## Roles & Access Control

| Role | Access |
|------|--------|
| **Admin / Firm Owner** | All cases, master calendar, firm overview |
| **Lawyer** | Cases where they are Case Owner or Buddy |

### Case staffing (buddy model)

| On the case | Meaning |
|-------------|---------|
| **Case Owner** | Exactly one lawyer accountable for the case |
| **Buddy** | Zero or more peer lawyers helping on the case |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`corepack enable`)
- Docker (for PostgreSQL)

### 1. Start Database

```bash
docker compose up -d
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Setup Database

```bash
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed
```

### 4. Start Development Servers

```bash
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:3001

## Demo Accounts

All accounts use password: `password123`

| Role | Email |
|------|-------|
| Admin | admin@lawfirm.com |
| Lawyer | lawyer1@lawfirm.com … lawyer4@lawfirm.com |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Current user |
| GET | `/dashboard/stats` | Role-filtered dashboard |
| GET/POST | `/cases` | List/create cases |
| GET/PATCH | `/cases/:id` | Case detail/update |
| GET/POST | `/cases/:caseId/tasks` | Task CRUD |
| GET/POST | `/cases/:caseId/documents` | Document upload |
| GET/POST | `/calendar/events` | Calendar events |
| GET/POST | `/cases/:caseId/billing/*` | Time entries & invoices |
| GET/POST | `/users` | User management (Admin) |

## Environment Variables

**apps/api/.env**
```
DATABASE_URL=postgresql://lawfirm:lawfirm@localhost:5433/lawfirm
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
UPLOAD_DIR=./uploads
PORT=3001
```

**apps/web/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Deploy on Railway

Monorepo deploys as **3 services**: PostgreSQL + API + Web.

### 1. Create Railway project

1. Push this repo to GitHub and create a new [Railway](https://railway.app) project from the repo.
2. Add a **PostgreSQL** plugin to the project.

### 2. API service

1. Add a service from the same repo (or duplicate).
2. **Settings → Config file path:** `railway.api.toml`
3. **Variables** (see `railway.env.example`):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | long random string |
| `JWT_REFRESH_SECRET` | long random string |
| `CORS_ORIGIN` | `https://<web-service>.up.railway.app` |
| `UPLOAD_DIR` | `./uploads` |

4. Deploy — runs `prisma migrate deploy` on start, health check at `/health`.

### 3. Web service

1. Add another service from the repo.
2. **Settings → Config file path:** `railway.web.toml`
3. **Variables** (set **before** first build):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<api-service>.up.railway.app` |

4. Redeploy web after API URL is known.

### 4. Seed demo data (optional, once)

Railway shell on the **API** service:

```bash
pnpm db:seed
```

Demo login: `admin@lawfirm.com` / `password123`

### Notes

- Uploads use ephemeral disk on Railway — use a volume or S3 for production file storage.
- LINE webhook URL: `https://<api-service>.up.railway.app/line/webhook`

## Deploy on your own VPS (Docker)

Runs the same 3 pieces (Postgres + API + Web) as containers on one server, behind a [Caddy](https://caddyserver.com/) reverse proxy that issues HTTPS certificates automatically. Uploaded files land on the VPS's own persistent disk (not ephemeral like Railway), so no S3/volume setup is required to get started.

### 1. Point DNS at the server

Before starting Caddy, create A records for both `yourdomain.com` and `api.yourdomain.com` pointing at the VPS's IP — Caddy needs these to resolve in order to issue certificates.

### 2. Configure

```bash
cp .env.production.example .env
# fill in DOMAIN, POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_PORTAL_JWT_SECRET
# (openssl rand -hex 32 for each secret)
```

### 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First boot runs `prisma migrate deploy` automatically before the API starts. To seed demo data once:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm prisma db seed
```

### 4. Redeploying after a code change

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Notes

- Postgres data, uploaded files, and Caddy's TLS certificates all live in named Docker volumes (`postgres_data`, `uploads`, `caddy_data`) — they survive `docker compose down` and rebuilds. Only `docker compose down -v` deletes them.
- `CLIENT_PORTAL_EXPOSE_DEV_TOKEN` is hardcoded to `false` in `docker-compose.prod.yml` — the client-portal magic-link token is never exposed in API responses in this setup; login is via the actual emailed link (requires `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` to be set, or the link has to be pulled from server logs during initial testing).
- Back up the `postgres_data` volume regularly (e.g. `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U lawfirm lawfirm > backup.sql`) — a VPS has no automatic snapshot unless the provider offers one separately.
