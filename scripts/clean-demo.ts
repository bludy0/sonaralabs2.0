/**
 * scripts/clean-demo.ts
 *
 * Demo verisini iz bırakmadan siler.
 * MongoDB: _demo:true olan tüm belgeler
 * PostgreSQL: demo user_id'leriyle ilişkili tüm satırlar
 *
 * Kullanım: pnpm demo:clean
 */

import mongoose, { Types } from "mongoose";
import { Client } from "pg";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://sonaralabs:sonaralabs_dev@localhost:5432/sonaralabs";

async function main() {
  console.log("🗑️   Demo temizliği başlıyor...\n");

  // ── MongoDB ─────────────────────────────────────────────────────────────
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  // Önce demo user ID'lerini topla (PG temizliğinde kullanacağız)
  const demoUsers = await db
    .collection("users")
    .find({ _demo: true }, { projection: { _id: 1 } })
    .toArray();

  const demoIds: Types.ObjectId[] = demoUsers.map((u) => u._id as Types.ObjectId);
  const demoIdStrings = demoIds.map((id) => id.toString());

  console.log(`📦  MongoDB: ${demoIds.length} demo kullanıcı bulundu`);

  if (demoIds.length > 0) {
    const mongoSteps = [
      { name: "users",          filter: { _demo: true } },
      { name: "generations",    filter: { _demo: true } },
      { name: "uploads",        filter: { _demo: true } },
      { name: "credit_logs",    filter: { _demo: true } },
      { name: "collections",    filter: { _demo: true } },
      { name: "daw_projects",   filter: { _demo: true } },
      { name: "refresh_tokens", filter: { userId: { $in: demoIds } } },
    ];

    for (const step of mongoSteps) {
      const result = await db.collection(step.name).deleteMany(step.filter as any);
      if (result.deletedCount > 0) {
        console.log(`   ✓ ${step.name}: ${result.deletedCount} belge silindi`);
      }
    }
  } else {
    console.log("   ℹ️  Silinecek demo verisi yok (MongoDB zaten temiz).");
  }

  await mongoose.disconnect();
  console.log("   MongoDB bağlantısı kapatıldı.\n");

  // ── PostgreSQL ───────────────────────────────────────────────────────────
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log("🐘  PostgreSQL: demo verisi temizleniyor...");

  if (demoIdStrings.length === 0) {
    console.log("   ℹ️  Silinecek demo verisi yok (PostgreSQL zaten temiz).");
  } else {
    // ANY($1::text[]) ile tek parametre olarak dizi gönderiyoruz — placeholder karmaşası yok
    const ids = demoIdStrings; // string[]

    // Sıra önemli: FK bağımlılıkları önce siliniyor
    const steps: Array<{ label: string; sql: string; params: unknown[] }> = [
      // feed_events: demo kullanıcıların actör olduğu eventler
      {
        label: "feed_events",
        sql:   "DELETE FROM feed_events WHERE actor_id = ANY($1::text[])",
        params: [ids],
      },
      // track_likes — demo kullanıcıların koyduğu beğeniler
      {
        label: "track_likes (beğeniler)",
        sql:   "DELETE FROM track_likes WHERE user_id = ANY($1::text[])",
        params: [ids],
      },
      // track_likes — demo kullanıcıların track'lerine ait beğeniler (FK)
      {
        label: "track_likes (track FK)",
        sql:   `DELETE FROM track_likes
                WHERE track_id IN (
                  SELECT id FROM public_tracks WHERE user_id = ANY($1::text[])
                )`,
        params: [ids],
      },
      // follows — hem takip eden hem takip edilen
      {
        label: "follows",
        sql:   `DELETE FROM follows
                WHERE follower_id = ANY($1::text[])
                   OR followee_id = ANY($1::text[])`,
        params: [ids],
      },
      // public_tracks
      {
        label: "public_tracks",
        sql:   "DELETE FROM public_tracks WHERE user_id = ANY($1::text[])",
        params: [ids],
      },
      // user_profiles
      {
        label: "user_profiles",
        sql:   "DELETE FROM user_profiles WHERE user_id = ANY($1::text[])",
        params: [ids],
      },
    ];

    for (const step of steps) {
      const result = await pg.query(step.sql, step.params);
      if ((result.rowCount ?? 0) > 0) {
        console.log(`   ✓ ${step.label}: ${result.rowCount} satır silindi`);
      }
    }
  }

  await pg.end();
  console.log("   PostgreSQL bağlantısı kapatıldı.\n");

  if (demoIds.length === 0 && demoIdStrings.length === 0) {
    console.log("ℹ️  Temizlenecek demo verisi bulunamadı — uygulama zaten temiz.");
  } else {
    console.log("✅  Demo verisi tamamen temizlendi. Hiçbir iz kalmadı.");
  }
}

main().catch((err) => {
  console.error("❌  Temizleme hatası:", err);
  process.exit(1);
});
