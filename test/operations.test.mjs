// The operations of the browser page (#P18.4, core docs/spec/native-surfaces.md#view-operations): an address commit begins
// an operation whose first record carries its identifiers, and a relayed command passes the identifiers of its request to
// its record and to the core command that it calls.
import assert from "node:assert/strict";
import test from "node:test";
import { TAB_PAGE, openTab, pluginLogs, requestWithCids } from "./fixtures/view.mjs";

test("an address commit begins an operation whose first record carries its identifiers", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  const address = view.window.document.body.lastElementChild.shadowRoot.querySelector("#address");
  address.value = "d.test";
  address.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await view.logged("plugin.browser.address.commit");
  const logs = pluginLogs(view);
  const commit = logs.find((entry) => entry.event === "address.commit");
  assert.ok(commit, `the page recorded no address.commit; recorded ${logs.map((entry) => entry.event).join(", ")}`);
  assert.equal(commit.level, "info");
  assert.equal(commit.cids.length, 1, `the record carries ${JSON.stringify(commit.cids)}`);
  assert.equal(commit.cids[0], `p${view.window.sokView.page}.1`);
});

test("a relayed command passes its identifiers to its record and to the core command it calls", async (t) => {
  const view = await openTab(t);
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  await view.change.status("core.grid", { cards: [{ id: "main", active: "browser-1", tabs: [{ id: "browser-1", plugin: "browser", title: "브라우저", label: null }] }] });
  // The command replies after the core call, and its record follows the reply.
  await requestWithCids(view, "browser.tab.select", { tab: "browser-1" }, ["p7.1"]);
  await view.logged("plugin.browser.command");
  assert.deepEqual(view.observed.commands.filter(({ name }) => name === "core.tab.select").map(({ cids }) => cids), [["p7.1"]],
    "the core call carries the identifiers");
  const record = pluginLogs(view).find((entry) => entry.event === "command" && entry.fields.name === "browser.tab.select");
  assert.ok(record, "the page recorded no command of browser.tab.select");
  assert.deepEqual(record.cids, ["p7.1"]);
});
