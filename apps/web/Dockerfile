# ── BASE: pnpm in monorepo root ───────────────────────────────────────────────
FROM node:20-alpine AS base
RUN npm install -g pnpm@10
WORKDIR /app

# ── DEV ──────────────────────────────────────────────────────────────────────
FROM base AS dev
# Copy monorepo manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/daw-studio/package.json ./packages/daw-studio/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --shamefully-hoist
# Source copied at runtime via volume mount in docker-compose
WORKDIR /app/apps/web
EXPOSE 5174
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# ── BUILD ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile --shamefully-hoist
WORKDIR /app/apps/web
RUN pnpm build

# ── PRODUCTION ────────────────────────────────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
