#!/usr/bin/env bash
# scripts/seed-demo.sh
# Demo verisini MongoDB ve PostgreSQL'e ekler.
# Kullanım: pnpm demo:seed

set -e
MONGO_DSN="mongodb://root:sonaralabs_dev@localhost:27017/sonaralabs?authSource=admin"

echo ""
echo "🌱  Demo seed başlıyor..."
echo ""

# ── Zaten seed yapıldı mı? ────────────────────────────────────────────────────
EXISTING=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval 'print(db.users.countDocuments({ _demo: true }))' 2>/dev/null | tail -1)
if [ "$EXISTING" != "0" ] && [ -n "$EXISTING" ]; then
  echo "⚠️  Demo verisi zaten mevcut ($EXISTING kullanıcı). Önce pnpm demo:clean çalıştırın."
  exit 1
fi

# ── 1. MongoDB Seed ───────────────────────────────────────────────────────────
echo "📦  MongoDB demo verisi ekleniyor..."

docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" --quiet --eval '
const PASS = "$2a$10$zHc2lmbJDEXzJ0lbsE9C4uPpovbbraOIHhp.0CNiR4mTd/skFo0Sm";
function d(n) { return new Date(Date.now() - n * 86400000); }
const BASE = "http://localhost:9000/sonaralabs-audio";

const aliceId = new ObjectId(); const pixelId = new ObjectId();
const sfxId   = new ObjectId(); const indieId = new ObjectId();

db.users.insertMany([
  { _id:aliceId, email:"alice@demo.sonaralabs.test", passwordHash:PASS, role:"admin", creditBalance:350, storageUsed:47185920, preferences:{accentColor:"#7c3aed"}, _demo:true, createdAt:d(60), updatedAt:d(1) },
  { _id:pixelId, email:"pixel@demo.sonaralabs.test", passwordHash:PASS, role:"user",  creditBalance:180, storageUsed:20971520, preferences:{accentColor:"#0ea5e9"}, _demo:true, createdAt:d(45), updatedAt:d(2) },
  { _id:sfxId,   email:"sfx@demo.sonaralabs.test",   passwordHash:PASS, role:"user",  creditBalance:250, storageUsed:10485760, preferences:{accentColor:"#f59e0b"}, _demo:true, createdAt:d(30), updatedAt:d(3) },
  { _id:indieId, email:"indie@demo.sonaralabs.test",  passwordHash:PASS, role:"user",  creditBalance:80,  storageUsed:5242880,  preferences:{accentColor:"#10b981"}, _demo:true, createdAt:d(14), updatedAt:d(4) },
]);
print("   ✓ users: 4 belge");

function g(uid,prompt,provider,style,mood,dur,bpm,status,isFav,isPub,type,dago) {
  const id = new ObjectId(); const done = (status||"done")==="done";
  return { _id:id, userId:uid, prompt, provider:provider||"beatoven", style:style||"action",
    mood:mood||"epic", duration:dur||30, status:status||"done", bpm:bpm||120, creditCost:5,
    isFavorited:isFav||false, isPublic:isPub||false, type:type||"music",
    audioUrl: done ? (BASE+"/demo_gen_"+id.toString()+".wav") : undefined,
    jobId:"demo_job_"+id.toString(), _demo:true, createdAt:d(dago||10), updatedAt:d(dago||10) };
}

const gens = [
  g(aliceId,"Epic boss fight orchestral battle theme","beatoven","action","intense",60,140,"done",true,true,"music",55),
  g(aliceId,"Mystical forest ambient loop for RPG","stability","ambient","mysterious",30,75,"done",false,true,"music",50),
  g(aliceId,"Dungeon crawl horror tension music","beatoven","horror","tense",30,90,"done",false,false,"music",40),
  g(aliceId,"Victory fanfare short loop","beatoven","action","triumphant",15,160,"done",true,false,"music",35),
  g(aliceId,"Space exploration sci-fi ambience","stability","ambient","calm",60,85,"done",false,true,"music",25),
  g(aliceId,"Fantasy tavern background music","beatoven","fantasy","cheerful",30,110,"done",false,false,"music",20),
  g(aliceId,"Stealth mission tense loop","stability","action","tense",30,95,"done",false,false,"music",15),
  g(aliceId,"Game over sad melody","beatoven","ambient","sad",15,60,"done",false,false,"music",5),
  g(pixelId,"8-bit retro platformer main theme","beatoven","chiptune","cheerful",30,150,"done",true,true,"music",42),
  g(pixelId,"Puzzle game chill background loop","stability","ambient","calm",60,80,"done",false,true,"music",38),
  g(pixelId,"Racing game adrenaline track","beatoven","action","intense",30,175,"done",false,false,"music",30),
  g(pixelId,"Cute village town theme for mobile game","stability","fantasy","cheerful",30,100,"done",false,true,"music",22),
  g(pixelId,"Battle intro stinger 15 seconds","beatoven","action","epic",15,130,"done",false,false,"music",18),
  g(pixelId,"End credits emotional piano theme","stability","ambient","emotional",60,70,"done",false,false,"music",8),
  g(sfxId,"Sword slash impact with reverb","elevenlabs","sfx","impact",3,0,"done",false,false,"sfx",28),
  g(sfxId,"Magic spell cast whoosh sparkle","elevenlabs","sfx","magic",2,0,"done",false,false,"sfx",24),
  g(sfxId,"Footsteps on wooden floor","elevenlabs","sfx","ambient",5,0,"done",false,false,"sfx",20),
  g(sfxId,"Explosion with debris falloff","elevenlabs","sfx","impact",4,0,"done",true,false,"sfx",15),
  g(sfxId,"Dark atmospheric horror drone","stability","horror","dark",30,60,"done",false,true,"music",10),
  g(sfxId,"Tense investigation theme","beatoven","ambient","tense",30,80,"done",false,false,"music",5),
  g(indieId,"Indie game main menu chill loop","beatoven","ambient","calm",30,90,"done",false,true,"music",12),
  g(indieId,"Boss fight metal rock guitar riff","beatoven","action","intense",30,160,"done",false,false,"music",7),
  { _id:new ObjectId(), userId:indieId, prompt:"Broken generation test", provider:"beatoven",
    style:"action", mood:"epic", duration:30, status:"failed", bpm:120, creditCost:5,
    isFavorited:false, isPublic:false, type:"music", audioUrl:undefined,
    jobId:"demo_job_failed", failReason:"Provider timeout after 300s", failedAt:d(3),
    _demo:true, createdAt:d(3), updatedAt:d(3) },
];
db.generations.insertMany(gens);
print("   ✓ generations: "+gens.length+" belge");

function u(uid,name,size,dur,dago) {
  const id = new ObjectId();
  return { _id:id, userId:uid, originalName:name,
    audioUrl:BASE+"/demo_upl_"+id.toString()+".wav",
    mimeType:"audio/wav", fileSize:size, duration:dur, isFavorited:false,
    _demo:true, createdAt:d(dago) };
}
const uploads = [
  u(aliceId,"recorded_guitar_loop.wav",8388608,45,48),
  u(aliceId,"field_recording_rain.wav",5242880,120,35),
  u(aliceId,"synth_bass_oneshot.wav",2097152,8,20),
  u(pixelId,"retro_beep_pack.wav",4194304,30,40),
  u(pixelId,"chiptune_drums.wav",3145728,22,25),
  u(indieId,"guitar_riff_raw.wav",6291456,38,10),
  u(indieId,"voice_over_test.wav",1048576,12,8),
  u(indieId,"ambient_drone_raw.wav",2621440,90,5),
];
db.uploads.insertMany(uploads);
print("   ✓ uploads: "+uploads.length+" belge");

const logs = [
  {_id:new ObjectId(),userId:aliceId,amount:100, type:"earn", reason:"Kayıt bonusu",           balanceAfter:100, _demo:true,createdAt:d(60)},
  {_id:new ObjectId(),userId:aliceId,amount:500, type:"earn", reason:"Kredi paketi satın alma", balanceAfter:600, _demo:true,createdAt:d(55)},
  {_id:new ObjectId(),userId:aliceId,amount:-5,  type:"spend",reason:"Üretim: beatoven 30s",    balanceAfter:595, _demo:true,createdAt:d(55)},
  {_id:new ObjectId(),userId:aliceId,amount:-8,  type:"spend",reason:"Üretim: beatoven 60s",    balanceAfter:587, _demo:true,createdAt:d(40)},
  {_id:new ObjectId(),userId:aliceId,amount:-200,type:"spend",reason:"Toplu üretim (5 adet)",   balanceAfter:387, _demo:true,createdAt:d(20)},
  {_id:new ObjectId(),userId:pixelId,amount:100, type:"earn", reason:"Kayıt bonusu",            balanceAfter:100, _demo:true,createdAt:d(45)},
  {_id:new ObjectId(),userId:pixelId,amount:200, type:"earn", reason:"Kredi paketi satın alma",  balanceAfter:300, _demo:true,createdAt:d(44)},
  {_id:new ObjectId(),userId:pixelId,amount:-30, type:"spend",reason:"6 üretim",                balanceAfter:270, _demo:true,createdAt:d(22)},
  {_id:new ObjectId(),userId:sfxId,  amount:100, type:"earn", reason:"Kayıt bonusu",            balanceAfter:100, _demo:true,createdAt:d(30)},
  {_id:new ObjectId(),userId:sfxId,  amount:200, type:"earn", reason:"Kredi paketi satın alma",  balanceAfter:300, _demo:true,createdAt:d(29)},
  {_id:new ObjectId(),userId:sfxId,  amount:-4,  type:"spend",reason:"4 SFX üretimi",           balanceAfter:296, _demo:true,createdAt:d(15)},
  {_id:new ObjectId(),userId:indieId,amount:100, type:"earn", reason:"Kayıt bonusu",            balanceAfter:100, _demo:true,createdAt:d(14)},
  {_id:new ObjectId(),userId:indieId,amount:-5,  type:"spend",reason:"Üretim: beatoven 30s",    balanceAfter:95,  _demo:true,createdAt:d(12)},
  {_id:new ObjectId(),userId:indieId,amount:-10, type:"spend",reason:"2 üretim",                balanceAfter:85,  _demo:true,createdAt:d(7)},
];
db.credit_logs.insertMany(logs);
print("   ✓ credit_logs: "+logs.length+" belge");

db.collections.insertMany([
  { _id:new ObjectId(), userId:aliceId, name:"⚔️ Battle Themes",
    items:[{refId:gens[0]._id.toString(),refModel:"Generation",addedAt:d(50)},{refId:gens[3]._id.toString(),refModel:"Generation",addedAt:d(34)}],
    _demo:true, createdAt:d(54) },
  { _id:new ObjectId(), userId:aliceId, name:"🌿 Ambient Loops",
    items:[{refId:gens[1]._id.toString(),refModel:"Generation",addedAt:d(49)},{refId:gens[4]._id.toString(),refModel:"Generation",addedAt:d(24)},{refId:uploads[1]._id.toString(),refModel:"Upload",addedAt:d(34)}],
    _demo:true, createdAt:d(53) },
  { _id:new ObjectId(), userId:pixelId, name:"🎮 Game Jam Pack",
    items:[{refId:gens[8]._id.toString(),refModel:"Generation",addedAt:d(40)},{refId:gens[9]._id.toString(),refModel:"Generation",addedAt:d(37)},{refId:gens[11]._id.toString(),refModel:"Generation",addedAt:d(21)}],
    _demo:true, createdAt:d(42) },
]);
print("   ✓ collections: 3 belge");

db.daw_projects.insertMany([
  { _id:new ObjectId(), userId:aliceId, name:"Epic Boss Fight", bpm:140,
    tracks:[
      {id:"t1",name:"Orchestral Main",audioUrl:gens[0].audioUrl,clips:[{id:"c1",trackId:"t1",startBar:0,durationBars:16,audioOffset:0}]},
      {id:"t2",name:"Tension Layer",  audioUrl:gens[2].audioUrl,clips:[{id:"c2",trackId:"t2",startBar:8,durationBars:8, audioOffset:0}]},
      {id:"t3",name:"Victory Stinger",audioUrl:gens[3].audioUrl,clips:[{id:"c3",trackId:"t3",startBar:16,durationBars:4,audioOffset:0}]},
    ], masterVolume:0.9, isPublic:false, _demo:true, createdAt:d(30), updatedAt:d(2) },
  { _id:new ObjectId(), userId:aliceId, name:"Dungeon Ambience", bpm:80,
    tracks:[
      {id:"t1",name:"Dark Drone",  audioUrl:gens[2].audioUrl, clips:[{id:"c1",trackId:"t1",startBar:0,durationBars:32,audioOffset:0}]},
      {id:"t2",name:"Rain Texture",audioUrl:uploads[1].audioUrl,clips:[{id:"c2",trackId:"t2",startBar:0,durationBars:32,audioOffset:0}]},
    ], masterVolume:0.7, isPublic:true, shareToken:"demo_share_dungeon_abc123",
    _demo:true, createdAt:d(20), updatedAt:d(1) },
  { _id:new ObjectId(), userId:pixelId, name:"Retro Platformer OST", bpm:150,
    tracks:[
      {id:"t1",name:"8-bit Main",    audioUrl:gens[8].audioUrl, clips:[{id:"c1",trackId:"t1",startBar:0,durationBars:16,audioOffset:0}]},
      {id:"t2",name:"Chiptune Drums",audioUrl:uploads[4].audioUrl,clips:[{id:"c2",trackId:"t2",startBar:0,durationBars:16,audioOffset:0}]},
    ], masterVolume:0.85, isPublic:false, _demo:true, createdAt:d(18), updatedAt:d(3) },
]);
print("   ✓ daw_projects: 3 belge");
print("   MongoDB tamamlandı.");
'

echo ""
echo "🐘  PostgreSQL demo verisi ekleniyor..."

# ── 2. MongoDB'den ID ve URL bilgilerini al ────────────────────────────────────
ALICE_ID=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval 'print(db.users.findOne({email:"alice@demo.sonaralabs.test"})._id.toString())' 2>/dev/null | tail -1)
PIXEL_ID=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval 'print(db.users.findOne({email:"pixel@demo.sonaralabs.test"})._id.toString())' 2>/dev/null | tail -1)
SFX_ID=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval 'print(db.users.findOne({email:"sfx@demo.sonaralabs.test"})._id.toString())' 2>/dev/null | tail -1)
INDIE_ID=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval 'print(db.users.findOne({email:"indie@demo.sonaralabs.test"})._id.toString())' 2>/dev/null | tail -1)

echo "   User ID'leri: alice=$ALICE_ID pixel=$PIXEL_ID sfx=$SFX_ID indie=$INDIE_ID"

# isPublic:true generation'lardan audioUrl ve genId al → tek satır, | ayrımlı
GEN_DATA=$(docker exec sonaralabs20-mongo-1 mongosh "$MONGO_DSN" \
  --quiet --eval '
db.generations.find({_demo:true,isPublic:true,status:"done"},{_id:1,userId:1,audioUrl:1,style:1,bpm:1,duration:1}).toArray().forEach(function(r){
  print(r.userId.toString()+"|"+r._id.toString()+"|"+r.audioUrl+"|"+r.style+"|"+r.bpm+"|"+r.duration);
});
' 2>/dev/null | grep -E '^[a-f0-9]{24}\|')

echo "   isPublic generation'lar: $(echo "$GEN_DATA" | wc -l | tr -d ' ') adet"

# ── 3. public_tracks INSERT SQL'ini oluştur ────────────────────────────────────
# Her track için bilgileri sabit tanımla, audioUrl ve genId'yi GEN_DATA'dan bul
TRACKS_SQL=""

# Track tanımları: userId|title|genre_tags|mood_tags|game_type_tags|like_count|is_loop|daysAgo|aranan_style
declare -a TRACK_DEFS=(
  "${ALICE_ID}|Epic Boss Fight – Orchestral|ARRAY['orchestral','action']|ARRAY['intense','epic']|ARRAY['rpg','action']|24|true|55|action"
  "${ALICE_ID}|Mystical Forest Ambient|ARRAY['ambient']|ARRAY['mysterious','calm']|ARRAY['rpg']|18|true|50|ambient"
  "${ALICE_ID}|Space Exploration Sci-Fi|ARRAY['ambient','sci-fi']|ARRAY['calm']|ARRAY['space','strategy']|31|true|25|ambient"
  "${PIXEL_ID}|8-Bit Platformer Main Theme|ARRAY['chiptune','retro']|ARRAY['cheerful','energetic']|ARRAY['platformer']|42|true|42|chiptune"
  "${PIXEL_ID}|Puzzle Game Chill Loop|ARRAY['ambient','casual']|ARRAY['calm','relaxed']|ARRAY['puzzle']|19|true|38|ambient"
  "${PIXEL_ID}|Cute Village Town Theme|ARRAY['fantasy','casual']|ARRAY['cheerful']|ARRAY['mobile','rpg']|27|true|22|fantasy"
  "${SFX_ID}|Dark Atmospheric Horror Drone|ARRAY['horror','ambient']|ARRAY['tense','dark']|ARRAY['horror']|15|true|10|horror"
  "${INDIE_ID}|Indie Game Main Menu Loop|ARRAY['ambient','indie']|ARRAY['calm','nostalgic']|ARRAY['indie','casual']|8|true|12|ambient"
)

for def in "${TRACK_DEFS[@]}"; do
  IFS='|' read -r T_UID T_TITLE T_GENRES T_MOODS T_GTYPES T_LIKES T_LOOP T_DAGO T_STYLE <<< "$def"

  # Bu userId + style kombinasyonu için gen kaydını bul
  T_GEN_LINE=$(echo "$GEN_DATA" | grep "^${T_UID}|" | grep "|${T_STYLE}|" | head -1)

  if [ -n "$T_GEN_LINE" ]; then
    T_GEN_ID=$(echo "$T_GEN_LINE" | cut -d'|' -f2)
    T_AUDIO=$(echo "$T_GEN_LINE"  | cut -d'|' -f3)
    T_BPM=$(echo "$T_GEN_LINE"    | cut -d'|' -f5)
    T_DUR=$(echo "$T_GEN_LINE"    | cut -d'|' -f6)
  else
    # Fallback
    T_GEN_ID="000000000000000000000000"
    T_AUDIO="http://localhost:9000/sonaralabs-audio/demo_fallback_${T_UID}_${T_STYLE}.wav"
    T_BPM=100
    T_DUR=30
  fi

  # Username'i user_id'ye göre belirle
  case "$T_UID" in
    "$ALICE_ID") T_USERNAME="alice_composer" ;;
    "$PIXEL_ID") T_USERNAME="pixel_beats" ;;
    "$SFX_ID")   T_USERNAME="sfx_master" ;;
    "$INDIE_ID") T_USERNAME="indie_dev" ;;
    *)           T_USERNAME="demo_user" ;;
  esac

  TRACKS_SQL="${TRACKS_SQL}
INSERT INTO public_tracks
  (user_id, username, generation_id, title, audio_url, duration_sec, bpm,
   genre_tags, mood_tags, game_type_tags, like_count, is_loop, created_at)
VALUES (
  '${T_UID}', '${T_USERNAME}', '${T_GEN_ID}',
  '$(echo "$T_TITLE" | sed "s/'/''/g")',
  '${T_AUDIO}',
  ${T_DUR}, ${T_BPM},
  ${T_GENRES}, ${T_MOODS}, ${T_GTYPES},
  ${T_LIKES}, ${T_LOOP},
  NOW() - INTERVAL '${T_DAGO} days'
);"
done

# ── 4. PostgreSQL'e tüm veriyi ekle ───────────────────────────────────────────
docker exec -i sonaralabs20-postgres-1 psql -U sonaralabs -d sonaralabs <<PGSQL
-- Profiller
INSERT INTO user_profiles
  (user_id, username, display_name, bio, avatar_url, game_genres, is_public,
   follower_count, following_count, track_count, created_at)
VALUES
  ('${ALICE_ID}', 'alice_composer', 'Alice Composer',
   'Game music composer & sound designer. RPG/Horror specialist. 🎼',
   NULL, ARRAY['rpg','horror','action'], true, 3, 2, 3, NOW() - INTERVAL '60 days'),
  ('${PIXEL_ID}', 'pixel_beats', 'Pixel Beats',
   'Chiptune & retro game music. Game jam regular 🎮',
   NULL, ARRAY['platformer','puzzle','mobile'], true, 2, 1, 3, NOW() - INTERVAL '45 days'),
  ('${SFX_ID}', 'sfx_master', 'SFX Master',
   'Procedural SFX & atmospheric sound design.',
   NULL, ARRAY['horror','action'], true, 1, 1, 1, NOW() - INTERVAL '30 days'),
  ('${INDIE_ID}', 'indie_dev', 'Indie Dev',
   'Solo dev building a metroidvania. Music & code both! 🕹️',
   NULL, ARRAY['indie','action'], true, 0, 1, 1, NOW() - INTERVAL '14 days')
ON CONFLICT (user_id) DO NOTHING;
PGSQL

# Tracks SQL'i ayrı çalıştır
echo "$TRACKS_SQL" | docker exec -i sonaralabs20-postgres-1 psql -U sonaralabs -d sonaralabs -q

# Follows + likes + feed events
docker exec -i sonaralabs20-postgres-1 psql -U sonaralabs -d sonaralabs <<PGSQL
-- Follows
INSERT INTO follows (follower_id, followee_id) VALUES
  ('${ALICE_ID}', '${PIXEL_ID}'),
  ('${ALICE_ID}', '${SFX_ID}'),
  ('${PIXEL_ID}', '${ALICE_ID}'),
  ('${PIXEL_ID}', '${INDIE_ID}'),
  ('${SFX_ID}',   '${ALICE_ID}'),
  ('${INDIE_ID}', '${ALICE_ID}')
ON CONFLICT DO NOTHING;

-- Track likes + feed events (track sıralamasına göre)
DO \$\$
DECLARE
  tids  uuid[];
  alice text := '${ALICE_ID}';
  pixel text := '${PIXEL_ID}';
  sfx   text := '${SFX_ID}';
  indie text := '${INDIE_ID}';
BEGIN
  SELECT ARRAY(SELECT id FROM public_tracks ORDER BY created_at ASC) INTO tids;

  IF array_length(tids, 1) IS NULL OR array_length(tids, 1) < 1 THEN
    RAISE NOTICE 'public_tracks boş — likes ve feed events atlandı';
    RETURN;
  END IF;

  -- Likes (var olan track'ler için güvenli indeksleme)
  FOR i IN 1..array_length(tids,1) LOOP
    CASE i
      WHEN 1 THEN  -- boss fight
        INSERT INTO track_likes VALUES (pixel,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (sfx,  tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (indie,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 2 THEN  -- forest ambient
        INSERT INTO track_likes VALUES (pixel,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (indie,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 3 THEN  -- space sci-fi
        INSERT INTO track_likes VALUES (pixel,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (sfx,  tids[i]) ON CONFLICT DO NOTHING;
      WHEN 4 THEN  -- 8-bit platformer
        INSERT INTO track_likes VALUES (alice,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (sfx,  tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (indie,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 5 THEN  -- puzzle chill
        INSERT INTO track_likes VALUES (alice,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 6 THEN  -- village town
        INSERT INTO track_likes VALUES (alice,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (pixel,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 7 THEN  -- horror drone
        INSERT INTO track_likes VALUES (alice,tids[i]) ON CONFLICT DO NOTHING;
        INSERT INTO track_likes VALUES (pixel,tids[i]) ON CONFLICT DO NOTHING;
      WHEN 8 THEN  -- indie menu
        INSERT INTO track_likes VALUES (alice,tids[i]) ON CONFLICT DO NOTHING;
      ELSE NULL;
    END CASE;
  END LOOP;

  -- Feed events
  -- Sütun sırası: recipient_id, actor_id, actor_username, verb, object_type, object_id, object_title, created_at
  -- alice'i takip edenler: pixel, sfx, indie → alice'in aksiyonları onlara gider
  -- pixel'i takip edenler: alice → pixel'in aksiyonları alice'e gider
  IF array_length(tids,1) >= 1 THEN
    INSERT INTO feed_events (recipient_id, actor_id, actor_username, verb, object_type, object_id, object_title, created_at) VALUES
      -- alice published boss fight → pixel,sfx,indie
      (pixel, alice, 'alice_composer', 'published', 'track', tids[1]::text, 'Epic Boss Fight – Orchestral',  NOW()-INTERVAL '55 days'),
      (sfx,   alice, 'alice_composer', 'published', 'track', tids[1]::text, 'Epic Boss Fight – Orchestral',  NOW()-INTERVAL '55 days'),
      (indie, alice, 'alice_composer', 'published', 'track', tids[1]::text, 'Epic Boss Fight – Orchestral',  NOW()-INTERVAL '55 days'),
      -- alice published forest → pixel,sfx,indie
      (pixel, alice, 'alice_composer', 'published', 'track', tids[2]::text, 'Mystical Forest Ambient',       NOW()-INTERVAL '50 days'),
      (sfx,   alice, 'alice_composer', 'published', 'track', tids[2]::text, 'Mystical Forest Ambient',       NOW()-INTERVAL '50 days'),
      (indie, alice, 'alice_composer', 'published', 'track', tids[2]::text, 'Mystical Forest Ambient',       NOW()-INTERVAL '50 days'),
      -- pixel followed alice → alice
      (alice, pixel, 'pixel_beats',    'followed',  'user',  alice,         '',                               NOW()-INTERVAL '44 days'),
      -- pixel published 8-bit → alice
      (alice, pixel, 'pixel_beats',    'published', 'track', tids[4]::text, '8-Bit Platformer Main Theme',   NOW()-INTERVAL '42 days'),
      -- sfx followed alice → alice
      (alice, sfx,   'sfx_master',     'followed',  'user',  alice,         '',                               NOW()-INTERVAL '29 days'),
      -- alice published space sci-fi → pixel,sfx,indie
      (pixel, alice, 'alice_composer', 'published', 'track', tids[3]::text, 'Space Exploration Sci-Fi',      NOW()-INTERVAL '25 days'),
      (sfx,   alice, 'alice_composer', 'published', 'track', tids[3]::text, 'Space Exploration Sci-Fi',      NOW()-INTERVAL '25 days'),
      (indie, alice, 'alice_composer', 'published', 'track', tids[3]::text, 'Space Exploration Sci-Fi',      NOW()-INTERVAL '25 days'),
      -- pixel liked alice's track → alice
      (alice, pixel, 'pixel_beats',    'liked',     'track', tids[3]::text, 'Space Exploration Sci-Fi',      NOW()-INTERVAL '24 days'),
      -- pixel published puzzle + village → alice
      (alice, pixel, 'pixel_beats',    'published', 'track', tids[5]::text, 'Puzzle Game Chill Loop',        NOW()-INTERVAL '22 days'),
      (alice, pixel, 'pixel_beats',    'published', 'track', tids[6]::text, 'Cute Village Town Theme',       NOW()-INTERVAL '21 days'),
      -- indie followed alice → alice
      (alice, indie, 'indie_dev',      'followed',  'user',  alice,         '',                               NOW()-INTERVAL '13 days'),
      -- indie published → alice (indie'yi alice takip ediyor)
      (alice, indie, 'indie_dev',      'published', 'track', tids[8]::text, 'Indie Game Main Menu Loop',     NOW()-INTERVAL '12 days');
  END IF;
END;
\$\$;

SELECT '   ✓ user_profiles: ' || COUNT(*)::text || ' satır' FROM user_profiles;
SELECT '   ✓ public_tracks:  ' || COUNT(*)::text || ' satır' FROM public_tracks;
SELECT '   ✓ follows:        ' || COUNT(*)::text || ' satır' FROM follows;
SELECT '   ✓ track_likes:    ' || COUNT(*)::text || ' satır' FROM track_likes;
SELECT '   ✓ feed_events:    ' || COUNT(*)::text || ' satır' FROM feed_events;
PGSQL

echo "   PostgreSQL tamamlandı."
echo ""
echo "✅  Demo seed tamamlandı!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📧  Demo hesapları (şifre: Demo1234!)"
echo "    alice@demo.sonaralabs.test   │ admin │ 350 kredi │ @alice_composer"
echo "    pixel@demo.sonaralabs.test   │ user  │ 180 kredi │ @pixel_beats"
echo "    sfx@demo.sonaralabs.test     │ user  │ 250 kredi │ @sfx_master"
echo "    indie@demo.sonaralabs.test   │ user  │  80 kredi │ @indie_dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗑️   Temizlemek için: pnpm demo:clean"
echo ""
