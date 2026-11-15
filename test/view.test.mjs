// The view page at the consumer boundary (#P27.3): the page of the view carries the import map of the view, reads the
// start values of the surface, builds its surface context over the view channel (@soksak/plugin-api/view), attaches the document
// region "page" through the composition of the view, and mounts the browser module into the page. The page module is the real
// ui/view.js, loaded into a view that the host fixture opens (test/fixtures/host.mjs; test/fixtures/view.mjs supplies the document region).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TAB_PAGE, callsOf, createRegion, documentState, exposure, openTab, pluginLogs, pushState, SURFACE } from "./fixtures/view.mjs";

// The check of a view page (core docs/spec/plugin-processes.md, rule 4): the page begins with its doctype and holds no import map,
// because the host inserts the view import map after the doctype of each view page.
function checkViewPage(html) {
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
}

const PAGE = new URL("../ui/index.html", import.meta.url);

test("the view page begins with its doctype, holds no import map, and carries the page script", () => {
  const html = readFileSync(PAGE, "utf8");
  assert.equal(checkViewPage(html), undefined);
  assert.match(html, /<script type="module" src="\.\/view\.js"><\/script>/);
});

test("the view page refuses to mount without the start values of the surface", async (t) => {
  const view = await openTab(t, { start: null });
  await assert.rejects(view.load(TAB_PAGE), /the view of browser has no start values: the host provides window\.sokSurface/);
});

// Each start value of another form than core injects is refused before the page sends anything.
for (const [label, change, reason] of [
  ["without declarations", { declarations: undefined }, /declarations/],
  ["with declarations that are an array", { declarations: [] }, /declarations/],
  ["with an origin of an empty directory", { origin: { directory: "" } }, /origin/],
  ["with an origin that is text", { origin: "/work" }, /origin/],
  ["with a project whose root is not text", { project: { id: "prj-project", root: 1 } }, /project/],
  ["with a project without an id", { project: { root: "/project" } }, /project/],
  ["without params", { params: undefined }, /params/],
]) {
  test(`the view page refuses start values ${label}`, async (t) => {
    const view = await openTab(t);
    // The host gives every view the declarations of the plugin, so a start value of another form replaces the injected one.
    view.window.sokSurface = Object.freeze({ ...view.window.sokSurface, ...change });
    await assert.rejects(view.load(TAB_PAGE), reason);
    assert.deepEqual(callsOf(view, "runtime.command.register"), []);
  });
}

test("the view page mounts the surface over the view channel and registers every declared name", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
});

test("the view page attaches the document region, places it, and opens the home setting in it", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  assert.deepEqual(callsOf(view, "document.attach"), [{ name: "page" }], "the view attaches the declared region page");
  assert.ok(view.calls.some(({ command, params }) => command === "composition.place" && params.regions.length === 1
    && params.regions[0].name === "page"), "the view places the region in one snapshot");
  assert.deepEqual(region.loads, ["https://home.test/"], "a new tab opens the home setting");
  assert.deepEqual(callsOf(view, "document.zoom"), [{ name: "page", zoom: 1 }], "the document starts at the text size of the surface");
});

test("a browser.navigate run through the channel loads the document region", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  // The command replies after the load of the region, so its reply ends the handling.
  assert.equal(await view.request("browser.navigate", { url: "https://example.test/" }), null);
  assert.deepEqual(region.loads, ["https://home.test/", "https://example.test/"]);
});

test("a document state updates the tab reports and the address field", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  // The region reports the home load (the fixture), then the state of the link that the person followed.
  await pushState(view, documentState("https://a.test/one", { title: "One", link: "https://a.test/two", canGoBack: true }));
  assert.deepEqual(callsOf(view, "tab.title"), [text("https://home.test/"), text("One")], "the home state titles the tab with its address, the loaded state with its title");
  assert.deepEqual(callsOf(view, "tab.footer"), [text(null), text("https://a.test/two")]);
  assert.equal(view.window.document.body.lastElementChild.shadowRoot.querySelector("#address").value, "https://a.test/one");
  const location = await exposure(view, "status.get", { name: "browser.location" });
  assert.equal(location.url, "https://a.test/one");
  assert.equal(location.canGoBack, true);
});

// The params of a tab call that carries one text value.
const text = (value) => value;

test("a tab with a tab state opens its stored address and writes no new tab state", async (t) => {
  const view = await openTab(t, { stored: { url: "https://stored.test/" } });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  // The state of the stored address ends the handling of the state, after which no state write is asserted.
  await pushState(view, documentState("https://stored.test/", { title: "Stored" }));
  assert.deepEqual(callsOf(view, "tab.state.write"), [], "the address of the tab state writes no new tab state");
});

// The page reads region.history and loads nothing when the attach restored a session history
// (core docs/spec/plugins.md#memory-saver). The region answers history as a boolean after its attach (core docs/spec/surface-composition.md).
test("a region that restored the session history of an unloaded tab loads nothing", async (t) => {
  const region = createRegion({ history: true });
  const view = await openTab(t, { region, stored: { url: "https://stored.test/" } });
  await view.load(TAB_PAGE);
  // The start record of the history source follows the decision of the page, so no load follows it.
  await view.logged("plugin.browser.start");
  assert.deepEqual(region.loads, [], "a region that restored the session history loads nothing");
});

// A restored session history reports its state before the page subscribes to the region state (the host sends it while the
// composition is placed); the page shows that state, because the subscription does not replay it.
test("a restored session history shows the state that the region reported before the page subscribed", async (t) => {
  const region = createRegion({ history: true, restoredState: documentState("https://stored.test/", { title: "Stored" }) });
  const view = await openTab(t, { region, stored: { url: "https://stored.test/" } });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  assert.deepEqual(region.loads, [], "a region that restored the session history loads nothing");
  assert.ok(callsOf(view, "tab.title").includes("Stored"), `the restored state titles the tab, the titles are ${JSON.stringify(callsOf(view, "tab.title"))}`);
});

test("the page reports a failure of the view channel as the declared record of its catalog", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  view.window.dispatchEvent(new view.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  const report = await view.logged("plugin.browser.report");
  assert.equal(report.level, "error");
  assert.match(report.fields.text, /failed/);
});

test("the page report is written through the SDK logger as the plugin event report", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  view.window.dispatchEvent(new view.window.ErrorEvent("error", { error: new Error("bridge logger probe"), message: "bridge logger probe" }));
  await view.logged("plugin.browser.report");
  assert.deepEqual(pluginLogs(view).filter(({ event }) => event === "report"), [
    { level: "error", event: "report", fields: { surface: "browser-1", text: "view browser: bridge logger probe" } },
  ]);
});

// The page writes each trace event through runtime.log with the name of its catalog entry without the plugin prefix
// (core docs/spec/plugins.md#logging); the page stores it as plugin.browser.<event>, which events.json must declare.
test("the page records its trace as the declared events of its catalog", async (t) => {
  const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8")).events;
  const region = createRegion();
  const view = await openTab(t, { region });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await pushState(view, documentState("https://a.test/one", { loading: true }));
  await view.logged("plugin.browser.navigation");
  await pushState(view, documentState("https://a.test/one", { title: "One" }));
  await view.logged("plugin.browser.load");
  await view.request("browser.navigate", { url: "https://b.test/" });
  await pushState(view, documentState("https://c.test/", { error: "net::ERR_NAME_NOT_RESOLVED", history: { entries: [{ url: "https://a.test/one", title: "One" }, { url: "https://c.test/", title: "" }], index: 1 } }));
  await view.logged("plugin.browser.region.failure");
  await view.request("browser.history.go", { index: 0 });
  const address = view.window.document.body.lastElementChild.shadowRoot.querySelector("#address");
  address.value = "d.test";
  address.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  view.window.dispatchEvent(new view.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  await view.logged("plugin.browser.report");
  await view.logged("plugin.browser.address.commit");
  await view.logged("plugin.browser.history.move");
  await view.logged("plugin.browser.command");
  const logs = pluginLogs(view);
  const recorded = logs.map((entry) => entry.event);
  for (const event of ["start", "command", "navigation", "load", "region.failure", "history.move", "address.commit", "report"]) {
    assert.ok(recorded.includes(event), `the page recorded ${event}; recorded ${recorded.join(", ")}`);
  }
  for (const entry of logs) {
    const declared = catalog[`plugin.browser.${entry.event}`];
    assert.ok(declared, `the page recorded ${entry.event}, which events.json does not declare as plugin.browser.${entry.event}`);
    assert.ok([declared.level].flat().includes(entry.level), `${entry.event} is recorded at ${entry.level}, the catalog declares ${JSON.stringify(declared.level)}`);
  }
});

// The section statuses are read through their exposure statuses; the page sends no declared UI snapshot, because core keeps none.
test("the page sends no declared UI snapshot, and each section status is read through its exposure status", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await pushState(view, documentState("https://a.test/one", { title: "One" }));
  // The title of the state ends its handling, after which no snapshot is asserted.
  assert.ok(callsOf(view, "tab.title").includes("One"));
  assert.deepEqual(view.sent.filter((message) => message.event === "declared-ui.snapshot"), []);
  assert.deepEqual((await exposure(view, "status.get", { name: "browser.history" })).elements,
    [{ kind: "list", key: "history", empty: "기록 없음", items: [] }]);
  assert.deepEqual((await exposure(view, "status.get", { name: "browser.tabs" })).elements[0].kind, "list");
});

test("a browser.address.select run focuses the address field of the view", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  assert.equal(await view.request("browser.address.select", {}), null);
  const host = view.window.document.body.lastElementChild;
  assert.equal(view.window.document.activeElement, host, "the focus of the address is retargeted to the host of the shadow root");
  assert.equal(host.shadowRoot.activeElement, host.shadowRoot.querySelector("#address"));
});

test("a refused runtime.log batch is reported through runtime.error", async (t) => {
  const view = await openTab(t, { faults: { "command.runtime.log": "log route refused" } });
  await view.load(TAB_PAGE);
  view.window.dispatchEvent(new view.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  await view.settled();
  assert.equal(view.observed.errors.find((line) => line.includes("log batch")),
    "surface browser-1 log batch: page event batch of 3 events failed: log route refused");
});

// P128-4: a bridge error report (a reply that arrives after its call ended) is written through runtime.error, which the application log
// records. The host answers the call once, then sends the same reply again through the window message channel of the view.
test("a late reply of a bridge call is reported through runtime.error", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  const answered = view.sent.find((message) => message.command === "tab.state.read" && message.id !== undefined);
  assert.ok(answered, "the page made a call that the host answered");
  view.window.dispatchEvent(new view.window.MessageEvent("message", { data: { sok: 1, id: answered.id, result: null }, source: view.window }));
  await view.settled();
  assert.deepEqual(view.observed.errors, ["surface browser-1 view bridge: late reply to tab.state.read arrived after its call ended"]);
});

// The red test of P128-1: the page closes its document streams when the view ends (the pagehide of the page disposes its mount).
test("the view closes its document streams when the view ends", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await pushState(view, documentState("https://a.test/one", { title: "One" }));
  // The status of the DOM section is watched, which opens its elements stream; the first value waits for a message of the stream.
  await view.push("exposure-request", { id: 1, surface: SURFACE, method: "status.watch", params: { name: "browser.elements" } });
  assert.deepEqual(region.subscriptions.map(({ stream, closed }) => [stream, closed]), [["elements", false]]);
  await view.close();
  assert.deepEqual(region.subscriptions.map(({ stream, closed }) => [stream, closed]), [["elements", true]],
    "the view closes its elements stream when the view ends");
});

