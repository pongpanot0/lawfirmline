# Production image for the NestJS API (apps/api).
# Build from the monorepo root: `docker build -f apps/api/Dockerfile .`

FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

# Install deps first (better layer caching — only re-runs when lockfile/package.json change)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
# apps/api's postinstall runs `prisma generate`, which needs the schema present.
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @lawfirm/shared build
RUN pnpm --filter api build:prod

FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=builder /repo ./
WORKDIR /repo/apps/api

EXPOSE 3001
CMD ["pnpm", "start:prod"]
