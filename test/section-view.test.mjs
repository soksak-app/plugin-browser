// The section view (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces): one page draws the section of
// its start values. It watches core.sidebars for the surface that its section follows, reads core.surfaces to keep only a surface of
// its own plugin, watches the status of its section on that surface, draws the value as DOM, and runs the command of an item that
// the person clicks on that surface. The runtime is a fake of the view bridge runtime, which takes status.watch(name, listener,
// {surface}) and command(name, params, {surface}), so the test reads no SDK.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWindow } from "./dom.mjs";
import { createSectionView } from "../build/test/ui/section-view.js";

const { window } = createWindow("sok://browser/ui/section.html");
const { document } = window;

// A fake of the view runtime: each status.watch is recorded with its name and options, and its stop function marks it stopped.
// Each command is recorded with its name, params and options.
function fakeRuntime() {
  const watches = [];
  const commands = [];
  return {
    watches,
    commands,
    expose: fakeExpose(),
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
    dom(name, element) {
      doms.push({ name, element });
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

function mount(fake, { section = SECTION, reports = [] } = {}) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  createSectionView({ runtime: fake.runtime, expose: fake.expose, declarations: DECLARATIONS, root, section, report: (text) => reports.push(text) });
  return root;
}

test("the section view watches core.sidebars and core.surfaces without a surface, then the status of its section on the followed surface of its plugin", () => {
  const fake = fakeRuntime();
  mount(fake);
  assert.deepEqual(fake.watches.map((watch) => [watch.name, watch.options]), [["core.sidebars", undefined], ["core.surfaces", undefined]]);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  const tabs = live(fake, "browser.tabs");
  assert.equal(tabs.length, 1);
  assert.deepEqual(tabs[0].options, { surface: "tab-1" });
});

test("a followed surface of another plugin is not watched, and the section shows the empty state", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["other-1", "other"]));
  deliver(fake, "core.sidebars", undefined, sidebars("other-1"));
  assert.equal(live(fake, "browser.tabs").length, 0, "no watch of a surface of another plugin");
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a followed surface that core.surfaces does not list is not watched", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
  deliver(fake, "core.sidebars", undefined, sidebars("tab-9"));
  assert.equal(live(fake, "browser.tabs").length, 0);
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
});

test("a change of core.surfaces that moves the followed surface to another plugin ends its watch", () => {
  const fake = fakeRuntime();
  mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  assert.equal(live(fake, "browser.tabs").length, 1);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "other"]));
  assert.equal(live(fake, "browser.tabs").length, 0, "the watch of the surface is ended when its plugin is not browser");
});

test("a change of the followed surface unwatches the earlier surface and watches the new one", () => {
  const fake = fakeRuntime();
  mount(fake);
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

test("a value of the followed status is drawn as DOM, the selected item is marked, and a click runs its command on the followed surface", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
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

test("a tree value is drawn with its children nested under their parent, and a status line is drawn as text", () => {
  const fake = fakeRuntime();
  const root = mount(fake, { section: { id: "browser.dom", sidebar: "left", card: null } });
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

test("a section that follows no surface shows the empty state text and watches no status of the plugin", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "core.sidebars", undefined, sidebars(null));
  assert.equal(root.querySelector("p.empty").textContent, "연결된 탭 없음");
  assert.equal(live(fake, "browser.tabs").length, 0, "no watch of the status remains on a null surface");
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
  createSectionView({ runtime: fake.runtime, expose: fake.expose, declarations: DECLARATIONS, root, section: SECTION, report: (text) => reports.push(text) });
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

test("the section view registers the status browser.section, which reports its pending, empty and followed states on each change", () => {
  const fake = fakeRuntime();
  mount(fake);
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

test("the rows, items, empty texts and status lines carry declared dom names, and each item is a command control", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
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
  // Each named element is registered with the exposure of the page under its name.
  for (const name of ["browser.section.row", "browser.section.item", "browser.section.status"]) {
    const registered = fake.expose.doms.filter((entry) => entry.name === name).map((entry) => entry.element);
    for (const el of named(name)) assert.ok(registered.includes(el), `${name} element is registered`);
  }
  for (const el of root.querySelectorAll("button")) assert.ok(el.dataset.command && el.dataset.expose, "each button has a command and a dom name");
});

test("a draw reuses the registered elements, so a new item registers only its row and its button", () => {
  const fake = fakeRuntime();
  mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  const registered = fake.expose.doms.length;
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", true]]));
  assert.equal(fake.expose.doms.length, registered, "a draw of the same value registers no element");
  deliver(fake, "browser.tabs", "tab-2", tabsValue([["t1", "Docs", false], ["t2", "Mail", false], ["t3", "News", true]]));
  assert.equal(fake.expose.doms.length, registered + 2, "one new row and one new button");
});

test("the empty state text carries the dom name browser.section.empty", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-1", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars(null));
  const empty = root.querySelector('[data-expose="browser.section.empty"]');
  assert.equal(empty?.textContent, "연결된 탭 없음");
});

test("a value that names a command the plugin does not declare is refused", () => {
  const fake = fakeRuntime();
  mount(fake);
  deliver(fake, "core.surfaces", undefined, surfaces(["tab-2", "browser"]));
  deliver(fake, "core.sidebars", undefined, sidebars("tab-2"));
  const value = { elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.unknown", params: {} }] }] };
  assert.throws(() => deliver(fake, "browser.tabs", "tab-2", value), /command browser\.unknown is not declared/);
});

test("a section id that the plugin does not declare is refused", () => {
  const fake = fakeRuntime();
  assert.throws(() => mount(fake, { section: { id: "browser.other", sidebar: "left", card: null } }),
    /section browser\.other is not a section of the browser plugin/);
});

test("the section page begins with its doctype, holds no import map, and carries the page script", () => {
  const html = readFileSync(new URL("../build/test/ui/section.html", import.meta.url), "utf8");
  assert.match(html, /^<!doctype html>/i, "the view page begins with its doctype");
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i, "the view page holds no import map of its own");
  assert.match(html, /<script type="module" src="\.\/section\.js"><\/script>/);
});
