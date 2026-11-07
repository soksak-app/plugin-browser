import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createBinder } from "./sdk-models/binder.mjs";
import { mount } from "../build/test/ui/browser.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));

// 주소가 없는 표면을 마운트한다. region.load 는 받은 주소를 상태로 알린다.
async function setup(t, { readTabState = () => null } = {}) {
  const dom = new JSDOM("<div id='mount'></div>", { url: "https://app.test/" });
  const root = dom.window.document.querySelector("#mount").attachShadow({ mode: "open" });
  const commands = new Map(), requests = [], states = new Set(), elements = new Map();
  const binder = createBinder((name, params) => {
    requests.push(name);
    return commands.get(name)(params);
  }, { check(name) { assert.ok(manifest.exposes.commands.some((entry) => entry.name === name), `undeclared command ${name}`); } });
  const region = {
    state: null,
    onState(fn) { states.add(fn); return () => states.delete(fn); },
    async load(url) { for (const fn of states) fn({ url, title: url, history: { entries: [], index: -1 }, elements: { nodes: [], truncated: false }, requests: { entries: [], truncated: false }, link: "" }); },
    async back() {}, async forward() {}, async reload() {}, async stop() {}, async zoom() {},
  };
  const controller = await mount(root, {
    runtime: { status: { watch: () => () => {} }, beginOperation: () => [], command: async () => null, log: { error() {}, warn() {}, info() {}, debug() {}, trace() {} }, settings: { read: async () => ({ home: "" }), on: () => () => {} }, textSize: { read: async () => 1, on: async () => () => {} } },
    tab: { title() {}, footer() {}, state: { read: () => readTabState(root), write() {} } },
    surfaceId: "browser-empty-test",
    composition: { async create() { return { region: () => region, async dispose() {} }; } },
    exposure: {
      status() {}, element(name, target) { elements.set(name, target); }, command(name, run) { commands.set(name, run); },
      bind: binder.bind, delegate: binder.delegate, dispose: binder.dispose,
    },
    status: { report() {} },
  });
  t.after(async () => { await controller.dispose(); dom.window.close(); });
  return { dom, root, requests, elements, commands, publishState(state) { for (const fn of states) fn(state); } };
}

test("an empty address hides the document element and shows the declared empty state", { timeout: 10000 }, async (t) => {
  const { root, elements } = await setup(t);
  assert.ok(manifest.exposes.element.some((entry) => entry.name === "browser.empty"), "browser.empty is not declared");
  const empty = root.querySelector('[data-expose="browser.empty"]');
  assert.ok(empty, "the empty state element is missing");
  assert.equal(elements.get("browser.empty"), empty);
  assert.equal(empty.hidden, false);
  assert.equal(empty.textContent, "주소를 입력하세요");
  assert.equal(root.querySelector("#document").hidden, true, "the document element must be hidden without an address");
});

test("clicking the empty state focuses the address through browser.address.select", { timeout: 10000 }, async (t) => {
  const { dom, root, requests } = await setup(t);
  const empty = root.querySelector('[data-expose="browser.empty"]');
  assert.equal(empty.dataset.command, "browser.address.select");
  empty.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, composed: true }));
  assert.ok(requests.includes("browser.address.select"));
  assert.equal(root.activeElement, root.querySelector("#address"));
});

test("a loaded address removes the empty state and shows the document element", { timeout: 10000 }, async (t) => {
  const { root, commands } = await setup(t);
  await commands.get("browser.navigate")({ url: "https://example.test/" });
  assert.equal(root.querySelector('[data-expose="browser.empty"]').hidden, true);
  assert.equal(root.querySelector("#document").hidden, false);
});

// P123 / core F696-4-1: public semantics come from the rendered browser view model.
test("browser.content.read declares and reads the actual empty instruction (P123)", { timeout: 10000 }, async (t) => {
  const declaration = manifest.exposes.commands.find((entry) => entry.name === "browser.content.read");
  assert.ok(declaration, "browser.content.read is not declared");
  // The SDK permits type/properties/items/enum, not oneOf/minLength. An
  // object enum enforces both pairings and rejects empty/missing instructions.
  assert.deepEqual(declaration.result, { type: "object", enum: [
    { kind: "empty", instruction: "주소를 입력하세요" },
    { kind: "document", instruction: null },
  ] });
  const { root, commands } = await setup(t);
  const read = commands.get("browser.content.read");
  assert.equal(typeof read, "function", "browser.content.read is not exposed");
  const value = await read({});
  assert.deepEqual(value, { kind: "empty", instruction: "주소를 입력하세요" });
  assert.equal(value.instruction, root.querySelector('[data-expose="browser.empty"]').textContent);
});

test("browser.content.read follows empty/document transitions without claiming load completion (P123)", { timeout: 10000 }, async (t) => {
  const { root, commands, publishState } = await setup(t);
  const read = commands.get("browser.content.read");
  assert.equal(typeof read, "function", "browser.content.read is not exposed");
  const state = { url: "https://example.test/", title: "", loading: true, progress: 0,
    history: { entries: [], index: -1 }, elements: { nodes: [], truncated: false },
    requests: { entries: [], truncated: false }, link: "" };
  publishState(state);
  assert.deepEqual(await read({}), { kind: "document", instruction: null });
  assert.equal(root.querySelector('[data-expose="browser.empty"]').hidden, true);
  publishState({ ...state, loading: false, progress: 1 });
  assert.deepEqual(await read({}), { kind: "document", instruction: null });
  publishState({ ...state, url: "", loading: false });
  const empty = await read({});
  assert.deepEqual(empty, { kind: "empty", instruction: "주소를 입력하세요" });
  assert.equal(root.querySelector('[data-expose="browser.empty"]').hidden, false);
  assert.equal(empty.instruction, root.querySelector('[data-expose="browser.empty"]').textContent);
});


test("the empty instruction is already present while initial tab restoration is pending (P123)", { timeout: 10000 }, async (t) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let inspected = false;
  const mounted = setup(t, { readTabState(root) {
    inspected = true;
    try {
      assert.equal(root.querySelector('[data-expose="browser.empty"]').textContent, "주소를 입력하세요",
        "initial markup must carry the instruction before awaiting tab restoration");
    } finally { release(null); }
    return pending;
  } });
  await mounted;
  assert.equal(inspected, true);
});
