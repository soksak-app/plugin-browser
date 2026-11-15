// The tests and the UI import the plugin API only through the specifiers that the fixture hook maps, and package.json declares no plugin API
// release: the plugin declares only engines.soksak as its relation to core. The tests import the UI from ui/ itself.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { MAPPED_SPECIFIERS } from "./fixtures/plugin-api/hooks.mjs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "node_modules" ? [] : walk(file)) : [file];
});
const sources = [...walk(path.join(root, "test")), ...walk(path.join(root, "ui"))].filter((file) => /\.(?:mjs|js)$/.test(file));
// The package name of a specifier: the scope and the name, or the name alone.
const packageOf = (specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

test("every SDK import of test/ and ui/ is a plugin API specifier that the fixture hook maps, and package.json declares none", () => {
  assert.equal(manifest.dependencies?.["@soksak/plugin-api"], undefined);
  assert.equal(manifest.devDependencies?.["@soksak/plugin-api"], undefined);
  const mapped = new Set(MAPPED_SPECIFIERS);
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import\()\s*["'`](@soksak\/[^"'`]+)["'`]/g)) {
      if (specifier.startsWith("@soksak/plugin-api")) {
        assert.ok(mapped.has(specifier), `${path.relative(root, file)} imports ${specifier}, which the fixture hook does not map`);
      } else {
        assert.ok(Object.keys(manifest.devDependencies ?? {}).includes(packageOf(specifier)), `${path.relative(root, file)} imports ${specifier}, which package.json does not declare`);
      }
    }
  }
});

test("no test file reads the build output, which the tests no longer build", () => {
  for (const file of sources.filter((name) => name.includes(`${path.sep}test${path.sep}`))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /build\/test/, path.relative(root, file));
  }
});
