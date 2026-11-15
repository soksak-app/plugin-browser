// The section view (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces): the section page (the real
// ui/section.js, opened by openSection) draws the section of its start values. It watches core.sidebars for the surface that
// its section follows, reads core.surfaces to keep only a surface of its own plugin, watches the status of its section on that surface,
// draws the value as DOM, and runs the command of an item that the person clicks on that surface. The statuses of the core and of the
// surfaces are delivered with view.change.status, and the runs of the commands are the commands that the host observed.
import assert from "node:assert/strict";
import test from "node:test";
import { SECTION_PAGE, callsOf, changesOf, exposure, liveWatches, openSection, pluginLogs, sendExposure } from "./fixtures/view.mjs";
import { elementsValue, historyValue, requestsValue } from "../ui/browser.js";

const SECTION = { id: "browser.tabs", sidebar: "left", card: null };

// Delivers value to the status name of the surface (undefined for the workbench statuses core.sidebars and core.surfaces).
const deliver = (view, name, surface, value) => view.change.status(name, value, surface);

// The value of core.sidebars with one sidebar that draws the section and the surface it follows.
const sidebars = (surface) => [{ sidebar: "left", sections: [{ id: "browser.tabs", surface }] }];

// The value of core.surfaces with one entry for each surface and its plugin.
const surfaces = (...entries) => entries.map(([surface, plugin]) => ({ surface, plugin, kind: "tab", sidebar: null }));

// The elements of an element name in document order, as the root holds them.
const namedIn = (root, name) => [...root.querySelectorAll(`[data-expose="${name}"]`)];

// The labels of the elements of an item list, in order: the text of each element without its children.
const labelsOf = (elements) => elements.map((el) => el.firstChild.textContent);

// The report records of the page: the texts of the report events of the section.
const reportsOf = (view) => pluginLogs(view).filter(({ event }) => event === "report").map(({ fields }) => fields.text);

// The value of one list of tabs on a surface, with its items.
const tabsValue = (items) => ({
  elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: items.map(([key, label, selected]) => ({
    key, label, command: "browser.tab.select", params: { tab: key }, selected,
  })) }],
});

// Opens the section view of the tabs section on the page, and waits until the page has started.
const openTabs = async (t, options) => {
  const view = await openSection(t, SECTION, options);
  await view.settled();
  return view;
};

test("the section view watches core.sidebars and core.surfaces without a surface, then the status of its section on the followed surface of its plugin", async (t) => {
  const view = await openTabs(t);
  assert.deepEqual(callsOf(view, "runtime.status.watch").map((params) => [params.name, params.surface]), [["core.sidebars", undefined], ["core.surfaces", undefined]]);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  const tabs = liveWatches(view, "browser.tabs");
  assert.equal(tabs.length, 1);
  assert.deepEqual(tabs[0], { name: "browser.tabs", surface: "tab-1" });
});

test("a followed surface of another plugin is not watched, and the section shows the empty state", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["other-1", "other"]));
  await deliver(view, "core.sidebars", undefined, sidebars("other-1"));
  assert.equal(liveWatches(view, "browser.tabs").length, 0, "no watch of a surface of another plugin");
  assert.equal(view.window.document.body.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a followed surface that core.surfaces does not list is not watched", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.sidebars", undefined, sidebars("tab-9"));
  assert.equal(liveWatches(view, "browser.tabs").length, 0);
  assert.equal(view.window.document.body.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a change of core.surfaces that moves the followed surface to another plugin ends its watch", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  assert.equal(liveWatches(view, "browser.tabs").length, 1);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "other"]));
  assert.equal(liveWatches(view, "browser.tabs").length, 0, "the watch of the surface is ended when its plugin is not browser");
});

test("a change of the followed surface unwatches the earlier surface and watches the new one", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"], ["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  assert.deepEqual(callsOf(view, "runtime.status.watch").filter((params) => params.name === "browser.tabs").map((params) => params.surface), ["tab-1", "tab-2"]);
  assert.deepEqual(callsOf(view, "runtime.status.unwatch").filter((params) => params.name === "browser.tabs").map((params) => params.surface), ["tab-1"],
    "the watch on tab-1 is ended");
  assert.deepEqual(liveWatches(view, "browser.tabs"), [{ name: "browser.tabs", surface: "tab-2" }]);
  // A repeated core.sidebars value with the same surface keeps the watch.
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  assert.equal(callsOf(view, "runtime.status.watch").filter((params) => params.name === "browser.tabs").length, 2);
});

test("a value of the followed status is drawn as DOM, the selected item is marked, and a click runs its command on the followed surface", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  await deliver(view, "browser.tabs", "tab-2", {
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
  const root = view.window.document.body;
  const buttons = [...root.querySelectorAll("button")];
  assert.deepEqual(buttons.map((button) => button.textContent), ["Docs", "Mail"]);
  assert.equal(root.querySelector("[aria-current='true']").textContent, "Mail");
  buttons[0].click();
  await view.settled();
  assert.deepEqual(view.observed.commands.map(({ name, params, surface }) => ({ name, params, surface })),
    [{ name: "browser.tab.select", params: { tab: "t1" }, surface: "tab-2" }]);
});

test("a tree value is drawn with its children nested under their parent, and a status line is drawn as text", async (t) => {
  const view = await openSection(t, { id: "browser.dom", sidebar: "left", card: null });
  await view.settled();
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, [{ sidebar: "left", sections: [{ id: "browser.dom", surface: "tab-1" }] }]);
  await deliver(view, "browser.elements", "tab-1", {
    elements: [
      { kind: "tree", key: "elements", empty: "요소 없음", nodes: [
        { key: "n0", label: "html", expanded: true, children: [{ key: "n1", label: "body" }] },
      ] },
      { kind: "status-line", key: "elements.cut", text: "2 of 2000" },
    ],
  });
  const root = view.window.document.body;
  const outer = root.querySelector("ul.tree > li");
  assert.equal(outer.firstChild.textContent, "html");
  assert.equal(outer.querySelector("ul > li").textContent, "body");
  assert.equal(root.querySelector("p.status").textContent, "2 of 2000");
});

test("a section that follows no surface shows the empty state text and watches no status of the plugin", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  await deliver(view, "core.sidebars", undefined, sidebars(null));
  assert.equal(view.window.document.body.querySelector("p.empty").textContent, "연결된 탭 없음");
  assert.equal(liveWatches(view, "browser.tabs").length, 0, "no watch of the status remains on a null surface");
});

test("a section that core.sidebars no longer draws ends its watch and reports nothing, because its removal follows the status", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  assert.equal(liveWatches(view, "browser.tabs").length, 1);
  await deliver(view, "core.sidebars", undefined, []);
  assert.deepEqual(reportsOf(view), []);
  assert.equal(liveWatches(view, "browser.tabs").length, 0, "no watch of the status remains");
  assert.equal(view.window.document.body.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a null value of the followed status, before the surface registers it, draws nothing and is not reported", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  await deliver(view, "browser.tabs", "tab-1", null);
  await view.settled();
  assert.deepEqual(reportsOf(view), []);
  assert.equal(view.window.document.body.children.length, 0);
  await deliver(view, "browser.tabs", "tab-1", {});
  await view.settled();
  assert.deepEqual(reportsOf(view), ["section browser.tabs has no elements in the value of browser.tabs"]);
});

test("a command that fails is reported with its name and its text", async (t) => {
  const view = await openTabs(t, { commands: { "browser.tab.select": () => { throw new Error("tab is gone"); } } });
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  await deliver(view, "browser.tabs", "tab-1", {
    elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.tab.select", params: { tab: "t1" } }] }],
  });
  view.window.document.body.querySelector("button").click();
  await view.settled();
  assert.deepEqual(reportsOf(view), ["command browser.tab.select: tab is gone"]);
});

test("the section view registers the status browser.section, which reports its pending, empty and followed states on each change", async (t) => {
  const view = await openTabs(t);
  assert.deepEqual(await exposure(view, "status.get", { name: "browser.section" }), { section: "browser.tabs", state: "pending" });
  await sendExposure(view, "status.watch", { name: "browser.section" });
  await deliver(view, "core.surfaces", undefined, [...surfaces(["other-1", "other"]), ...surfaces(["tab-1", "browser"])]);
  await deliver(view, "core.sidebars", undefined, sidebars("other-1"));
  await deliver(view, "core.sidebars", undefined, sidebars("other-1"));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-1"));
  assert.deepEqual(changesOf(view, "browser.section").map((value) => value.state), ["pending", "empty", "followed"], "each change is notified once");
  assert.deepEqual(await exposure(view, "status.get", { name: "browser.section" }), { section: "browser.tabs", state: "followed" });
});

test("the rows, items, empty texts and status lines carry declared element names, and each item is a command control", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  await deliver(view, "browser.tabs", "tab-2", {
    elements: [
      ...tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]).elements,
      { kind: "status-line", key: "tabs.cut", text: "2 of 2" },
    ],
  });
  const root = view.window.document.body;
  const named = (name) => namedIn(root, name);
  assert.equal(named("browser.section.row").length, 2);
  assert.deepEqual(named("browser.section.item").map((el) => [el.tagName, el.textContent, el.dataset.command, JSON.parse(el.dataset.params).tab]),
    [["BUTTON", "Docs", "browser.tab.select", "t1"], ["BUTTON", "Mail", "browser.tab.select", "t2"]]);
  assert.equal(named("browser.section.status")[0].textContent, "2 of 2");
  for (const button of root.querySelectorAll("button")) assert.ok(button.dataset.command && button.dataset.expose, "each button has a command and an element name");
});

test("each element name is registered once, with a provider that returns the current elements", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", false], ["t3", "News", true]]));
  const registered = callsOf(view, "runtime.native.call").filter((params) => params.name === "registered" && params.payload.kind === "element")
    .map((params) => params.payload.name);
  for (const name of ["browser.section.row", "browser.section.item", "browser.section.empty", "browser.section.status"]) {
    assert.equal(registered.filter((entry) => entry === name).length, 1, `${name} is registered once`);
  }
  assert.equal(view.window.document.body.querySelectorAll('[data-expose="browser.section.row"]').length, 3);
});

test("the provider of the rows lists them in document order, a nested child after its parent, and a removed row is not listed", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  const item = (key, label, children) => ({ key, label, command: "browser.tab.select", params: { tab: key }, ...(children ? { children } : {}) });
  await deliver(view, "browser.tabs", "tab-2", { elements: [{ kind: "tree", key: "tabs", empty: "없음", nodes: [
    item("a", "A", [item("a1", "A1")]),
    item("b", "B"),
  ] }] });
  const root = view.window.document.body;
  assert.deepEqual(labelsOf(namedIn(root, "browser.section.row")), ["A", "A1", "B"]);
  assert.deepEqual(labelsOf(namedIn(root, "browser.section.item")), ["A", "A1", "B"]);
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["c", "C", false]]));
  assert.deepEqual(labelsOf(namedIn(root, "browser.section.row")), ["C"], "a row that a draw removed is not listed");
});

test("the empty state text carries the element name browser.section.empty", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars(null));
  const empty = view.window.document.body.querySelector('[data-expose="browser.section.empty"]');
  assert.equal(empty?.textContent, "연결된 탭 없음");
});

// P128-3: the value of a section that names an undeclared command is refused, the refusal is reported through runtime.error (the record
// of the application log), and the item is not drawn.
test("a section value that names a command the plugin does not declare is reported through runtime.error and its item is not drawn", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  const value = { elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.unknown", params: {} }] }] };
  await deliver(view, "browser.tabs", "tab-2", value);
  await view.settled();
  assert.deepEqual(view.observed.errors, ["surface browser-1 section browser.tabs: command browser.unknown is not declared"]);
  assert.equal(view.window.document.body.querySelectorAll("button").length, 0, "the item that names an undeclared command is not drawn");
});

test("a section id that the plugin does not declare is refused", async (t) => {
  const view = await openSection(t, { id: "browser.other", sidebar: "left", card: null });
  await view.settled();
  const report = await view.logged("plugin.browser.report");
  assert.match(report.fields.text, /section browser\.other is not a section of the browser plugin/);
});

// A press on an item, a redraw with the same keys between the press and the release, and the release: WebKit sends no click when the
// pressed element was removed, so the element must stay connected and the release must run the command (core docs/spec/exposure.md).
test("a redraw with the same keys between a press and its release keeps the pressed element, and the release runs its command", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  const root = view.window.document.body;
  const pressed = root.querySelector("button");
  pressed.dispatchEvent(new view.window.Event("pointerdown", { bubbles: true }));
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", true], ["t2", "Mail", false]]));
  assert.equal(pressed.isConnected, true, "the pressed element is still in the document after the redraw");
  assert.equal(root.querySelector("button"), pressed, "the key t1 keeps its element");
  pressed.dispatchEvent(new view.window.Event("pointerup", { bubbles: true }));
  pressed.click();
  await view.settled();
  assert.deepEqual(view.observed.commands.map(({ name, params, surface }) => ({ name, params, surface })),
    [{ name: "browser.tab.select", params: { tab: "t1" }, surface: "tab-2" }]);
});

// A redraw creates an element only for a key that is new and removes an element only for a key that left; a kept key keeps its element.
test("a redraw creates an element only for a new key and removes the element of a key that left", async (t) => {
  const view = await openTabs(t);
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, sidebars("tab-2"));
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  const root = view.window.document.body;
  const [first, second] = root.querySelectorAll("button");
  await deliver(view, "browser.tabs", "tab-2", tabsValue([["t2", "Mail", false], ["t3", "News", true]]));
  assert.equal(first.isConnected, false, "the element of t1, which left, is removed");
  assert.equal(second.isConnected, true, "the element of t2, which stayed, is kept");
  assert.deepEqual(labelsOf(namedIn(root, "browser.section.item")), ["Mail", "News"]);
  assert.equal(root.querySelectorAll("button")[0], second);
  assert.equal(root.querySelectorAll("button")[1].dataset.params, JSON.stringify({ tab: "t3" }));
});

test("the section page begins with its doctype, holds no import map, and carries the page script", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../ui/section.html", import.meta.url), "utf8");
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
  assert.match(html, /<script type="module" src="\.\/section\.js"><\/script>/);
  assert.equal(SECTION_PAGE.pathname.endsWith("/ui/section.js"), true);
});

// The memory saver of core unloads a hidden section and restores it when the section is shown again (core
// docs/spec/plugins.md#memory-saver). An unload closes the view of the section, and a restore loads the page again in a new view,
// which core gives the state that the earlier view wrote through tab.state.write, the values of core.sidebars and core.surfaces,
// and the value of the followed status, which the followed surface keeps. Each view of these cases is a new view with the section page.
// Core reports the section on the surface tab-1 of the browser plugin, and tab-1 gives each value of the status of the section.
async function follow(view, id, status, values, surface = "tab-1") {
  await deliver(view, "core.surfaces", undefined, surfaces(["tab-1", "browser"], ["tab-2", "browser"]));
  await deliver(view, "core.sidebars", undefined, [{ sidebar: "left", sections: [{ id, surface }] }]);
  for (const value of values) await deliver(view, status, surface, value);
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
  test(`the ${id} section that core unloads and restores shows the rows and the scroll position that it had`, async (t) => {
    // The loaded view draws the value of tab-1, and the person scrolls its body.
    const loaded = await openSection(t, { id, sidebar: "left", card: null }, { layout: true });
    await loaded.settled();
    await follow(loaded, id, status, values);
    const body = loaded.window.document.body;
    body.scrollLeft = 120;
    body.scrollTop = 90;
    await loaded.scrolled();
    const shown = body.innerHTML;
    // The unload closes the view, and core keeps the last state that the view wrote; a section that wrote no state has none, which
    // tab.state.read gives as null.
    const stored = callsOf(loaded, "tab.state.write").at(-1) ?? null;
    await loaded.close();
    // The restore loads the page in a new view, which core gives the stored state, the same section and surface, and the values
    // that tab-1 gives a new watch of the status.
    const restored = await openSection(t, { id, sidebar: "left", card: null }, { stored, layout: true });
    await restored.settled();
    await follow(restored, id, status, values);
    await restored.scrolled();
    const restoredBody = restored.window.document.body;
    assert.equal(restoredBody.innerHTML, shown, "the restored section shows the rows that it had");
    assert.deepEqual({ x: restoredBody.scrollLeft, y: restoredBody.scrollTop }, { x: 120, y: 90 }, "the restored section shows the scroll position that it had");
    assert.deepEqual(stored, { surface: "tab-1", scroll: { x: 120, y: 90 } }, "the view writes the followed surface and the scroll position as its state");
    assert.deepEqual(callsOf(restored, "tab.state.write").filter((value) => value !== null), [], "the restored view writes no other state");
  });
}

test("a restored section that follows another surface than its state names starts at the top and writes the state of that surface", async (t) => {
  const [{ id, status, values }] = RESTORE_CASES;
  const restored = await openSection(t, { id, sidebar: "left", card: null }, { stored: { surface: "tab-1", scroll: { x: 120, y: 90 } }, layout: true });
  await restored.settled();
  await follow(restored, id, status, values, "tab-2");
  await restored.scrolled();
  assert.deepEqual({ x: restored.window.document.body.scrollLeft, y: restored.window.document.body.scrollTop }, { x: 0, y: 0 });
  assert.deepEqual(callsOf(restored, "tab.state.write"), [{ surface: "tab-2", scroll: { x: 0, y: 0 } }]);
});

test("a scroll of the person before the rows reach the stored position keeps the position of the person", async (t) => {
  const { id, status, values } = RESTORE_CASES[1];
  const restored = await openSection(t, { id, sidebar: "left", card: null }, { stored: { surface: "tab-1", scroll: { x: 120, y: 90 } }, layout: true });
  await restored.settled();
  // The first value holds six rows, which reach no scroll offset of 90 pixels.
  await follow(restored, id, status, [requestsValue({ entries: Array.from({ length: 6 }, (_, index) => ({ url: `https://site.test/r${index}.js`, type: "script", start: index, duration: 1 })), dropped: 0 })]);
  const body = restored.window.document.body;
  body.scrollLeft = 50;
  body.scrollTop = 10;
  await restored.scrolled();
  await follow(restored, id, status, values);
  await restored.scrolled();
  assert.deepEqual({ x: body.scrollLeft, y: body.scrollTop }, { x: 50, y: 10 });
  assert.deepEqual(callsOf(restored, "tab.state.write"), [{ surface: "tab-1", scroll: { x: 50, y: 10 } }]);
});

test("a stored state of another form is refused", async (t) => {
  const view = await openSection(t, { id: "browser.history", sidebar: "left", card: null }, { stored: { scroll: 90 } });
  await view.settled();
  const report = await view.logged("plugin.browser.report");
  assert.match(report.fields.text, /the state of section browser\.history is not \{surface, scroll: \{x, y\}\}: \{"scroll":90\}/);
});

