import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createEmitter } from "../build/test/ui/events.js";
import { mount } from "../build/test/ui/browser.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"));
const LEVELS = ["error", "warn", "info", "debug", "trace"];
const CLASSES = ["lifecycle", "input", "call", "io", "frame"];
const TYPES = ["string", "number", "integer", "boolean", "array", "object", "null"];

const recorder = () => {
  const events = [];
  const log = Object.fromEntries(LEVELS.map((level) => [level, (event, fields) => { events.push({ level, event, fields }); }]));
  return { events, runtime: { log, status: { watch: () => () => {} }, beginOperation: () => [], command: async () => null } };
};

test("the emitter strips the plugin prefix and calls the level function of the runtime", () => {
  const { events, runtime } = recorder();
  const emitEvent = createEmitter(runtime, "browser");
  emitEvent("warn", "plugin.browser.load.failed", { url: "https://a.test/" });
  assert.deepEqual(events, [{ level: "warn", event: "load.failed", fields: { url: "https://a.test/" } }]);
});

test("the emitter refuses a name of another plugin and a level that does not exist", () => {
  const { runtime } = recorder();
  const emitEvent = createEmitter(runtime, "browser");
  assert.throws(() => emitEvent("info", "plugin.files.open", {}), /plugin\.browser\./);
  assert.throws(() => emitEvent("loud", "plugin.browser.open", {}), /level/);
});

test("the manifest names the catalog, the catalog is declared for release, and every entry has the contract form", () => {
  assert.equal(manifest.events, "events.json");
  assert.ok(pkg.files.includes("events.json"));
  assert.ok(pkg.files.includes("ui/events.js"));
  assert.equal(catalog.schema, 3);
  assert.deepEqual(catalog.layers, ["plugin"]);
  assert.ok(Object.keys(catalog.events).length > 0);
  for (const [name, entry] of Object.entries(catalog.events)) {
    assert.match(name, /^plugin\.browser\.[a-z_]+(\.[a-z_]+)*$/, name);
    assert.equal(entry.layer, "plugin", name);
    assert.ok(CLASSES.includes(entry.class), name);
    for (const level of [entry.level].flat()) assert.ok(LEVELS.includes(level), name);
    assert.ok(entry.description.length > 0, name);
    assert.equal(entry.fields.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.equal(entry.fields.type, "object", name);
    assert.ok(Array.isArray(entry.fields.required), name);
    for (const field of entry.fields.required) assert.ok(Object.hasOwn(entry.fields.properties, field), `${name}.${field}`);
    for (const [field, schema] of Object.entries(entry.fields.properties)) {
      for (const type of [schema.type].flat()) assert.ok(TYPES.includes(type), `${name}.${field}`);
    }
  }
});

async function setup(t, { home = "https://home.test/", failLoad } = {}) {
  const dom = new JSDOM("<div id='mount'></div>", { url: "https://app.test/" });
  const root = dom.window.document.querySelector("#mount").attachShadow({ mode: "open" });
  const commands = new Map();
  const states = new Set();
  const { events, runtime } = recorder();
  const page = { url: "", title: "", loading: false, progress: 0, canGoBack: false, canGoForward: false, error: null, scroll: { x: 0, y: 0 },
    history: { entries: [], index: -1 }, elements: { nodes: [], truncated: false }, requests: { entries: [], truncated: false }, link: "" };
  const push = (change) => { Object.assign(page, change); for (const fn of states) fn({ ...page }); };
  const region = {
    state: null,
    onState(fn) { states.add(fn); return () => states.delete(fn); },
    async load(url) { if (failLoad) throw Object.assign(new Error("refused"), { code: -32001 }); push({ url }); },
    async back() {}, async forward() {}, async reload() {}, async stop() {}, async zoom() {},
    async entry() { return true; },
  };
  const controller = await mount(root, {
    runtime: { ...runtime, settings: { read: async () => ({ home }), on: async () => () => {} }, textSize: { read: async () => 1, on: async () => () => {} } },
    tab: { title() {}, footer() {}, state: { read: () => null, write() {} } },
    surfaceId: "browser-events-test",
    composition: { async create() { return { region: () => region, async dispose() {} }; } },
    exposure: { status() {}, dom() {}, command(name, run) { commands.set(name, run); }, bind() {}, delegate() {}, dispose() {} },
    declared: { push() {} },
    declared: { push() {} },
    status: { report() {} },
  });
  t.after(() => { controller.dispose(); dom.window.close(); });
  return { events, commands, push, page };
}

test("the start is an event that names the address and where it came from", async (t) => {
  const { events } = await setup(t);
  const start = events.find((event) => event.event === "start");
  assert.deepEqual(start, { level: "info", event: "start", fields: { url: "https://home.test/", source: "home" } });
});

test("a command result states ok and micros, and a failed command states the code and the text", async (t) => {
  const { events, commands } = await setup(t, { failLoad: false });
  await commands.get("browser.reload")({});
  const ok = events.find((event) => event.event === "command" && event.fields.name === "browser.reload");
  assert.equal(ok.level, "debug");
  assert.equal(ok.fields.ok, true);
  assert.ok(Number.isInteger(ok.fields.micros) && ok.fields.micros >= 0);
  assert.equal("error" in ok.fields, false);
  await assert.rejects(commands.get("browser.navigate")({ url: "" }), /requires an address/);
  const failed = events.find((event) => event.event === "command" && event.fields.name === "browser.navigate");
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.ok, false);
  assert.match(failed.fields.error, /^-32000: browser\.navigate requires an address/);
});

test("a failed load keeps the code of the error", async (t) => {
  const { events, commands } = await setup(t, { home: "", failLoad: true });
  await assert.rejects(commands.get("browser.navigate")({ url: "https://x.test/" }), /refused/);
  const failed = events.find((event) => event.event === "command");
  assert.equal(failed.fields.error, "-32001: refused");
});

test("a history move names the entries it moves between", async (t) => {
  const { events, commands, push } = await setup(t, { home: "" });
  push({ history: { entries: [{ url: "https://a.test/", title: "A" }, { url: "https://b.test/", title: "B" }, { url: "https://c.test/", title: "C" }], index: 2 } });
  await commands.get("browser.history.go")({ index: 0 });
  assert.deepEqual(events.find((event) => event.event === "history.move").fields, { from: 2, to: 0 });
});

test("a document that finishes loading is a load event with its duration, and a document error is a failure event", async (t) => {
  const { events, push } = await setup(t, { home: "" });
  push({ url: "https://a.test/", loading: true });
  push({ url: "https://a.test/", loading: false });
  const load = events.find((event) => event.event === "load");
  assert.equal(load.level, "info");
  assert.equal(load.fields.url, "https://a.test/");
  assert.equal(load.fields.ok, true);
  assert.ok(Number.isInteger(load.fields.micros) && load.fields.micros >= 0);
  push({ url: "https://b.test/", loading: true });
  push({ url: "https://b.test/", loading: false, error: "net::ERR_NAME_NOT_RESOLVED" });
  const failure = events.find((event) => event.event === "region.failure");
  assert.equal(failure.level, "error");
  assert.deepEqual(failure.fields, { url: "https://b.test/", reason: "net::ERR_NAME_NOT_RESOLVED" });
});

test("a change of the address of the document is a navigation event", async (t) => {
  const { events, push } = await setup(t, { home: "" });
  push({ url: "https://a.test/" });
  push({ url: "https://a.test/", title: "t" });
  push({ url: "https://b.test/" });
  const navigations = events.filter((event) => event.event === "navigation").map((event) => event.fields);
  assert.deepEqual(navigations, [{ from: "", to: "https://a.test/" }, { from: "https://a.test/", to: "https://b.test/" }]);
});
