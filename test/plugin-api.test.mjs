// The fixtures that answer the plugin API of the page: the resolve hook maps the specifiers of the plugin API (the import map of the page
// resolves them) to the fixture modules, and the fixtures refuse a call that a test did not arrange. The hook is registered by the test
// script (test/fixtures/plugin-api/register.mjs), so each test here imports the specifiers through the hook.
import assert from "node:assert/strict";
import test from "node:test";
import { createBinder, createExpose, drawList } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { observeViewDocumentFrames } from "@soksak/plugin-api/diagnostic-view-frames";
import { createViewHandle } from "./fixtures/plugin-api/bridge-host.mjs";
import { MAPPED_SPECIFIERS } from "./fixtures/plugin-api/hooks.mjs";

test("the hook maps each plugin API specifier to its fixture module, which exports the members that the page uses", () => {
  assert.deepEqual(MAPPED_SPECIFIERS, ["@soksak/plugin-api", "@soksak/plugin-api/view", "@soksak/plugin-api/diagnostic-view-frames"]);
  assert.equal(typeof createBinder, "function");
  assert.equal(typeof createExpose, "function");
  assert.equal(typeof drawList, "function");
  assert.equal(typeof createViewBridge, "function");
  assert.equal(typeof observeViewDocumentFrames, "function");
});

test("the hook maps no other plugin API specifier, which the page cannot import", async () => {
  const unmapped = "@soksak/plugin-api/page";
  await assert.rejects(import(unmapped), { code: "ERR_MODULE_NOT_FOUND" });
});

test("a view handle refuses a wire post, and a call without an arranged answer is refused", async () => {
  const handle = createViewHandle({ plugin: "browser", surface: "browser-1", answer: () => { throw new Error("the view call tab.title has no arranged answer"); } });
  assert.throws(() => handle.postMessage({ sok: 1, command: "tab.title" }), /posted to the sok-view wire/);
  const bridge = createViewBridge({ handler: handle, report: () => {} });
  await assert.rejects(bridge.calls.request("tab.title", "x"), { message: "the view call tab.title has no arranged answer" });
});
