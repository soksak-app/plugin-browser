// The diagnostic entries of the browser views (core docs/spec/plugin-processes.md#section-views), in a diagnostic build. The tab view
// (ui/view.js) serves browser.view.measure; each section view (ui/section.js) serves browser.view.frames, browser.view.history and its
// ready status. The page modules run in the host fixture (test/fixtures/host.mjs): the commands and statuses are reached through the exposure requests of the
// host, and the animation frames and the ResizeObserver of the view document are driven by frameClock (fixtures/view.mjs), which runs a
// frame only when the test runs it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attach } from "../ui/browser-diagnostics.js";
import {
  DIAGNOSTICS, DIAGNOSTIC_DECLARATIONS, SECTION_PAGE, START, TAB_PAGE, changesOf, documentState, exposure, frameClock, openSection, openTab,
  pluginLogs, pushState, sendExposure,
} from "./fixtures/view.mjs";

const eventFields = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"))
  .events["plugin.browser.view.content_frame"].fields;

// The layout of the view documents: the size of the root element, which the page reads as its content viewport.
const rectOf = (width, height) => () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height });
const TAB_RECT = rectOf(640, 480);
const SECTION_RECT = rectOf(240, 160);

// The theme tokens that the view bridge sets on the root of a view document; the hex colors of the card, background and border tokens.
const THEME = { "--card": "#1e1e1e", "--bg": "#141414", "--edge": "#2a2a2a", "--rule": "#333333", "--focus": "#3b82f6" };
const SECTION_THEME = { scheme: "dark", tokens: THEME };
const MARKER = [255, 0, 255];
const CONTENT = { content: "연결된 탭 없음", language: "ko-KR" };
const SECTION = { id: "browser.tabs", sidebar: "left", card: null };
// The section ids of the plugin with the status that each section draws.
const STATUS_OF_SECTION = new Map([
  ["browser.dom", "browser.elements"],
  ["browser.network", "browser.requests"],
  ["browser.tabs", "browser.tabs"],
  ["browser.history", "browser.history"],
]);

// Runs a command of the page through the exposure request of the host, and resolves with its result.
const command = (view, name, params) => exposure(view, "command.run", { name, params });
const readyOf = (view, id) => exposure(view, "status.get", { name: `${id}.view.ready` });
const readyName = (id) => `${id}.view.ready`;
// The content-frame records of the view, in order: the fields of each view.content_frame that the page logged.
const framesOf = (view) => pluginLogs(view).filter(({ event }) => event === "view.content_frame").map(({ fields }) => fields);
const paintOf = (view) => ["documentElement", "body"].map((name) => view.window.getComputedStyle(view.window.document[name]).backgroundColor);

// Opens the tab view with the diagnostic declaration, and loads its page. The frame clock is installed before the page loads.
async function openDiagnosticTab(t, options = {}) {
  const view = await openTab(t, {
    start: { ...START, diagnostics: DIAGNOSTICS },
    declarations: DIAGNOSTIC_DECLARATIONS,
    layout: { rect: TAB_RECT },
    ...options,
  });
  const clock = frameClock(view);
  await view.load(TAB_PAGE);
  await view.settled();
  return { view, clock };
}

// Opens a section view with the diagnostic declaration, and waits until the page has started.
async function openDiagnosticSection(t, id = SECTION.id, options = {}) {
  const view = await openSection(t, { ...SECTION, id }, {
    diagnostics: DIAGNOSTICS,
    theme: SECTION_THEME,
    viewLayout: { rect: SECTION_RECT },
    frames: true,
    ...options,
  });
  await view.settled();
  return { view, clock: view.clock };
}

// Delivers the values of core.surfaces and core.sidebars to the section view, which are workbench statuses (no surface).
async function follow(view, id, surface) {
  await view.change.status("core.surfaces", [{ surface: "tab-2", plugin: "browser", kind: "tab", sidebar: null }], undefined);
  await view.change.status("core.sidebars", [{ sidebar: "left", sections: [{ id, surface }] }], undefined);
  await view.settled();
}

const sidebarsOf = (view, id, surface) => view.change.status("core.sidebars", [{ sidebar: "left", sections: [{ id, surface }] }], undefined);
const deliverRows = (view, name, value, surface = "tab-2") => view.change.status(name, value, surface);

const rows = { elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [{ key: "t1", label: "Docs" }] }] };
const noRows = { elements: [{ kind: "list", key: "tabs", empty: "브라우저 탭 없음", items: [] }] };

test("a release view without a diagnostic declaration in its start values attaches no diagnostic module", async (t) => {
  const view = await openTab(t, { start: { ...START, diagnostics: null } });
  await view.load(TAB_PAGE);
  await view.settled();
  await assert.rejects(command(view, "browser.view.measure", { action: "read" }), { message: "unknown command browser.view.measure" });
});

test("a diagnostic view loads the declaration of its start values and serves browser.view.measure", async (t) => {
  const { view } = await openDiagnosticTab(t);
  assert.deepEqual(await command(view, "browser.view.measure", { action: "read" }), {
    enabled: false, sequence: 0, historyEntries: view.window.history.length, regionHistoryEntries: 0, width: 640, height: 480,
  });
});

test("start values without a diagnostic declaration are refused with an error that names them", async (t) => {
  const start = { ...START };
  delete start.diagnostics;
  const view = await openTab(t, { start });
  await assert.rejects(view.load(TAB_PAGE), {
    message: "the start values of the browser view have no diagnostics: window.sokSurface {surface, params, origin, project, declarations, diagnostics} carries it",
  });
});

test("browser.view.measure records the content frames of the document root while it is started, reads the document size, and stops", async (t) => {
  const { view, clock } = await openDiagnosticTab(t);
  // The document region holds two history entries, which the read reports as the region history length.
  await pushState(view, documentState("https://a.test/2", { history: { entries: [{ url: "https://a.test/1", title: "1" }, { url: "https://a.test/2", title: "2" }], index: 1 } }));
  assert.deepEqual(await command(view, "browser.view.measure", { action: "read" }), {
    enabled: false, sequence: 0, historyEntries: view.window.history.length, regionHistoryEntries: 2, width: 640, height: 480,
  }, "the read reports the length of the region history");
  clock.notify();
  clock.run();
  await view.settled();
  assert.deepEqual(framesOf(view), [], "no frame is recorded before the start");

  const started = await command(view, "browser.view.measure", { action: "start" });
  assert.deepEqual(started.sourceClock, {
    documentTimeOriginMs: view.window.performance.timeOrigin,
    sourceNowMs: started.sourceClock.sourceNowMs,
    sourceResolutionMs: 1,
  }, "the start reply anchors frame times to the view document clock");
  assert.ok(Number.isFinite(started.sourceClock.sourceNowMs) && started.sourceClock.sourceNowMs >= 0);
  assert.deepEqual({ enabled: started.enabled, sequence: started.sequence, historyEntries: started.historyEntries, regionHistoryEntries: started.regionHistoryEntries, width: started.width, height: started.height }, {
    enabled: true, sequence: 0, historyEntries: view.window.history.length, regionHistoryEntries: 2, width: 640, height: 480,
  });

  clock.notify();
  clock.run();
  await view.settled();
  const [frame] = framesOf(view);
  // The SDK logger of the surface adds the surface to each record (plugin-runtime.js); events.json does not forbid the field.
  assert.deepEqual(Object.keys(frame).sort(), [...eventFields.required, "surface"].sort(), "the record holds the fields of events.json and the surface");
  assert.equal(frame.surface, "browser-1");
  assert.equal(frame.sequence, 0);
  assert.equal(frame.width, 640);
  assert.equal(frame.height, 480);
  assert.equal(frame.documentTimeOriginMs, view.window.performance.timeOrigin);
  assert.equal(frame.resizeCount, 1);
  assert.equal(frame.firstResizeAtMs, frame.resizeAtMs, "one resize has one time");
  assert.ok(frame.frameTimeMs >= frame.resizeAtMs, "the animation frame follows the resize");

  assert.deepEqual(await command(view, "browser.view.measure", { action: "stop" }), {
    enabled: false, sequence: 1, historyEntries: view.window.history.length, regionHistoryEntries: 2, width: 640, height: 480,
  });
  clock.notify();
  clock.run();
  await view.settled();
  assert.equal(framesOf(view).length, 1, "no frame is recorded after stop");
  assert.deepEqual(await command(view, "browser.view.measure", { action: "read" }), {
    enabled: false, sequence: 1, historyEntries: view.window.history.length, regionHistoryEntries: 2, width: 640, height: 480,
  });
});

test("browser.view.measure refuses a repeated start, a stop without a start and an unknown action", async (t) => {
  const { view } = await openDiagnosticTab(t);
  await assert.rejects(command(view, "browser.view.measure", { action: "stop" }), { message: "browser view measurement is not active" });
  await command(view, "browser.view.measure", { action: "start" });
  await assert.rejects(command(view, "browser.view.measure", { action: "start" }), { message: "browser view measurement is already active" });
  // The host refuses a value that the declared enum of action does not hold, before the page runs (the page message is tested in the attach test).
  await assert.rejects(command(view, "browser.view.measure", { action: "reset" }), { message: "invalid params for browser.view.measure" });
  await command(view, "browser.view.measure", { action: "stop" });
});

test("the view ends its diagnostic observation when the view ends", async (t) => {
  const { view, clock } = await openDiagnosticTab(t);
  await command(view, "browser.view.measure", { action: "start" });
  // The start requests one frame, the frame that observes the root; the view ends by canceling it.
  const observing = clock.requested();
  assert.equal(clock.pending() > 0, true, "the start leaves the frame that observes the root pending");
  await view.close();
  assert.ok(clock.canceled().includes(observing), "the page cancels the frame that observes the root when the view ends");
});

// P128-2: the section page ends its content watch and its diagnostic observation when the view ends (the pagehide of the page disposes
// the section diagnostics). The frame that renders the content and the frame that observes the root are the frames that the view cancels.
test("the section page ends its content watch and its diagnostic observation when the view ends", async (t) => {
  const { view, clock } = await openDiagnosticSection(t);
  await follow(view, SECTION.id, null);
  const rendering = clock.requested();
  assert.equal(clock.pending() > 0, true, "the text requests the frame that renders it");
  await command(view, "browser.view.frames", { action: "start" });
  const observing = clock.requested();
  await view.close();
  assert.ok(clock.canceled().includes(rendering), "the page cancels the frame that renders its content when the view ends");
  assert.ok(clock.canceled().includes(observing), "the page cancels the frame that observes the root when the view ends");
});

// The shared view-frame observer only emits the fields that its own checks accept, so an invalid interval cannot come from the view
// document. This test calls attach directly, with the observer replaced by a fault injection that emits each invalid interval
// (the contract of the content-frame adapter, not a host behavior). The expose object records the commands that attach registers.
test("the content-frame adapter rejects invalid coalesced intervals and fields and forwards valid ones unchanged", async (t) => {
  const view = await openTab(t);
  const commands = new Map();
  const records = [];
  let emit = null;
  const dispose = await attach({
    expose: { command: async (name, run) => commands.set(name, run) },
    root: view.window.document.documentElement,
    section: null,
    readRegionHistoryEntries: () => 0,
    log: (event, fields) => records.push({ event, fields }),
    observeFrames: (options) => { emit = options.log.trace; return () => {}; },
  });
  const run = commands.get("browser.view.measure");
  await run({ action: "start" });
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
  for (const fields of invalid) assert.throws(() => emit("view.content_frame", fields));
  emit("view.content_frame", valid);
  assert.deepEqual(records, [{ event: "view.content_frame", fields: valid }], "valid source metadata is forwarded without rewriting");
  // The page refuses an action that its own check rejects, with its own message (the host does not check the values of the params).
  await assert.rejects(async () => run({ action: "reset" }), { message: "browser.view.measure action must be start, stop or read" });
  await run({ action: "stop" });
  await dispose();
});

// The section page refuses an unknown action of browser.view.frames with its own message (the host refuses it first, see the section tests).
test("the frames command of a section view refuses an action that is neither start nor stop with its own message", async (t) => {
  const view = await openTab(t);
  const commands = new Map();
  const statuses = new Map();
  await attach({
    expose: { command: async (name, run) => commands.set(name, run), status: async (name, read, subscribe) => statuses.set(name, { read, subscribe }) },
    root: view.window.document.documentElement,
    section: SECTION,
    declaration: DIAGNOSTICS,
    log: () => {},
    observeFrames: () => () => {},
  });
  await assert.rejects(async () => commands.get("browser.view.frames")({ action: "reset" }), { message: "browser.view.frames action must be start or stop" });
});

test("events.json requires the coalesced source interval fields of the content frame", () => {
  for (const name of ["firstResizeAtMs", "resizeAtMs", "resizeCount", "frameTimeMs"]) {
    assert.ok(eventFields.required.includes(name), `events.json must require ${name}`);
    assert.ok(Object.hasOwn(eventFields.properties, name), `events.json must declare ${name}`);
  }
  assert.equal(eventFields.properties.resizeCount.minimum, 1);
});

for (const id of STATUS_OF_SECTION.keys()) {
  test(`the ${id} section view serves browser.view.frames, browser.view.history and only ${id}.view.ready`, async (t) => {
    const { view } = await openDiagnosticSection(t, id);
    assert.deepEqual(await command(view, "browser.view.history", {}), { length: view.window.history.length });
    assert.deepEqual(await readyOf(view, id), { ready: false, ...CONTENT });
    await assert.rejects(command(view, "browser.view.frames", { action: "stop" }), { message: "browser.view.frames is not active" }, "the frames command is served");
    for (const other of STATUS_OF_SECTION.keys()) {
      if (other === id) continue;
      await assert.rejects(readyOf(view, other), { message: `status ${readyName(other)} is not registered` });
    }
  });
}

test("browser.view.frames start observes the content frames of the section view and paints its document root with the marker color until stop", async (t) => {
  const { view, clock } = await openDiagnosticSection(t);
  const before = paintOf(view);
  const started = await command(view, "browser.view.frames", { action: "start" });
  assert.deepEqual(Object.keys(started).sort(), ["enabled", "markerColor", "sourceClock"]);
  assert.equal(started.enabled, true);
  assert.deepEqual(started.markerColor, MARKER);
  assert.equal(started.sourceClock.documentTimeOriginMs, view.window.performance.timeOrigin);
  assert.ok(Number.isFinite(started.sourceClock.sourceNowMs) && started.sourceClock.sourceNowMs >= 0);
  assert.equal(started.sourceClock.sourceResolutionMs, 1);
  assert.deepEqual(paintOf(view), ["rgb(255, 0, 255)", "rgb(255, 0, 255)"], "the root and the body show the marker color");

  clock.notify();
  clock.run();
  await view.settled();
  const [frame] = framesOf(view);
  assert.equal(frame.width, 240);
  assert.equal(frame.height, 160);
  assert.equal(frame.documentTimeOriginMs, view.window.performance.timeOrigin);

  assert.deepEqual(await command(view, "browser.view.frames", { action: "stop" }), { enabled: false });
  assert.deepEqual(paintOf(view), before, "stop paints the root as before start");
  clock.notify();
  clock.run();
  await view.settled();
  assert.equal(framesOf(view).length, 1, "no frame is recorded after stop");
});

test("browser.view.frames refuses a repeated start, a stop without a start and an unknown action", async (t) => {
  const { view } = await openDiagnosticSection(t);
  await assert.rejects(command(view, "browser.view.frames", { action: "stop" }), { message: "browser.view.frames is not active" });
  await command(view, "browser.view.frames", { action: "start" });
  await assert.rejects(command(view, "browser.view.frames", { action: "start" }), { message: "browser.view.frames is already active" });
  // The host refuses a value that the declared enum of action does not hold, before the page runs (the page message is tested in the attach test).
  await assert.rejects(command(view, "browser.view.frames", { action: "reset" }), { message: "invalid params for browser.view.frames" });
  await command(view, "browser.view.frames", { action: "stop" });
});

test("browser.view.frames start fails without observing or painting when the marker color is within 4 of a theme color in every channel", async (t) => {
  const { view } = await openDiagnosticSection(t, SECTION.id, { theme: { scheme: "dark", tokens: { ...THEME, "--edge": "#fd02fb" } } });
  const before = paintOf(view);
  await assert.rejects(command(view, "browser.view.frames", { action: "start" }), {
    message: "browser.view.frames marker color [255,0,255] is within 4 in every channel of the theme color --edge #fd02fb",
  });
  assert.deepEqual(paintOf(view), before);

  const unreadable = await openDiagnosticSection(t, SECTION.id, { theme: { scheme: "dark", tokens: { ...THEME, "--card": "var(--bg)" } } });
  await assert.rejects(command(unreadable.view, "browser.view.frames", { action: "start" }), {
    message: 'browser.view.frames reads the theme color --card as #rrggbb, not "var(--bg)"',
  });
});

test("browser.view.history answers the length of the session history of the section view", async (t) => {
  const { view } = await openDiagnosticSection(t);
  assert.deepEqual(await command(view, "browser.view.history", {}), { length: view.window.history.length });
});

for (const [id, status] of STATUS_OF_SECTION) {
  test(`${id}.view.ready is true while the section view shows the empty text, once a frame renders it`, async (t) => {
    const { view, clock } = await openDiagnosticSection(t, id);
    await sendExposure(view, "status.watch", { name: readyName(id) });
    await view.settled();
    assert.equal(view.window.document.body.textContent, "", "before the first core.sidebars the section view shows nothing");
    assert.deepEqual(await readyOf(view, id), { ready: false, ...CONTENT });
    await sidebarsOf(view, id, null);
    await view.settled();
    assert.equal(view.window.document.body.textContent, CONTENT.content);
    assert.deepEqual(await readyOf(view, id), { ready: false, ...CONTENT }, "the frame that renders the text has not run");
    clock.run();
    await view.settled();
    assert.deepEqual(await readyOf(view, id), { ready: true, ...CONTENT });
    assert.deepEqual(changesOf(view, readyName(id)).map((value) => value.ready), [false, true]);
    void status;
  });

  test(`${id}.view.ready is false while the section view shows the rows of a followed surface`, async (t) => {
    const { view, clock } = await openDiagnosticSection(t, id);
    await follow(view, id, "tab-2");
    await deliverRows(view, status, rows);
    clock.run();
    await view.settled();
    assert.equal(view.window.document.body.textContent, "Docs");
    assert.deepEqual(await readyOf(view, id), { ready: false, ...CONTENT });
  });
}

test("the ready status follows the text: another empty text is false, and the text that returns is true after its frame", async (t) => {
  const { view, clock } = await openDiagnosticSection(t);
  await follow(view, SECTION.id, null);
  clock.run();
  await view.settled();
  assert.equal((await readyOf(view, SECTION.id)).ready, true);
  await sidebarsOf(view, SECTION.id, "tab-2");
  await view.settled();
  assert.equal((await readyOf(view, SECTION.id)).ready, false, "the rows of the followed surface replace the text at once");
  await deliverRows(view, "browser.tabs", noRows);
  clock.run();
  await view.settled();
  assert.equal(view.window.document.body.textContent, "브라우저 탭 없음");
  assert.equal((await readyOf(view, SECTION.id)).ready, false);
  await sidebarsOf(view, SECTION.id, null);
  clock.run();
  await view.settled();
  assert.equal((await readyOf(view, SECTION.id)).ready, true);
});

test("a text that leaves before its frame renders it is not ready", async (t) => {
  const { view, clock } = await openDiagnosticSection(t);
  await follow(view, SECTION.id, null);
  assert.equal(clock.pending(), 1, "the frame that renders the text is requested");
  await sidebarsOf(view, SECTION.id, "tab-2");
  await view.settled();
  assert.equal(clock.pending(), 0, "the text that left cancels its frame");
  clock.run();
  await view.settled();
  assert.equal((await readyOf(view, SECTION.id)).ready, false);
});

// The ready status of a declaration that does not name one string each for content and language, as the diagnostic module requires.
const readyDeclaration = (fields) => ({ module: "ui/browser-diagnostics.js", exposes: { status: [{ name: "browser.tabs.view.ready", description: "", schema: {
  type: "object", properties: { ready: { type: "boolean" }, ...fields } } }] } });
const REFUSAL = "view browser: section failed: browser section diagnostics require the declaration of browser.tabs.view.ready with a one-item enum of the strings content and language";

for (const [label, declaration] of [
  ["no status", { module: "ui/browser-diagnostics.js", exposes: {} }],
  ["no language", readyDeclaration({ content: { type: "string", enum: [CONTENT.content] } })],
  ["no content", readyDeclaration({ language: { type: "string", enum: [CONTENT.language] } })],
  ["two contents", readyDeclaration({ content: { type: "string", enum: [CONTENT.content, "another"] }, language: { type: "string", enum: [CONTENT.language] } })],
  ["empty content enum", readyDeclaration({ content: { type: "string", enum: [] }, language: { type: "string", enum: [CONTENT.language] } })],
  ["non-string content", readyDeclaration({ content: { type: "string", enum: [1] }, language: { type: "string", enum: [CONTENT.language] } })],
  ["const content", readyDeclaration({ content: { type: "string", const: CONTENT.content }, language: { type: "string", enum: [CONTENT.language] } })],
]) {
  test(`a section view whose declaration has ${label} is refused with its error`, async (t) => {
    const view = await openSection(t, SECTION, { diagnostics: declaration, theme: SECTION_THEME, viewLayout: { rect: SECTION_RECT }, frames: true });
    const report = await view.logged("plugin.browser.report");
    assert.equal(report.fields.text, REFUSAL);
  });
}

test("a section view whose declaration names one string each for content and language serves its ready status", async (t) => {
  const content = { type: "string", enum: [CONTENT.content] };
  const language = { type: "string", enum: [CONTENT.language] };
  const { view } = await openDiagnosticSection(t, SECTION.id, { diagnostics: readyDeclaration({ content, language }) });
  assert.deepEqual(await readyOf(view, SECTION.id), { ready: false, ...CONTENT });
});

test("diagnostics.json declares the entries of the tab view and of the section views, with a one-item enum of the content and language of each section", () => {
  const { module, exposes } = DIAGNOSTICS;
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
  const { commands, status } = DIAGNOSTICS.exposes;
  const unknown = [
    ...commands.flatMap(({ name, params, result }) => [...unknownFields(`${name} params`, params), ...unknownFields(`${name} result`, result)]),
    ...status.flatMap(({ name, schema }) => unknownFields(`${name} schema`, schema)),
  ];
  assert.deepEqual(unknown, []);
});

void SECTION_PAGE;
