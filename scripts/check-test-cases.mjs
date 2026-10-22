// Compares the case copies in test/fixtures/sdk-cases with the contract files of the pinned @soksak/plugin-api. A copy
// that differs from the published file, or a file that the pinned release does not publish, fails the check. The check
// reads the package only; the tests never read it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.resolve(process.env.CORE_PLUGIN_API_DIR || path.join(root, "node_modules", "@soksak", "plugin-api"));
const copies = path.join(root, "test", "fixtures", "sdk-cases");
const published = path.join(apiDir, "contract");
let compared = 0;
for (const name of fs.readdirSync(copies).filter((file) => file.endsWith(".json"))) {
  const publishedPath = path.join(published, name);
  if (!fs.existsSync(publishedPath)) throw new Error(`the pinned API does not publish contract file contract/${name}`);
  const copied = JSON.parse(fs.readFileSync(path.join(copies, name), "utf8"));
  const release = JSON.parse(fs.readFileSync(publishedPath, "utf8"));
  assert.deepEqual(copied, release, `copied case file ${name} differs from the pinned API`);
  compared += 1;
}
console.log(`Test case copies match the pinned API: ${compared} files`);
