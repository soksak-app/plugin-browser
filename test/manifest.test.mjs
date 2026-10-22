import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

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

test("the 히스토리, 네트워크 and DOM sections are declared UI statuses of this plugin", () => {
  const declared = (name) => manifest.exposes.status.some((entry) => entry.name === name);
  const sections = Object.fromEntries(manifest.sections.map((section) => [section.id, section]));
  assert.equal(sections["browser.history"].status, "browser.history");
  assert.equal(sections["browser.network"].status, "browser.requests");
  assert.equal(sections["browser.dom"].status, "browser.elements");
  assert.equal(sections["browser.tabs"].module, "ui/sections/tabs.js");
  for (const id of ["browser.history", "browser.network", "browser.dom"]) {
    assert.equal(sections[id].module, undefined, `${id} declares no module`);
    assert.ok(declared(sections[id].status), `${sections[id].status} is not a status of this plugin`);
  }
});

/** 섹션을 마운트하고, 관찰한 status 에 값을 보내는 함수와 연결한 요소를 돌려준다. */
async function mountSection(id, surface = "t1") {
  const section = manifest.sections.find((item) => item.id === id);
  // 섹션은 실제 문서에서 실행한다.
  const dom = new JSDOM("<body></body>");
  globalThis.document = dom.window.document;
  const root = dom.window.document.createElement("div");
  dom.window.document.body.append(root);
  const observers = new Map();
  const bound = [];
  const context = { card: "rail", surface,
    status(name, fn) { observers.set(name, fn); return () => observers.delete(name); },
    bind(el, name, params) { bound.push({ el, name, params }); return el; } };
  const mounted = await (await import(`../${section.module}`)).mount(root, context);
  const send = (name, value, source = "t1") => { bound.length = 0; observers.get(name)(value, source); };
  return { root, observers, bound, send, dispose: () => { mounted.dispose(); delete globalThis.document; dom.window.close(); } };
}

test("the tabs section lists the browser tabs of the card that holds its surface and selects a tab on press", async () => {
  const s = await mountSection("browser.tabs", "b1");
  const grid = { cards: [
    { id: "rail", tabs: [], active: null },
    { id: "main", active: "b1", tabs: [
      { id: "b1", plugin: "browser", title: "브라우저", label: "One" },
      { id: "s1", plugin: "other", title: "다른", label: null },
      { id: "b2", plugin: "browser", title: "브라우저", label: null }] }] };
  s.send("core.grid", grid, "core");
  assert.deepEqual(s.bound.map(({ el, name, params }) => [el.textContent, el.getAttribute("aria-current"), name, params]),
    [["One", "page", "core.tab.select", { tab: "b1" }], ["브라우저", null, "core.tab.select", { tab: "b2" }]]);
  s.send("core.grid", { cards: [] }, "core");
  assert.equal(s.root.textContent, "브라우저 탭 없음");
  s.dispose();
  assert.equal(s.observers.size, 0);
});
