/**
 * scripts/seed.ts
 * Çalıştırma: npx tsx scripts/seed.ts
 *
 * Yapar:
 *  1. aurabeat + auradaw eski DB'lerini drop eder
 *  2. sonaralabs DB'sindeki tüm collection'ları temizler
 *  3. Test kullanıcısı + Admin kullanıcısı oluşturur
 *  4. Kimlik bilgilerini scripts/seed-credentials.txt dosyasına yazar
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/sonaralabs";

// ── Kullanıcılar ──────────────────────────────────────────────────────────────
const SEED_USERS = [
  {
    email:         "test@sonaralabs.io",
    password:      "Test1234!",
    role:          "user" as const,
    creditBalance: 500,
    displayName:   "Test User",
  },
  {
    email:         "admin@sonaralabs.io",
    password:      "Admin1234!",
    role:          "admin" as const,
    creditBalance: 9999,
    displayName:   "Admin",
  },
];

// ── Schema (auth servisindekiyle birebir) ─────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    email:         { type: String, required: true, unique: true, lowercase: true },
    passwordHash:  { type: String, required: true, select: false },
    role:          { type: String, enum: ["user", "admin"], default: "user" },
    creditBalance: { type: Number, default: 100 },
    storageUsed:   { type: Number, default: 0 },
    preferences:   { accentColor: { type: String, default: "#0F3460" } },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌  MongoDB bağlanılıyor:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  const adminDb = mongoose.connection.db!.admin();

  // 1. Eski DB'leri drop et
  const oldDbs = ["aurabeat", "auradaw"];
  for (const dbName of oldDbs) {
    try {
      await mongoose.connection.db!.admin().command({ listDatabases: 1 });
      const client = mongoose.connection.getClient();
      const db = client.db(dbName);
      await db.dropDatabase();
      console.log(`🗑️   "${dbName}" database silindi`);
    } catch {
      console.log(`⚠️   "${dbName}" silinemedi (zaten yok olabilir)`);
    }
  }

  // 2. sonaralabs DB'sindeki collection'ları temizle
  const collections = await mongoose.connection.db!.listCollections().toArray();
  for (const col of collections) {
    await mongoose.connection.db!.collection(col.name).deleteMany({});
    console.log(`🧹  "${col.name}" collection temizlendi`);
  }

  // 3. Kullanıcıları oluştur
  const createdUsers: { email: string; password: string; role: string; id: string }[] = [];

  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const doc = await User.create({
      email:         u.email,
      passwordHash,
      role:          u.role,
      creditBalance: u.creditBalance,
      storageUsed:   0,
      preferences:   { accentColor: "#0F3460" },
    });
    createdUsers.push({ email: u.email, password: u.password, role: u.role, id: String(doc._id) });
    console.log(`✅  ${u.role.toUpperCase()} kullanıcı oluşturuldu: ${u.email}`);
  }

  // 4. Kimlik bilgilerini dosyaya yaz
  const now = new Date().toISOString();
  const lines = [
    "# Sonaralabs — Seed Credentials",
    `# Oluşturulma: ${now}`,
    "# Bu dosyayı paylaşma / commit etme.",
    "",
    ...createdUsers.map(u => [
      `## ${u.role.toUpperCase()}`,
      `Email    : ${u.email}`,
      `Password : ${u.password}`,
      `Role     : ${u.role}`,
      `MongoDB ID: ${u.id}`,
      "",
    ].join("\n")),
  ].join("\n");

  const outPath = path.resolve("scripts/seed-credentials.txt");
  fs.writeFileSync(outPath, lines, "utf8");
  console.log(`\n📄  Kimlik bilgileri: ${outPath}`);

  await mongoose.disconnect();
  console.log("\n✔️  Seed tamamlandı.");
}

main().catch(err => {
  console.error("Seed HATA:", err);
  process.exit(1);
});
