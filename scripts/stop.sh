#!/usr/bin/env bash
#
# Sonaralabs lokal geliştirme durdurucusu.
# dev.sh'in başlattığı süreçleri kapatır (turbo/tsx servisleri + MinIO).
# MongoDB/Redis brew servisleridir; isteğe bağlı --infra ile onlar da durur.
#
# Kullanım:   ./scripts/stop.sh           (servisler + MinIO)
#             ./scripts/stop.sh --infra   (ayrıca brew mongod + redis)
#
set -uo pipefail
cd "$(dirname "$0")/.."

ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
log()  { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }

# turbo dev + tsx watch servisleri (bu repo yolundakiler)
log "Servisler durduruluyor (turbo/tsx)…"
pkill -f "turbo.*dev" 2>/dev/null || true
pkill -f "sonaralabs2.0/services/.*tsx" 2>/dev/null || true
pkill -f "sonaralabs2.0/node_modules/.pnpm/tsx" 2>/dev/null || true
ok "Servisler durduruldu"

# MinIO (dev.sh tarafından başlatıldıysa)
if [ -f /tmp/sonaralabs-minio.pid ]; then
  kill "$(cat /tmp/sonaralabs-minio.pid)" 2>/dev/null && ok "MinIO durduruldu" || true
  rm -f /tmp/sonaralabs-minio.pid
fi

# İsteğe bağlı: brew altyapısı
if [ "${1:-}" = "--infra" ]; then
  log "Altyapı durduruluyor (brew mongod + redis)…"
  brew services stop mongodb-community >/dev/null 2>&1 || true
  brew services stop redis >/dev/null 2>&1 || true
  ok "Altyapı durduruldu"
fi
