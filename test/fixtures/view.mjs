// The fixtures of the browser views of these tests. A view is opened by openView, which loads the page into a jsdom window and gives the page
// a view handle (plugin-api/bridge-host.mjs). The page reaches the plugin API through the fixtures of plugin-api/: its calls are recorded
// in the view record, and each call is answered with what the host answers here (answer). The document region of the view is a host object,
// so its operations are the handlers of createRegion, and each attach, load, zoom and subscription is recorded in the region. A test
// delivers the states and the messages of the region with view.push, as the host delivers them. The declarations of the plugin and the
// composition of the view come from the plugin manifest.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createViewHandle, recordOf } from "./plugin-api/bridge-host.mjs";
import { layOut } from "./layout.mjs";

const manifest = JSON.parse(readFileSync(new URL("../../plugin.json", import.meta.url), "utf8"));

/** The page module of the tab view and the page module of a section view. */
export const TAB_PAGE = new URL("../../ui/view.js", import.meta.url);
export const SECTION_PAGE = new URL("../../ui/section.js", import.meta.url);
/** The document of each page, which the view loads in its window. */
const TAB_HTML = readFileSync(new URL("../../ui/index.html", import.meta.url), "utf8");
const SECTION_HTML = readFileSync(new URL("../../ui/section.html", import.meta.url), "utf8");
/** The exposure declarations of the plugin, which the start values of each view carry. */
export const DECLARATIONS = manifest.exposes;

// The diagnostic declaration of the plugin (diagnostics.json), which a diagnostic build loads into the start values of its views.
export const DIAGNOSTICS = JSON.parse(readFileSync(new URL("../../diagnostics.json", import.meta.url), "utf8"));

// The declarations of a diagnostic build: the manifest entries with the entries of diagnostics.json (the host merges them the same way).
export const DIAGNOSTIC_DECLARATIONS = {
  ...DECLARATIONS,
  commands: [...(DECLARATIONS.commands ?? []), ...DIAGNOSTICS.exposes.commands],
  status: [...(DECLARATIONS.status ?? []), ...DIAGNOSTICS.exposes.status],
};

// The entries that the host declares for every view of a surface document, beside the entries of the plugin: the document and input statuses
// and the hit and clock commands of the surface (core docs/spec/native-surfaces.md#view-surfaces, view exposure).
const CORE_DOCUMENT_ENTRIES = {
  status: [{ name: "core.surface.document" }, { name: "core.surface.input" }],
  commands: [{ name: "core.surface.hit" }, { name: "core.surface.clock" }],
};

// The declarations that the start values of a view carry: the entries of the plugin, with the core entries of the surface document.
function declarationsOf(plugin) {
  return {
    ...plugin,
    status: [...(plugin.status ?? []), ...CORE_DOCUMENT_ENTRIES.status],
    commands: [...(plugin.commands ?? []), ...CORE_DOCUMENT_ENTRIES.commands],
  };
}

/**
 * The frame clock of a view page under test: the window records each ResizeObserver that the page constructs and each animation frame that
 * the page requests, and run() runs the requested frames at the current time of the window, as the frame that renders the document does.
 * A page observes a size change through the observer that the test notifies (notify), and no frame runs until the test runs it.
 */
export function frameClock(view) {
  const pending = new Map();
  const observers = [];
  const canceled = [];
  let handle = 0;
  const Base = view.window.ResizeObserver;
  view.window.ResizeObserver = class extends Base {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };
  view.window.requestAnimationFrame = (run) => {
    handle += 1;
    pending.set(handle, run);
    return handle;
  };
  view.window.cancelAnimationFrame = (id) => {
    canceled.push(id);
    pending.delete(id);
  };
  return {
    // The identifier of the latest requested frame, and the identifiers of the frames that the page canceled, in order.
    requested: () => handle,
    canceled: () => [...canceled],
    // The size change of the document root, as the platform observer reports it: an entry of the root with its target.
    notify: () => {
      const root = view.window.document.documentElement;
      for (const observer of observers) observer.notify([{ target: root, contentRect: root.getBoundingClientRect() }]);
    },
    // Runs the frames that are requested at the time of the window.
    run: () => {
      const due = [...pending.values()];
      pending.clear();
      for (const run of due) run(view.window.performance.now());
    },
    pending: () => pending.size,
  };
}
/** The surface of the views of these tests. */
export const SURFACE = "browser-1";
/** The start values of a tab view, as the host injects them. */
export const START = { surface: SURFACE, params: {}, origin: { directory: "/work" }, project: { id: "prj-project", root: "/project" }, diagnostics: null, levels: {} };

/** A document state of the region that shows url, with change applied. */
export const documentState = (url, change = {}) => ({
  url, title: "", loading: false, progress: 1, canGoBack: false, canGoForward: false, error: null,
  scroll: { x: 0, y: 0 }, link: "", history: { entries: [], index: -1 }, ...change,
});

/**
 * The document region "page" of a view: the host side of composition.document. attach answers the history flag of the region; load
 * is recorded and reports the state of the loaded address; zoom and go are recorded; each subscription gets a handle that the region keeps until its unsubscribe. restoredState is the state that
 * the region reports while the composition is placed, before the page subscribes to the region state (a restored session history).
 */
export function createRegion({ history = false, restoredState = null } = {}) {
  // refuse, when set, makes the next subscribe fail with its text, as a region that refuses the subscription.
  const region = { name: "page", history, restoredState, refuse: null, view: null, loads: [], zooms: [], subscriptions: [], unsubscribed: [] };
  // The handlers of the operations of the region, each named as the call of the view (document.<operation>) with its params.
  region.handlers = {
    attach: () => ({ history: region.history }),
    // The region reports the state of each load after the load, as the document of the view does: the state is delivered in the next
    // microtask, after the call of the page has been answered.
    load: ({ name, url }) => {
      region.loads.push(url);
      queueMicrotask(() => region.view.deliverEvent("document-state", { document: name, state: documentState(url) }));
      return null;
    },
    zoom: ({ zoom }) => {
      region.zooms.push(zoom);
      return null;
    },
    go: () => null,
    post: () => null,
    subscribe: ({ stream }) => {
      if (region.refuse !== null) throw new Error(region.refuse);
      const handle = region.subscriptions.length + 1;
      region.subscriptions.push({ stream, handle, closed: false });
      // The reply of a subscription is its handle (core docs/spec/native-surfaces.md#document-streams).
      return handle;
    },
    unsubscribe: ({ handle }) => {
      region.subscriptions.find((entry) => entry.handle === handle).closed = true;
      region.unsubscribed.push(handle);
      return null;
    },
    detach: () => null,
  };
  return region;
}

/**
 * The host answers of a tab view: the settings, the text size, the tab state, the core commands that the page runs and the composition of
 * the region. core.tab.select is a core command the tab page runs; the other commands are given by the test.
 */
export function tabHost(region, { home = "https://home.test/", stored = null, textSize = 1, commands = {}, declarations = DECLARATIONS } = {}) {
  return {
    surface: SURFACE,
    declarations,
    settings: { home },
    textSize,
    commands: { "core.tab.select": () => null, ...commands },
    state: { read: () => stored, write: () => null },
    composition: {
      // A restored session history reports its state while the composition is placed: the host sends it before the create of the page
      // returns, and the page subscribed to the region state already.
      place: () => {
        if (region.restoredState !== null) {
          const state = region.restoredState;
          region.restoredState = null;
          region.view.deliverEvent("document-state", { document: region.name, state });
        }
        return null;
      },
      document: region.handlers,
    },
  };
}

// The most host events that the view keeps before the page loads; none is kept, a host event reaches the listeners that the page registered.
/** The bound on the rounds that wait for the page to finish its calls; a page that never settles fails the wait. */
const SETTLE_ROUNDS = 10_000;
const tick = () => new Promise((resolve) => setImmediate(resolve));
/** The names of the window that a page reads as globals; the other names of the process stay the process values. */
const WINDOW_GLOBALS = [
  "window", "document", "location", "customElements", "addEventListener", "removeEventListener", "dispatchEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "MutationObserver", "Node", "Element",
  "HTMLElement", "Text", "Comment", "DocumentFragment", "ShadowRoot", "CSSStyleDeclaration", "DOMParser", "HTMLButtonElement",
  "HTMLInputElement", "HTMLAnchorElement", "HTMLStyleElement", "HTMLLinkElement", "HTMLIFrameElement", "HTMLScriptElement",
  "HTMLImageElement",
];

// The views that are open, in the order they were opened: the page of the last open view reads the window globals.
const openViews = [];
let globalsInstalled = false;
// Each load of a page evaluates its module again: the query of the module URL is unique in the process, so no view reads a module that an
// earlier view evaluated (module instances are cached by their URL).
let moduleInstances = 0;

function currentView() {
  if (openViews.length === 0) throw new Error("no view is open: the page globals are read outside a view");
  return openViews.at(-1);
}

// Each global reads the window of the current view when the page reads it. A function of the window is bound to the window, so a bare call
// such as addEventListener(...) runs on the window of the view.
function installGlobals() {
  if (globalsInstalled) return;
  globalsInstalled = true;
  for (const name of WINDOW_GLOBALS) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        const target = currentView().window;
        const value = target[name];
        return typeof value === "function" && name[0] === name[0].toLowerCase() ? value.bind(target) : value;
      },
      set() {},
    });
  }
}

/** The resize source of the view document: it records the targets that the page observes and delivers the entries that the host reports. */
class ResizeSource {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  notify(entries) {
    this.callback(entries, this);
  }
}


let viewCounter = 0;

/** The frame-free timers of the page: each timer and animation frame that the page starts is recorded with its delay (null for a frame). */
function recordTimers(window, observed) {
  for (const name of ["setTimeout", "setInterval"]) {
    const base = window[name];
    window[name] = function timed(callback, delay, ...rest) {
      observed.timers.push({ kind: name, delay: delay ?? 0 });
      return base.call(window, callback, delay, ...rest);
    };
  }
  const baseFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function timedFrame(callback) {
    observed.timers.push({ kind: "requestAnimationFrame", delay: null });
    return baseFrame.call(window, callback);
  };
}

/**
 * Opens a view of a plugin page in a jsdom window, and returns the view. The page module is loaded with view.load(url) and runs against the
 * window of the view. host holds the answers of the host: surface, declarations, settings, textSize, commands, state, composition, surfaces.
 *
 *     plugin   the plugin id; the view is on soksak://<plugin>/ and its page is the html of the page
 *     html     the document of the page (its own html file)
 *     host     the host answers (see answerCall)
 *     start    the start values of the surface (window.sokSurface), or null for none
 *     layout   {rect} sets the rectangle of the root element of the view document; {} for none
 */
export function openView({ plugin, html, host, start, layout = {} }) {
  installGlobals();
  const dom = new JSDOM(html, { url: `soksak://${plugin}/index.html`, pretendToBeVisual: true });
  const window = dom.window;
  // The host loads the module that the page names, so the script element of the page is not part of the body that the page draws, and the
  // white space between the elements of the document is not a node of the body (the document is what the page draws).
  for (const script of [...window.document.querySelectorAll("script")]) script.remove();
  for (const node of [...window.document.body.childNodes]) {
    if (node.nodeType === window.Node.TEXT_NODE && node.textContent.trim() === "") node.remove();
  }
  const surface = host.surface;
  const surfaces = host.surfaces ?? [{ plugin, surface }];
  const observed = { timers: [], commands: [], errors: [] };
  let closed = false;
  viewCounter += 1;
  const handle = createViewHandle({ plugin, surface, answer: (command, params) => answerCall(command, params) });
  const record = recordOf(handle);
  const view = {
    window,
    get calls() { return record.calls; },
    get events() { return record.events; },
    get observed() {
      return { timers: observed.timers, commands: record.observed.commands, errors: record.errors.map(({ where, text }) => `surface ${surface} ${where}: ${text}`) };
    },
    get page() { return record.page; },
  };

  recordTimers(window, observed);
  openViews.push({ window });
  window.ResizeObserver = ResizeSource;
  // The visual viewport of a web view: an event target with the size and the scale of the page, which jsdom does not provide.
  window.visualViewport = Object.assign(new window.EventTarget(), { width: window.innerWidth, height: window.innerHeight, scale: 1, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0 });
  window.sokTheme = { scheme: "light", tokens: {} };
  if (start !== null) window.sokSurface = Object.freeze({ ...start, declarations: declarationsOf(host.declarations) });
  if (layout.rect !== undefined) window.document.documentElement.getBoundingClientRect = layout.rect;
  // The page reaches the plugin API through its view handle, which is the sok-view handler of the window.
  window.webkit = { messageHandlers: { "sok-view": handle } };

  // The answer of one call of the page, by its name. A call that this table does not serve is refused.
  function answerCall(command, params) {
    if (command.startsWith("core.")) {
      const run = host.commands?.[command];
      if (run === undefined) throw new Error(`view call ${command} is not served`);
      return run(params);
    }
    if (command.startsWith("document.")) return host.composition.document[command.slice("document.".length)](params);
    switch (command) {
      case "tab.title":
      case "tab.footer":
      case "tab.notify":
      case "tab.modified":
      case "tab.error":
      case "tab.keep":
      case "tab.directory":
      case "tab.focus":
      case "composition.report":
      case "image.attach":
      case "image.focus":
      case "image.caret":
      case "image.text":
      case "image.detach":
        return null;
      case "tab.state.read":
        return host.state.read();
      case "tab.state.write":
        return host.state.write(params);
      case "composition.declaration":
        return manifest.surface.composition;
      case "composition.place":
        return host.composition.place(params);
      case "surface.menu":
        return false;
      case "runtime.error":
        return null;
      case "runtime.command.register":
      case "runtime.native.on":
      case "runtime.native.call":
      case "runtime.settings.on":
      case "runtime.textSize.on":
        return null;
      case "runtime.status.watch":
      case "runtime.status.unwatch":
        if (params.surface !== undefined && !surfaces.some((entry) => entry.plugin === plugin && entry.surface === params.surface)) {
          throw new Error(`view call ${command} surface ${params.surface} is not a surface of ${plugin}`);
        }
        return null;
      case "runtime.textSize.read":
        return host.textSize ?? 1;
      case "runtime.settings.read":
        return { home: host.settings.home };
      case "runtime.command.run": {
        const target = params.surface ?? surface;
        if (!surfaces.some((entry) => entry.plugin === plugin && entry.surface === target)) {
          throw new Error(`view call runtime.command.run surface ${target} is not a surface of ${plugin}`);
        }
        const run = host.commands?.[params.name];
        if (run === undefined) throw new Error(`surface ${target} has not registered command ${params.name}`);
        return run(params.params);
      }
      default:
        throw new Error(`view call ${command} is not served`);
    }
  }

  // Waits until the page has no call in flight: a round of the task queue, with no time limit. A round in which the page sends no call ends.
  async function settled() {
    let sent = -1;
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      await tick();
      if (record.calls.length === sent) return;
      sent = record.calls.length;
    }
    throw new Error("the view did not settle: its page keeps sending calls");
  }

  // The host delivers an event to the page: document states and streams, status values, text size, theme, and native events.
  const deliver = (event, data) => {
    if (event === "document-state") {
      const entry = record.regions.get(data.document);
      entry.state = data.state;
      for (const listener of [...entry.listeners]) listener(data.state);
    } else if (event === "document-stream") {
      record.streams.get(data.handle)?.(data.message);
    } else if (event === "status") {
      for (const listener of [...(record.statusListeners.get(`${data.surface ?? ""}\u0000${data.name}`) ?? [])]) listener(data.value);
    } else if (event === "textSize") {
      for (const listener of [...record.textSizeListeners]) listener(data);
    } else if (event === "theme") {
      for (const listener of [...record.themeListeners]) listener(data);
    } else {
      for (const listener of [...(record.nativeListeners.get(event) ?? [])]) listener(data);
    }
  };

  Object.assign(view, {
    /** Loads the module of the page into the window and resolves with the module (its evaluation ends the load). */
    async load(url) {
      moduleInstances += 1;
      const href = url instanceof URL ? url.href : url;
      return import(`${href}?view=${moduleInstances}`);
    },
    /** Delivers a host event with its data to the page, and waits until the page has handled it. */
    async push(event, data) {
      deliver(event, data);
      await settled();
    },
    /** Delivers a host event without waiting; for a host answer that runs inside a call of the page. */
    deliverEvent(event, data) {
      deliver(event, data);
    },
    change: {
      async status(name, value, statusSurface) {
        deliver("status", { name, surface: statusSurface, value });
        await settled();
      },
      async textSize(value) {
        deliver("textSize", value);
        await settled();
      },
    },
    /** Invokes a command that the page registered with commands.register, and resolves with its result or rejects with its message. */
    request(command, params, options = {}) {
      const run = record.commands.get(command);
      if (run === undefined) return Promise.reject(new Error(`the page has not registered command ${command}`));
      return Promise.resolve().then(() => run(params, options));
    },
    /** Delivers an event of the bridge to the page, as the bridge reports it to the page (a late reply, for example). */
    bridgeEvent(event) {
      recordOf(handle).report(event);
    },
    settled,
    /** Waits for the first record of the page with the event name, and resolves with it. */
    async logged(event) {
      for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await settled();
        const found = record.events.find((entry) => entry.event === event);
        if (found !== undefined) return found;
      }
      throw new Error(`the page did not record ${event}`);
    },
    /** Ends the view: the page receives pagehide, its work ends, and the window closes. */
    async close() {
      if (closed) return;
      closed = true;
      window.dispatchEvent(new window.Event("pagehide"));
      await settled();
      openViews.splice(openViews.findIndex((entry) => entry.window === window), 1);
      window.close();
    },
  });
  return view;
}

/**
 * Opens a tab view of the browser plugin in the host fixture, and closes it when the test ends (close is idempotent). The page module is loaded
 * by the test with view.load(TAB_PAGE). Options: region (createRegion), start (the start values; null for none), and the host answers of
 * tabHost.
 */
export async function openTab(t, { region = createRegion(), start = START, declarations = DECLARATIONS, layout = {}, theme = null, ...answers } = {}) {
  const view = openView({
    plugin: "browser",
    html: TAB_HTML,
    host: tabHost(region, { ...answers, declarations }),
    start,
    layout,
  });
  // The start theme of the host is set before the page runs, as the host sets it (the bridge applies it when the page starts).
  if (theme !== null) view.window.sokTheme = theme;
  region.view = view;
  const close = view.close;
  let ended = false;
  view.close = async () => {
    if (ended) return;
    ended = true;
    await close();
  };
  t.after(() => view.close());
  return view;
}

let exposureRequests = 0;

/**
 * Sends the exposure request method with params to the view, as core forwards it (the host event exposure-request), and resolves with its
 * identifier. The answer of the page is the exposureReply call with that identifier in view.calls.
 */
export async function sendExposure(view, method, params) {
  const id = ++exposureRequests;
  await view.push("exposure-request", { id, surface: SURFACE, method, params });
  await settleAll(view);
  return id;
}

/** The answer that the page sent for the exposure request id, as {result} or {error: {message}}; undefined while the page has not answered. */
export function answerOf(view, id) {
  const answer = view.calls.find((call) => call.command === "runtime.native.call" && call.params.name === "exposureReply" && call.params.payload.id === id);
  return answer?.params.payload;
}

/** The values that the page sent for the watched status name, in order (each changed call of the exposure relay). */
export const changesOf = (view, name) => callsOf(view, "runtime.native.call")
  .filter((params) => params.name === "changed" && params.payload.name === name).map((params) => params.payload.value);

/** Sends the exposure request and resolves with the result that the page answered; a page that answers with an error rejects with its message. */
export async function exposure(view, method, params) {
  const id = await sendExposure(view, method, params);
  const answer = view.calls.find((call) => call.command === "runtime.native.call" && call.params.name === "exposureReply" && call.params.payload.id === id);
  if (answer === undefined) throw new Error(`the page did not answer the exposure request ${method}`);
  const { error, result } = answer.params.payload;
  if (error !== undefined) throw new Error(error.message);
  return result;
}

/**
 * Waits until the view has no more work: each page reply and each follow-up call of the page (a read that ends unsubscribes its stream, and
 * the unsubscribe is a call of its own) is sent. It waits for the messages of the page and of the host, not for a time.
 */
export async function settleAll(view) {
  let sent = -1;
  while (sent !== view.calls.length) {
    sent = view.calls.length;
    await view.settled();
  }
}

/** The states of the region that the view page receives, as the host delivers each one. */
export const pushState = async (view, state, name = "page") => {
  await view.push("document-state", { document: name, state });
  await settleAll(view);
};

/** A message of a stream of the region, which the host delivers to the subscription handle. */
export const pushStream = async (view, handle, message, name = "page") => {
  await view.push("document-stream", { document: name, handle, message });
  await settleAll(view);
};

/**
 * Sends the command request of the host with its identifiers (cids), as the host sends a command with an operation, and resolves with the
 * reply that the page sent for it. view.request sends a command without identifiers, so a test with identifiers uses this request.
 */
let commandRequests = 0;
export async function requestWithCids(view, command, params, cids) {
  const result = await view.request(command, params, { cids });
  await view.settled();
  return result;
}

/** The params of each call of the view named command, in order. */
export const callsOf = (view, command) => view.calls.filter((call) => call.command === command).map((call) => call.params);

/** The plugin records of the page log in order: each batch record of plugin.browser.<event>, with its event name without the prefix. */
export const pluginLogs = (view) => view.events.filter((entry) => entry.event.startsWith("plugin.browser."))
  .map(({ level, event, fields, cids }) => ({ level, event: event.slice("plugin.browser.".length), fields, ...(cids === undefined ? {} : { cids }) }));

/**
 * The host answers of a section view: the tab state of the section surface, the surfaces that the window holds (the surfaces of the
 * browser plugin named by surfaces), and the commands of the plugin that the section runs on the surface it follows.
 */
export function sectionHost({ stored = null, surfaces = [], commands = {}, declarations = DECLARATIONS } = {}) {
  return {
    surface: SURFACE,
    declarations,
    surfaces,
    settings: { home: "" },
    commands: { "browser.tab.select": () => null, "browser.history.go": () => null, ...commands },
    state: { read: () => stored, write: () => null },
    composition: { place: () => null, document: {} },
  };
}

// The surfaces of the browser plugin that the window holds by default: the tabs tab-1 and tab-2, and a surface of another plugin.
export const SURFACES = [{ plugin: "browser", surface: "tab-1" }, { plugin: "browser", surface: "tab-2" }, { plugin: "other", surface: "other-1" }];

/**
 * Opens a section view of the browser plugin (its start values carry the section), and closes it when the test ends. With layout, the body
 * of the view lays out its scroll position (fixtures/layout.mjs) before the page loads, and the view has scrolled(), which settles when the
 * scroll events of the layout have reached the body.
 */
export async function openSection(t, section, { stored = null, surfaces = SURFACES, commands = {}, layout = false, diagnostics = null, theme = null, viewLayout = {}, frames = false } = {}) {
  const view = openView({
    plugin: "browser",
    html: SECTION_HTML,
    host: sectionHost({ stored, surfaces, commands, declarations: diagnostics === null ? DECLARATIONS : DIAGNOSTIC_DECLARATIONS }),
    start: { surface: SURFACE, params: {}, origin: { directory: "/work" }, project: { id: "prj-project", root: "/project" }, diagnostics, section },
    layout: viewLayout,
  });
  if (theme !== null) view.window.sokTheme = theme;
  // The frame clock of the page is installed before the page loads, so the observers and the frames that the page requests are recorded.
  if (frames) view.clock = frameClock(view);
  if (layout) view.scrolled = layOut(view.window.document.body).scrolled;
  await view.load(SECTION_PAGE);
  const close = view.close;
  let ended = false;
  view.close = async () => {
    if (ended) return;
    ended = true;
    await close();
  };
  t.after(() => view.close());
  return view;
}

/** The watches of the status name that are not stopped, in the order of the page: each {name, surface} of a runtime.status.watch call. */
export function liveWatches(view, name) {
  const live = [];
  for (const { command, params } of view.calls) {
    if (command === "runtime.status.watch" && params.name === name) live.push(params);
    if (command === "runtime.status.unwatch" && params.name === name) {
      const index = live.findIndex((watch) => watch.surface === params.surface);
      if (index !== -1) live.splice(index, 1);
    }
  }
  return live;
}
