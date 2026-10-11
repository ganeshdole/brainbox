# One build stage for the whole monorepo, three runtime targets:
#   api     - the Hono backend (node dist/index.js)
#   migrate - one-shot `drizzle-kit migrate` (needs devDeps, so it reuses build)
#   web     - Caddy serving dashboard + widget.js + marketing, proxying the API
# Built and wired together by compose.yaml at the repo root.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# Fetch against the lockfile alone so the dependency layer survives source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
# Unset by default so the committed .env.production files and built-in
# defaults apply; compose.yaml passes them through to point the frontends at
# another host.
ARG VITE_API_URL
ARG VITE_API_BASE_URL
ARG VITE_DASHBOARD_URL
ARG VITE_DEMO_WIDGET_SRC
ARG VITE_DEMO_ENDPOINT
ARG VITE_DEMO_PROJECT_KEY
RUN pnpm -r build
# Production-only node_modules for the API. dist is gitignored, so pnpm deploy
# would skip it - it is copied from the build output separately below.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter @brainbox/backend --prod --legacy /out

FROM build AS migrate
WORKDIR /app/backend
CMD ["pnpm", "db:migrate"]

FROM node:22-slim AS api
ENV NODE_ENV=production
ENV PORT=8787
WORKDIR /app/backend
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
# The bundled LocalStorage resolves dist/../../.storage, i.e. /app/.storage.
RUN mkdir -p /app/.storage && chown node:node /app/.storage
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dashboard/dist /srv/app
COPY --from=build /app/widget/dist/widget.js /srv/app/widget.js
COPY --from=build /app/marketing/dist /srv/www
