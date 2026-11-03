// The section view (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces): one page draws the section of
// its start values. It watches core.sidebars for the surface that its section follows, reads core.surfaces to keep only a surface of
// its own plugin, watches the status of its section on that surface, draws the value as DOM, and runs the command of an item that
// the person clicks on that surface. The runtime is a fake of the view bridge runtime, which takes status.watch(name, listener,
// {surface}) and command(name, params, {surface}), so the test reads no SDK.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWindow } from "./dom.mjs";
import { elementsValue, historyValue, requestsValue } from "../build/test/ui/browser.js";
import { createSectionView } from "../build/test/ui/section-view.js";

const { window } = createWindow("sok://browser/ui/section.html");
const { document } = window;

// A fake of the view runtime: each status.watch is recorded with its name and options, and its stop function marks it stopped.
// Each command is recorded with its name, params and options. tabState is the tab state of the section surface as the view calls
// tab.state.read and tab.state.write reach it: read resolves with stored, the state that core keeps for the surface, which is null
// for a section without a stored state, and each write is recorded in writes.
function fakeRuntime({ stored } = { stored: null }) {
  const watches = [];
  const commands = [];
  const writes = [];
  return {
    watches,
    commands,
    writes,
    expose: fakeExpose(),
    tabState: {
      read: () => Promise.resolve(stored),
      write: (value) => { writes.push(value); },
    },
    runtime: {
      status: {
        watch(name, listener, options) {
          const watch = { name, options, listener, stopped: false };
          watches.push(watch);
          return () => { watch.stopped = true; };
        },
      },
      command(name, params, options) {
        const promise = Promise.resolve(null);
        commands.push({ name, params, options, promise });
        return promise;
      },
    },
  };
}

// A fake of the exposure of the page: each status is recorded with its read and subscribe, and each dom registration with its element.
function fakeExpose() {
  const statuses = new Map();
  const doms = [];
  return {
    statuses,
    doms,
    status(name, read, subscribe) {
      statuses.set(name, { read, subscribe });
      return Promise.resolve();
    },
    dom(name, target) {
      doms.push({ name, target });
      return Promise.resolve();
    },
  };
}

// The exposes of the browser plugin that the section view uses: the commands of its items.
const DECLARATIONS = {
  status: [],
  commands: [{ name: "browser.tab.select" }, { name: "browser.history.go" }],
  dom: [],
};

// The dom names of the section view, each registered once through expose.dom.
const DOM_NAMES = ["browser.section.row", "browser.section.item", "browser.section.empty", "browser.section.status"];

// The provider that the page registered for a dom name: the function that returns the current elements.
const providerOf = (fake, name) => fake.expose.doms.find((entry) => entry.name === name).target;

// The elements of a dom name in document order, as root holds them.
const namedIn = (root, name) => [...root.querySelectorAll(`[data-expose="${name}"]`)];

// The labels of the elements of an item list, in order: the text of each element without its children.
const labelsOf = (elements) => elements.map((el) => el.firstChild.textContent);

// The watches of a name that are not stopped; a watch with no options follows the workbench.
const live = (fake, name) => fake.watches.filter((watch) => watch.name === name && !watch.stopped);

// Delivers value to each live watch of name on surface (undefined for the workbench statuses core.sidebars and core.surfaces).
function deliver(fake, name, surface, value) {
  for (const watch of live(fake, name)) {
    if (watch.options?.surface === surface) watch.listener(value);
  }
}

const SECTION = { id: "browser.tabs", sidebar: "left", card: null };

// The value of core.sidebars with one sidebar that draws the section and the surface it follows.
const sidebars = (surface) => [{
  sidebar: "left",
  sections: [{ id: "browser.tabs", surface }],
}];

// The value of core.surfaces with one entry for each surface and its plugin.
const surfaces = (...entries) => entries.map(([surface, plugin]) => ({ surface, plugin, kind: "tab", sidebar: null }));

// Creates the section view in a new root and resolves with the root once the view has read its state.
async function mount(fake, { section = SECTION, reports = [] } = {}) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  await createSectionView({ runtime: fake.runtime, expose: fake.expose, declarations: DECLARATIONS, root, section, tabState: fake.tabState, report: (text) => reports.push(text) });
  return root;
}

test("the section view watches core.sidebars and core.surfaces without a surface, then the status of its section on the followed surface of its plugin", async () => {
  const fake = fakeRuntime();
  await mount(fake);
  assert.deepEqual(fake.watches.map((watch) => [watch.name, watch.options]), [["core.sidebars", undefined], ["core.surfaces", undefined]]);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  const tabs = live(fake, "browser.tabs");
  assert.equal(tabs.length, 1);
  assert.deepEqual(tabs[0].options, { surface: "tab-1" });
});

test("a followed surface of another plugin is not watched, and the section shows the empty state", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["other-1", "other"]));
  deliver(fake, "core.sidebars", undefined, sidebars("other-1"));
  assert.equal(live(fake, "browser.tabs").length, 0, "no watch of a surface of another plugin");
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a followed surface that core.surfaces does not list is not watched", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.sidebars", undefined, sidebars("tab-9"));
  assert.equal(live(fake, "browser.tabs").length, 0);
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a change of core.surfaces that moves the followed surface to another plugin ends its watch", async () => {
  const fake = fakeRuntime();
  await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  assert.equal(live(fake, "browser.tabs").length, 1);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "other"]));
  assert.equal(live(fake, "browser.tabs").length, 0, "the watch of the surface is ended when its plugin is not browser");
});

test("a change of the followed surface unwatches the earlier surface and watches the new one", async () => {
  const fake = fakeRuntime();
  await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"], ["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  const first = fake.watches.find((watch) => watch.name === "browser.tabs" && watch.options.surface === "tab-1");
  assert.equal(first.stopped, true, "the watch on tab-1 is ended");
  const active = live(fake, "browser.tabs");
  assert.deepEqual(active.map((watch) => watch.options), [{ surface: "tab-2" }]);
  // A repeated core.sidebars value with the same surface keeps the watch.
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  assert.equal(fake.watches.filter((watch) => watch.name === "browser.tabs").length, 2);
});

test("a value of the followed status is drawn as DOM, the selected item is marked, and a click runs its command on the followed surface", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", {
    elements: [{
      kind: "list",
      key: "tabs",
      empty: "브라우저 탭 없음",
      items: [
        { key: "t1", label: "Docs", command: "browser.tab.select", params: { tab: "t1" }, selected: false },
        { key: "t2", label: "Mail", command: "browser.tab.select", params: { tab: "t2" }, selected: true },
      ],
    }],
  });
  const buttons = [...root.querySelectorAll("button")];
  assert.deepEqual(buttons.map((button) => button.textContent), ["Docs", "Mail"]);
  assert.equal(root.querySelector("[aria-current='true']").textContent, "Mail");
  buttons[0].click();
  assert.deepEqual(fake.commands.map(({ name, params, options }) => ({ name, params, options })),
    [{ name: "browser.tab.select", params: { tab: "t1" }, options: { surface: "tab-2" } }]);
});

test("a tree value is drawn with its children nested under their parent, and a status line is drawn as text", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake, { section: { id: "browser.dom", sidebar: "left", card: null } });
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, [{ sidebar: "left", sections: [{ id: "browser.dom", surface: "tab-1" }] }]);
  deliver(fake, "browser.elements", "tab-1", {
    elements: [
      { kind: "tree", key: "elements", empty: "요소 없음", nodes: [
        { key: "n0", label: "html", expanded: true, children: [{ key: "n1", label: "body" }] },
      ] },
      { kind: "status-line", key: "elements.cut", text: "2 of 2000" },
    ],
  });
  const outer = root.querySelector("ul.tree > li");
  assert.equal(outer.firstChild.textContent, "html");
  assert.equal(outer.querySelector("ul > li").textContent, "body");
  assert.equal(root.querySelector("p.status").textContent, "2 of 2000");
});

test("a section that follows no surface shows the empty state text and watches no status of the plugin", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "core.sidebars", undefined, sidebars(null));
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
  assert.equal(live(fake, "browser.tabs").length, 0, "no watch of the status remains on a null surface");
});

test("a section that core.sidebars no longer draws ends its watch and reports nothing, because its removal follows the status", async () => {
  const fake = fakeRuntime();
  const reports = [];
  const root = await mount(fake, { reports });
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  assert.equal(live(fake, "browser.tabs").length, 1);
  deliver(fake, "core.sidebars", undefined, []);
  assert.deepEqual(reports, []);
  assert.equal(live(fake, "browser.tabs").length, 0, "no watch of the status remains");
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a null value of the followed status, before the surface registers it, draws nothing and is not reported", async () => {
  const fake = fakeRuntime();
  const reports = [];
  const root = await mount(fake, { reports });
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "browser.tabs", "tab-1", null);
  assert.deepEqual(reports, []);
  assert.equal(root.children.length, 0);
  deliver(fake, "browser.tabs", "tab-1", {});
  assert.deepEqual(reports, ["section browser.tabs has no elements in the value of browser.tabs"]);
});

test("a command that fails is reported with its name and its text", async () => {
  const fake = fakeRuntime();
  const reports = [];
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  fake.runtime.command = (name, params, options) => {
    const promise = Promise.reject(new Error("tab is gone"));
    fake.commands.push({ name, params, options, promise });
    return promise;
  };
  await createSectionView({ runtime: fake.runtime, expose: fake.expose, declarations: DECLARATIONS, root, section: SECTION, tabState: fake.tabState, report: (text) => reports.push(text) });
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "browser.tabs", "tab-1", {
    elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.tab.select", params: { tab: "t1" } }] }],
  });
  root.querySelector("button").click();
  await fake.commands[0].promise.catch(() => {});
  assert.deepEqual(reports, ["command browser.tab.select: tab is gone"]);
});

// The value of one list of tabs on the surface tab-2, with two items.
const tabsValue = (items) => ({
  elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: items.map(([key, label, selected]) => ({
    key, label, command: "browser.tab.select", params: { tab: key }, selected,
  })) }],
});

test("the section view registers the status browser.section, which reports its pending, empty and followed states on each change", async () => {
  const fake = fakeRuntime();
  await mount(fake);
  const status = fake.expose.statuses.get("browser.section");
  assert.ok(status, "browser.section is registered");
  assert.deepEqual(status.read(), { section: "browser.tabs", state: "pending" });
  const seen = [];
  status.subscribe((value) => seen.push(value.state));
  deliver(fake, "core.surfaces", undefined, [...surfaces(["other-1", "other"]), ...surfaces(["tab-1", "browser"])]);
  deliver(fake, "core.sidebars", undefined, sidebars("other-1"));
  deliver(fake, "core.sidebars", undefined, sidebars("other-1"));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  assert.deepEqual(seen, ["pending", "empty", "followed"], "each change is notified once");
  assert.deepEqual(status.read(), { section: "browser.tabs", state: "followed" });
});

test("the rows, items, empty texts and status lines carry declared dom names, and each item is a command control", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", {
    elements: [
      ...tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]).elements,
      { kind: "status-line", key: "tabs.cut", text: "2 of 2" },
    ],
  });
  const named = (name) => [...root.querySelectorAll(`[data-expose="${name}"]`)];
  assert.equal(named("browser.section.row").length, 2);
  assert.deepEqual(named("browser.section.item").map((el) => [el.tagName, el.textContent, el.dataset.command, JSON.parse(el.dataset.params).tab]),
    [["BUTTON", "Docs", "browser.tab.select", "t1"], ["BUTTON", "Mail", "browser.tab.select", "t2"]]);
  assert.equal(named("browser.section.status")[0].textContent, "2 of 2");
  // The registry of the page lists each named element of the section, in document order.
  for (const name of ["browser.section.row", "browser.section.item", "browser.section.status"]) {
    assert.deepEqual(providerOf(fake, name)(), named(name), `${name} lists its elements in document order`);
  }
  for (const el of root.querySelectorAll("button")) assert.ok(el.dataset.command && el.dataset.expose, "each button has a command and a dom name");
});

test("each dom name is registered once, with a provider that returns the current elements", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", false], ["t3", "News", true]]));
  for (const name of DOM_NAMES) {
    const registrations = fake.expose.doms.filter((entry) => entry.name === name);
    assert.equal(registrations.length, 1, `${name} is registered once`);
    assert.equal(typeof registrations[0].target, "function", `${name} is registered with a provider`);
  }
  assert.equal(providerOf(fake, "browser.section.row")().length, 3);
  assert.equal(root.querySelectorAll('[data-expose="browser.section.row"]').length, 3);
});

test("the provider of the rows lists them in document order, a nested child after its parent, and a removed row is not listed", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  const item = (key, label, children) => ({ key, label, command: "browser.tab.select", params: { tab: key }, ...(children ? { children } : {}) });
  deliver(fake, "browser.tabs", "tab-2", { elements: [{ kind: "tree", key: "tabs", empty: "없음", nodes: [
    item("a", "A", [item("a1", "A1")]),
    item("b", "B"),
  ] }] });
  assert.deepEqual(labelsOf(providerOf(fake, "browser.section.row")()), ["A", "A1", "B"]);
  assert.deepEqual(labelsOf(providerOf(fake, "browser.section.item")()), ["A", "A1", "B"]);
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["c", "C", false]]));
  assert.deepEqual(labelsOf(providerOf(fake, "browser.section.row")()), ["C"], "a row that a draw removed is not listed");
  assert.deepEqual(providerOf(fake, "browser.section.row")(), namedIn(root, "browser.section.row"));
});

test("the empty state text carries the dom name browser.section.empty", async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars(null));
  const empty = root.querySelector('[data-expose="browser.section.empty"]');
  assert.equal(empty?.textContent, "연결된 탭 없음");
});

test("a value that names a command the plugin does not declare is refused", async () => {
  const fake = fakeRuntime();
  await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  const value = { elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.unknown", params: {} }] }] };
  assert.throws(() => deliver(fake, "browser.tabs", "tab-2", value), /command browser\.unknown is not declared/);
});

test("a section id that the plugin does not declare is refused", async () => {
  const fake = fakeRuntime();
  await assert.rejects(mount(fake, { section: { id: "browser.other", sidebar: "left", card: null } }),
    /section browser\.other is not a section of the browser plugin/);
});

// A press on an item, a redraw with the same keys between the press and the release, and the release: WebKit sends no click when the
// pressed element was removed, so the element must stay connected and the release must run the command (core docs/spec/exposure.md).
test("a redraw with the same keys between a press and its release keeps the pressed element, and the release runs its command", { timeout: 5000 }, async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  const pressed = root.querySelector("button");
  pressed.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", true], ["t2", "Mail", false]]));
  assert.equal(pressed.isConnected, true, "the pressed element is still in the document after the redraw");
  assert.equal(root.querySelector("button"), pressed, "the key t1 keeps its element");
  pressed.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
  pressed.click();
  assert.deepEqual(fake.commands.map(({ name, params, options }) => ({ name, params, options })),
    [{ name: "browser.tab.select", params: { tab: "t1" }, options: { surface: "tab-2" } }]);
});

// A redraw creates an element only for a key that is new and removes an element only for a key that left; a kept key keeps its element.
test("a redraw creates an element only for a new key and removes the element of a key that left", { timeout: 5000 }, async () => {
  const fake = fakeRuntime();
  const root = await mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  const [first, second] = root.querySelectorAll("button");
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t2", "Mail", false], ["t3", "News", true]]));
  assert.equal(first.isConnected, false, "the element of t1, which left, is removed");
  assert.equal(second.isConnected, true, "the element of t2, which stayed, is kept");
  assert.deepEqual(labelsOf(namedIn(root, "browser.section.item")), ["Mail", "News"]);
  assert.equal(root.querySelectorAll("button")[0], second);
  assert.equal(root.querySelectorAll("button")[1].dataset.params, JSON.stringify({ tab: "t3" }));
});

test("the section page begins with its doctype, holds no import map, and carries the page script", () => {
  const html = readFileSync(new URL("../build/test/ui/section.html", import.meta.url), "utf8");
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
  assert.match(html, /<script type="module" src="\.\/section\.js"><\/script>/);
});

// The memory saver of core unloads a hidden section and restores it when the section is shown again (core
// docs/spec/plugins.md#memory-saver). An unload closes the view of the section, and a restore loads the page again in a new view,
// which core gives the state that the earlier view wrote through tab.state.write, the values of core.sidebars and core.surfaces,
// and the value of the followed status, which the followed surface keeps. Each view of these cases is a new window with the
// section module loaded again.
let views = 0;

// jsdom lays out nothing, so the test gives the body of a section the layout that the section reads: a view of 200 by 100 pixels,
// and content of 20 pixels per row that is 400 pixels wide while the body holds a row. A scroll offset stays within the content,
// and an offset that a scroll or a smaller content changes fires scroll at the body after the task, as a layout does.
function layOut(root) {
  const view = { width: 200, height: 100 };
  const rows = () => root.querySelectorAll("li").length;
  const limit = {
    scrollLeft: () => (rows() > 0 ? 400 : view.width) - view.width,
    scrollTop: () => Math.max(view.height, rows() * 20) - view.height,
  };
  const offsets = { scrollLeft: 0, scrollTop: 0 };
  const move = (name, value) => {
    const next = Math.max(0, Math.min(value, limit[name]()));
    if (next === offsets[name]) return;
    offsets[name] = next;
    setTimeout(() => root.dispatchEvent(new root.ownerDocument.defaultView.Event("scroll")), 0);
  };
  for (const name of ["scrollLeft", "scrollTop"]) {
    Object.defineProperty(root, name, {
      configurable: true,
      get: () => { move(name, offsets[name]); return offsets[name]; },
      set: (value) => move(name, value),
    });
  }
  Object.defineProperty(root, "clientWidth", { configurable: true, get: () => view.width });
  Object.defineProperty(root, "clientHeight", { configurable: true, get: () => view.height });
  Object.defineProperty(root, "scrollWidth", { configurable: true, get: () => view.width + limit.scrollLeft() });
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => view.height + limit.scrollTop() });
}

// Resolves after the scroll events that the layout queued have run.
const settle = async () => {
  for (let round = 0; round < 4; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

// Opens a view of the section id as the host does: a new window whose body is the root of the section page (ui/section.js), and
// the state that core gives the view.
async function openView(id, stored) {
  const { window: view } = createWindow("sok://browser/ui/section.html");
  views += 1;
  const { createSectionView: create } = await import(`../build/test/ui/section-view.js?view=${views}`);
  const fake = fakeRuntime({ stored });
  const reports = [];
  const root = view.document.body;
  layOut(root);
  await create({ runtime: fake.runtime, expose: fake.expose, declarations: DECLARATIONS, root, section: { id, sidebar: "left", card: null }, tabState: fake.tabState, report: (text) => reports.push(text) });
  return { view, fake, root, reports };
}

// Core reports the section on the surface tab-1 of the browser plugin, and tab-1 gives each value of the status of the section.
function follow(opened, id, status, values, surface = "tab-1") {
  deliver(opened.fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"], ["tab-2", "browser"]));
  deliver(opened.fake, "core.sidebars", undefined, [{ sidebar: "left", sections: [{ id, surface }] }]);
  for (const value of values) deliver(opened.fake, status, surface, value);
}

const ROWS = 12;
// The values that the followed surface gives a watch of the status of each section, from the value builders of the tab page
// (ui/browser.js): a stream status gives its empty value when the watch starts and the value that the region collected after it,
// and the history and the tabs give their value at once.
const RESTORE_CASES = [
  { id: "browser.dom", status: "browser.elements", values: [elementsValue(null), elementsValue({
    nodes: [
      { node: 1, depth: 0, tag: "html", id: "", class: "" },
      { node: 2, depth: 1, tag: "body", id: "", class: "" },
      ...Array.from({ length: ROWS - 2 }, (_, index) => ({ node: index + 3, depth: 2, tag: "div", id: `d${index}`, class: "row wide" })),
    ],
    total: 600,
    truncated: true,
  })] },
  { id: "browser.network", status: "browser.requests", values: [requestsValue(null), requestsValue({
    entries: Array.from({ length: ROWS }, (_, index) => ({ url: `https://site.test/r${index}.js`, type: "script", start: index, duration: 10 + index })),
    dropped: 3,
  })] },
  { id: "browser.tabs", status: "browser.tabs", values: [
    tabsValue(Array.from({ length: ROWS }, (_, index) => [`t${index}`, `Tab ${index}`, index === 5])),
  ] },
  { id: "browser.history", status: "browser.history", values: [historyValue({
    entries: Array.from({ length: ROWS }, (_, index) => ({ url: `https://site.test/p${index}`, title: `Page ${index}` })),
    index: 4,
  })] },
];

for (const { id, status, values } of RESTORE_CASES) {
  test(`the ${id} section that core unloads and restores shows the rows and the scroll position that it had`, async () => {
    // The loaded view draws the value of tab-1, and the person scrolls its body.
    const loaded = await openView(id, null);
    follow(loaded, id, status, values);
    loaded.root.scrollLeft = 120;
    loaded.root.scrollTop = 90;
    await settle();
    const shown = loaded.root.innerHTML;
    // The unload closes the view, and core keeps the last state that the view wrote; a section that wrote no state has none, which
    // tab.state.read gives as null.
    const stored = loaded.fake.writes.at(-1) ?? null;
    loaded.view.close();
    // The restore loads the page in a new view, which core gives the stored state, the same section and surface, and the values
    // that tab-1 gives a new watch of the status.
    const restored = await openView(id, stored);
    follow(restored, id, status, values);
    await settle();
    assert.equal(restored.root.innerHTML, shown, "the restored section shows the rows that it had");
    assert.deepEqual({ x: restored.root.scrollLeft, y: restored.root.scrollTop }, { x: 120, y: 90 }, "the restored section shows the scroll position that it had");
    assert.deepEqual(stored, { surface: "tab-1", scroll: { x: 120, y: 90 } }, "the view writes the followed surface and the scroll position as its state");
    assert.deepEqual(restored.fake.writes, [], "the restored view writes no other state");
    assert.deepEqual([...loaded.reports, ...restored.reports], []);
  });
}

test("a restored section that follows another surface than its state names starts at the top and writes the state of that surface", async () => {
  const [{ id, status, values }] = RESTORE_CASES;
  const restored = await openView(id, { surface: "tab-1", scroll: { x: 120, y: 90 } });
  follow(restored, id, status, values, "tab-2");
  await settle();
  assert.deepEqual({ x: restored.root.scrollLeft, y: restored.root.scrollTop }, { x: 0, y: 0 });
  assert.deepEqual(restored.fake.writes, [{ surface: "tab-2", scroll: { x: 0, y: 0 } }]);
});

test("a scroll of the person before the rows reach the stored position keeps the position of the person", async () => {
  const { id, status, values } = RESTORE_CASES[1];
  const restored = await openView(id, { surface: "tab-1", scroll: { x: 120, y: 90 } });
  // The first value holds six rows, which reach no scroll offset of 90 pixels.
  follow(restored, id, status, [requestsValue({ entries: Array.from({ length: 6 }, (_, index) => ({ url: `https://site.test/r${index}.js`, type: "script", start: index, duration: 1 })), dropped: 0 })]);
  restored.root.scrollLeft = 50;
  restored.root.scrollTop = 10;
  await settle();
  follow(restored, id, status, values);
  await settle();
  assert.deepEqual({ x: restored.root.scrollLeft, y: restored.root.scrollTop }, { x: 50, y: 10 });
  assert.deepEqual(restored.fake.writes, [{ surface: "tab-1", scroll: { x: 50, y: 10 } }]);
});

test("a stored state of another form is refused", async () => {
  await assert.rejects(openView("browser.history", { scroll: 90 }),
    /the state of section browser\.history is not \{surface, scroll: \{x, y\}\}: \{"scroll":90\}/);
});
