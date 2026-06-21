#!/usr/bin/env bash
#
# Sonaralabs lokal geliştirme başlatıcısı.
# Tek komutla: altyapıyı (MongoDB/Redis/MinIO) ayağa kaldırır, bağımlılıkları
# kurar, tüm servisleri + frontend'i çalıştırır ve hazır olunca tarayıcıyı açar.
#
# Kullanım:   ./scripts/dev.sh        (veya: pnpm start)
# Durdurma:   Ctrl+C  (servisleri durdurur; MinIO arka planda kalır → scripts/stop.sh)
#
set -euo pipefail
cd "$(dirname "$0")/.."   # repo kökü

log()  { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }

port_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# ── 1) MongoDB (host-native brew) ──────────────────────────────────────────────
if port_up 27017; then ok "MongoDB çalışıyor (:27017)"
else
  log "MongoDB başlatılıyor (brew)…"
  brew services start mongodb-community >/dev/null && ok "MongoDB başlatıldı"
fi

# ── 2) Redis (host-native brew) ────────────────────────────────────────────────
if port_up 6379; then ok "Redis çalışıyor (:6379)"
else
  log "Redis başlatılıyor (brew)…"
  brew services start redis >/dev/null && ok "Redis başlatıldı"
fi

# ── 3) MinIO (yükleme/avatar için; yoksa gerisi yine çalışır) ──────────────────
if port_up 9000; then ok "MinIO çalışıyor (:9000)"
elif command -v minio >/dev/null 2>&1; then
  log "MinIO başlatılıyor (:9000, konsol :9001)…"
  MINIO_DATA="${MINIO_DATA_DIR:-$HOME/.sonaralabs/minio}"
  mkdir -p "$MINIO_DATA"
  MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}" \
  MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-sonaralabs_dev}" \
    nohup minio server "$MINIO_DATA" --address ":9000" --console-address ":9001" \
    >/tmp/sonaralabs-minio.log 2>&1 &
  echo $! > /tmp/sonaralabs-minio.pid
  disown || true
  for _ in $(seq 1 15); do port_up 9000 && break; sleep 1; done
  port_up 9000 && ok "MinIO başlatıldı (log: /tmp/sonaralabs-minio.log)" \
               || warn "MinIO başlamadı — yükleme özellikleri çalışmayabilir (log: /tmp/sonaralabs-minio.log)"
else
  warn "minio bulunamadı — yükleme/avatar çalışmayabilir (kurulum: brew install minio)"
fi

# ── 4) Bağımlılıklar ───────────────────────────────────────────────────────────
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules ]; then
  log "Bağımlılıklar kuruluyor (pnpm install)…"
  pnpm install
fi

# ── 5) Hazır olunca tarayıcıyı aç ──────────────────────────────────────────────
URL="${SITE_URL:-http://localhost:5174}"
(
  for _ in $(seq 1 60); do
    curl -fsS "$URL" >/dev/null 2>&1 && break
    sleep 1
  done
  ok "Site hazır → $URL"
  command -v open >/dev/null 2>&1 && open "$URL" || true
) &

# ── 6) Tüm servisler + frontend (önplan; Ctrl+C ile durur) ─────────────────────
# --concurrency: frontend dahil 10+ kalıcı (persistent) dev görevi turbo'nun
# varsayılan 10 limitini aşar → en az görev sayısı kadar concurrency gerekir.
log "Tüm servisler + frontend başlatılıyor (turbo dev) — durdurmak için Ctrl+C"
exec pnpm exec turbo dev --concurrency=15
