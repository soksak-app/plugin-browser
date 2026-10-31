// The section view (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces): one page draws the section of
// its start values. It watches core.sidebars for the surface that its section follows, watches the status of its section on that
// surface, draws the value as DOM, and runs the command of an item that the person clicks. The runtime is a fake of the view
// bridge runtime, which takes status.watch(name, listener, {surface}) and command(name, params), so the test reads no SDK.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWindow } from "./dom.mjs";
import { createSectionView } from "../build/test/ui/section-view.js";

const { window } = createWindow("sok://browser/ui/section.html");
const { document } = window;

// A fake of the view runtime: each status.watch is recorded with its name and options, and its stop function marks it stopped.
function fakeRuntime() {
  const watches = [];
  const commands = [];
  return {
    watches,
    commands,
    runtime: {
      status: {
        watch(name, listener, options) {
          const watch = { name, options, listener, stopped: false };
          watches.push(watch);
          return () => { watch.stopped = true; };
        },
      },
      command(name, params) {
        const promise = Promise.resolve(null);
        commands.push({ name, params, promise });
        return promise;
      },
    },
  };
}

// The watches of a name that are not stopped; a watch with no options follows the workbench.
const live = (fake, name) => fake.watches.filter((watch) => watch.name === name && !watch.stopped);

// Delivers value to each live watch of name on surface (undefined for the workbench status core.sidebars).
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

function mount(fake, { section = SECTION, reports = [] } = {}) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  createSectionView({ runtime: fake.runtime, root, section, report: (text) => reports.push(text) });
  return root;
}

test("the section view watches core.sidebars without a surface, then the status of its section on the surface that the section follows", () => {
  const fake = fakeRuntime();
  mount(fake);
  assert.equal(fake.watches.length, 1);
  assert.equal(fake.watches[0].name, "core.sidebars");
  assert.equal(fake.watches[0].options, undefined);
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  const tabs = live(fake, "browser.tabs");
  assert.equal(tabs.length, 1);
  assert.deepEqual(tabs[0].options, { surface: "tab-1" });
});

test("a change of the followed surface unwatches the earlier surface and watches the new one", () => {
  const fake = fakeRuntime();
  mount(fake);
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

test("a value of the followed status is drawn as DOM, the selected item is marked, and a click runs its bound command", () => {
  const fake = fakeRuntime();
  const root = mount(fake);
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
  assert.deepEqual(fake.commands.map(({ name, params }) => ({ name, params })), [{ name: "browser.tab.select", params: { tab: "t1" } }]);
});

test("a tree value is drawn with its children nested under their parent, and a status line is drawn as text", () => {
  const fake = fakeRuntime();
  const root = mount(fake, { section: { id: "browser.dom", sidebar: "left", card: null } });
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
  fake.runtime.command = (name, params) => {
    const promise = Promise.reject(new Error("tab is gone"));
    fake.commands.push({ name, params, promise });
    return promise;
  };
  createSectionView({ runtime: fake.runtime, root, section: SECTION, report: (text) => reports.push(text) });
  deliver(fake, "core.sidebars", undefined, sidebars("tab-1"));
  deliver(fake, "browser.tabs", "tab-1", {
    elements: [{ kind: "list", key: "tabs", empty: "없음", items: [{ key: "t1", label: "Docs", command: "browser.tab.select", params: { tab: "t1" } }] }],
  });
  root.querySelector("button").click();
  await fake.commands[0].promise.catch(() => {});
  assert.deepEqual(reports, ["command browser.tab.select: tab is gone"]);
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
