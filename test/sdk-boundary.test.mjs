// The tests of this plugin do not load the SDK. Each test file imports the UI through build/test/ui, whose SDK imports
// are rewritten to the models of test/sdk-models (scripts/build-test.mjs), and no test file names an @soksak/ specifier.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "fixtures" ? [] : walk(file)) : [file];
});
const testSources = walk(testRoot).filter((file) => /\.mjs$/.test(file) && !file.includes(`${path.sep}sdk-models${path.sep}`));

test("no test file imports an SDK package", () => {
  for (const file of testSources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from|import\()\s*["'`]@soksak\//, path.relative(testRoot, file));
  }
});

test("no test file imports the UI source instead of the test tree", () => {
  for (const file of testSources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from|import\()\s*["'`]\.\.\/ui\//, path.relative(testRoot, file));
  }
});

// The SDK needle is built from parts, so this file does not contain it. The guard reports each line of test/ that contains it.
const SDK_NEEDLE = "@soksak/" + "plugin-api";

function everyFile(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? everyFile(file) : [file];
  });
}

test("no line of test/ contains the SDK needle", () => {
  const found = [];
  for (const file of everyFile(testRoot)) {
    readFileSync(file, "utf8").split("\n").forEach((line, index) => {
      if (line.includes(SDK_NEEDLE)) found.push(`${path.relative(testRoot, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
