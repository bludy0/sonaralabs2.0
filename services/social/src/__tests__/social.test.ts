// Güncel MongoDB + Hono social servisini gerçek route'lar üzerinden test eder.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.MONGO_URI = "mongodb://placeholder/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.PORT = "3009";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app, socialModels } from "../index";

const SECRET = process.env.INTERNAL_JWT_SECRET!;
const { Profile, PublicTrackModel, Follow, TrackLike, FeedEventModel } = socialModels;
let mongod: MongoMemoryServer;

function token(userId: string, internal = true) {
  return jwt.sign({ sub: userId, role: "user", ...(internal ? { _internal: true } : {}) }, SECRET, { expiresIn: "5m" });
}

function authHeaders(userId: string) {
  return { "x-internal-token": token(userId), "content-type": "application/json" };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    Profile.syncIndexes(), PublicTrackModel.syncIndexes(), Follow.syncIndexes(),
    TrackLike.syncIndexes(), FeedEventModel.syncIndexes(),
  ]);
});

afterEach(async () => {
  await Promise.all([
    Profile.deleteMany({}), PublicTrackModel.deleteMany({}), Follow.deleteMany({}),
    TrackLike.deleteMany({}), FeedEventModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Social health ve internal auth", () => {
  it("health endpoint servis bilgisini döner", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "social" });
  });

  it("token olmadan private profile endpoint'ini reddeder", async () => {
    const response = await app.request("/profile/me");
    expect(response.status).toBe(401);
  });

  it("internal secret ile imzalı fakat _internal flag olmayan tokenı reddeder", async () => {
    const response = await app.request("/profile/me", {
      headers: { "x-internal-token": token("user-1", false) },
    });
    expect(response.status).toBe(401);
  });
});

describe("Profile routes", () => {
  it("GET /profile/me profili yoksa MongoDB'de oluşturur", async () => {
    const response = await app.request("/profile/me", { headers: authHeaders("user-12345678") });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.data.username).toBe("user_12345678");
    expect(await Profile.countDocuments({ userId: "user-12345678" })).toBe(1);
  });

  it("PUT /profile/me yalnızca token sahibinin profilini günceller", async () => {
    await Profile.create({ userId: "owner", username: "old-name" });
    await Profile.create({ userId: "other", username: "other-name" });

    const response = await app.request("/profile/me", {
      method: "PUT",
      headers: authHeaders("owner"),
      body: JSON.stringify({ username: "new-name", bio: "Game composer" }),
    });

    expect(response.status).toBe(200);
    expect((await Profile.findOne({ userId: "owner" }))!.username).toBe("new-name");
    expect((await Profile.findOne({ userId: "other" }))!.username).toBe("other-name");
  });
});

describe("Public track routes", () => {
  it("track yayınlarken username'i client yerine profilden alır ve waveform'u sınırlar", async () => {
    await Profile.create({ userId: "publisher", username: "trusted-name" });

    const response = await app.request("/tracks", {
      method: "POST",
      headers: authHeaders("publisher"),
      body: JSON.stringify({
        username: "spoofed-name",
        title: "Battle Loop",
        audioUrl: "https://audio.test/battle.wav",
        waveformData: Array.from({ length: 2_500 }, (_, i) => i / 2_500),
      }),
    });
    const body = await response.json() as any;

    expect(response.status).toBe(201);
    expect(body.data.username).toBe("trusted-name");
    expect(body.data.waveformData).toHaveLength(2_000);
  });

  it("GET /tracks MongoDB filtreleme ve sayfalama uygular", async () => {
    await PublicTrackModel.insertMany([
      { userId: "u1", username: "one", title: "Battle One", audioUrl: "a", genreTags: ["action"], moodTags: ["epic"] },
      { userId: "u2", username: "two", title: "Quiet Cave", audioUrl: "b", genreTags: ["ambient"], moodTags: ["calm"] },
      { userId: "u3", username: "three", title: "Battle Two", audioUrl: "c", genreTags: ["action"], moodTags: ["dark"] },
    ]);

    const response = await app.request("/tracks?genre=action&q=Battle&page=1&limit=1");
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(2);
    expect(body.data.pages).toBe(2);
  });

  it("like toggle sayacı negatife düşürmeden like/unlike yapar", async () => {
    const track = await PublicTrackModel.create({
      userId: "owner", username: "owner", title: "Loop", audioUrl: "audio", likeCount: 0,
    });

    const like = await app.request(`/tracks/${track._id}/like`, {
      method: "POST", headers: authHeaders("listener"),
    });
    const unlike = await app.request(`/tracks/${track._id}/like`, {
      method: "POST", headers: authHeaders("listener"),
    });

    expect((await like.json() as any).data).toMatchObject({ liked: true, likeCount: 1 });
    expect((await unlike.json() as any).data).toMatchObject({ liked: false, likeCount: 0 });
    expect(await TrackLike.countDocuments()).toBe(0);
  });

  it("başka kullanıcıya ait track silinemez", async () => {
    const track = await PublicTrackModel.create({ userId: "owner", username: "owner", title: "Loop", audioUrl: "audio" });
    const response = await app.request(`/tracks/${track._id}`, {
      method: "DELETE", headers: authHeaders("attacker"),
    });

    expect(response.status).toBe(404);
    expect(await PublicTrackModel.countDocuments({ _id: track._id })).toBe(1);
  });
});

describe("Follow routes", () => {
  it("follow/unfollow toggle MongoDB kaydını ve sayaçları günceller", async () => {
    await Profile.insertMany([
      { userId: "follower", username: "follower-name" },
      { userId: "followee", username: "followee-name" },
    ]);

    const follow = await app.request("/follow/followee", { method: "POST", headers: authHeaders("follower") });
    expect((await follow.json() as any).data.following).toBe(true);
    expect(await Follow.countDocuments({ followerId: "follower", followeeId: "followee" })).toBe(1);

    const unfollow = await app.request("/follow/followee", { method: "POST", headers: authHeaders("follower") });
    expect((await unfollow.json() as any).data.following).toBe(false);
    expect(await Follow.countDocuments()).toBe(0);

    const [follower, followee] = await Promise.all([
      Profile.findOne({ userId: "follower" }),
      Profile.findOne({ userId: "followee" }),
    ]);
    expect(follower!.followingCount).toBe(0);
    expect(followee!.followerCount).toBe(0);
  });

  it("kullanıcının kendisini takip etmesini reddeder", async () => {
    const response = await app.request("/follow/same-user", {
      method: "POST", headers: authHeaders("same-user"),
    });
    expect(response.status).toBe(400);
  });

  it("feed event modeli kullanıcı ve tarih indeksli kayıt tutar", async () => {
    await FeedEventModel.create({
      recipientId: "recipient", actorId: "actor", verb: "published",
      objectType: "track", objectId: "track-1",
    });
    expect(await FeedEventModel.countDocuments({ recipientId: "recipient" })).toBe(1);
  });
});
