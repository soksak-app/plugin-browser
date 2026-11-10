// The statuses browser.elements and browser.requests follow the document streams of the region (core docs/spec/native-surfaces.md#document-streams)
// and serve the values of the DOM and 네트워크 sections (#P27.2). The region is a fake at the consumer
// boundary: it records each subscription and its close, and each of them is an occurrence that a test waits for.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { elementsValue, requestsValue } from "../build/test/ui/browser.js";
import { createOccurrences } from "./occurrences.mjs";
// The address of the document that a region shows when a test reads its streams.
const DOCUMENT = "https://example.test/page";

function fakeRegion() {
  const { until, occurred, list } = createOccurrences();
  const subscriptions = list();
  return {
    subscriptions,
    until,
    // refuse makes the next subscribe fail with its text, as a region that refuses the subscription.
    refuse: null,
    subscribe(stream, listener) {
      if (this.refuse !== null) return Promise.reject(new Error(this.refuse));
      const subscription = { stream, listener, closed: false };
      subscriptions.push(subscription);
      return Promise.resolve({ stream, close() { subscription.closed = true; occurred(); return Promise.resolve(); } });
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
      command: async () => {}, element: async () => {}, delegate: async () => {}, bind: async () => {},
      dispose: async () => {},
    },
    status: { report: (phase, error) => { reports.push([phase, error]); } },
    runtime: {
      status: { watch: () => () => {} }, beginOperation: () => [], command: async () => null,
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
const element = { node: 1, depth: 0, tag: "html", id: "", class: "" };
const request = (url) => ({ url, type: "script", start: 0, duration: 1 });
// A document state of the region: the document of the region shows url, with change applied.
const documentState = (url, change = {}) => ({ url, title: "", link: "", error: null, loading: false, history: { entries: [], index: -1 }, ...change });
const subscribed = (region, count) => region.until(() => region.subscriptions.length >= count);
const closed = (region, index) => region.until(() => region.subscriptions[index].closed);


test("browser.elements subscribes to the elements stream while watched and closes it when the watch stops", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.elements").subscribe((value) => values.push(value));
  await subscribed(region, 1);
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  region.subscriptions[0].listener(snapshot([element], 1));
  assert.deepEqual(values.at(-1), elementsValue({ nodes: [element], total: 1, truncated: false }));
  stop();
  await closed(region, 0);
  assert.equal(region.subscriptions[0].closed, true, "stopping the watch closes the elements subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.elements without a watch takes one snapshot and closes its subscription", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = { url: DOCUMENT };
  const read = statuses.get("browser.elements").read();
  await subscribed(region, 1);
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  region.subscriptions[0].listener(snapshot([element], 2000, true));
  assert.deepEqual(await read, elementsValue({ nodes: [element], total: 2000, truncated: true }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of each stream status of a region without a document is the empty value at once and opens no subscription", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  assert.equal(region.state, null, "the fake region has no document");
  assert.deepEqual(await statuses.get("browser.elements").read(), elementsValue(null));
  assert.deepEqual(await statuses.get("browser.requests").read(), requestsValue(null));
  region.state = { url: "" };
  assert.deepEqual(await statuses.get("browser.elements").read(), elementsValue(null));
  assert.deepEqual(region.subscriptions, [], "a read without a document opened a stream subscription");
  await mounted.dispose();
  dom.window.close();
});

// A status watch of the exposure subscribes and then reads the status (createExpose of core), so a read while a watch holds the
// subscription is the value of the watch and does not wait for a message of a second subscription.
test("a read of browser.elements while a watch holds its subscription is the watched value at once", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = { url: DOCUMENT };
  const stop = statuses.get("browser.elements").subscribe(() => {});
  await subscribed(region, 1);
  assert.deepEqual(await statuses.get("browser.elements").read(), elementsValue(null));
  assert.deepEqual(region.subscriptions.map((s) => s.stream), ["elements"], "the read opened a second subscription");
  region.subscriptions[0].listener(snapshot([element], 1));
  assert.deepEqual(await statuses.get("browser.elements").read(), elementsValue({ nodes: [element], total: 1, truncated: false }));
  stop();
  await mounted.dispose();
  dom.window.close();
});

// The first read of a stream has no time limit (docs/spec/calls.md): it ends by its first data message, a failure of its subscription,
// the end of the page of the region or the end of the region, and it starts no timer.
test("a read of browser.elements starts no timer and ends by its first snapshot", async (t) => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = { url: DOCUMENT };
  const timers = t.mock.method(globalThis, "setTimeout");
  const read = statuses.get("browser.elements").read();
  await subscribed(region, 1);
  assert.equal(timers.mock.callCount(), 0, "the read started a timer");
  region.subscriptions[0].listener(snapshot([element], 1));
  assert.deepEqual(await read, elementsValue({ nodes: [element], total: 1, truncated: false }));
  assert.equal(timers.mock.callCount(), 0, "the read started a timer");
  timers.mock.restore();
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.elements ends with the end of the page of the region and closes its subscription", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = documentState(DOCUMENT);
  const read = statuses.get("browser.elements").read();
  await subscribed(region, 1);
  // The host reports the end of the WebContent process of the region as the document state with this error.
  for (const fn of region.stateListeners) fn(documentState(DOCUMENT, { error: "the web content process ended" }));
  await assert.rejects(read, { message: "document elements stream ended: the web content process ended" });
  await closed(region, 0);
  assert.equal(region.subscriptions[0].closed, true, "the ended read ends its subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a load failure of the region does not end a read of browser.elements", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = documentState(DOCUMENT);
  const read = statuses.get("browser.elements").read();
  await subscribed(region, 1);
  for (const fn of region.stateListeners) fn(documentState(DOCUMENT, { error: "net::ERR_NAME_NOT_RESOLVED" }));
  region.subscriptions[0].listener(snapshot([element], 1));
  assert.deepEqual(await read, elementsValue({ nodes: [element], total: 1, truncated: false }));
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.elements ends with the failure of its subscription", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = documentState(DOCUMENT);
  region.refuse = "the region refused the subscription";
  await assert.rejects(statuses.get("browser.elements").read(), { message: "the region refused the subscription" });
  await mounted.dispose();
  dom.window.close();
});

test("a message that arrives after the watch stops does not set the value that a later read returns", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = { url: DOCUMENT };
  const stop = statuses.get("browser.elements").subscribe(() => {});
  await subscribed(region, 1);
  const late = region.subscriptions[0].listener;
  stop();
  await closed(region, 0);
  late(snapshot([element], 1));
  const read = statuses.get("browser.elements").read();
  await subscribed(region, 2);
  assert.equal(region.subscriptions.length, 2, "the read subscribes again instead of returning the message of the closed watch");
  region.subscriptions[1].listener(snapshot([], 0));
  assert.deepEqual(await read, elementsValue({ nodes: [], total: 0, truncated: false }));
  await mounted.dispose();
  dom.window.close();
});

test("browser.elements reports null after a reset of the document", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.elements").subscribe((value) => values.push(value));
  await subscribed(region, 1);
  region.subscriptions[0].listener(snapshot([element], 1));
  region.subscriptions[0].listener({ type: "reset" });
  assert.deepEqual(values.at(-1), elementsValue(null), "a reset draws the empty tree of the section");
  stop();
  await mounted.dispose();
  dom.window.close();
});

test("browser.requests accumulates the entries of each batch, clears on reset, and reports dropped", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await subscribed(region, 1);
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["requests", false]]);
  const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((name) => request(`https://${name}.test/`));
  const stream = region.subscriptions[0];
  stream.listener({ type: "entries", entries: [a, b], dropped: 0 });
  assert.deepEqual(values.at(-1), requestsValue({ entries: [a, b], dropped: 0 }));
  stream.listener({ type: "entries", entries: [c], dropped: 0 });
  assert.deepEqual(values.at(-1), requestsValue({ entries: [a, b, c], dropped: 0 }));
  stream.listener({ type: "entries", entries: [d], dropped: 2 });
  assert.deepEqual(values.at(-1), requestsValue({ entries: [a, b, c, d], dropped: 2 }));
  stream.listener({ type: "reset" });
  assert.deepEqual(values.at(-1), requestsValue(null), "a reset draws the empty list of the section");
  stream.listener({ type: "entries", entries: [e], dropped: 0 });
  assert.deepEqual(values.at(-1), requestsValue({ entries: [e], dropped: 0 }));
  stop();
  await closed(region, 0);
  assert.equal(stream.closed, true, "stopping the watch closes the requests subscription");
  await mounted.dispose();
  dom.window.close();
});

test("browser.requests keeps the newest 200 entries of its log", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await subscribed(region, 1);
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
  region.state = { url: DOCUMENT };
  const read = statuses.get("browser.requests").read();
  await subscribed(region, 1);
  region.subscriptions[0].listener({ type: "entries", entries: [request("https://log.test/")], dropped: 3 });
  assert.deepEqual(await read, requestsValue({ entries: [request("https://log.test/")], dropped: 3 }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await mounted.dispose();
  dom.window.close();
});

test("a read of browser.requests ends with the close of the region at the dispose of the view", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  region.state = documentState(DOCUMENT);
  const read = statuses.get("browser.requests").read();
  const ended = read.then(() => null, (error) => error.message);
  await subscribed(region, 1);
  await mounted.dispose();
  assert.equal(await ended, "document requests stream ended: the region closed");
  assert.equal(region.subscriptions[0].closed, true, "the ended read ends its subscription");
  dom.window.close();
});

test("disposing the browser closes the watched document streams", async () => {
  const { dom, region, statuses, mounted } = await mountBrowser();
  statuses.get("browser.elements").subscribe(() => {});
  statuses.get("browser.requests").subscribe(() => {});
  await subscribed(region, 2);
  await mounted.dispose();
  assert.deepEqual(region.subscriptions.map((s) => s.closed), [true, true]);
  dom.window.close();
});

test("browser.requests shows an error when its log sheds entries that the region does not count", async () => {
  const { dom, region, statuses, errors, mounted } = await mountBrowser();
  const values = [];
  const stop = statuses.get("browser.requests").subscribe((value) => values.push(value));
  await subscribed(region, 1);
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
