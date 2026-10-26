import assert from "node:assert/strict";
import test from "node:test";
import { attach } from "../build/test/ui/browser-diagnostics.js";
import { loadDiagnostics } from "../build/test/ui/view-diagnostics.js";

function fixture() {
  let observation;
  let stopped = false;
  const records = [];
  const commands = new Map();
  const root = {
    getBoundingClientRect: () => ({ width: 640, height: 480 }),
    ownerDocument: {
      defaultView: {
        history: { length: 2 },
        performance: { timeOrigin: 1_700_000_000_000, now: () => 42 },
        ResizeObserver: function ResizeObserver() {},
        requestAnimationFrame() {},
        cancelAnimationFrame() {},
      },
    },
  };
  const expose = { command: async (name, run) => commands.set(name, run) };
  return {
    root, records, commands,
    attach: () => attach({ expose, root, readRegionHistoryEntries: () => 3,
      log: (event, fields) => records.push({ event, fields }),
      observeFrames: (options) => { observation = options; return () => { stopped = true; }; } }),
    getObservation: () => observation,
    emitFrame(fields) { observation.log.trace("view.content_frame", fields); },
    isStopped: () => stopped,
  };
}

test("diagnostic observer records only explicit ResizeObserver-to-animation-frame samples", { timeout: 1000 }, async () => {
  const f = fixture();
  const dispose = await f.attach();
  const command = f.commands.get("browser.view.measure");
  assert.equal(typeof command, "function");
  assert.deepEqual(await command({ action: "read" }), {
    enabled: false, sequence: 0, historyEntries: 2, regionHistoryEntries: 3, width: 640, height: 480,
  });
  assert.deepEqual(f.records, []);

  await command({ action: "start" });
  assert.strictEqual(f.getObservation().document, f.root.ownerDocument);
  assert.strictEqual(f.getObservation().ResizeObserver, f.root.ownerDocument.defaultView.ResizeObserver);
  assert.equal(f.getObservation().timeOriginMs, 1_700_000_000_000);
  assert.equal(f.getObservation().now(), 42);
  f.emitFrame({
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, resizeAtMs: 42, frameTimeMs: 45, width: 640, height: 480,
  });
  assert.deepEqual(f.records, [{ event: "view.content_frame", fields: {
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, resizeAtMs: 42, frameTimeMs: 45, width: 640, height: 480,
  } }]);

  await command({ action: "stop" });
  assert.equal(f.isStopped(), true);
  f.emitFrame({ sequence: 1, documentTimeOriginMs: 1_700_000_000_000, resizeAtMs: 48, frameTimeMs: 50, width: 640, height: 480 });
  assert.equal(f.records.length, 1);
  assert.deepEqual(await command({ action: "read" }), {
    enabled: false, sequence: 1, historyEntries: 2, regionHistoryEntries: 3, width: 640, height: 480,
  });
  await dispose();
});

test("diagnostic observer refuses repeated starts and unknown actions", { timeout: 1000 }, async () => {
  const f = fixture();
  await f.attach();
  const command = f.commands.get("browser.view.measure");
  await command({ action: "start" });
  await assert.rejects(command({ action: "start" }), /already active/);
  await assert.rejects(command({ action: "reset" }), /action must be start, stop or read/);
  await command({ action: "stop" });
});

test("normal staging without diagnostics does not attach a diagnostic module", { timeout: 1000 }, async () => {
  const calls = [];
  const declaration = await loadDiagnostics("soksak://browser/ui/index.html", async (url) => {
    calls.push(url);
    return { status: 404, ok: false };
  });
  assert.equal(declaration, null);
  assert.deepEqual(calls, ["soksak://browser/diagnostics.json"]);
});
