// One-off cutover script: removes the old library collections (`sprites`, `sprite_versions`) after the integration replaced them with projects and icons. Shows what would be dropped; only drops when run with --confirm. Take `npm run backup:db` first (it dumps every collection).
import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";

const LEGACY = ["sprites", "sprite_versions"];

async function main() {
  const confirm = process.argv.includes("--confirm");
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database handle is not available after connecting.");

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  try {
    for (const name of LEGACY) {
      if (!existing.has(name)) {
        console.log(`[cutover] ${name}: not present, nothing to do`);
        continue;
      }
      const count = await db.collection(name).countDocuments();
      if (!confirm) {
        console.log(`[cutover] ${name}: ${count} documents would be dropped (run again with --confirm)`);
        continue;
      }
      await db.dropCollection(name);
      console.log(`[cutover] ${name}: dropped (${count} documents)`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[cutover] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
