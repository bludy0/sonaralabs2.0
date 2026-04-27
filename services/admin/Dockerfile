FROM node:20-alpine AS base
RUN npm install -g pnpm@10

# ── INSTALL ───────────────────────────────────────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/types/package.json ./packages/types/
COPY services/admin/package.json ./services/admin/
RUN pnpm install --frozen-lockfile --shamefully-hoist

# ── BUILD ─────────────────────────────────────────────────────────────────────
FROM installer AS builder
COPY packages/types/src ./packages/types/src
COPY packages/types/tsconfig.json ./packages/types/tsconfig.json
WORKDIR /app/packages/types
RUN pnpm run build
WORKDIR /app

COPY services/admin/src ./services/admin/src
COPY services/admin/tsconfig.json ./services/admin/tsconfig.json
WORKDIR /app/services/admin
RUN pnpm run build

# ── PRODUCTION ────────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/services/admin/dist ./dist
COPY --from=installer /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=installer /app/packages/types/package.json ./packages/types/package.json
COPY services/admin/package.json ./
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node", "dist/index.js"]
