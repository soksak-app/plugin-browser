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

// The memory saver of core unloads a hidden section surface only when its section declares unload, of the form of surface.unload
// (core docs/spec/plugins.md#sections, #memory-saver). The section views write their state through the tab state of their surface
// (ui/section-view.js).
test("each section declares unload as the surface declares it", () => {
  assert.deepEqual(manifest.surface.unload, { format: 1, maxBytes: 16384 });
  for (const section of manifest.sections) {
    assert.deepEqual(section.unload, { format: 1, maxBytes: 16384 }, `${section.id} declares unload`);
  }
});

// The names that the section views expose (ui/section-view.js): the status of each section and the element names of its rows, items and
// texts. Each element name is a list, because a section draws several elements of each name.
test("the section views declare the status browser.section and the element names of their rows, items and texts as lists", () => {
  const status = manifest.exposes.status.find((entry) => entry.name === "browser.section");
  assert.ok(status, "browser.section is declared");
  assert.deepEqual(status.schema.properties.state.enum, ["pending", "empty", "followed"]);
  assert.equal(status.schema.properties.section.type, "string");
  const elements = Object.fromEntries(manifest.exposes.element.map((entry) => [entry.name, entry]));
  for (const name of ["browser.section.row", "browser.section.item", "browser.section.empty", "browser.section.status"]) {
    assert.equal(elements[name]?.many, true, `${name} is declared as a list`);
  }
});
