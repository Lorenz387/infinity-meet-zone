import { copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const from = join(root, "node_modules/@electric-sql/pglite/dist");
const names = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const hits = [];

function walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const path = join(dir, name);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (name === "node_modules" && dir !== root) continue;
      walk(path);
    } else if (name.includes("electric-sql__pglite") && name.endsWith(".mjs")) {
      hits.push(path);
    }
  }
}

walk(join(root, ".vercel/output"));
walk(join(root, "node_modules/.nitro"));
for (const file of hits) {
  for (const name of names) copyFileSync(join(from, name), join(dirname(file), name));
}
console.log(`[pglite] placed runtime files next to ${hits.length} bundle(s)`);
