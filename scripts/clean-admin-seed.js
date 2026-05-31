// Removes all temporary admin demo data created by the chart seed.
// Run: mongosh "mongodb://localhost:27017/sonaralabs" scripts/clean-admin-seed.js
const ADMIN = ObjectId("69ee792e3a7cb3602128ceb0");
let removed = 0;
["generations", "creditlogs", "credit_logs", "uploads", "publictracks", "collections"].forEach(c => {
  const r = db.getCollection(c).deleteMany({ isSeed: true });
  removed += r.deletedCount;
  print(c + ": removed " + r.deletedCount);
});
db.users.updateOne({ _id: ADMIN }, { $set: { storageUsed: 0 } });
print("admin storageUsed reset to 0");
print("TOTAL removed: " + removed);
