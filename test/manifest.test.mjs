import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// The manifest fields that this plugin and its page rely on; the SDK validator of the manifest runs in make check.
test("plugin.json declares the fields that the plugin relies on", () => {
  assert.equal(typeof manifest.id, "string");
  assert.equal(typeof manifest.name, "string");
  assert.equal(typeof manifest.description, "string");
  assert.ok(Array.isArray(manifest.sections));
  assert.ok(Array.isArray(manifest.exposes.status));
  assert.ok(Array.isArray(manifest.exposes.commands));
});

test("the package publishes the manifest and surface module", () => {
  assert.ok(pkg.files.includes("plugin.json"));
  if (manifest.surface?.module === undefined) return;
  assert.ok(existsSync(new URL(`../${manifest.surface.module}`, import.meta.url)), manifest.surface.module);
  assert.ok(pkg.files.some((entry) => manifest.surface.module === entry || manifest.surface.module.startsWith(`${entry}/`)));
});

test("every section module is published", () => {
  for (const section of manifest.sections ?? []) {
    if (section.module === undefined) continue;
    assert.ok(existsSync(new URL(`../${section.module}`, import.meta.url)), section.module);
    assert.ok(pkg.files.some((entry) => section.module === entry || section.module.startsWith(`${entry}/`)), section.module);
  }
});

test("every section is a view of the section page, at its declared height, and the tab selection is a command of it", () => {
  const sections = Object.fromEntries(manifest.sections.map((section) => [section.id, section]));
  assert.deepEqual(Object.keys(sections).sort(), ["browser.dom", "browser.history", "browser.network", "browser.tabs"]);
  for (const section of manifest.sections) {
    assert.deepEqual(section.composition, { kind: "view", page: "ui/section.html" }, `${section.id} is a view of the section page`);
    assert.equal(section.status, undefined, `${section.id} declares no status`);
    assert.equal(section.module, undefined, `${section.id} declares no module`);
    assert.equal(section.fill, undefined, `${section.id} declares no fill`);
  }
  assert.equal(sections["browser.dom"].height, "fill");
  assert.equal(sections["browser.network"].height, "fill");
  assert.equal(sections["browser.tabs"].height, 160);
  assert.equal(sections["browser.history"].height, 160);
  assert.ok(manifest.exposes.commands.some((entry) => entry.name === "browser.tab.select"), "browser.tab.select is a declared command");
});
