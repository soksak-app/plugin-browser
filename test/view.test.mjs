// The view page at the consumer boundary (#P27.3): the page of the view carries the import map of the view, reads the
// start values of the surface, builds its surface context over the view channel, attaches the document region "page"
// through the composition of the view, and mounts the browser module into the page. The host side of the channel is
// test/view-host.mjs, which serves the call route of a view as the core workbench answers it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createViewPage } from "./view-host.mjs";

// The import map of a view page as the core wire serves it, as a literal fake of the check of the page.
const VIEW_IMPORTS = Object.freeze({
  "soksak": "sok://core/modules/soksak/dist/index.js",
  "@soksak/plugin-api": "sok://core/modules/@soksak/plugin-api/index.js",
  "@soksak/plugin-api/view": "sok://core/modules/@soksak/plugin-api/view.js",
  "@soksak/shared/": "sok://core/shared/",
});

// The check of a view page: exactly one static import map whose imports equal VIEW_IMPORTS, and no other field.
function checkViewPage(html) {
  const maps = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)];
  assert.equal(maps.length, 1, "expected one import map");
  const map = JSON.parse(maps[0][1]);
  const field = Object.keys(map).find((key) => key !== "imports");
  assert.equal(field, undefined, "the import map has an unexpected field");
  assert.deepEqual(map.imports, VIEW_IMPORTS);
}

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const PAGE = new URL("../build/test/ui/index.html", import.meta.url);
const START = { surface: "browser-1", params: {}, origin: { directory: "/work" }, project: { root: "/project" }, declarations: manifest.exposes };

test("the view page carries the import map of the view and the page script", () => {
  const html = readFileSync(PAGE, "utf8");
  assert.equal(checkViewPage(html), undefined);
  assert.match(html, /<script type="module" src="\.\/view\.js"><\/script>/);
});

test("the view page refuses to mount without the start values of the surface", async (t) => {
  const host = createViewPage(t, "no-start");
  host.window.sokSurface = null;
  await assert.rejects(import("../build/test/ui/view.js?case=no-start"),
    /the view of browser has no start values: the host provides window\.sokSurface/);
});

// Each start value of another form than core injects is refused before the page sends anything.
for (const [label, change, reason] of [
  ["without declarations", { declarations: undefined }, /declarations/],
  ["with declarations that are an array", { declarations: [] }, /declarations/],
  ["with an origin of an empty directory", { origin: { directory: "" } }, /origin/],
  ["with an origin that is text", { origin: "/work" }, /origin/],
  ["with a project whose root is not text", { project: { root: 1 } }, /project/],
  ["without params", { params: undefined }, /params/],
]) {
  test(`the view page refuses start values ${label}`, async (t) => {
    const caseId = `start-${label.replaceAll(" ", "-")}`;
    const host = createViewPage(t, caseId, { start: { ...START, ...change } });
    await assert.rejects(import(`../ui/view.js?case=${caseId}`), reason);
    assert.deepEqual(host.reports.registered, []);
  });
}

test("the view page mounts the surface over the view channel and registers every declared name", async (t) => {
  const { settle } = createViewPage(t, "mount");
  await import("../build/test/ui/view.js?case=mount");
  await settle();
});

test("the view page attaches the document region, places it, and opens the home setting in it", async (t) => {
  const { region, calls, settle } = createViewPage(t, "region");
  await import("../build/test/ui/view.js?case=region");
  await settle();
  assert.deepEqual(calls.find(([name]) => name === "document.attach")?.[1], { name: "page" }, "the view attaches the declared region page");
  assert.ok(calls.some(([name, params]) => name === "composition.place" && params.regions.length === 1
    && params.regions[0].name === "page"), "the view places the region in one snapshot");
  assert.deepEqual(region.loads, ["https://home.test/"], "a new tab opens the home setting");
  assert.deepEqual(calls.filter(([name]) => name === "document.zoom").map(([, params]) => params),
    [{ name: "page", zoom: 1 }], "the document starts at the text size of the surface");
});

test("a browser.navigate run through the channel loads the document region", async (t) => {
  const { region, run, settle } = createViewPage(t, "navigate");
  await import("../build/test/ui/view.js?case=navigate");
  await settle();
  assert.equal(await run("browser.navigate", { url: "https://example.test/" }), null);
  await settle();
  assert.deepEqual(region.loads, ["https://home.test/", "https://example.test/"]);
});

test("a document state updates the tab reports and the address field", async (t) => {
  const { window, region, reports, expose, settle } = createViewPage(t, "state");
  await import("../build/test/ui/view.js?case=state");
  await settle();
  region.show("https://a.test/one", { title: "One", link: "https://a.test/two", canGoBack: true });
  await settle();
  assert.deepEqual(reports.title, ["https://home.test/", "One"], "the home state titles the tab with its address, the loaded state with its title");
  assert.deepEqual(reports.footer, [null, "https://a.test/two"]);
  assert.equal(window.document.body.lastElementChild.shadowRoot.querySelector("#address").value, "https://a.test/one");
  const reply = await expose("status.get", { name: "browser.location" });
  assert.equal(reply.result.url, "https://a.test/one");
  assert.equal(reply.result.canGoBack, true);
});

test("a tab with a tab state opens its stored address and writes no new tab state", async (t) => {
  const host = createViewPage(t, "restored", { stored: { url: "https://stored.test/" } });
  await import("../build/test/ui/view.js?case=restored");
  await host.settle();
  assert.deepEqual(host.region.loads, ["https://stored.test/"]);
  assert.deepEqual(host.reports.state, [], "the address of the tab state writes no new tab state");
});

// The page reads region.history and loads nothing when the attach restored a session history
// (core docs/spec/plugins.md#memory-saver). The region handle reports history as a boolean after its attach
// (core docs/spec/surface-composition.md); the fake attach reply carries it.
test("a region that restored the session history of an unloaded tab loads nothing", async (t) => {
  const host = createViewPage(t, "history-restored", { stored: { url: "https://stored.test/" } });
  host.region.history = true;
  await import("../build/test/ui/view.js?case=history-restored");
  await host.settle();
  assert.deepEqual(host.region.loads, [], "a region that restored the session history loads nothing");
});

// A restored session history reports its state before the page subscribes to the region state (the host sends it while the
// composition is placed); the page shows that state, because the subscription does not replay it.
test("a restored session history shows the state that the region reported before the page subscribed", async (t) => {
  const host = createViewPage(t, "history-state", { stored: { url: "https://stored.test/" } });
  host.region.history = true;
  host.region.restoredState = host.region.stateOf("https://stored.test/", { title: "Stored" });
  await import("../build/test/ui/view.js?case=history-state");
  await host.settle();
  assert.deepEqual(host.region.loads, [], "a region that restored the session history loads nothing");
  assert.ok(host.reports.title.includes("Stored"), `the restored state titles the tab, the titles are ${JSON.stringify(host.reports.title)}`);
});

test("the page reports a failure of the view channel as the declared record of its catalog", async (t) => {
  const host = createViewPage(t, "report");
  await import("../build/test/ui/view.js?case=report");
  host.window.dispatchEvent(new host.window.ErrorEvent("error", { error: new Error("failed"), message: "failed" }));
  await host.settle();
  const report = host.logs.find((entry) => entry.event === "plugin.browser.report");
  assert.ok(report, "the page stored no report record");
  assert.equal(report.level, "error");
  assert.match(report.fields.text, /failed/);
});

test("the page pushes the declared UI value of each section status", async (t) => {
  const { region, snapshots, settle } = createViewPage(t, "declared");
  await import("../build/test/ui/view.js?case=declared");
  await settle();
  region.show("https://a.test/one", { title: "One" });
  await settle();
  const byStatus = Object.fromEntries(snapshots.map((snapshot) => [snapshot.status, snapshot]));
  assert.deepEqual(Object.keys(byStatus).toSorted(), ["browser.elements", "browser.history", "browser.requests"]);
  assert.equal(byStatus["browser.history"].plugin, "browser");
  assert.deepEqual(byStatus["browser.history"].value.elements,
    [{ kind: "list", key: "history", empty: "기록 없음", items: [] }], "the first value is the whole value of the status");
  assert.ok(Number.isInteger(byStatus["browser.history"].seq) && byStatus["browser.history"].seq > 0);
  assert.deepEqual(byStatus["browser.requests"].value,
    { elements: [{ kind: "list", key: "requests", empty: "요청 없음", items: [] }] });
});

test("a browser.address.select run focuses the address field of the view", async (t) => {
  const { window, run, settle } = createViewPage(t, "select");
  await import("../build/test/ui/view.js?case=select");
  await settle();
  assert.equal(await run("browser.address.select", {}), null);
  const host = window.document.body.lastElementChild;
  assert.equal(window.document.activeElement, host, "the focus of the address is retargeted to the host of the shadow root");
  assert.equal(host.shadowRoot.activeElement, host.shadowRoot.querySelector("#address"));
});
