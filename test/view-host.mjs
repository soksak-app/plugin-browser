// A fake of the core side of the view channel for the tests of the view page, built from the wire contract of core
// (docs/spec/native-surfaces.md#view-surfaces): the view channel global window.sokView, the call route of a view, the
// view events and the composition and document calls of a view with a document region. It reads no file of core. The
// page imports with a distinct query per case, so each case mounts a fresh page into its own window.
import { readFileSync } from "node:fs";
import { createWindow, useWindow } from "./dom.mjs";

/**
 * Installs the view channel of the contract in window: the ready message {event: "view.ready", plugin, document, time_origin} through
 * the sok-view handler, and window.sokView.attach(listener), which delivers the host messages with sok: 1 that arrived
 * before the attach in order and every later one. A message without the marker is reported as view.error.
 */
function installViewChannel(window, handler) {
  const plugin = window.location.host;
  const queue = [];
  let listener = null;
  window.addEventListener("message", (event) => {
    if (event.data?.sok !== 1) {
      handler.postMessage({ event: "view.error", plugin, reason: `message without the sok marker for ${plugin}` });
      return;
    }
    if (listener) listener(event.data);
    else queue.push(event.data);
  });
  // The page identity is a UUID of the document, and the time origin is a separate field (core view-wire.json).
  const page = window.crypto.randomUUID();
  const timeOrigin = window.performance.timeOrigin;
  handler.postMessage({ event: "view.ready", plugin, document: page, time_origin: timeOrigin });
  window.sokView = Object.freeze({
    page,
    timeOrigin,
    attach(next) {
      if (listener) throw new Error(`view channel for ${plugin} already has a message listener`);
      listener = next;
      while (queue.length > 0) next(queue.shift());
    },
  });
}

const MANIFEST = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const declared = (kind, name) => (MANIFEST.exposes[kind] ?? []).some((entry) => entry.name === name);

const settle = (rounds = 8) => {
  let done = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) done = done.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return done;
};

/**
 * The document region "page" of the view. The host delivers each state of the region as the event document-state
 * {document, state} and each message of a stream as the event document-stream {document, handle, message} through the
 * subscriptions runtime.native.on, which emit(name, data) runs. show(url, change) reports one state, and load(url)
 * records the load and reports it. subscribe(stream) opens a subscription and stream(stream, message) delivers it.
 */
function fakeRegion(name, emit) {
  const region = { name, streams: [], handles: 0, loads: [], history: false, restoredState: null };
  region.stateOf = (url, change = {}) => ({ url, title: "", loading: false, progress: 1, canGoBack: false, canGoForward: false, error: null, scroll: { x: 0, y: 0 }, link: "", history: { entries: [], index: -1 }, ...change });
  region.show = (url, change = {}) => {
    const state = region.stateOf(url, change);
    setTimeout(() => emit("document-state", { document: name, state }), 0);
    return state;
  };
  region.load = (url) => { region.loads.push(url); region.show(url); return Promise.resolve(); };
  region.stream = (stream, message) => {
    setTimeout(() => {
      for (const subscription of region.streams) {
        if (subscription.stream === stream && !subscription.closed) {
          emit("document-stream", { document: name, handle: subscription.handle, message });
        }
      }
    }, 0);
  };
  region.call = {
    attach: async () => ({ history: region.history }),
    load: (params) => region.load(params.url),
    zoom: async () => null,
    go: async () => null,
    post: async () => null,
    subscribe: (params) => {
      const handle = `handle-${++region.handles}`;
      region.streams.push({ stream: params.stream, handle, closed: false });
      return { stream: params.stream, handle, close: async () => {
        region.streams.find((entry) => entry.handle === handle).closed = true;
      } };
    },
    unsubscribe: async () => null,
    detach: async () => null,
  };
  return region;
}

/**
 * Creates one window with the view page of one case mounted: the start values, the fake view channel, the host side of
 * the sok-view channel, and the composition and document routes of the view. The globals of the test process serve the
 * window.
 *
 * Returns { window, region, reports, logs, calls, run, post, settle, expose }. reports holds the tab reports, the state
 * writes and the registrations that the page sent; logs holds the plugin events from the view log batches; calls holds the
 * composition and document calls of the page; run(name, params) sends one command request of core to the page; expose(method, params)
 * forwards one exposure request of core; post(message) posts one host message to the page.
 */
export function createViewPage(t, caseId, { stored = null, origin = { directory: "/work" }, start, textSize = 1, home = "https://home.test/", refuseLog = null } = {}) {
  const { window } = createWindow(`sok://browser/ui/index.html?case=${caseId}`);
  useWindow(window);
  // The composition controller measures the insets of the region element against the viewport of the view and observes
  // the element sizes; jsdom reports no viewport and no size, so the test provides the forms it reads.
  window.visualViewport = { width: 800, height: 600 };
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const reports = { title: [], footer: [], modified: [], error: [], errorLines: [], keep: [], state: [], registered: [], native: [], cids: [] };
  const logs = [];
  let clockUs = 0;
  let monoNs = 0;
  const snapshots = [];
  const calls = [];
  const pending = new Map();
  const subscribed = new Set();
  // The statuses that the page watches; the host sends a value of a watched status with status(name, value).
  const watched = new Set();
  const exposurePending = new Map();
  const nativeListeners = new Set();
  const post = (message) => window.dispatchEvent(new window.MessageEvent("message", { source: window, origin: "", data: message }));
  const emitNative = (name, data) => {
    if (nativeListeners.has(name)) post({ sok: 1, event: name, data });
  };
  const region = fakeRegion("page", emitNative);
  const handler = { postMessage: (sent) => { const message = JSON.parse(JSON.stringify(sent)); deliver(message); } };
  window.webkit = { messageHandlers: { "sok-view": handler } };

  const reply = (id, payload) => post({ sok: 1, id, ...payload });
  const deliver = (message) => {
    if (message?.event === "declared-ui.snapshot") {
      snapshots.push(message);
      post({ sok: 1, event: "declared-ui.snapshot.ack", data: { plugin: message.plugin, status: message.status, seq: message.seq } });
      return;
    }
    if (message?.event !== undefined) return;
    if (message?.reply !== undefined) {
      const request = pending.get(message.reply);
      if (!request) throw new Error(`the page replied to unknown host request ${message.reply}`);
      pending.delete(message.reply);
      if (message.error !== undefined) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.cancel === true) return;
    if (Number.isInteger(message?.id) && typeof message?.command === "string") {
      // The identifiers that the page sends with a call are recorded with the call.
      if (message.cids !== undefined) reports.cids.push({ command: message.command, cids: message.cids });
      serve(message.id, message.command, message.params);
      return;
    }
    throw new Error(`the page sent an unexpected message ${JSON.stringify(message)}`);
  };
  const serve = (id, command, params) => {
    Promise.resolve().then(async () => {
      switch (command) {
        case "tab.state.read": return stored;
        case "tab.state.write": reports.state.push(params); return null;
        case "tab.title": reports.title.push(params); return null;
        case "tab.footer": reports.footer.push(params); return null;
        case "tab.modified": reports.modified.push(params); return null;
        case "tab.error": reports.error.push(params); return null;
        case "tab.notify": case "tab.keep": case "tab.directory": return null;
        case "runtime.log":
          if (params?.action === "clock") {
            clockUs += 1;
            monoNs += 1;
            return { ts_us: clockUs, mono_ns: monoNs };
          }
          if (params?.action === "batch" && Array.isArray(params.events)) {
            // The consumer observes declared plugin events; page clock and writer lifecycle events are outside its catalog.
            const records = params.events.filter((entry) => entry.event.startsWith("plugin.browser."));
            // refuseLog makes the host refuse a batch that carries a plugin event.
            if (refuseLog !== null && records.length > 0) throw new Error(refuseLog);
            for (const { level, event, fields, cids } of records) {
              logs.push({ level, event: event.slice("plugin.browser.".length), fields, ...(cids === undefined ? {} : { cids }) });
            }
            return null;
          }
          throw new Error("runtime.log requires a clock or batch action");
        case "runtime.error": reports.errorLines.push(params); return null;
        case "runtime.status.watch": watched.add(params.name); return null;
        case "runtime.status.unwatch": watched.delete(params.name); return null;
        case "core.tab.select": calls.push([command, params]); return null;
        case "runtime.textSize.read": return textSize;
        case "runtime.textSize.on": return null;
        case "runtime.settings.read": return { home };
        case "runtime.settings.on": return null;
        case "runtime.native.on":
          if (typeof params?.name !== "string" || params.name === "") throw new Error("runtime.native.on requires a name");
          subscribed.add(params.name);
          nativeListeners.add(params.name);
          return null;
        case "runtime.command.register":
          if (!declared("commands", params.name)) throw new Error(`command ${params.name} is not declared`);
          reports.registered.push(params.name);
          return null;
        case "composition.declaration":
          return JSON.parse(JSON.stringify(MANIFEST.surface.composition));
        case "composition.place":
          calls.push(["composition.place", params]);
          // A restored session history reports its state while the composition is placed, before the create of the page
          // returns and the page subscribes to the state of the region; the host sends it at once, as it does for a restore.
          if (region.restoredState !== null) {
            const state = region.restoredState;
            region.restoredState = null;
            emitNative("document-state", { document: region.name, state });
          }
          return null;
        case "composition.report":
          calls.push(["composition.report", params]);
          return null;
        case "document.attach": case "document.load": case "document.zoom": case "document.go":
        case "document.post": case "document.subscribe": case "document.unsubscribe": case "document.detach": {
          const operation = command.slice("document.".length);
          calls.push([command, params]);
          if (params.name !== region.name) throw new Error(`the page called ${command} for the unknown region ${params.name}`);
          const result = await region.call[operation](params);
          return result === undefined ? null : result;
        }
        case "runtime.sidecar.send": case "runtime.sidecar.on": case "runtime.sidecar.onFailure":
          throw new Error(`the page called ${command}, which this case serves no sidecar for`);
        case "runtime.native.call": {
          const { name, payload } = params;
          if (name === "registered") {
            if (!declared(payload.kind, payload.name)) throw new Error(`${payload.kind} ${payload.name} is not declared`);
            reports.native.push(["registered", payload]);
            return null;
          }
          if (name === "exposureReply") {
            const request = exposurePending.get(payload.id);
            if (!request) throw new Error(`the page replied to unknown exposure request ${payload.id}`);
            exposurePending.delete(payload.id);
            const { id: _id, ...answer } = payload;
            request(answer);
            return null;
          }
          throw new Error(`the page called the native ${name}`);
        }
        default:
          throw new Error(`the page called ${command}, which is served by no route of the test host`);
      }
    }).then((result) => reply(id, { result: result ?? null }), (error) => reply(id, { error: { code: -32000, message: String(error?.message ?? error) } }));
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "soksak://browser/diagnostics.json" || url === "sok://browser/diagnostics.json") {
      return { status: 404, ok: false };
    }
    throw new Error(`the page fetched ${url}, which the test host serves no document for`);
  };
  t.after(() => { globalThis.fetch = realFetch; });

  // The start values in the form that core injects (docs/spec/native-surfaces.md#view-surfaces, start values): the
  // declarations are the exposes of the plugin.
  window.sokSurface = Object.freeze(start ?? { surface: "browser-1", params: {}, origin, project: { id: "prj-project", root: "/project" }, declarations: MANIFEST.exposes });
  installViewChannel(window, handler);
  post({ sok: 1, event: "theme", data: { scheme: "dark", tokens: {} } });

  let nextId = 1000;
  // A command of the view: options.cids is the operation of the request, which the page passes to the command handler.
  const run = (name, paramsOfRun = {}, options = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post(options.cids === undefined ? { sok: 1, id, command: name, params: paramsOfRun } : { sok: 1, id, command: name, params: paramsOfRun, cids: options.cids });
  });
  // The host sends the value of a status that the page watches (core docs/spec/native-surfaces.md#view-events).
  const status = (name, value) => {
    if (!watched.has(name)) throw new Error(`the page does not watch status ${name}`);
    post({ sok: 1, event: "status", data: { name, value } });
  };
  let nextExposure = 0;
  const expose = (method, paramsOfRequest) => new Promise((resolve) => {
    if (!subscribed.has("exposure-request")) {
      resolve({ error: { message: "the page has no subscription of exposure-request" } });
      return;
    }
    const id = ++nextExposure;
    exposurePending.set(id, resolve);
    post({ sok: 1, event: "exposure-request", data: { id, surface: "browser-1", method, params: paramsOfRequest } });
  });
  return { window, region, reports, logs, calls, snapshots, subscribed, run, post, settle, expose, status };
}
