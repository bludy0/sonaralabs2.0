FROM node:20-alpine AS base

# ── DEPS ─────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app/services/upload
COPY services/upload/package*.json ./
RUN npm install --omit=dev && cp -r node_modules /prod_modules
RUN npm install

# ── BUILD ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY services/upload/tsconfig.json ./
COPY services/upload/src ./src
COPY shared /app/shared
RUN npm run build

# ── PRODUCTION ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/services/upload/dist ./dist
COPY --from=build /prod_modules ./node_modules
COPY services/upload/package*.json ./
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "dist/services/upload/src/index.js"]
