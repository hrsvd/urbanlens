#!/usr/bin/env node

/**
 * Runs ingest-data.mjs for every registered locality sequentially.
 * Sequential (not parallel) to avoid hammering Overpass and Open-Meteo.
 *
 * Usage:
 *   node scripts/ingest-all.mjs
 *   node scripts/ingest-all.mjs --skip hsr          # skip already-done
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCALITIES = ["hsr", "koramangala", "indiranagar", "whitefield", "jpnagar", "marathahalli", "bellandur", "hebbal"];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipIdx = args.indexOf("--skip");
const skip = skipIdx !== -1 ? args.slice(skipIdx + 1).filter((a) => !a.startsWith("--")) : [];

for (const localityId of LOCALITIES) {
  if (skip.includes(localityId)) {
    console.log(`\nskip   ${localityId} (--skip flag)`);
    continue;
  }
  console.log(`\n${"─".repeat(60)}`);
  console.log(`ingest ${localityId}`);
  console.log("─".repeat(60));
  try {
    execSync(`node ${path.join(ROOT, "scripts", "ingest-data.mjs")} --locality ${localityId}`, {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch (error) {
    console.error(`\nFailed to ingest ${localityId}: ${String(error)}`);
    console.error("Continuing with remaining localities...");
  }
}

console.log("\nAll localities processed.");
