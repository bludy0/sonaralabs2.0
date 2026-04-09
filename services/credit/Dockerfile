FROM node:20-alpine AS base

# ── DEPS ─────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app/services/credit
COPY services/credit/package*.json ./
RUN npm install --omit=dev && cp -r node_modules /prod_modules
RUN npm install

# ── BUILD ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY services/credit/tsconfig.json ./
COPY services/credit/src ./src
COPY shared /app/shared
RUN npm run build

# ── PRODUCTION ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/services/credit/dist ./dist
COPY --from=build /prod_modules ./node_modules
COPY services/credit/package*.json ./
EXPOSE 3005
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3005/health || exit 1
CMD ["node", "dist/services/credit/src/index.js"]
