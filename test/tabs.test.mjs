// The 탭 section is a declared UI status (#P28): the view watches core.grid, pushes the browser tabs of the card that holds
// its surface as a declared list, and each row runs browser.tab.select, which selects the tab through core.tab.select.
import assert from "node:assert/strict";
import test from "node:test";
import { createViewPage } from "./view-host.mjs";

const grid = {
  cards: [
    { id: "rail", active: null, tabs: [] },
    {
      id: "main",
      active: "browser-1",
      tabs: [
        { id: "browser-1", plugin: "browser", title: "브라우저", label: "One" },
        { id: "other-1", plugin: "other", title: "다른", label: null },
        { id: "b2", plugin: "browser", title: "브라우저", label: null },
      ],
    },
  ],
};

const tabsValues = (host) => host.snapshots.filter((snapshot) => snapshot.status === "browser.tabs");

test("the tabs status lists the browser tabs of the card that holds the surface", async (t) => {
  const host = createViewPage(t, "tabs-value");
  await import("../build/test/ui/view.js?case=tabs-value");
  await host.settle();
  host.status("core.grid", grid);
  await host.settle();
  const last = tabsValues(host).at(-1);
  assert.ok(last, "the page pushed no value of browser.tabs");
  assert.deepEqual(last.value, {
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
  const host = createViewPage(t, "tabs-empty");
  await import("../build/test/ui/view.js?case=tabs-empty");
  await host.settle();
  host.status("core.grid", { cards: [] });
  await host.settle();
  assert.deepEqual(tabsValues(host).at(-1).value, {
    elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [] }],
  });
});

test("a press on a tab row runs core.tab.select with the tab", async (t) => {
  const host = createViewPage(t, "tabs-select");
  await import("../build/test/ui/view.js?case=tabs-select");
  await host.settle();
  host.status("core.grid", grid);
  await host.settle();
  assert.equal(await host.run("browser.tab.select", { tab: "b2" }), null);
  await host.settle();
  assert.deepEqual(host.calls.filter(([name]) => name === "core.tab.select"), [["core.tab.select", { tab: "b2" }]]);
});

test("the tabs section has a registered status, which core reads for the section source", async (t) => {
  const host = createViewPage(t, "tabs-registered");
  await import("../build/test/ui/view.js?case=tabs-registered");
  await host.settle();
  const registered = host.reports.native.filter(([name]) => name === "registered").map(([, payload]) => payload);
  assert.ok(
    registered.some((payload) => payload.kind === "status" && payload.name === "browser.tabs"),
    `the page registered ${JSON.stringify(registered)}, not the status browser.tabs`,
  );
});
