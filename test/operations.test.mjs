// The operations of the browser page (#P18.4, core docs/spec/native-surfaces.md#view-operations): an address commit begins
// an operation whose first record carries its identifiers, and a relayed command passes the identifiers of its request to
// its record and to the core command that it calls.
import assert from "node:assert/strict";
import test from "node:test";
import { createViewPage } from "./view-host.mjs";

test("an address commit begins an operation whose first record carries its identifiers", async (t) => {
  const host = createViewPage(t, "operation-commit");
  await import("../build/test/ui/view.js?case=operation-commit");
  await host.settle();
  const address = host.window.document.body.lastElementChild.shadowRoot.querySelector("#address");
  address.value = "d.test";
  address.dispatchEvent(new host.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await host.settle();
  const commit = host.logs.find((entry) => entry.event === "address.commit");
  assert.ok(commit, `the page recorded no address.commit; recorded ${host.logs.map((entry) => entry.event).join(", ")}`);
  assert.equal(commit.level, "info");
  assert.equal(commit.cids.length, 1, `the record carries ${JSON.stringify(commit.cids)}`);
  assert.equal(commit.cids[0], `p${host.window.sokView.page}.1`);
});

test("a relayed command passes its identifiers to its record and to the core command it calls", async (t) => {
  const host = createViewPage(t, "operation-command");
  await import("../build/test/ui/view.js?case=operation-command");
  await host.settle();
  host.status("core.grid", { cards: [{ id: "main", active: "browser-1", tabs: [{ id: "browser-1", plugin: "browser", title: "브라우저", label: null }] }] });
  await host.settle();
  await host.run("browser.tab.select", { tab: "browser-1" }, { cids: ["p7.1"] });
  await host.settle();
  assert.deepEqual(host.reports.cids, [{ command: "core.tab.select", cids: ["p7.1"] }], "the core call carries the identifiers");
  const record = host.logs.find((entry) => entry.event === "command" && entry.fields.name === "browser.tab.select");
  assert.ok(record, "the page recorded no command of browser.tab.select");
  assert.deepEqual(record.cids, ["p7.1"]);
});
