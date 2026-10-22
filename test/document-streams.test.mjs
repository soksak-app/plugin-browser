// The statuses browser.elements and browser.requests follow the document streams of the region (core docs/spec/native-surfaces.md#document-streams)
// and serve the declared UI values of the DOM and 네트워크 sections (#P27.2). The region is a fake at the consumer
// boundary: it records each subscription and its close.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { declaredElements, declaredRequests } from "../build/test/ui/browser.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeRegion() {
  const subscriptions = [];
  return {
    subscriptions,
    subscribe(stream, listener) {
      const subscription = { stream, listener, closed: false };
      subscriptions.push(subscription);
      return Promise.resolve({ stream, close() { subscription.closed = true; return Promise.resolve(); } });
    },
    state: null,
    stateListeners: new Set(),
    onState(fn) { this.stateListeners.add(fn); return () => this.stateListeners.delete(fn); },
    zoom: async () => {}, load: async () => {}, back: async () => {}, forward: async () => {}, reload: async () => {}, stop: async () => {},
    entry: async () => {},
  };
}

async function mountBrowser() {
  const dom = new JSDOM("<div></div>", { url: "https://example.test/" });
  const root = dom.window.document.createElement("div");
  const shadow = root.attachShadow({ mode: "open" });
  const region = fakeRegion();
  const statuses = new Map();
  const reports = [];
  const errors = [];
  const titles = [];
  const composition = { region: () => region, dispose: async () => {} };
  const context = {
    tab: { title: (text) => titles.push(text), footer() {}, error: (text) => errors.push(text), state: { read: () => null, write() {} } },
    surfaceId: "browser-streams-test",
    composition: { create: async () => composition },
    exposure: {
      status: async (name, read, subscribe) => statuses.set(name, { read, subscribe }),
      command: async () => {}, dom: async () => {}, delegate: async () => {}, bind: async () => {},
      dispose: async () => {},
    },
    declared: { push() {} },
    status: { report: (phase, error) => { reports.push([phase, error]); } },
    runtime: {
      log: { error() {}, warn() {}, info() {}, debug() {}, trace() {} },
      settings: { read: async () => ({ home: "" }), on: async () => () => {} },
      textSize: { read: async () => 1, on: async () => () => {} },
    },
  };
  const { mount } = await import("../build/test/ui/browser.js");
  const mounted = await mount(shadow, context);
  return { dom, region, statuses, reports, errors, titles, mounted };
}

const snapshot = (nodes, total = nodes.length, truncated = false) => ({ type: "snapshot", seq: 1, nodes, total, truncated });
const element = { depth: 0, tag: "html", id: "", class: "" };
const request = (url) => ({ url, type: "script", start: 0, duration: 1 });


test("browser.elements subscribes to the elements stream while watched and closes it when the watch stops", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.elements").subscribe((value) => values.push(value));
  await flush();
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  region.subscriptions[0].listener(snapshot([element], 1));
  assert.deepEqual(values.at(-1), declaredElements({ nodes: [element], total: 1, truncated: false }));
  stop();
  await flush();
  assert.equal(region.subscriptions[0].closed, true, "stopping the watch closes the elements subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.elements without a watch takes one snapshot and closes its subscription", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const read = statuses.get("browser.elements").read();
  await flush();
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  region.subscriptions[0].listener(snapshot([element], 2000, true));
  assert.deepEqual(await read, declaredElements({ nodes: [element], total: 2000, truncated: true }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.elements fails with an explicit error when no snapshot arrives within 10 seconds", async (t) => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const read = statuses.get("browser.elements").read();
  t.mock.timers.tick(9999);
  t.mock.timers.tick(1);
  await assert.rejects(read, { message: "document elements stream sent no message within 10000ms" });
  await flush();
  assert.equal(region.subscriptions[0].closed, true, "the failed read ends its subscription");
  t.mock.timers.reset();
  await mounted.dispose();
  dom.window.close();
});

test("a message that arrives after the watch stops does not set the value that a later read returns", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const stop = statuses.get("browser.elements").subscribe(() => {});
  await flush();
  const late = region.subscriptions[0].listener;
  stop();
  await flush();
  late(snapshot([element], 1));
  const read = statuses.get("browser.elements").read();
  await flush();
  assert.equal(region.subscriptions.length, 2, "the read subscribes again instead of returning the message of the closed watch");
  region.subscriptions[1].listener(snapshot([], 0));
  assert.deepEqual(await read, declaredElements({ nodes: [], total: 0, truncated: false }));
  await mounted.dispose();
  dom.window.close();
});

test("browser.elements reports null after a reset of the document", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.elements").subscribe((value) => values.push(value));
  await flush();
  region.subscriptions[0].listener(snapshot([element], 1));
  region.subscriptions[0].listener({ type: "reset" });
  assert.deepEqual(values.at(-1), declaredElements(null), "a reset draws the empty tree of the section");
  stop();
  await mounted.dispose();
  dom.window.close();
});

test("browser.requests accumulates the entries of each batch, clears on reset, and reports dropped", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await flush();
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["requests", false]]);
  const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((name) => request(`https://${name}.test/`));
  const stream = region.subscriptions[0];
  stream.listener({ type: "entries", entries: [a, b], dropped: 0 });
  assert.deepEqual(values.at(-1), declaredRequests({ entries: [a, b], dropped: 0 }));
  stream.listener({ type: "entries", entries: [c], dropped: 0 });
  assert.deepEqual(values.at(-1), declaredRequests({ entries: [a, b, c], dropped: 0 }));
  stream.listener({ type: "entries", entries: [d], dropped: 2 });
  assert.deepEqual(values.at(-1), declaredRequests({ entries: [a, b, c, d], dropped: 2 }));
  stream.listener({ type: "reset" });
  assert.deepEqual(values.at(-1), declaredRequests(null), "a reset draws the empty list of the section");
  stream.listener({ type: "entries", entries: [e], dropped: 0 });
  assert.deepEqual(values.at(-1), declaredRequests({ entries: [e], dropped: 0 }));
  stop();
  await flush();
  assert.equal(stream.closed, true, "stopping the watch closes the requests subscription");
  await mounted.dispose();
  dom.window.close();
});

test("browser.requests keeps the newest 200 entries of its log", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await flush();
  const batch = Array.from({ length: 201 }, (_, index) => request(`https://r${index}.test/`));
  region.subscriptions[0].listener({ type: "entries", entries: batch, dropped: 1 });
  const value = values.at(-1);
  const list = value.elements.find((element) => element.kind === "list");
  assert.equal(list.items.length, 200);
  assert.ok(list.items[0].label.includes("r1.test/"), "the log keeps the newest entries");
  stop();
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.requests returns the request log of its first entries message", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const read = statuses.get("browser.requests").read();
  await flush();
  region.subscriptions[0].listener({ type: "entries", entries: [request("https://log.test/")], dropped: 3 });
  assert.deepEqual(await read, declaredRequests({ entries: [request("https://log.test/")], dropped: 3 }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.requests fails with an explicit error when no entries arrive within 10 seconds", async (t) => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const read = statuses.get("browser.requests").read();
  t.mock.timers.tick(10000);
  await assert.rejects(read, { message: "document requests stream sent no message within 10000ms" });
  await flush();
  assert.equal(region.subscriptions[0].closed, true);
  t.mock.timers.reset();
  await mounted.dispose();
  dom.window.close();
});

test("disposing the browser closes the watched document streams", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  statuses.get("browser.elements").subscribe(() => {});
  statuses.get("browser.requests").subscribe(() => {});
  await flush();
  await mounted.dispose();
  assert.deepEqual(region.subscriptions.map((s) => s.closed), [true, true]);
  dom.window.close();
});

test("browser.requests shows an error when its log sheds entries that the region does not count", async () => {
  const { dom, region, statuses, errors, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await flush();
  const batch = (count) => Array.from({ length: count }, (_, index) => request(`https://r${index}.test/`));
  region.subscriptions[0].listener({ type: "entries", entries: batch(200), dropped: 0 });
  region.subscriptions[0].listener({ type: "entries", entries: batch(5), dropped: 0 });
  assert.equal(errors.length, 1, `the uncounted shed was not shown; errors ${JSON.stringify(errors)}`);
  assert.match(errors[0], /requests/);
  assert.equal(values.at(-1).elements[0].items.length, 200, "the refused batch changed the list");
  stop();
  await mounted.dispose();
});

test("a tab title longer than 256 characters is refused with an error, and the tab shows its name", async () => {
  const { dom, region, errors, titles, mounted } = await mountBrowser();
  const state = { url: "https://e.test/", title: "t".repeat(257), link: "", error: null, loading: false, history: { entries: [], index: -1 },
    elements: { nodes: [], total: 0, truncated: false }, requests: { entries: [], dropped: 0 } };
  for (const fn of region.stateListeners) fn(state);
  assert.deepEqual(titles.at(-1), null, "the title was cut or kept");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /title/);
  await mounted.dispose();
  dom.window.close();
});
