// One-off backup script: dumps every collection in the configured database to backups/<timestamp>/<collection>.json (MongoDB Extended JSON, so ObjectIds and dates can be restored exactly).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";

// Resolve the output folder at the project root (one level above server/), which is git-ignored.
const BACKUP_ROOT = path.resolve(process.cwd(), "..", "backups");

async function main() {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database handle is not available after connecting.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const { EJSON } = mongoose.mongo.BSON;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const summary: Record<string, number> = {};

  try {
    for (const { name } of collections) {
      const docs = await db.collection(name).find({}).toArray();
      // Canonical (non-relaxed) output keeps types such as ObjectId and Date.
      fs.writeFileSync(
        path.join(outDir, `${name}.json`),
        EJSON.stringify(docs, { relaxed: false }, 2),
      );
      summary[name] = docs.length;
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(`[backup] Wrote ${Object.keys(summary).length} collection(s) to ${outDir}`);
  for (const [name, count] of Object.entries(summary)) {
    console.log(`[backup]   ${name}: ${count} document(s)`);
  }
}

main().catch(async (err) => {
  console.error("[backup] Failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
