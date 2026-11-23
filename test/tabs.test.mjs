// The 탭 section reads the browser.tabs status (#P28): the view watches core.grid, and the status lists the browser tabs of the card
// that holds its surface, each row running browser.tab.select, which selects the tab through core.tab.select.
import assert from "node:assert/strict";
import test from "node:test";
import { TAB_PAGE, callsOf, exposure, openTab } from "./fixtures/view.mjs";

// A tab of core.grid is {tab, plugin, title, active, params, label, ...} (core docs/spec/groups.md), and active of a card names its
// active tab.
const grid = {
  cards: [
    { id: "rail", active: null, tabs: [] },
    {
      id: "main",
      active: "browser-1",
      tabs: [
        { tab: "browser-1", plugin: "browser", title: "One", active: true, params: null, label: "One" },
        { tab: "other-1", plugin: "other", title: "다른", active: false, params: null, label: null },
        { tab: "b2", plugin: "browser", title: "브라우저", active: false, params: null, label: null },
      ],
    },
  ],
};

const tabsValue = (view) => exposure(view, "status.get", { name: "browser.tabs" });

test("the tabs status lists the browser tabs of the card that holds the surface", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await view.change.status("core.grid", grid);
  assert.deepEqual(await tabsValue(view), {
    elements: [{
      kind: "list",
      key: "tabs",
      empty: "브라우저 탭 없음",
      items: [
        { key: "browser-1", label: "One", command: "browser.tab.select", params: { tab: "browser-1" }, selected: true },
        { key: "b2", label: "브라우저", command: "browser.tab.select", params: { tab: "b2" }, selected: false },
      ],
    }],
  });
});

test("the tabs status is empty when the grid holds no card of the surface", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await view.change.status("core.grid", { cards: [] });
  assert.deepEqual(await tabsValue(view), {
    elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [] }],
  });
});

test("a press on a tab row runs core.tab.select with the tab", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await view.change.status("core.grid", grid);
  // The command replies after the core call, so its reply ends the handling.
  assert.equal(await view.request("browser.tab.select", { tab: "b2" }), null);
  assert.deepEqual(view.observed.commands.filter(({ name }) => name === "core.tab.select").map(({ name, params }) => [name, params]),
    [["core.tab.select", { tab: "b2" }]]);
});

test("the tabs section has a registered status, which core reads for the section source", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  const registered = callsOf(view, "runtime.native.call").filter((params) => params.name === "registered").map((params) => params.payload);
  assert.ok(
    registered.some((payload) => payload.kind === "status" && payload.name === "browser.tabs"),
    `the page registered ${JSON.stringify(registered)}, not the status browser.tabs`,
  );
});
