import assert from "node:assert/strict";
import test from "node:test";

// createPageExposure of ui/page.js over a fake bridge: the view calls that the page sends are recorded in order, and the exposure
// requests are delivered through the exposure-request subscription of the runtime.

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

test("a watched status is sent as a changed call with its name, value and version", async () => {
  const { createPageExposure } = await import("../build/test/ui/page.js");
  const calls = [];
  const reports = [];
  let answer = null;
  const bridge = {
    calls: { request: async (command, params) => { calls.push({ command, params }); return null; } },
    runtime: { native: { on: (name, fn) => { if (name === "exposure-request") answer = fn; return () => {}; } } },
  };
  const declarations = { status: [{ name: "browser.location" }], commands: [], element: [] };
  const expose = createPageExposure({ bridge, declarations, report: (text) => reports.push(text) });
  let value = { url: "https://a.test/" };
  const subscribers = new Set();
  await expose.status("browser.location", () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
  await answer({ id: 1, method: "status.watch", params: { name: "browser.location" } });
  await settle();
  const changedCalls = () => calls.filter((call) => call.command === "runtime.native.call" && call.params.name === "changed");
  assert.deepEqual(changedCalls().map((call) => call.params), [
    { name: "changed", payload: { name: "browser.location", value: { url: "https://a.test/" }, version: 1 } },
  ], "the watch sends the current value with version 1");
  value = { url: "https://b.test/" };
  for (const fn of [...subscribers]) fn(value);
  await settle();
  assert.deepEqual(changedCalls().map((call) => call.params.payload.version), [1, 2], "a later different value is sent with the next version");
  assert.deepEqual(reports, [], "no call of the page was refused");
});
