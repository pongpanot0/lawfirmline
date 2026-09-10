# Production image for the Next.js web app (apps/web).
# Build from the monorepo root: `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com .`
#
# NEXT_PUBLIC_API_URL is baked into the client bundle at build time — it must
# be passed as a build arg, not a runtime env var.

FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @lawfirm/shared build
RUN pnpm --filter web build

# next.config.js has output: 'standalone' — .next/standalone contains a
# self-contained server plus only the node_modules it actually traced,
# mirroring the monorepo path (apps/web/server.js).
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
