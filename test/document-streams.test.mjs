// The statuses browser.elements and browser.requests follow the document streams of the region (core docs/spec/native-surfaces.md#document-streams)
// and serve the values of the DOM and 네트워크 sections (#P27.2). The page is the real ui/view.js in the view fixture; the region is the
// fixture of test/fixtures/view.mjs, which records each subscription and its close. A status is watched or read through its exposure
// request, and the messages of a stream reach the page as the host delivers them (view.push).
import assert from "node:assert/strict";
import test from "node:test";
import { elementsValue, requestsValue } from "../ui/browser.js";
import { TAB_PAGE, answerOf, callsOf, changesOf, createRegion, documentState, exposure, openTab, pushState, pushStream, sendExposure } from "./fixtures/view.mjs";

// The address of the document that a region shows when a test reads its streams.
const DOCUMENT = "https://example.test/page";

const snapshot = (nodes, total = nodes.length, truncated = false) => ({ type: "snapshot", seq: 1, nodes, total, truncated });
const element = { node: 1, depth: 0, tag: "html", id: "", class: "" };
const request = (url) => ({ url, type: "script", start: 0, duration: 1 });

/**
 * Opens the browser view with a region that opens no page (home is empty), and loads its page module. The region has no document until a
 * test delivers one with pushState.
 */
async function mountBrowser(t, { refuse = null } = {}) {
  const region = createRegion();
  region.refuse = refuse;
  const view = await openTab(t, { region, home: "" });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  return { view, region };
}

/** Watches the status name, as the exposure of the core watches it. */
const watch = (view, name) => sendExposure(view, "status.watch", { name });
/** Stops the watch of the status name. */
const unwatch = (view, name) => sendExposure(view, "status.unwatch", { name });
/** Reads the status name and waits for its answer, which a read with no stream message does not give. */
const read = (view, name) => exposure(view, "status.get", { name });

/** The last element of a list, or undefined. */
const lastOf = (values) => values.at(-1);

test("browser.elements subscribes to the elements stream while watched and closes it when the watch stops", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.elements");
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 1));
  assert.deepEqual(lastOf(changesOf(view, "browser.elements")), elementsValue({ nodes: [element], total: 1, truncated: false }));
  await unwatch(view, "browser.elements");
  assert.equal(region.subscriptions[0].closed, true, "stopping the watch closes the elements subscription");
  await view.close();
});

test("a read of browser.elements without a watch takes one snapshot and closes its subscription", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["elements", false]]);
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 2000, true));
  assert.deepEqual(answerOf(view, id).result, elementsValue({ nodes: [element], total: 2000, truncated: true }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await view.close();
});

test("a read of each stream status of a region without a document is the empty value at once and opens no subscription", async (t) => {
  const { view, region } = await mountBrowser(t);
  assert.deepEqual(await read(view, "browser.elements"), elementsValue(null));
  assert.deepEqual(await read(view, "browser.requests"), requestsValue(null));
  await pushState(view, documentState(""));
  assert.deepEqual(await read(view, "browser.elements"), elementsValue(null));
  assert.deepEqual(region.subscriptions, [], "a read without a document opened a stream subscription");
  await view.close();
});

// A status watch of the exposure subscribes and then reads the status (createExpose of core), so a read while a watch holds the
// subscription is the value of the watch and does not wait for a message of a second subscription.
test("a read of browser.elements while a watch holds its subscription is the watched value at once", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  await watch(view, "browser.elements");
  assert.deepEqual(await read(view, "browser.elements"), elementsValue(null));
  assert.deepEqual(region.subscriptions.map((s) => s.stream), ["elements"], "the read opened a second subscription");
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 1));
  assert.deepEqual(await read(view, "browser.elements"), elementsValue({ nodes: [element], total: 1, truncated: false }));
  await unwatch(view, "browser.elements");
  await view.close();
});

// The first read of a stream has no time limit (docs/spec/calls.md): it ends by its first data message, a failure of its subscription,
// the end of the page of the region or the end of the region, and it starts no timer.
test("a read of browser.elements starts no timer and ends by its first snapshot", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const timersBefore = view.observed.timers.length;
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  assert.deepEqual(view.observed.timers.slice(timersBefore), [], "the read started a timer");
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 1));
  assert.deepEqual(answerOf(view, id).result, elementsValue({ nodes: [element], total: 1, truncated: false }));
  assert.deepEqual(view.observed.timers.slice(timersBefore), [], "the read started a timer");
  await view.close();
});

test("a read of browser.elements ends with the end of the page of the region and closes its subscription", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  // The host reports the end of the WebContent process of the region as the document state with this error.
  await pushState(view, documentState(DOCUMENT, { error: "the web content process ended" }));
  assert.equal(answerOf(view, id).error.message, "document elements stream ended: the web content process ended");
  assert.equal(region.subscriptions[0].closed, true, "the ended read ends its subscription");
  await view.close();
});

test("a load failure of the region does not end a read of browser.elements", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  await pushState(view, documentState(DOCUMENT, { error: "net::ERR_NAME_NOT_RESOLVED" }));
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 1));
  assert.deepEqual(answerOf(view, id).result, elementsValue({ nodes: [element], total: 1, truncated: false }));
  await view.close();
});

test("a read of browser.elements ends with the failure of its subscription", async (t) => {
  const { view, region } = await mountBrowser(t, { refuse: "the region refused the subscription" });
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  assert.equal(answerOf(view, id).error.message, "the region refused the subscription");
  void region;
  await view.close();
});

test("a message that arrives after the watch stops does not set the value that a later read returns", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  await watch(view, "browser.elements");
  const late = region.subscriptions[0].handle;
  await unwatch(view, "browser.elements");
  assert.equal(region.subscriptions[0].closed, true);
  await pushStream(view, late, snapshot([element], 1));
  const id = await sendExposure(view, "status.get", { name: "browser.elements" });
  assert.equal(region.subscriptions.length, 2, "the read subscribes again instead of returning the message of the closed watch");
  await pushStream(view, region.subscriptions[1].handle, snapshot([], 0));
  assert.deepEqual(answerOf(view, id).result, elementsValue({ nodes: [], total: 0, truncated: false }));
  await view.close();
});

test("browser.elements reports null after a reset of the document", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.elements");
  await pushStream(view, region.subscriptions[0].handle, snapshot([element], 1));
  await pushStream(view, region.subscriptions[0].handle, { type: "reset" });
  assert.deepEqual(lastOf(changesOf(view, "browser.elements")), elementsValue(null), "a reset draws the empty tree of the section");
  await unwatch(view, "browser.elements");
  await view.close();
});

test("browser.requests accumulates the entries of each batch, clears on reset, and reports dropped", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.requests");
  assert.deepEqual(region.subscriptions.map((s) => [s.stream, s.closed]), [["requests", false]]);
  const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((name) => request(`https://${name}.test/`));
  const handle = region.subscriptions[0].handle;
  await pushStream(view, handle, { type: "entries", entries: [a, b], dropped: 0 });
  assert.deepEqual(lastOf(changesOf(view, "browser.requests")), requestsValue({ entries: [a, b], dropped: 0 }));
  await pushStream(view, handle, { type: "entries", entries: [c], dropped: 0 });
  assert.deepEqual(lastOf(changesOf(view, "browser.requests")), requestsValue({ entries: [a, b, c], dropped: 0 }));
  await pushStream(view, handle, { type: "entries", entries: [d], dropped: 2 });
  assert.deepEqual(lastOf(changesOf(view, "browser.requests")), requestsValue({ entries: [a, b, c, d], dropped: 2 }));
  await pushStream(view, handle, { type: "reset" });
  assert.deepEqual(lastOf(changesOf(view, "browser.requests")), requestsValue(null), "a reset draws the empty list of the section");
  await pushStream(view, handle, { type: "entries", entries: [e], dropped: 0 });
  assert.deepEqual(lastOf(changesOf(view, "browser.requests")), requestsValue({ entries: [e], dropped: 0 }));
  await unwatch(view, "browser.requests");
  assert.equal(region.subscriptions[0].closed, true, "stopping the watch closes the requests subscription");
  await view.close();
});

test("browser.requests keeps the newest 200 entries of its log", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.requests");
  const batch = Array.from({ length: 201 }, (_, index) => request(`https://r${index}.test/`));
  await pushStream(view, region.subscriptions[0].handle, { type: "entries", entries: batch, dropped: 1 });
  const value = lastOf(changesOf(view, "browser.requests"));
  const list = value.elements.find((element) => element.kind === "list");
  assert.equal(list.items.length, 200);
  assert.ok(list.items[0].label.includes("r1.test/"), "the log keeps the newest entries");
  await unwatch(view, "browser.requests");
  await view.close();
});

test("a read of browser.requests returns the request log of its first entries message", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.requests" });
  await pushStream(view, region.subscriptions[0].handle, { type: "entries", entries: [request("https://log.test/")], dropped: 3 });
  assert.deepEqual(answerOf(view, id).result, requestsValue({ entries: [request("https://log.test/")], dropped: 3 }));
  assert.equal(region.subscriptions[0].closed, true, "the read ends its subscription");
  await view.close();
});

test("a read of browser.requests ends with the close of the region at the dispose of the view", async (t) => {
  const { view, region } = await mountBrowser(t);
  await pushState(view, documentState(DOCUMENT));
  const id = await sendExposure(view, "status.get", { name: "browser.requests" });
  await view.close();
  assert.equal(answerOf(view, id).error.message, "document requests stream ended: the region closed");
  assert.equal(region.subscriptions[0].closed, true, "the ended read ends its subscription");
});

test("disposing the browser closes the watched document streams", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.elements");
  await watch(view, "browser.requests");
  assert.equal(region.subscriptions.length, 2);
  await view.close();
  assert.deepEqual(region.subscriptions.map((s) => s.closed), [true, true]);
});

test("browser.requests shows an error when its log sheds entries that the region does not count", async (t) => {
  const { view, region } = await mountBrowser(t);
  await watch(view, "browser.requests");
  const handle = region.subscriptions[0].handle;
  const batch = (count) => Array.from({ length: count }, (_, index) => request(`https://r${index}.test/`));
  await pushStream(view, handle, { type: "entries", entries: batch(200), dropped: 0 });
  await pushStream(view, handle, { type: "entries", entries: batch(5), dropped: 0 });
  const errors = callsOf(view, "tab.error");
  assert.equal(errors.length, 1, `the uncounted shed was not shown; errors ${JSON.stringify(errors)}`);
  assert.match(errors[0], /requests/);
  assert.equal(lastOf(changesOf(view, "browser.requests")).elements[0].items.length, 200, "the refused batch changed the list");
  await unwatch(view, "browser.requests");
  await view.close();
});

test("a tab title longer than 256 characters is refused with an error, and the tab shows its name", async (t) => {
  const { view } = await mountBrowser(t);
  const state = { url: "https://e.test/", title: "t".repeat(257), link: "", error: null, loading: false, history: { entries: [], index: -1 },
    elements: { nodes: [], total: 0, truncated: false }, requests: { entries: [], dropped: 0 } };
  await pushState(view, state);
  assert.deepEqual(lastOf(callsOf(view, "tab.title")), null, "the title was cut or kept");
  const errors = callsOf(view, "tab.error");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /title/);
  await view.close();
});
