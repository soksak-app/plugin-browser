import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { INTERACTIVE } from "@soksak/plugin-api";

const source = readFileSync(new URL("../ui/browser.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const { document } = new JSDOM("<div></div>").window;
const names = (kind) => manifest.exposes[kind].map((entry) => entry.name);

test("browser module is an app-DOM entry", () => {
  assert.match(source, /export (?:async )?function mount/);
});

test("every control names a declared dom entry and a declared command", () => {
  assert.match(source, /data-expose="browser.address/);
  assert.match(source, /data-command="browser.reload/);
  assert.ok(names("dom").length > 0);
});

test("the document region is a declared dom entry and the start address is the home setting", () => {
  assert.match(source, /browser.document/);
  assert.equal(manifest.home, undefined);
  assert.deepEqual(manifest.settings.home, { label: "홈 주소", description: manifest.settings.home.description, type: "address", default: "" });
  assert.deepEqual(names("commands"), ["browser.history.go", "browser.address.select", "browser.navigate", "browser.back", "browser.forward", "browser.reload", "browser.stop"]);
  assert.deepEqual(names("status"), ["browser.location", "browser.address.text", "browser.history", "browser.elements", "browser.requests"]);
});

test("browser mount publishes document state, respects shadow focus, and disposes every port", async () => {
  const dom = new JSDOM("<div></div>", { url: "https://example.test/" });
  const root = dom.window.document.createElement("div");
  const shadow = root.attachShadow({ mode: "open" });
  const states = [];
  const exposed = { statuses: new Map(), commands: new Map(), doms: new Map(), disposed: false };
  const region = {
    state: null,
    onState(fn) { states.push(fn); return () => { states.splice(states.indexOf(fn), 1); }; },
    load: async (url) => { states.forEach((fn) => fn({ url, title: "loaded", history: { entries: [], index: -1 }, link: "" })); },
    back: async () => {}, forward: async () => {}, reload: async () => {}, stop: async () => {},
    zoom: async (factor) => { zooms.push(factor); },
  };
  const zooms = [];
  let notifyTextSize = null;
  const composition = {
    region: () => region,
    dispose: async () => { composition.disposed = true; },
  };
  const context = {
    tab: { title() {}, footer() {}, state: { read: () => null, write() {} } },
    surfaceId: "browser-page-test",
    composition: { create: async () => composition },
    exposure: {
      status: async (name, read, subscribe) => exposed.statuses.set(name, { read, subscribe }),
      command: async (name, fn) => exposed.commands.set(name, fn),
      dom: async (name, element) => exposed.doms.set(name, element),
      delegate: async () => {}, bind: async () => {},
      dispose: async () => { exposed.disposed = true; },
    },
    declared: { push() {} },
    status: { report: (phase) => { exposed.phase = phase; } },
    runtime: { log: { error() {}, warn() {}, info() {}, debug() {}, trace() {} }, settings: { read: async () => ({ home: "https://home.test/" }), on: () => () => {} }, textSize: { read: async () => 1.25,
      on: async (fn) => { notifyTextSize = fn; return () => { notifyTextSize = null; }; } } },
  };
  const { mount } = await import("../ui/browser.js");
  const mounted = await mount(shadow, context);
  // 문서의 페이지 확대는 표면의 글자 배율을 따른다(docs/spec/text-size.md).
  assert.deepEqual(zooms, [1.25], "the document starts at the surface text size");
  notifyTextSize(2);
  await Promise.resolve();
  assert.deepEqual(zooms, [1.25, 2], "the document follows text size changes");
  // 기록 이동과 새로 고침 단추는 core 아이콘 표의 경로를 직접 그린다.
  const pathOf = (command) => shadow.querySelector(`[data-command="${command}"] svg`)?.innerHTML;
  assert.deepEqual(["browser.back", "browser.forward", "browser.reload"].map(pathOf),
    ['<path d="m15 18-6-6 6-6"></path>', '<path d="m9 18 6-6-6-6"></path>',
      '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path>']);
  const address = shadow.querySelector("#address");
  address.focus();
  address.value = "https://typing.test/";
  address.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  states[0]({ url: "https://changed.test/", title: "changed", history: { entries: [], index: -1 }, link: "" });
  assert.equal(address.value, "https://typing.test/", "text being typed is not overwritten");
  const watchValues = [];
  const stopWatch = exposed.statuses.get("browser.location").subscribe((value) => watchValues.push(value.url));
  states[0]({ url: "https://next.test/", history: { entries: [], index: -1 }, link: "" });
  assert.equal(exposed.statuses.get("browser.location").read().url, "https://next.test/");
  assert.deepEqual(watchValues, ["https://changed.test/", "https://next.test/"]);
  stopWatch();
  await mounted.dispose();
  assert.equal(composition.disposed, true);
  assert.equal(exposed.disposed, true);
  assert.equal(states.length, 0);
  assert.equal(notifyTextSize, null, "disposing stops following the text size");
  assert.equal(shadow.childNodes.length, 0);
  dom.window.close();
});

/** Mounts the browser with a fake region whose attach restored a session history when history is true, and a tab state. */
async function mountRestored({ stored, history }) {
  const dom = new JSDOM("<div></div>", { url: "https://example.test/" });
  const shadow = dom.window.document.createElement("div").attachShadow({ mode: "open" });
  const states = [];
  const loads = [];
  const writes = [];
  const region = {
    history,
    state: null,
    onState(fn) { states.push(fn); return () => { states.splice(states.indexOf(fn), 1); }; },
    load: async (url) => { loads.push(url); },
    zoom: async () => {},
  };
  const context = {
    tab: { title() {}, footer() {}, state: { read: () => stored, write: (value) => writes.push(value) } },
    surfaceId: "browser-state-test",
    composition: { create: async () => ({ region: () => region, dispose: async () => {} }) },
    exposure: { status: async () => {}, command: async () => {}, dom: async () => {}, delegate: async () => {}, bind: async () => {}, dispose: async () => {} },
    declared: { push() {} },
    status: { report() {} },
    runtime: { log: { error() {}, warn() {}, info() {}, debug() {}, trace() {} }, settings: { read: async () => ({ home: "https://home.test/" }), on: () => () => {} },
      textSize: { read: async () => 1, on: async () => () => {} } },
  };
  const { mount } = await import("../ui/browser.js");
  const mounted = await mount(shadow, context);
  return { dom, states, loads, writes, mounted };
}

test("a tab opens the address of its tab state and writes each new address", async () => {
  const { dom, states, loads, writes, mounted } = await mountRestored({ stored: { url: "https://stored.test/" }, history: false });
  assert.deepEqual(loads, ["https://stored.test/"]);
  assert.equal(dom.window.localStorage.length, 0, "the address is not kept in localStorage");
  const state = (url) => ({ url, title: "", history: { entries: [], index: -1 }, link: "", error: null, scroll: { x: 0, y: 0 } });
  states[0](state("https://stored.test/"));
  states[0](state("https://next.test/"));
  states[0](state("https://next.test/"));
  assert.deepEqual(writes, [{ url: "https://next.test/" }]);
  await mounted.dispose();
  dom.window.close();
});

test("a region that restored the session history loads nothing, and a new tab opens home", async () => {
  const restored = await mountRestored({ stored: { url: "https://stored.test/" }, history: true });
  assert.deepEqual(restored.loads, []);
  await restored.mounted.dispose();
  restored.dom.window.close();
  const fresh = await mountRestored({ stored: null, history: false });
  assert.deepEqual(fresh.loads, ["https://home.test/"]);
  await fresh.mounted.dispose();
  fresh.dom.window.close();
});

test("a tab state without an http or https address is refused", async () => {
  await assert.rejects(mountRestored({ stored: { url: "file:///etc" }, history: false }),
    /the tab state of browser tab browser-state-test has no http or https address: \{"url":"file:\/\/\/etc"\}/);
});
