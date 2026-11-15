import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { callsOf, createRegion, documentState, exposure, openTab, pushState, sendExposure, START, TAB_PAGE } from "./fixtures/view.mjs";

const source = readFileSync(new URL("../ui/browser.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const names = (kind) => manifest.exposes[kind].map((entry) => entry.name);

test("the browser module exports its mount function", () => {
  assert.match(source, /export (?:async )?function mount/);
});

test("every control names a declared element entry and a declared command", () => {
  assert.match(source, /data-expose="browser.address/);
  assert.match(source, /data-command="browser.reload/);
  assert.ok(names("element").length > 0);
});

test("the document region is a declared element entry and the start address is the home setting", () => {
  assert.match(source, /browser.document/);
  assert.equal(manifest.home, undefined);
  assert.deepEqual(manifest.settings.home, { label: "홈 주소", description: manifest.settings.home.description, type: "address", default: "" });
  assert.deepEqual(names("commands"), ["browser.content.read", "browser.history.go", "browser.address.select", "browser.navigate", "browser.back", "browser.forward", "browser.reload", "browser.stop", "browser.tab.select"]);
  assert.deepEqual(names("status"), ["browser.location", "browser.address.text", "browser.history", "browser.elements", "browser.requests", "browser.tabs", "browser.section"]);
});

test("browser mount publishes document state, respects shadow focus, and disposes every port", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region, textSize: 1.25 });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  const shadow = view.window.document.body.lastElementChild.shadowRoot;
  // 문서의 페이지 확대는 표면의 글자 배율을 따른다(docs/spec/text-size.md).
  assert.deepEqual(region.zooms, [1.25], "the document starts at the surface text size");
  await view.change.textSize(2);
  assert.deepEqual(region.zooms, [1.25, 2], "the document follows text size changes");
  // 기록 이동과 새로 고침 단추는 core 아이콘 표의 경로를 직접 그린다.
  const pathOf = (command) => shadow.querySelector(`[data-command="${command}"] svg`)?.innerHTML;
  assert.deepEqual(["browser.back", "browser.forward", "browser.reload"].map(pathOf),
    ['<path d="m15 18-6-6 6-6"></path>', '<path d="m9 18 6-6-6-6"></path>',
      '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path>']);
  const address = shadow.querySelector("#address");
  address.focus();
  address.value = "https://typing.test/";
  address.dispatchEvent(new view.window.Event("input", { bubbles: true }));
  await pushState(view, documentState("https://changed.test/", { title: "changed" }));
  assert.equal(address.value, "https://typing.test/", "text being typed is not overwritten");
  await sendExposure(view, "status.watch", { name: "browser.location" });
  await pushState(view, documentState("https://next.test/"));
  assert.equal((await exposure(view, "status.get", { name: "browser.location" })).url, "https://next.test/");
  const watchValues = callsOf(view, "runtime.native.call").filter((params) => params.name === "changed" && params.payload.name === "browser.location")
    .map((params) => params.payload.value.url);
  assert.deepEqual(watchValues, ["https://changed.test/", "https://next.test/"]);
  await sendExposure(view, "status.unwatch", { name: "browser.location" });
  await view.close();
  // The dispose of the mount ends the composition of the view, which detaches its region.
  assert.deepEqual(callsOf(view, "document.detach"), [{ name: "page" }]);
  assert.equal(shadow.childNodes.length, 0);
});

// The tab state of a restored view: the address it opens and the addresses that it writes.
test("a tab opens the address of its tab state and writes each new address", async (t) => {
  const region = createRegion();
  const view = await openTab(t, { region, stored: { url: "https://stored.test/" } });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  assert.deepEqual(region.loads, ["https://stored.test/"]);
  // The view runs on the soksak origin, which jsdom gives no localStorage: the address cannot be kept there (not the same check as the
  // length of an https origin's localStorage, which the view test could not reach).
  assert.throws(() => view.window.localStorage, { name: "SecurityError" }, "the view origin has no localStorage");
  await pushState(view, documentState("https://stored.test/"));
  await pushState(view, documentState("https://next.test/"));
  await pushState(view, documentState("https://next.test/"));
  assert.deepEqual(callsOf(view, "tab.state.write"), [{ url: "https://next.test/" }]);
  await view.close();
});

test("a region that restored the session history loads nothing, and a new tab opens home", async (t) => {
  const restoredRegion = createRegion({ history: true });
  const restored = await openTab(t, { region: restoredRegion, stored: { url: "https://stored.test/" } });
  await restored.load(TAB_PAGE);
  await restored.logged("plugin.browser.start");
  assert.deepEqual(restoredRegion.loads, []);
  await restored.close();
  const freshRegion = createRegion();
  const fresh = await openTab(t, { region: freshRegion, stored: null });
  await fresh.load(TAB_PAGE);
  await fresh.logged("plugin.browser.start");
  assert.deepEqual(freshRegion.loads, ["https://home.test/"]);
  await fresh.close();
});

test("a tab state without an http or https address is refused", async (t) => {
  const view = await openTab(t, { stored: { url: "file:///etc" }, start: { ...START, surface: "browser-state-test" } });
  await view.load(TAB_PAGE);
  const report = await view.logged("plugin.browser.report");
  assert.match(report.fields.text, /the tab state of browser tab browser-state-test has no http or https address: \{"url":"file:\/\/\/etc"\}/);
});

