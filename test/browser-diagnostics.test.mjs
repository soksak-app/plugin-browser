import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attach } from "../build/test/ui/browser-diagnostics.js";
import { createSectionView } from "../build/test/ui/section-view.js";
import { loadDiagnostics } from "../build/test/ui/view-diagnostics.js";
import { createWindow } from "./dom.mjs";
import { createOccurrences } from "./occurrences.mjs";

const eventFields = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"))
  .events["plugin.browser.view.content_frame"].fields;

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
    attach: () => attach({ expose, root, section: null, readRegionHistoryEntries: () => 3,
      log: (event, fields) => records.push({ event, fields }),
      observeFrames: (options) => { observation = options; return () => { stopped = true; }; } }),
    getObservation: () => observation,
    emitFrame(fields) { observation.log.trace("view.content_frame", fields); },
    isStopped: () => stopped,
  };
}

test("diagnostic observer records only explicit ResizeObserver-to-animation-frame samples", async () => {
  const f = fixture();
  const dispose = await f.attach();
  const command = f.commands.get("browser.view.measure");
  assert.equal(typeof command, "function");
  assert.deepEqual(await command({ action: "read" }), {
    enabled: false, sequence: 0, historyEntries: 2, regionHistoryEntries: 3, width: 640, height: 480,
  });
  assert.deepEqual(f.records, []);

  const startReply = await command({ action: "start" });
  assert.deepEqual(startReply.sourceClock, {
    documentTimeOriginMs: 1_700_000_000_000,
    sourceNowMs: 42,
    sourceResolutionMs: 1,
  }, "the successful start reply must anchor frame times to the view document clock");
  assert.deepEqual({
    enabled: startReply.enabled,
    sequence: startReply.sequence,
    historyEntries: startReply.historyEntries,
    regionHistoryEntries: startReply.regionHistoryEntries,
    width: startReply.width,
    height: startReply.height,
  }, {
    enabled: true, sequence: 0, historyEntries: 2, regionHistoryEntries: 3, width: 640, height: 480,
  }, "the source clock must be additive to the existing start reply");
  assert.strictEqual(f.getObservation().document, f.root.ownerDocument);
  assert.strictEqual(f.getObservation().ResizeObserver, f.root.ownerDocument.defaultView.ResizeObserver);
  assert.equal(f.getObservation().timeOriginMs, 1_700_000_000_000);
  assert.equal(f.getObservation().now(), 42);
  f.emitFrame({
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 40, resizeAtMs: 42,
    resizeCount: 2, frameTimeMs: 45, width: 640, height: 480,
  });
  assert.deepEqual(f.records, [{ event: "view.content_frame", fields: {
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 40, resizeAtMs: 42,
    resizeCount: 2, frameTimeMs: 45, width: 640, height: 480,
  } }]);

  await command({ action: "stop" });
  assert.equal(f.isStopped(), true);
  f.emitFrame({ sequence: 1, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 48, resizeAtMs: 48,
    resizeCount: 1, frameTimeMs: 50, width: 640, height: 480 });
  assert.equal(f.records.length, 1);
  assert.deepEqual(await command({ action: "read" }), {
    enabled: false, sequence: 1, historyEntries: 2, regionHistoryEntries: 3, width: 640, height: 480,
  });
  await dispose();
});

test("the content-frame catalog requires the complete coalesced source interval", async () => {
  const f = fixture();
  await f.attach();
  const command = f.commands.get("browser.view.measure");
  await command({ action: "start" });
  const currentFrame = {
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 40, resizeAtMs: 42,
    resizeCount: 2, frameTimeMs: 45, width: 640, height: 480,
  };
  f.emitFrame(currentFrame);
  assert.deepEqual(f.records[0].fields, currentFrame, "the consumer forwards all current observer fields unchanged");
  for (const name of ["firstResizeAtMs", "resizeAtMs", "resizeCount", "frameTimeMs"]) {
    assert.ok(eventFields.required.includes(name), `events.json must require ${name}`);
    assert.ok(Object.hasOwn(eventFields.properties, name), `events.json must declare ${name}`);
  }
  assert.equal(eventFields.properties.resizeCount.minimum, 1);
  await command({ action: "stop" });
});

test("the content-frame adapter rejects invalid coalesced intervals and fields", async () => {
  const f = fixture();
  await f.attach();
  const command = f.commands.get("browser.view.measure");
  await command({ action: "start" });
  const valid = {
    sequence: 0, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 40, resizeAtMs: 42,
    resizeCount: 2, frameTimeMs: 45, width: 640, height: 480,
  };
  const invalid = [
    { ...valid, resizeAtMs: 39 },
    { ...valid, frameTimeMs: 41 },
    { ...valid, resizeCount: 0 },
    { ...valid, resizeCount: 1.5 },
    { ...valid, resizeCount: 1 },
    { ...valid, extra: true },
    Object.fromEntries(Object.entries(valid).filter(([name]) => name !== "firstResizeAtMs")),
  ];
  for (const fields of invalid) assert.throws(() => f.emitFrame(fields));
  f.emitFrame(valid);
  assert.deepEqual(f.records[0].fields, valid, "valid source metadata is forwarded without rewriting");
  await command({ action: "stop" });
});

test("diagnostic observer refuses repeated starts and unknown actions", async () => {
  const f = fixture();
  await f.attach();
  const command = f.commands.get("browser.view.measure");
  await command({ action: "start" });
  await assert.rejects(command({ action: "start" }), /already active/);
  await assert.rejects(command({ action: "reset" }), /action must be start, stop or read/);
  await command({ action: "stop" });
});

test("a release view without a diagnostic declaration in its start values attaches no diagnostic module", async () => {
  assert.equal(await loadDiagnostics({ surface: "browser-1", diagnostics: null }), null);
});

test("a diagnostic view loads the declaration of its start values and its attach function", async () => {
  const declaration = { module: "ui/browser-diagnostics.js", exposes: {} };
  const diagnostics = await loadDiagnostics({ surface: "browser-1", diagnostics: declaration });
  assert.deepEqual(diagnostics.declaration, declaration);
  assert.equal(typeof diagnostics.attach, "function");
});

test("start values without a diagnostic declaration are refused with an error that names them", async () => {
  await assert.rejects(loadDiagnostics({ surface: "browser-1" }),
    /^Error: the start values of the browser view have no diagnostics: window\.sokSurface \{surface, params, origin, project, declarations, diagnostics\} carries it$/);
});

// The theme tokens that the view bridge sets on the root of a view document; the hex colors of the card, background and border tokens.
const THEME = { "--card": "#1e1e1e", "--bg": "#141414", "--edge": "#2a2a2a", "--rule": "#333333", "--focus": "#3b82f6" };
// The section ids of the plugin with the status that each section draws.
const STATUS_OF_SECTION = new Map([
  ["browser.dom", "browser.elements"],
  ["browser.network", "browser.requests"],
  ["browser.tabs", "browser.tabs"],
  ["browser.history", "browser.history"],
]);
const SECTION = { id: "browser.tabs", sidebar: "left", card: null };
const DECLARATION = JSON.parse(readFileSync(new URL("../diagnostics.json", import.meta.url), "utf8"));
const CONTENT = { content: "연결된 탭 없음", language: "ko-KR" };
const MARKER = [255, 0, 255];

/**
 * A section page in a jsdom window: the theme tokens on its root, the body painted with the card token as section.html paints it, the
 * section view in the body, the exposure of the page and a fake of the shared view-frame observer. The animation frames of the window
 * wait for frame(), and deliver(name, value, surface) gives a value to the live watches of the section view on that surface.
 * Each mutation observer of the page is paired with a watcher of the same target and options, and each run of its callback is an
 * occurrence: after a delivery or a frame changes what an observer observes, the fixture waits for that observer to handle it.
 */
function sectionFixture(tokens = THEME, section = SECTION) {
  const { window } = createWindow("sok://browser/ui/section.html");
  window.ResizeObserver = function ResizeObserver() {};
  const { until, occurred } = createOccurrences();
  const Platform = window.MutationObserver;
  const observers = new Set();
  window.MutationObserver = class extends Platform {
    constructor(callback) {
      super((records, observer) => {
        callback(records, observer);
        this.handled += 1;
        occurred();
      });
      this.handled = 0;
      this.watcher = new Platform(() => {});
    }
    observe(target, options) {
      super.observe(target, options);
      this.watcher.observe(target, options);
      observers.add(this);
    }
    disconnect() {
      super.disconnect();
      this.watcher.disconnect();
      observers.delete(this);
    }
  };
  // Waits until each connected observer whose target changed has run its callback for that change.
  const observed = () => {
    const changed = [...observers].filter((observer) => observer.watcher.takeRecords().length > 0).map((observer) => [observer, observer.handled]);
    return until(() => changed.every(([observer, handled]) => observer.handled > handled));
  };
  const pending = new Map();
  let handle = 0;
  window.requestAnimationFrame = (run) => { handle += 1; pending.set(handle, run); return handle; };
  window.cancelAnimationFrame = (id) => { pending.delete(id); };
  const doc = window.document;
  for (const [name, value] of Object.entries(tokens)) doc.documentElement.style.setProperty(name, value);
  const style = doc.createElement("style");
  style.textContent = "body{background:#1e1e1e}";
  doc.head.append(style);
  doc.body.replaceChildren();
  let observation = null;
  let stopped = false;
  const records = [];
  const commands = new Map();
  const statuses = new Map();
  const watches = [];
  const expose = {
    command: async (name, run) => { commands.set(name, run); },
    status: async (name, read, subscribe) => { statuses.set(name, { read, subscribe }); },
  };
  const runtime = {
    status: {
      watch(name, listener, options) {
        const watch = { name, listener, surface: options?.surface, stopped: false };
        watches.push(watch);
        return () => { watch.stopped = true; };
      },
    },
    command: async () => null,
  };
  const paint = () => ["documentElement", "body"].map((name) => window.getComputedStyle(doc[name]).backgroundColor);
  return {
    window, doc, records, commands, statuses, paint, section,
    // The ready status of the section, by the name that the section view registers.
    ready: () => statuses.get(`${section.id}.view.ready`),
    attach: async ({ declaration = DECLARATION } = {}) => {
      await createSectionView({ runtime, expose: { status: async () => {}, element: async () => {} }, declarations: { commands: [] },
        root: doc.body, section, tabState: { read: async () => null, write: () => {} }, report: (text) => { throw new Error(text); } });
      return attach({ expose, root: doc.documentElement, section, declaration,
        log: (event, fields) => records.push({ event, fields }),
        observeFrames: (options) => { observation = options; return () => { stopped = true; }; } });
    },
    // Delivers a value and lets the observers of the document run.
    deliver: async (name, value, surface) => {
      for (const watch of watches.filter((entry) => entry.name === name && entry.surface === surface && !entry.stopped)) watch.listener(value);
      await observed();
    },
    // Runs the animation frames that wait, as the frame that renders the document does.
    frame: async () => {
      const due = [...pending.values()];
      pending.clear();
      for (const run of due) run(0);
      await observed();
    },
    getObservation: () => observation,
    isStopped: () => stopped,
  };
}

// The values of core.sidebars and core.surfaces when the section follows surface, and when surface belongs to plugin.
const sidebarsOf = (surface, id = SECTION.id) => [{ sidebar: "left", sections: [{ id, surface }] }];
const surfacesOf = (surface, plugin) => [{ surface, plugin, kind: "tab", sidebar: null }];
const rows = { elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [{ key: "t1", label: "Docs" }] }] };
const noRows = { elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [] }] };

const FRAME = { sequence: 0, documentTimeOriginMs: 1_700_000_000_000, firstResizeAtMs: 40, resizeAtMs: 42,
  resizeCount: 2, frameTimeMs: 45, width: 240, height: 160 };

for (const id of STATUS_OF_SECTION.keys()) {
  test(`the ${id} section view serves browser.view.frames, browser.view.history and only ${id}.view.ready`, async () => {
    const section = sectionFixture(THEME, { ...SECTION, id });
    await section.attach();
    assert.deepEqual([...section.commands.keys()].sort(), ["browser.view.frames", "browser.view.history"]);
    assert.deepEqual([...section.statuses.keys()], [`${id}.view.ready`]);
  });
}

test("the tab view serves browser.view.measure", async () => {
  const tab = fixture();
  await tab.attach();
  assert.deepEqual([...tab.commands.keys()], ["browser.view.measure"]);
});

test("browser.view.frames start observes the content frames of the section view and paints its document root with the marker color until stop", async () => {
  const f = sectionFixture();
  await f.attach();
  const frames = f.commands.get("browser.view.frames");
  const before = f.paint();
  const started = await frames({ action: "start" });
  assert.deepEqual(Object.keys(started).sort(), ["enabled", "markerColor", "sourceClock"]);
  assert.equal(started.enabled, true);
  assert.deepEqual(started.markerColor, MARKER);
  assert.equal(started.sourceClock.documentTimeOriginMs, f.window.performance.timeOrigin);
  assert.ok(Number.isFinite(started.sourceClock.sourceNowMs) && started.sourceClock.sourceNowMs >= 0);
  assert.equal(started.sourceClock.sourceResolutionMs, 1);
  assert.strictEqual(f.getObservation().document, f.doc);
  assert.deepEqual(f.paint(), ["rgb(255, 0, 255)", "rgb(255, 0, 255)"], "the root and the body show the marker color");
  f.getObservation().log.trace("view.content_frame", FRAME);
  assert.deepEqual(f.records, [{ event: "view.content_frame", fields: FRAME }]);
  assert.throws(() => f.getObservation().log.trace("view.content_frame", { ...FRAME, sequence: 1, frameTimeMs: 41 }));
  assert.deepEqual(await frames({ action: "stop" }), { enabled: false });
  assert.equal(f.isStopped(), true);
  assert.deepEqual(f.paint(), before, "stop paints the root as before start");
  f.getObservation().log.trace("view.content_frame", { ...FRAME, sequence: 1 });
  assert.equal(f.records.length, 1, "no frame is recorded after stop");
});

test("browser.view.frames refuses a repeated start, a stop without a start and an unknown action", async () => {
  const f = sectionFixture();
  await f.attach();
  const frames = f.commands.get("browser.view.frames");
  await assert.rejects(frames({ action: "stop" }), /^Error: browser\.view\.frames is not active$/);
  await frames({ action: "start" });
  await assert.rejects(frames({ action: "start" }), /^Error: browser\.view\.frames is already active$/);
  await assert.rejects(frames({ action: "reset" }), /^TypeError: browser\.view\.frames action must be start or stop$/);
  await frames({ action: "stop" });
});

test("browser.view.frames start fails without observing or painting when the marker color is within 4 of a theme color in every channel", async () => {
  const f = sectionFixture({ ...THEME, "--edge": "#fd02fb" });
  await f.attach();
  const before = f.paint();
  await assert.rejects(f.commands.get("browser.view.frames")({ action: "start" }),
    /^Error: browser\.view\.frames marker color \[255,0,255\] is within 4 in every channel of the theme color --edge #fd02fb$/);
  assert.equal(f.getObservation(), null);
  assert.deepEqual(f.paint(), before);
  const unreadable = sectionFixture({ ...THEME, "--card": "var(--bg)" });
  await unreadable.attach();
  await assert.rejects(unreadable.commands.get("browser.view.frames")({ action: "start" }),
    /^Error: browser\.view\.frames reads the theme color --card as #rrggbb, not "var\(--bg\)"$/);
});

test("browser.view.history answers the length of the session history of the section view", async () => {
  const f = sectionFixture();
  await f.attach();
  assert.deepEqual(await f.commands.get("browser.view.history")({}), { length: f.window.history.length });
});

for (const [id, status] of STATUS_OF_SECTION) {
  test(`${id}.view.ready is true while the section view shows the empty text, once a frame renders it`, async () => {
    const f = sectionFixture(THEME, { ...SECTION, id });
    await f.attach();
    const ready = f.ready();
    const seen = [];
    ready.subscribe((value) => seen.push(value.ready));
    await f.frame();
    assert.equal(f.doc.body.textContent, "", "before the first core.sidebars the section view shows nothing");
    assert.deepEqual(ready.read(), { ready: false, ...CONTENT });
    await f.deliver("core.sidebars", sidebarsOf(null, id));
    assert.equal(f.doc.body.textContent, CONTENT.content);
    assert.deepEqual(ready.read(), { ready: false, ...CONTENT }, "the frame that renders the text has not run");
    await f.frame();
    assert.deepEqual(ready.read(), { ready: true, ...CONTENT });
    assert.deepEqual(seen, [false, true]);
  });

  test(`${id}.view.ready is false while the section view shows the rows of a followed surface`, async () => {
    const f = sectionFixture(THEME, { ...SECTION, id });
    await f.attach();
    await f.deliver("core.surfaces", surfacesOf("tab-2", "browser"));
    await f.deliver("core.sidebars", sidebarsOf("tab-2", id));
    await f.deliver(status, rows, "tab-2");
    await f.frame();
    assert.equal(f.doc.body.textContent, "Docs");
    assert.deepEqual(f.ready().read(), { ready: false, ...CONTENT });
  });
}

test("the ready status follows the text: another empty text is false, and the text that returns is true after its frame", async () => {
  const f = sectionFixture();
  await f.attach();
  const ready = f.ready();
  await f.deliver("core.surfaces", surfacesOf("tab-2", "browser"));
  await f.deliver("core.sidebars", sidebarsOf(null));
  await f.frame();
  assert.equal(ready.read().ready, true);
  await f.deliver("core.sidebars", sidebarsOf("tab-2"));
  assert.equal(ready.read().ready, false, "the rows of the followed surface replace the text at once");
  await f.deliver("browser.tabs", noRows, "tab-2");
  await f.frame();
  assert.equal(f.doc.body.textContent, "브라우저 탭 없음");
  assert.equal(ready.read().ready, false);
  await f.deliver("core.sidebars", sidebarsOf(null));
  await f.frame();
  assert.equal(ready.read().ready, true);
});

test("a text that leaves before its frame renders it is not ready", async () => {
  const f = sectionFixture();
  await f.attach();
  await f.deliver("core.surfaces", surfacesOf("tab-2", "browser"));
  await f.deliver("core.sidebars", sidebarsOf(null));
  await f.deliver("core.sidebars", sidebarsOf("tab-2"));
  await f.frame();
  assert.equal(f.ready().read().ready, false);
});

test("the function that attach returns ends the watch of the content", async () => {
  const f = sectionFixture();
  const dispose = await f.attach();
  dispose();
  await f.deliver("core.sidebars", sidebarsOf(null));
  await f.frame();
  assert.equal(f.ready().read().ready, false);
});

test("a section view whose declaration lacks its status or a one-item enum of content and language is refused", async () => {
  const ready = (fields) => ({ module: DECLARATION.module, exposes: { status: [{ name: "browser.tabs.view.ready", description: "", schema: { type: "object",
    properties: { ready: { type: "boolean" }, ...fields } } }] } });
  const refusal = /^TypeError: browser section diagnostics require the declaration of browser\.tabs\.view\.ready with a one-item enum of the strings content and language$/;
  const content = { type: "string", enum: [CONTENT.content] };
  const language = { type: "string", enum: [CONTENT.language] };
  for (const declaration of [
    { module: DECLARATION.module, exposes: {} },
    ready({ content }),
    ready({ language }),
    ready({ content: { type: "string", enum: [CONTENT.content, "another"] }, language }),
    ready({ content: { type: "string", enum: [] }, language }),
    ready({ content: { type: "string", enum: [1] }, language }),
    ready({ content: { type: "string", const: CONTENT.content }, language }),
  ]) {
    await assert.rejects(sectionFixture().attach({ declaration }), refusal);
  }
  await sectionFixture().attach({ declaration: ready({ content, language }) });
});

test("diagnostics.json declares the entries of the tab view and of the section views, with a one-item enum of the content and language of each section", () => {
  const { module, exposes } = DECLARATION;
  assert.equal(module, "ui/browser-diagnostics.js");
  assert.deepEqual(exposes.commands.map((entry) => entry.name), ["browser.view.measure", "browser.view.frames", "browser.view.history"]);
  assert.deepEqual(exposes.status.map((entry) => entry.name), [...STATUS_OF_SECTION.keys()].map((id) => `${id}.view.ready`));
  for (const { schema } of exposes.status) {
    assert.deepEqual(schema, { type: "object", properties: {
      ready: { type: "boolean" },
      content: { type: "string", enum: [CONTENT.content] },
      language: { type: "string", enum: [CONTENT.language] },
    } });
  }
});

// The schema subset of the exposure declarations (core docs/spec/exposure.md): a diagnostic build refuses a schema with any other
// field, and the workbench does not start. The tests of this plugin load no SDK, so this test states the subset.
const SCHEMA_FIELDS = ["type", "properties", "items", "enum"];
const unknownFields = (where, schema) => [
  ...Object.keys(schema).filter((field) => !SCHEMA_FIELDS.includes(field)).map((field) => `${where}: unknown field ${field}`),
  ...Object.entries(schema.properties ?? {}).flatMap(([name, property]) => unknownFields(`${where}.${name}`, property)),
  ...(schema.items === undefined ? [] : unknownFields(`${where}.items`, schema.items)),
];

test("every schema of diagnostics.json holds only the fields of the schema subset", () => {
  const { commands, status } = DECLARATION.exposes;
  const unknown = [
    ...commands.flatMap(({ name, params, result }) => [...unknownFields(`${name} params`, params), ...unknownFields(`${name} result`, result)]),
    ...status.flatMap(({ name, schema }) => unknownFields(`${name} schema`, schema)),
  ];
  assert.deepEqual(unknown, []);
});
