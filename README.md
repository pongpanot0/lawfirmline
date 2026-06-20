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
| **Admin / Managing Partner** | All cases, master calendar, firm overview |
| **Lawyer** | Cases where they are Lead Lawyer or Co-Counsel |
| **Clerk / Junior** | Cases/tasks assigned to them |

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
| Lawyer | lawyer1@lawfirm.com, lawyer2@lawfirm.com |
| Clerk | clerk1@lawfirm.com, clerk2@lawfirm.com |

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
# lawfirmline
