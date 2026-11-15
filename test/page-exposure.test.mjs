import assert from "node:assert/strict";
import test from "node:test";
import { callsOf, documentState, openTab, sendExposure } from "./fixtures/view.mjs";

// createPageExposure of ui/page.js over the view bridge of the page (createPage): the view calls that the page sends are recorded in
// order, and the exposure requests are delivered through the exposure-request subscription of the runtime, as the host delivers them.

const PAGE = new URL("../ui/page.js", import.meta.url);

test("a watched status is sent as a changed call with its name, value and version", async (t) => {
  const view = await openTab(t);
  const page = await view.load(PAGE);
  const { bridge, report } = page.createPage();
  const reports = [];
  const declarations = { status: [{ name: "browser.location" }], commands: [], element: [] };
  const expose = page.createPageExposure({ bridge, declarations, report: (text) => reports.push(text) });
  let value = documentState("https://a.test/");
  const subscribers = new Set();
  await expose.status("browser.location", () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
  const changedCalls = () => callsOf(view, "runtime.native.call").filter((params) => params.name === "changed");
  await sendExposure(view, "status.watch", { name: "browser.location" });
  await view.settled();
  assert.deepEqual(changedCalls(), [
    { name: "changed", payload: { name: "browser.location", value: documentState("https://a.test/"), version: 1 } },
  ], "the watch sends the current value with version 1");
  value = documentState("https://b.test/");
  for (const fn of [...subscribers]) fn(value);
  await view.settled();
  assert.deepEqual(changedCalls().map((params) => params.payload.version), [1, 2], "a later different value is sent with the next version");
  assert.deepEqual(reports, [], "no call of the page was refused");
});
