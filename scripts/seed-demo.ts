/**
 * scripts/seed-demo.ts
 *
 * Demo verisi oluşturur. Tüm veriler _demo:true (MongoDB) veya
 * e-posta domain'i @demo.sonaralabs.test (PostgreSQL) ile işaretlenir.
 * Silmek için: pnpm demo:clean
 *
 * Kullanım: pnpm demo:seed
 */

import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { Client } from "pg";

// ── Bağlantı bilgileri (.env'den ya da default) ───────────────────────────
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://sonaralabs:sonaralabs_dev@localhost:5432/sonaralabs";
const MINIO_BASE = "http://localhost:9000/sonaralabs-audio";
const AVATAR_BASE = "http://localhost:9000/sonaralabs-avatars";

// ── Yardımcı ─────────────────────────────────────────────────────────────
function oid() {
  return new Types.ObjectId();
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

// ── Demo kullanıcılar ─────────────────────────────────────────────────────
const PASS_HASH = bcrypt.hashSync("Demo1234!", 10);

const USERS = [
  {
    _id: oid(),
    email: "alice@demo.sonaralabs.test",
    passwordHash: PASS_HASH,
    role: "admin",
    creditBalance: 350,
    storageUsed: 47_185_920, // ~45 MB
    preferences: { accentColor: "#7c3aed" },
    _demo: true,
    createdAt: daysAgo(60),
  },
  {
    _id: oid(),
    email: "pixel@demo.sonaralabs.test",
    passwordHash: PASS_HASH,
    role: "user",
    creditBalance: 180,
    storageUsed: 20_971_520, // ~20 MB
    preferences: { accentColor: "#0ea5e9" },
    _demo: true,
    createdAt: daysAgo(45),
  },
  {
    _id: oid(),
    email: "sfx@demo.sonaralabs.test",
    passwordHash: PASS_HASH,
    role: "user",
    creditBalance: 250,
    storageUsed: 10_485_760, // ~10 MB
    preferences: { accentColor: "#f59e0b" },
    _demo: true,
    createdAt: daysAgo(30),
  },
  {
    _id: oid(),
    email: "indie@demo.sonaralabs.test",
    passwordHash: PASS_HASH,
    role: "user",
    creditBalance: 80,
    storageUsed: 5_242_880, // ~5 MB
    preferences: { accentColor: "#10b981" },
    _demo: true,
    createdAt: daysAgo(14),
  },
];

const [alice, pixel, sfx, indie] = USERS;

// ── Generations ───────────────────────────────────────────────────────────
function gen(
  userId: Types.ObjectId,
  opts: {
    prompt: string;
    provider?: string;
    style?: string;
    mood?: string;
    duration?: number;
    status?: string;
    bpm?: number;
    isFavorited?: boolean;
    isPublic?: boolean;
    type?: string;
    daysAgo?: number;
  }
) {
  const id = oid();
  const done = (opts.status ?? "done") === "done";
  return {
    _id: id,
    userId,
    prompt: opts.prompt,
    provider: opts.provider ?? "beatoven",
    style: opts.style ?? "action",
    mood: opts.mood ?? "epic",
    duration: opts.duration ?? 30,
    status: opts.status ?? "done",
    bpm: opts.bpm ?? 120,
    creditCost: 5,
    isFavorited: opts.isFavorited ?? false,
    isPublic: opts.isPublic ?? false,
    type: opts.type ?? "music",
    audioUrl: done
      ? `${MINIO_BASE}/demo_gen_${id}.wav`
      : undefined,
    jobId: `demo_job_${id}`,
    _demo: true,
    createdAt: daysAgo(opts.daysAgo ?? 10),
    updatedAt: daysAgo(opts.daysAgo ?? 10),
  };
}

const GENERATIONS = [
  // Alice — 8 üretim
  gen(alice._id, { prompt: "Epic boss fight orchestral battle theme", style: "action",  mood: "intense",    bpm: 140, duration: 60, isFavorited: true,  isPublic: true,  daysAgo: 55, provider: "beatoven" }),
  gen(alice._id, { prompt: "Mystical forest ambient loop for RPG",    style: "ambient", mood: "mysterious", bpm: 75,  duration: 30, isFavorited: false, isPublic: true,  daysAgo: 50, provider: "stability" }),
  gen(alice._id, { prompt: "Dungeon crawl horror tension music",       style: "horror",  mood: "tense",      bpm: 90,  duration: 30, daysAgo: 40, provider: "beatoven" }),
  gen(alice._id, { prompt: "Victory fanfare short loop",               style: "action",  mood: "triumphant", bpm: 160, duration: 15, isFavorited: true, daysAgo: 35, provider: "beatoven" }),
  gen(alice._id, { prompt: "Space exploration sci-fi ambience",        style: "ambient", mood: "calm",       bpm: 85,  duration: 60, isPublic: true, daysAgo: 25, provider: "stability" }),
  gen(alice._id, { prompt: "Fantasy tavern background music",          style: "fantasy", mood: "cheerful",   bpm: 110, duration: 30, daysAgo: 20, provider: "beatoven" }),
  gen(alice._id, { prompt: "Stealth mission tense loop",               style: "action",  mood: "tense",      bpm: 95,  duration: 30, daysAgo: 15, provider: "stability" }),
  gen(alice._id, { prompt: "Game over sad melody",                     style: "ambient", mood: "sad",        bpm: 60,  duration: 15, daysAgo: 5,  provider: "beatoven" }),

  // Pixel — 6 üretim
  gen(pixel._id, { prompt: "8-bit retro platformer main theme",        style: "chiptune",bpm: 150, duration: 30, isPublic: true,  isFavorited: true, daysAgo: 42, provider: "beatoven" }),
  gen(pixel._id, { prompt: "Puzzle game chill background loop",        style: "ambient", mood: "calm",       bpm: 80,  duration: 60, isPublic: true, daysAgo: 38, provider: "stability" }),
  gen(pixel._id, { prompt: "Racing game adrenaline track",             style: "action",  mood: "intense",    bpm: 175, duration: 30, daysAgo: 30, provider: "beatoven" }),
  gen(pixel._id, { prompt: "Cute village town theme for mobile game",  style: "fantasy", mood: "cheerful",   bpm: 100, duration: 30, isPublic: true, daysAgo: 22, provider: "stability" }),
  gen(pixel._id, { prompt: "Battle intro stinger 15 seconds",          style: "action",  mood: "epic",       bpm: 130, duration: 15, daysAgo: 18, provider: "beatoven" }),
  gen(pixel._id, { prompt: "End credits emotional piano theme",        style: "ambient", mood: "emotional",  bpm: 70,  duration: 60, daysAgo: 8,  provider: "stability" }),

  // SFX — 4 SFX + 2 müzik
  gen(sfx._id,   { prompt: "Sword slash impact with reverb",           type: "sfx",      duration: 3,  daysAgo: 28, provider: "elevenlabs" }),
  gen(sfx._id,   { prompt: "Magic spell cast whoosh sparkle",          type: "sfx",      duration: 2,  daysAgo: 24, provider: "elevenlabs" }),
  gen(sfx._id,   { prompt: "Footsteps on wooden floor",                type: "sfx",      duration: 5,  daysAgo: 20, provider: "elevenlabs" }),
  gen(sfx._id,   { prompt: "Explosion with debris falloff",            type: "sfx",      duration: 4,  isFavorited: true, daysAgo: 15, provider: "elevenlabs" }),
  gen(sfx._id,   { prompt: "Dark atmospheric horror drone",            style: "horror",  bpm: 60,  duration: 30, isPublic: true, daysAgo: 10, provider: "stability" }),
  gen(sfx._id,   { prompt: "Tense investigation theme",                style: "ambient", bpm: 80,  duration: 30, daysAgo: 5,  provider: "beatoven" }),

  // Indie — 3 üretim (1 failed)
  gen(indie._id, { prompt: "Indie game main menu chill loop",          style: "ambient", bpm: 90,  duration: 30, isPublic: true, daysAgo: 12, provider: "beatoven" }),
  gen(indie._id, { prompt: "Boss fight metal rock guitar riff",        style: "action",  bpm: 160, duration: 30, daysAgo: 7,  provider: "beatoven" }),
  {
    ...gen(indie._id, { prompt: "Broken generation test", daysAgo: 3 }),
    status: "failed",
    audioUrl: undefined,
    failReason: "Provider timeout after 300s",
    failedAt: daysAgo(3),
  },
];

// ── Uploads ───────────────────────────────────────────────────────────────
function upload(userId: Types.ObjectId, name: string, size: number, dur: number, dAgo: number) {
  const id = oid();
  return {
    _id: id,
    userId,
    originalName: name,
    audioUrl: `${MINIO_BASE}/demo_upl_${id}.wav`,
    mimeType: "audio/wav",
    fileSize: size,
    duration: dur,
    isFavorited: false,
    _demo: true,
    createdAt: daysAgo(dAgo),
  };
}

const UPLOADS = [
  upload(alice._id, "recorded_guitar_loop.wav",    8_388_608, 45,  48),
  upload(alice._id, "field_recording_rain.wav",    5_242_880, 120, 35),
  upload(alice._id, "synth_bass_oneshot.wav",      2_097_152, 8,   20),
  upload(pixel._id, "retro_beep_pack.wav",         4_194_304, 30,  40),
  upload(pixel._id, "chiptune_drums.wav",          3_145_728, 22,  25),
  upload(indie._id, "guitar_riff_raw.wav",         6_291_456, 38,  10),
  upload(indie._id, "voice_over_test.wav",         1_048_576, 12,  8),
  upload(indie._id, "ambient_drone_raw.wav",       2_621_440, 90,  5),
];

// ── Credit logs ───────────────────────────────────────────────────────────
function creditLog(
  userId: Types.ObjectId,
  amount: number,
  type: string,
  reason: string,
  balanceAfter: number,
  dAgo: number
) {
  return { _id: oid(), userId, amount, type, reason, balanceAfter, _demo: true, createdAt: daysAgo(dAgo) };
}

const CREDIT_LOGS = [
  creditLog(alice._id,  100, "earn",  "Kayıt bonusu",           100, 60),
  creditLog(alice._id,  500, "earn",  "Kredi paketi satın alma", 600, 55),
  creditLog(alice._id,   -5, "spend", "Üretim: beatoven 30s",    595, 55),
  creditLog(alice._id,   -5, "spend", "Üretim: beatoven 30s",    590, 50),
  creditLog(alice._id,   -8, "spend", "Üretim: beatoven 60s",    582, 40),
  creditLog(alice._id, -200, "spend", "Kredi 5 üretim toplu",    382, 25),
  creditLog(pixel._id,  100, "earn",  "Kayıt bonusu",           100, 45),
  creditLog(pixel._id,  200, "earn",  "Kredi paketi satın alma", 300, 44),
  creditLog(pixel._id,   -5, "spend", "Üretim: stability 30s",   295, 38),
  creditLog(pixel._id,  -30, "spend", "6 üretim",               265, 22),
  creditLog(sfx._id,    100, "earn",  "Kayıt bonusu",            100, 30),
  creditLog(sfx._id,    200, "earn",  "Kredi paketi satın alma",  300, 29),
  creditLog(sfx._id,     -1, "spend", "SFX: elevenlabs",          299, 28),
  creditLog(indie._id,  100, "earn",  "Kayıt bonusu",            100, 14),
  creditLog(indie._id,   -5, "spend", "Üretim: beatoven 30s",     95, 12),
];

// ── Collections ───────────────────────────────────────────────────────────
const aliceBattleCol = oid();
const aliceAmbientCol = oid();
const pixelJamCol = oid();

const COLLECTIONS = [
  {
    _id: aliceBattleCol,
    userId: alice._id,
    name: "⚔️ Battle Themes",
    items: [
      { refId: GENERATIONS[0]._id.toString(), refModel: "Generation", addedAt: daysAgo(50) },
      { refId: GENERATIONS[3]._id.toString(), refModel: "Generation", addedAt: daysAgo(34) },
    ],
    _demo: true,
    createdAt: daysAgo(54),
  },
  {
    _id: aliceAmbientCol,
    userId: alice._id,
    name: "🌿 Ambient Loops",
    items: [
      { refId: GENERATIONS[1]._id.toString(), refModel: "Generation", addedAt: daysAgo(49) },
      { refId: GENERATIONS[4]._id.toString(), refModel: "Generation", addedAt: daysAgo(24) },
      { refId: UPLOADS[1]._id.toString(),      refModel: "Upload",     addedAt: daysAgo(34) },
    ],
    _demo: true,
    createdAt: daysAgo(53),
  },
  {
    _id: pixelJamCol,
    userId: pixel._id,
    name: "🎮 Game Jam Pack",
    items: [
      { refId: GENERATIONS[8]._id.toString(),  refModel: "Generation", addedAt: daysAgo(40) },
      { refId: GENERATIONS[9]._id.toString(),  refModel: "Generation", addedAt: daysAgo(37) },
      { refId: GENERATIONS[11]._id.toString(), refModel: "Generation", addedAt: daysAgo(21) },
    ],
    _demo: true,
    createdAt: daysAgo(42),
  },
];

// ── DAW Projects ──────────────────────────────────────────────────────────
const dawProjects = [
  {
    _id: oid(),
    userId: alice._id,
    name: "Epic Boss Fight",
    bpm: 140,
    tracks: [
      { id: "t1", name: "Orchestral Main",   audioUrl: GENERATIONS[0].audioUrl, clips: [{ id: "c1", trackId: "t1", startBar: 0,  durationBars: 16, audioOffset: 0 }] },
      { id: "t2", name: "Tension Layer",     audioUrl: GENERATIONS[2].audioUrl, clips: [{ id: "c2", trackId: "t2", startBar: 8,  durationBars: 8,  audioOffset: 0 }] },
      { id: "t3", name: "Victory Stinger",   audioUrl: GENERATIONS[3].audioUrl, clips: [{ id: "c3", trackId: "t3", startBar: 16, durationBars: 4,  audioOffset: 0 }] },
    ],
    masterVolume: 0.9,
    isPublic: false,
    _demo: true,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
  },
  {
    _id: oid(),
    userId: alice._id,
    name: "Dungeon Ambience",
    bpm: 80,
    tracks: [
      { id: "t1", name: "Dark Drone",    audioUrl: GENERATIONS[2].audioUrl, clips: [{ id: "c1", trackId: "t1", startBar: 0, durationBars: 32, audioOffset: 0 }] },
      { id: "t2", name: "Rain Texture",  audioUrl: UPLOADS[1].audioUrl,     clips: [{ id: "c2", trackId: "t2", startBar: 0, durationBars: 32, audioOffset: 0 }] },
    ],
    masterVolume: 0.7,
    isPublic: true,
    shareToken: "demo_share_dungeon_abc123",
    _demo: true,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
  },
  {
    _id: oid(),
    userId: pixel._id,
    name: "Retro Platformer OST",
    bpm: 150,
    tracks: [
      { id: "t1", name: "8-bit Main",   audioUrl: GENERATIONS[8].audioUrl,  clips: [{ id: "c1", trackId: "t1", startBar: 0,  durationBars: 16, audioOffset: 0 }] },
      { id: "t2", name: "Chiptune Drums", audioUrl: UPLOADS[4].audioUrl,    clips: [{ id: "c2", trackId: "t2", startBar: 0,  durationBars: 16, audioOffset: 0 }] },
    ],
    masterVolume: 0.85,
    isPublic: false,
    _demo: true,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(3),
  },
];

// ── PostgreSQL verileri ───────────────────────────────────────────────────
const PG_USER_IDS = {
  alice: alice._id.toString(),
  pixel: pixel._id.toString(),
  sfx:   sfx._id.toString(),
  indie: indie._id.toString(),
};

// Public tracks — sadece isPublic:true olan generation'lardan
const publicGenIds = GENERATIONS.filter((g) => g.isPublic && g.status === "done");

interface PgTrack {
  id: string;
  userId: string;
  generationId: string;
  title: string;
  audioUrl: string;
  durationSec: number;
  bpm: number;
  genreTags: string[];
  moodTags: string[];
  gameTypeTags: string[];
  likeCount: number;
  isLoop: boolean;
  daysAgo: number;
}

const PG_TRACKS: PgTrack[] = [
  { id: crypto.randomUUID(), userId: PG_USER_IDS.alice, generationId: GENERATIONS[0]._id.toString(), title: "Epic Boss Fight – Orchestral",         audioUrl: GENERATIONS[0].audioUrl!,  durationSec: 60,  bpm: 140, genreTags: ["orchestral","action"],  moodTags: ["intense","epic"],    gameTypeTags: ["rpg","action"],   likeCount: 24, isLoop: true,  daysAgo: 55 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.alice, generationId: GENERATIONS[1]._id.toString(), title: "Mystical Forest Ambient",               audioUrl: GENERATIONS[1].audioUrl!,  durationSec: 30,  bpm: 75,  genreTags: ["ambient"],              moodTags: ["mysterious","calm"], gameTypeTags: ["rpg"],            likeCount: 18, isLoop: true,  daysAgo: 50 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.alice, generationId: GENERATIONS[4]._id.toString(), title: "Space Exploration Sci-Fi",              audioUrl: GENERATIONS[4].audioUrl!,  durationSec: 60,  bpm: 85,  genreTags: ["ambient","sci-fi"],     moodTags: ["calm"],              gameTypeTags: ["space","strategy"], likeCount: 31, isLoop: true, daysAgo: 25 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.pixel, generationId: GENERATIONS[8]._id.toString(), title: "8-Bit Platformer Main Theme",          audioUrl: GENERATIONS[8].audioUrl!,  durationSec: 30,  bpm: 150, genreTags: ["chiptune","retro"],     moodTags: ["cheerful","energetic"], gameTypeTags: ["platformer"], likeCount: 42, isLoop: true, daysAgo: 42 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.pixel, generationId: GENERATIONS[9]._id.toString(), title: "Puzzle Game Chill Loop",               audioUrl: GENERATIONS[9].audioUrl!,  durationSec: 60,  bpm: 80,  genreTags: ["ambient","casual"],     moodTags: ["calm","relaxed"],    gameTypeTags: ["puzzle"],         likeCount: 19, isLoop: true,  daysAgo: 38 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.pixel, generationId: GENERATIONS[11]._id.toString(), title: "Cute Village Town Theme",             audioUrl: GENERATIONS[11].audioUrl!, durationSec: 30,  bpm: 100, genreTags: ["fantasy","casual"],    moodTags: ["cheerful"],          gameTypeTags: ["mobile","rpg"],   likeCount: 27, isLoop: true,  daysAgo: 22 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.sfx,  generationId: GENERATIONS[18]._id.toString(), title: "Dark Atmospheric Horror Drone",       audioUrl: GENERATIONS[18].audioUrl!, durationSec: 30,  bpm: 60,  genreTags: ["horror","ambient"],    moodTags: ["tense","dark"],      gameTypeTags: ["horror"],         likeCount: 15, isLoop: true,  daysAgo: 10 },
  { id: crypto.randomUUID(), userId: PG_USER_IDS.indie, generationId: GENERATIONS[20]._id.toString(), title: "Indie Game Main Menu Loop",          audioUrl: GENERATIONS[20].audioUrl!, durationSec: 30,  bpm: 90,  genreTags: ["ambient","indie"],     moodTags: ["calm","nostalgic"],  gameTypeTags: ["indie","casual"], likeCount: 8,  isLoop: true,  daysAgo: 12 },
];

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Demo seed başlıyor...\n");

  // ── MongoDB ─────────────────────────────────────────────────────────────
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  console.log("📦  MongoDB: koleksiyonlar dolduruluyor...");

  const usersInserted = await db.collection("users").insertMany(USERS as any);
  console.log(`   ✓ users: ${usersInserted.insertedCount} belge`);

  const gensInserted = await db.collection("generations").insertMany(GENERATIONS as any);
  console.log(`   ✓ generations: ${gensInserted.insertedCount} belge`);

  const uplsInserted = await db.collection("uploads").insertMany(UPLOADS as any);
  console.log(`   ✓ uploads: ${uplsInserted.insertedCount} belge`);

  const logsInserted = await db.collection("credit_logs").insertMany(CREDIT_LOGS as any);
  console.log(`   ✓ credit_logs: ${logsInserted.insertedCount} belge`);

  const colsInserted = await db.collection("collections").insertMany(COLLECTIONS as any);
  console.log(`   ✓ collections: ${colsInserted.insertedCount} belge`);

  const dawsInserted = await db.collection("daw_projects").insertMany(dawProjects as any);
  console.log(`   ✓ daw_projects: ${dawsInserted.insertedCount} belge`);

  await mongoose.disconnect();
  console.log("   MongoDB bağlantısı kapatıldı.\n");

  // ── PostgreSQL ───────────────────────────────────────────────────────────
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  console.log("🐘  PostgreSQL: tablolar dolduruluyor...");

  // Profiller
  const profiles = [
    { userId: PG_USER_IDS.alice, username: "alice_composer", displayName: "Alice Composer",   bio: "Game music composer & sound designer. RPG/Horror specialist.", avatarUrl: `${AVATAR_BASE}/demo_${PG_USER_IDS.alice}.jpg`, gameGenres: ["rpg","horror","action"], isPublic: true,  followerCount: 3, followingCount: 2, trackCount: 3 },
    { userId: PG_USER_IDS.pixel, username: "pixel_beats",    displayName: "Pixel Beats",       bio: "Chiptune & retro game music. Game jam regular 🎮",             avatarUrl: `${AVATAR_BASE}/demo_${PG_USER_IDS.pixel}.jpg`, gameGenres: ["platformer","puzzle","mobile"], isPublic: true, followerCount: 2, followingCount: 1, trackCount: 3 },
    { userId: PG_USER_IDS.sfx,   username: "sfx_master",     displayName: "SFX Master",        bio: "Procedural SFX & atmospheric sound design.",                  avatarUrl: null, gameGenres: ["horror","action"],   isPublic: true,  followerCount: 1, followingCount: 1, trackCount: 1 },
    { userId: PG_USER_IDS.indie, username: "indie_dev",      displayName: "Indie Dev",         bio: "Solo dev building a metroidvania. Music & code both!",       avatarUrl: null, gameGenres: ["indie","action"],    isPublic: true,  followerCount: 0, followingCount: 1, trackCount: 1 },
  ];

  for (const p of profiles) {
    await pg.query(
      `INSERT INTO user_profiles
        (user_id, username, display_name, bio, avatar_url, game_genres,
         is_public, follower_count, following_count, track_count, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() - interval '${Math.floor(Math.random()*60)} days')
       ON CONFLICT (user_id) DO NOTHING`,
      [p.userId, p.username, p.displayName, p.bio, p.avatarUrl,
       p.gameGenres, p.isPublic, p.followerCount, p.followingCount, p.trackCount]
    );
  }
  console.log(`   ✓ user_profiles: ${profiles.length} satır`);

  // Public tracks
  for (const t of PG_TRACKS) {
    await pg.query(
      `INSERT INTO public_tracks
        (id, user_id, generation_id, title, audio_url, duration_sec, bpm,
         genre_tags, mood_tags, game_type_tags, like_count, is_loop, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() - interval '${t.daysAgo} days')`,
      [t.id, t.userId, t.generationId, t.title, t.audioUrl,
       t.durationSec, t.bpm, t.genreTags, t.moodTags, t.gameTypeTags,
       t.likeCount, t.isLoop]
    );
  }
  console.log(`   ✓ public_tracks: ${PG_TRACKS.length} satır`);

  // Follows: alice→pixel, alice→sfx, pixel→alice, pixel→indie, sfx→alice, indie→alice
  const follows = [
    [PG_USER_IDS.alice, PG_USER_IDS.pixel],
    [PG_USER_IDS.alice, PG_USER_IDS.sfx],
    [PG_USER_IDS.pixel, PG_USER_IDS.alice],
    [PG_USER_IDS.pixel, PG_USER_IDS.indie],
    [PG_USER_IDS.sfx,   PG_USER_IDS.alice],
    [PG_USER_IDS.indie, PG_USER_IDS.alice],
  ];
  for (const [f, fe] of follows) {
    await pg.query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [f, fe]
    );
  }
  console.log(`   ✓ follows: ${follows.length} satır`);

  // Track likes — çeşitli beğeniler
  const likes: [string, string][] = [
    [PG_USER_IDS.pixel, PG_TRACKS[0].id],
    [PG_USER_IDS.sfx,   PG_TRACKS[0].id],
    [PG_USER_IDS.indie, PG_TRACKS[0].id],
    [PG_USER_IDS.alice, PG_TRACKS[3].id],
    [PG_USER_IDS.sfx,   PG_TRACKS[3].id],
    [PG_USER_IDS.indie, PG_TRACKS[3].id],
    [PG_USER_IDS.alice, PG_TRACKS[4].id],
    [PG_USER_IDS.pixel, PG_TRACKS[2].id],
    [PG_USER_IDS.indie, PG_TRACKS[2].id],
    [PG_USER_IDS.alice, PG_TRACKS[5].id],
    [PG_USER_IDS.pixel, PG_TRACKS[6].id],
    [PG_USER_IDS.alice, PG_TRACKS[7].id],
  ];
  for (const [uid, tid] of likes) {
    await pg.query(
      `INSERT INTO track_likes (user_id, track_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [uid, tid]
    );
  }
  console.log(`   ✓ track_likes: ${likes.length} satır`);

  // Feed events
  const feedEvents = [
    { actor: PG_USER_IDS.alice, verb: "published",  objType: "track",  objId: PG_TRACKS[0].id,           dAgo: 55 },
    { actor: PG_USER_IDS.alice, verb: "published",  objType: "track",  objId: PG_TRACKS[1].id,           dAgo: 50 },
    { actor: PG_USER_IDS.pixel, verb: "published",  objType: "track",  objId: PG_TRACKS[3].id,           dAgo: 42 },
    { actor: PG_USER_IDS.pixel, verb: "followed",   objType: "user",   objId: PG_USER_IDS.alice,         dAgo: 40 },
    { actor: PG_USER_IDS.sfx,   verb: "followed",   objType: "user",   objId: PG_USER_IDS.alice,         dAgo: 29 },
    { actor: PG_USER_IDS.alice, verb: "published",  objType: "track",  objId: PG_TRACKS[2].id,           dAgo: 25 },
    { actor: PG_USER_IDS.pixel, verb: "liked",      objType: "track",  objId: PG_TRACKS[2].id,           dAgo: 24 },
    { actor: PG_USER_IDS.pixel, verb: "published",  objType: "track",  objId: PG_TRACKS[4].id,           dAgo: 22 },
    { actor: PG_USER_IDS.indie, verb: "followed",   objType: "user",   objId: PG_USER_IDS.alice,         dAgo: 13 },
    { actor: PG_USER_IDS.indie, verb: "published",  objType: "track",  objId: PG_TRACKS[7].id,           dAgo: 12 },
  ];

  for (const ev of feedEvents) {
    await pg.query(
      `INSERT INTO feed_events (actor_id, verb, object_type, object_id, created_at)
       VALUES ($1,$2,$3,$4, NOW() - interval '${ev.dAgo} days')`,
      [ev.actor, ev.verb, ev.objType, ev.objId]
    );
  }
  console.log(`   ✓ feed_events: ${feedEvents.length} satır`);

  await pg.end();
  console.log("   PostgreSQL bağlantısı kapatıldı.\n");

  console.log("✅  Demo seed tamamlandı!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧  Demo hesapları (şifre: Demo1234!):");
  console.log("    alice@demo.sonaralabs.test   (admin, 350 kredi)");
  console.log("    pixel@demo.sonaralabs.test   (user,  180 kredi)");
  console.log("    sfx@demo.sonaralabs.test     (user,  250 kredi)");
  console.log("    indie@demo.sonaralabs.test   (user,   80 kredi)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🗑️   Temizlemek için: pnpm demo:clean");
}

main().catch((err) => {
  console.error("❌  Seed hatası:", err);
  process.exit(1);
});
