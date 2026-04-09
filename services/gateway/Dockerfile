FROM node:20-alpine AS base

# ── DEPS ─────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app/services/gateway
COPY services/gateway/package*.json ./
RUN npm install --omit=dev && cp -r node_modules /prod_modules
RUN npm install

# ── BUILD ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY services/gateway/tsconfig.json ./
COPY services/gateway/src ./src
COPY shared /app/shared
RUN npm run build

# ── PRODUCTION ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/services/gateway/dist ./dist
COPY --from=build /prod_modules ./node_modules
COPY services/gateway/package*.json ./
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/services/gateway/src/index.js"]
