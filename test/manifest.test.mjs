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

test("every section is a declared UI status of this plugin, and the tab selection is a command of it", () => {
  const declared = (name) => manifest.exposes.status.some((entry) => entry.name === name);
  const sections = Object.fromEntries(manifest.sections.map((section) => [section.id, section]));
  assert.equal(sections["browser.history"].status, "browser.history");
  assert.equal(sections["browser.network"].status, "browser.requests");
  assert.equal(sections["browser.dom"].status, "browser.elements");
  assert.equal(sections["browser.tabs"].status, "browser.tabs");
  for (const section of manifest.sections) {
    assert.equal(section.module, undefined, `${section.id} declares no module`);
    assert.ok(declared(section.status), `${section.status} is not a status of this plugin`);
  }
  assert.ok(manifest.exposes.commands.some((entry) => entry.name === "browser.tab.select"), "browser.tab.select is a declared command");
});
