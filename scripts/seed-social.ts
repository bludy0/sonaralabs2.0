/**
 * scripts/seed-social.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keşfet (Explore) ve Akış (Feed) için mock veri üretir.
 *   - profiles      → mock müzisyenler
 *   - publictracks  → Explore listesi (gerçek MinIO WAV'larıyla, çalınabilir)
 *   - feedevents    → test kullanıcısının Akış'ı (recipientId = test user)
 *
 * Idempotent: yalnızca `userId: "mock-*"` kayıtlarını ve test kullanıcısının
 * mock feed event'lerini siler/yeniden ekler — gerçek verilere dokunmaz.
 *
 * Çalıştır:  pnpm tsx scripts/seed-social.ts
 */
import mongoose from "mongoose";
import { createClient } from "redis";
import crypto from "crypto";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/sonaralabs";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TEST_EMAIL = "test@sonaralabs.io";

// Gerçek, çalınabilir MinIO WAV'ları (bu oturumda üretildi) — döngüyle kullanılır
const AUDIO = [
  "http://localhost:9000/sonaralabs-audio/music/1780512776661-1kjzqlsv6w9.wav",
  "http://localhost:9000/sonaralabs-audio/music/1780519204714-spdi7zis9c.wav",
];
const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;
const wave = () => Array.from({ length: 48 }, () => 8 + Math.floor(Math.random() * 92));
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

// ── Mock müzisyenler ───────────────────────────────────────────────────────────
const PROFILES = [
  { userId: "mock-aurora",  username: "aurora_synth",  displayName: "Aurora Vance",  bio: "Ambient & orchestral game scores. RPG ruhu.",        gameGenres: ["rpg", "adventure"],   followerCount: 1280, followingCount: 84 },
  { userId: "mock-pixel",   username: "pixelbard",     displayName: "Pixel Bard",    bio: "8-bit & chiptune. Retro platformer müzikleri.",      gameGenres: ["platformer", "retro"], followerCount: 940,  followingCount: 120 },
  { userId: "mock-mika",    username: "nightcore_dev", displayName: "Mika Sol",      bio: "Synthwave / cyberpunk. Neon geceler.",               gameGenres: ["cyberpunk", "racing"], followerCount: 2110, followingCount: 60 },
  { userId: "mock-dmitri",  username: "epicforge",     displayName: "Dmitri Kross",  bio: "Epik boss savaşı temaları. Koro + davul.",           gameGenres: ["action", "rpg"],       followerCount: 3340, followingCount: 45 },
  { userId: "mock-tanuki",  username: "lofi_tanuki",   displayName: "Tanuki",        bio: "Lo-fi & JRPG. Sakin köy temaları.",                  gameGenres: ["jrpg", "puzzle"],      followerCount: 760,  followingCount: 210 },
  { userId: "mock-grim",    username: "dungeon_synth",  displayName: "Grimwald",     bio: "Fantasy & horror atmosferleri. Zindan müziği.",      gameGenres: ["horror", "fantasy"],   followerCount: 1520, followingCount: 33 },
  { userId: "mock-rae",     username: "velocity_audio", displayName: "Rae Quinn",    bio: "Yüksek tempolu yarış & aksiyon müziği.",             gameGenres: ["racing", "action"],    followerCount: 880,  followingCount: 97 },
];

// ── Mock public track'ler ──────────────────────────────────────────────────────
type T = { owner: string; title: string; genre: string[]; mood: string[]; game: string[]; dur: 15 | 30 | 60; bpm: number; likes: number; days: number };
const TRACKS: T[] = [
  { owner: "mock-dmitri", title: "Final Boss — Ascension",       genre: ["boss", "orchestral"], mood: ["epic", "tense"],       game: ["rpg", "action"],   dur: 60, bpm: 145, likes: 412, days: 2 },
  { owner: "mock-aurora", title: "Whispering Pines",             genre: ["ambient"],            mood: ["calm", "mysterious"],  game: ["rpg"],             dur: 60, bpm: 70,  likes: 188, days: 4 },
  { owner: "mock-pixel",  title: "Jump World 1-1",               genre: ["chiptune"],           mood: ["cheerful", "playful"], game: ["platformer"],      dur: 30, bpm: 150, likes: 327, days: 1 },
  { owner: "mock-mika",   title: "Neon Drift",                   genre: ["synthwave"],          mood: ["energetic"],           game: ["racing"],          dur: 30, bpm: 120, likes: 540, days: 3 },
  { owner: "mock-grim",   title: "Crypt of the Forgotten",       genre: ["horror", "ambient"],  mood: ["dark", "tense"],       game: ["horror"],          dur: 60, bpm: 60,  likes: 233, days: 6 },
  { owner: "mock-tanuki", title: "Tea House Afternoon",          genre: ["lofi", "jrpg"],       mood: ["calm", "dreamy"],      game: ["puzzle"],          dur: 60, bpm: 82,  likes: 401, days: 2 },
  { owner: "mock-mika",   title: "Chrome District",              genre: ["cyberpunk"],          mood: ["dark", "energetic"],   game: ["scifi"],           dur: 30, bpm: 128, likes: 296, days: 5 },
  { owner: "mock-dmitri", title: "March of the Vanguard",        genre: ["orchestral"],         mood: ["heroic", "triumphant"],game: ["action"],          dur: 60, bpm: 110, likes: 358, days: 8 },
  { owner: "mock-aurora", title: "Starlit Voyage",               genre: ["scifi", "ambient"],   mood: ["dreamy"],              game: ["scifi"],           dur: 60, bpm: 88,  likes: 174, days: 10 },
  { owner: "mock-pixel",  title: "Bonus Stage Frenzy",           genre: ["chiptune"],           mood: ["energetic", "playful"],game: ["platformer"],      dur: 15, bpm: 165, likes: 210, days: 7 },
  { owner: "mock-rae",    title: "Redline Rush",                 genre: ["racing", "action"],   mood: ["energetic"],           game: ["racing"],          dur: 30, bpm: 140, likes: 263, days: 3 },
  { owner: "mock-grim",   title: "Lantern in the Fog",           genre: ["fantasy", "medieval"],mood: ["mysterious", "melancholic"], game: ["fantasy"],   dur: 60, bpm: 72,  likes: 145, days: 12 },
  { owner: "mock-tanuki", title: "Sleepy Village Theme",         genre: ["jrpg"],               mood: ["cheerful", "calm"],    game: ["jrpg"],            dur: 30, bpm: 96,  likes: 312, days: 4 },
  { owner: "mock-aurora", title: "Throne Room",                  genre: ["orchestral"],         mood: ["epic"],                game: ["rpg"],             dur: 30, bpm: 90,  likes: 199, days: 9 },
  { owner: "mock-mika",   title: "After Midnight",               genre: ["synthwave", "lofi"],  mood: ["melancholic", "dreamy"],game: ["cyberpunk"],      dur: 60, bpm: 100, likes: 487, days: 1 },
  { owner: "mock-dmitri", title: "Siege Engine",                 genre: ["boss", "action"],     mood: ["tense", "dark"],       game: ["action"],          dur: 30, bpm: 132, likes: 276, days: 6 },
  { owner: "mock-rae",    title: "Checkpoint Cleared",           genre: ["action"],             mood: ["triumphant"],          game: ["racing"],          dur: 15, bpm: 128, likes: 154, days: 11 },
  { owner: "mock-grim",   title: "The Deep Below",               genre: ["horror"],             mood: ["dark"],                game: ["horror"],          dur: 60, bpm: 55,  likes: 221, days: 5 },
];

async function main() {
  console.log("→ MongoDB'ye bağlanılıyor…");
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  const testUser = await db.collection("users").findOne({ email: TEST_EMAIL });
  if (!testUser) throw new Error(`Test kullanıcısı bulunamadı (${TEST_EMAIL}). Önce seed çalıştır.`);
  const TEST_ID = String(testUser._id);
  console.log(`   test user: ${TEST_ID}`);

  const profiles = db.collection("profiles");
  const tracks   = db.collection("publictracks");
  const feed     = db.collection("feedevents");

  // ── Idempotent temizlik (yalnızca mock-* + test feed) ────────────────────────
  await profiles.deleteMany({ userId: /^mock-/ });
  await tracks.deleteMany({ userId: /^mock-/ });
  await feed.deleteMany({ recipientId: TEST_ID, actorId: /^mock-/ });

  // ── Profiller ────────────────────────────────────────────────────────────────
  const trackCountByOwner: Record<string, number> = {};
  for (const t of TRACKS) trackCountByOwner[t.owner] = (trackCountByOwner[t.owner] ?? 0) + 1;

  await profiles.insertMany(PROFILES.map(p => ({
    userId: p.userId, username: p.username, displayName: p.displayName, bio: p.bio,
    avatarUrl: avatar(p.username), gameGenres: p.gameGenres, isPublic: true,
    followerCount: p.followerCount, followingCount: p.followingCount,
    trackCount: trackCountByOwner[p.userId] ?? 0,
    createdAt: daysAgo(120), updatedAt: new Date(),
  })));
  console.log(`   ✓ profiles: ${PROFILES.length}`);

  // ── Public track'ler (Explore) ───────────────────────────────────────────────
  const trackDocs = TRACKS.map((t, i) => {
    const p = PROFILES.find(x => x.userId === t.owner)!;
    return {
      _id: new mongoose.Types.ObjectId(),
      userId: t.owner, username: p.username, generationId: "",
      title: t.title, audioUrl: AUDIO[i % AUDIO.length], waveformData: wave(),
      durationSec: t.dur, bpm: t.bpm,
      genreTags: t.genre, moodTags: t.mood, gameTypeTags: t.game,
      likeCount: t.likes, isLoop: true,
      createdAt: daysAgo(t.days), updatedAt: daysAgo(t.days),
    };
  });
  await tracks.insertMany(trackDocs);
  console.log(`   ✓ publictracks: ${trackDocs.length}`);

  // ── Feed event'leri (test kullanıcısının Akış'ı) ─────────────────────────────
  const pick = (id: string) => PROFILES.find(p => p.userId === id)!;
  const ev = (actorId: string, verb: "published" | "liked" | "followed", objType: "track" | "user", objId: string, title: string | undefined, days: number) => ({
    _id: new mongoose.Types.ObjectId(),
    recipientId: TEST_ID, actorId, actorUsername: pick(actorId).username,
    verb, objectType: objType, objectId: objId, objectTitle: title,
    createdAt: daysAgo(days), updatedAt: daysAgo(days),
  });
  const t = (i: number) => trackDocs[i];
  const feedDocs = [
    ev("mock-mika",   "published", "track", String(t(14)._id), t(14).title, 1),
    ev("mock-pixel",  "followed",  "user",  TEST_ID,           undefined,    1),
    ev("mock-dmitri", "published", "track", String(t(0)._id),  t(0).title,   2),
    ev("mock-tanuki", "liked",     "track", String(t(5)._id),  t(5).title,   2),
    ev("mock-aurora", "followed",  "user",  TEST_ID,           undefined,    3),
    ev("mock-mika",   "liked",     "track", String(t(3)._id),  t(3).title,   3),
    ev("mock-grim",   "published", "track", String(t(4)._id),  t(4).title,   6),
    ev("mock-rae",    "followed",  "user",  TEST_ID,           undefined,    7),
    ev("mock-dmitri", "liked",     "track", String(t(7)._id),  t(7).title,   8),
    ev("mock-pixel",  "published", "track", String(t(9)._id),  t(9).title,   7),
    ev("mock-aurora", "published", "track", String(t(8)._id),  t(8).title,   10),
    ev("mock-grim",   "followed",  "user",  TEST_ID,           undefined,    12),
  ];
  await feed.insertMany(feedDocs);
  console.log(`   ✓ feedevents (test user): ${feedDocs.length}`);

  // ── Redis feed cache'ini temizle (yeni event'ler görünsün) ───────────────────
  try {
    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    await redis.del(`feed:${TEST_ID}`);
    await redis.quit();
    console.log("   ✓ redis feed cache temizlendi");
  } catch (e) {
    console.log("   ⚠ redis cache temizlenemedi (sorun değil):", String(e));
  }

  await mongoose.disconnect();
  console.log("✅ Mock sosyal veri hazır — Keşfet'te 18 track, Akış'ta 12 event.");
}

main().catch(err => { console.error("❌ seed-social başarısız:", err); process.exit(1); });
