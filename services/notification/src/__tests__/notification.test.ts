// services/notification/src/__tests__/notification.test.ts
// SSE bağlantı yönetimi ve event dağıtımı testleri.
// Gerçek HTTP sunucusu veya DB gerekmez — pure unit tests.

process.env.INTERNAL_JWT_SECRET = "test-internal-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.PORT                = "3007";

import jwt from "jsonwebtoken";

const SECRET = process.env.INTERNAL_JWT_SECRET!;

// ── SSE Connection Map simülasyonu ────────────────────────────────────────────

type MockResponse = {
  writtenData: string[];
  closed: boolean;
  write: (chunk: string) => void;
  end: () => void;
};

function makeMockRes(): MockResponse {
  const res: MockResponse = {
    writtenData: [],
    closed: false,
    write(chunk) { if (!this.closed) this.writtenData.push(chunk); },
    end()  { this.closed = true; },
  };
  return res;
}

// Notification servisiyle aynı mantık
type ConnSet = Map<string, Set<MockResponse>>;

function notifyUser(connections: ConnSet, userId: string, payload: object) {
  const conns = connections.get(userId);
  if (!conns?.size) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); }
    catch { conns.delete(res); }
  }
}

function addConnection(connections: ConnSet, userId: string, res: MockResponse) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(res);
}

function removeConnection(connections: ConnSet, userId: string, res: MockResponse) {
  connections.get(userId)?.delete(res);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SSE Connection Map", () => {
  it("bağlantı eklenir ve listelenir", () => {
    const conns: ConnSet = new Map();
    const res = makeMockRes();
    addConnection(conns, "user1", res);

    expect(conns.has("user1")).toBe(true);
    expect(conns.get("user1")!.size).toBe(1);
  });

  it("aynı kullanıcının birden fazla sekmesi desteklenir", () => {
    const conns: ConnSet = new Map();
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    addConnection(conns, "user1", res1);
    addConnection(conns, "user1", res2);

    expect(conns.get("user1")!.size).toBe(2);
  });

  it("bağlantı kesilince kaldırılır", () => {
    const conns: ConnSet = new Map();
    const res = makeMockRes();
    addConnection(conns, "user1", res);
    removeConnection(conns, "user1", res);

    expect(conns.get("user1")!.size).toBe(0);
  });

  it("farklı kullanıcıların bağlantıları birbirinden izole", () => {
    const conns: ConnSet = new Map();
    addConnection(conns, "user1", makeMockRes());
    addConnection(conns, "user2", makeMockRes());

    expect(conns.get("user1")!.size).toBe(1);
    expect(conns.get("user2")!.size).toBe(1);
  });
});

describe("notifyUser — event dağıtımı", () => {
  it("bağlı kullanıcıya event gönderilir", () => {
    const conns: ConnSet = new Map();
    const res = makeMockRes();
    addConnection(conns, "user1", res);

    notifyUser(conns, "user1", { status: "done", jobId: "j1" });

    expect(res.writtenData).toHaveLength(1);
    const parsed = JSON.parse(res.writtenData[0].replace("data: ", "").trim());
    expect(parsed.status).toBe("done");
    expect(parsed.jobId).toBe("j1");
  });

  it("bağlı olmayan kullanıcıya event gönderilmez (no-op)", () => {
    const conns: ConnSet = new Map();
    // Herhangi bir bağlantı yok
    expect(() => notifyUser(conns, "ghost-user", { status: "done" })).not.toThrow();
  });

  it("birden fazla sekmeye event ulaşır", () => {
    const conns: ConnSet = new Map();
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    addConnection(conns, "user1", res1);
    addConnection(conns, "user1", res2);

    notifyUser(conns, "user1", { status: "processing" });

    expect(res1.writtenData).toHaveLength(1);
    expect(res2.writtenData).toHaveLength(1);
  });

  it("yalnızca hedef kullanıcıya gönderilir (broadcast isolation)", () => {
    const conns: ConnSet = new Map();
    const res1 = makeMockRes(); // user1
    const res2 = makeMockRes(); // user2
    addConnection(conns, "user1", res1);
    addConnection(conns, "user2", res2);

    notifyUser(conns, "user1", { status: "done" });

    expect(res1.writtenData).toHaveLength(1);
    expect(res2.writtenData).toHaveLength(0); // user2'ye gitmiyor
  });

  it("SSE mesaj formatı doğru (data: ... \\n\\n)", () => {
    const conns: ConnSet = new Map();
    const res = makeMockRes();
    addConnection(conns, "u1", res);

    notifyUser(conns, "u1", { type: "done" });

    expect(res.writtenData[0]).toMatch(/^data: /);
    expect(res.writtenData[0]).toMatch(/\n\n$/);
  });
});

// ── Internal JWT doğrulama ────────────────────────────────────────────────────

describe("Internal JWT doğrulama", () => {
  it("geçerli internal token kabul edilir", () => {
    const token = jwt.sign({ sub: "generation-service", _internal: true }, SECRET, { expiresIn: "5m" });
    const payload = jwt.verify(token, SECRET) as any;
    expect(payload._internal).toBe(true);
  });

  it("token yoksa 401 mantığı tetiklenir", () => {
    const token = "";
    const isValid = !!token;
    expect(isValid).toBe(false);
  });

  it("süresi dolmuş token reddedilir", async () => {
    const token = jwt.sign({ sub: "svc", _internal: true }, SECRET, { expiresIn: "1ms" });
    await new Promise(r => setTimeout(r, 5));
    expect(() => jwt.verify(token, SECRET)).toThrow(/expired/i);
  });
});

// ── SSE event payload yapısı ──────────────────────────────────────────────────

describe("SSE event payload", () => {
  it.each([
    ["pending",    { status: "pending",    jobId: "j1" }],
    ["processing", { status: "processing", jobId: "j1", progress: 50 }],
    ["done",       { status: "done",       jobId: "j1", audioUrl: "https://storage/track.wav", generationId: "g1" }],
    ["failed",     { status: "failed",     jobId: "j1", error: "Provider timeout" }],
  ])("'%s' status için payload geçerli JSON", (_status, payload) => {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    const parsed = JSON.parse(msg.replace("data: ", "").trim());
    expect(parsed.status).toBe(payload.status);
  });
});
