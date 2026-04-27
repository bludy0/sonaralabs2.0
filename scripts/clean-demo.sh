#!/usr/bin/env bash
# scripts/clean-demo.sh
# Demo verisini iz bırakmadan siler.
# Kullanım: pnpm demo:clean

set -e

echo ""
echo "🗑️   Demo temizliği başlıyor..."
echo ""

# ── MongoDB — demo user ID'lerini al ─────────────────────────────────────────
DEMO_COUNT=$(docker exec sonaralabs20-mongo-1 mongosh \
  "mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin" \
  --quiet --eval 'print(db.users.countDocuments({ _demo: true }))' 2>/dev/null | tail -1)

if [ "$DEMO_COUNT" = "0" ] || [ -z "$DEMO_COUNT" ]; then
  echo "ℹ️   Silinecek demo verisi bulunamadı — uygulama zaten temiz."
  exit 0
fi

echo "📦  MongoDB: $DEMO_COUNT demo kullanıcı bulundu, siliniyor..."

# PostgreSQL için user ID'lerini önceden al
DEMO_IDS=$(docker exec sonaralabs20-mongo-1 mongosh \
  "mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin" \
  --quiet --eval '
const users = db.users.find({ _demo: true }, { _id: 1 }).toArray();
print(users.map(u => u._id.toString()).join(","));
' 2>/dev/null | tail -1)

echo "   Demo user ID'leri: $DEMO_IDS"

# ── MongoDB Cleanup ───────────────────────────────────────────────────────────
docker exec sonaralabs20-mongo-1 mongosh \
  "mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin" \
  --quiet \
  --eval '
const demoUsers = db.users.find({ _demo: true }, { _id: 1 }).toArray();
const ids = demoUsers.map(u => u._id);

const steps = [
  { col: "users",          filter: { _demo: true } },
  { col: "generations",    filter: { _demo: true } },
  { col: "uploads",        filter: { _demo: true } },
  { col: "credit_logs",    filter: { _demo: true } },
  { col: "collections",    filter: { _demo: true } },
  { col: "daw_projects",   filter: { _demo: true } },
  { col: "refresh_tokens", filter: { userId: { $in: ids } } },
];

steps.forEach(function(s) {
  const r = db[s.col].deleteMany(s.filter);
  if (r.deletedCount > 0) print("   ✓ " + s.col + ": " + r.deletedCount + " belge silindi");
});
print("   MongoDB temizlendi.");
'

echo ""
echo "🐘  PostgreSQL: demo verisi siliniyor..."

# ID listesini PostgreSQL ANY array formatına çevir
# "id1,id2,id3" → '{id1,id2,id3}'
PG_IDS_ARRAY="{$(echo $DEMO_IDS)}"

docker exec -i sonaralabs20-postgres-1 psql \
  -U sonaralabs -d sonaralabs <<PGSQL

DO \$\$
DECLARE
  ids text[] := '${PG_IDS_ARRAY}'::text[];
  cnt int;
BEGIN
  -- feed_events
  DELETE FROM feed_events WHERE actor_id = ANY(ids);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ feed_events: % satır silindi', cnt; END IF;

  -- track_likes — demo kullanıcıların beğenileri
  DELETE FROM track_likes WHERE user_id = ANY(ids);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ track_likes (kullanıcı): % satır silindi', cnt; END IF;

  -- track_likes — demo kullanıcıların track'lerine ait beğeniler
  DELETE FROM track_likes
  WHERE track_id IN (SELECT id FROM public_tracks WHERE user_id = ANY(ids));
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ track_likes (track FK): % satır silindi', cnt; END IF;

  -- follows
  DELETE FROM follows WHERE follower_id = ANY(ids) OR followee_id = ANY(ids);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ follows: % satır silindi', cnt; END IF;

  -- public_tracks
  DELETE FROM public_tracks WHERE user_id = ANY(ids);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ public_tracks: % satır silindi', cnt; END IF;

  -- user_profiles
  DELETE FROM user_profiles WHERE user_id = ANY(ids);
  GET DIAGNOSTICS cnt = ROW_COUNT;
  IF cnt > 0 THEN RAISE NOTICE '   ✓ user_profiles: % satır silindi', cnt; END IF;

  RAISE NOTICE '   PostgreSQL temizlendi.';
END;
\$\$;
PGSQL

echo ""
echo "✅  Demo verisi tamamen temizlendi. Hiçbir iz kalmadı."
echo ""
