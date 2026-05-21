#!/usr/bin/env bash
# backup-mongodb.sh — MongoDB Atlas'tan yerel dump + S3/B2'ye yükle
# Kullanım: MONGO_URI="mongodb+srv://..." ./scripts/backup-mongodb.sh
# Cron örneği (her gece 02:00): 0 2 * * * /app/scripts/backup-mongodb.sh >> /var/log/sonaralabs-backup.log 2>&1

set -euo pipefail

: "${MONGO_URI:?MONGO_URI env var gerekli}"

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_DIR="/tmp/sonaralabs-backup-${TIMESTAMP}"
ARCHIVE="${BACKUP_DIR}.tar.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"; }

log "Backup başlıyor: ${TIMESTAMP}"

# 1. mongodump
mongodump \
  --uri="${MONGO_URI}" \
  --out="${BACKUP_DIR}" \
  --gzip

# 2. Arşivle
tar -czf "${ARCHIVE}" -C "$(dirname "${BACKUP_DIR}")" "$(basename "${BACKUP_DIR}")"
rm -rf "${BACKUP_DIR}"

ARCHIVE_SIZE=$(du -sh "${ARCHIVE}" | cut -f1)
log "Dump tamamlandı: ${ARCHIVE} (${ARCHIVE_SIZE})"

# 3. Uzak depolama — B2 (rclone) veya AWS S3
if command -v rclone &>/dev/null && [[ -n "${B2_BUCKET:-}" ]]; then
  log "Backblaze B2'ye yükleniyor: ${B2_BUCKET}"
  rclone copy "${ARCHIVE}" "b2:${B2_BUCKET}/mongodb-backups/"
  log "B2 yükleme tamamlandı"
elif command -v aws &>/dev/null && [[ -n "${S3_BUCKET:-}" ]]; then
  log "S3'e yükleniyor: ${S3_BUCKET}"
  aws s3 cp "${ARCHIVE}" "s3://${S3_BUCKET}/mongodb-backups/"
  log "S3 yükleme tamamlandı"
else
  log "UYARI: rclone/aws bulunamadı veya bucket tanımlı değil. Backup sadece local: ${ARCHIVE}"
fi

# 4. Yerel eski backup'ları temizle (>RETENTION_DAYS gün)
find /tmp -name "sonaralabs-backup-*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
log "Eski local backup'lar temizlendi (>${RETENTION_DAYS} gün)"

log "Backup tamamlandı: ${ARCHIVE}"
