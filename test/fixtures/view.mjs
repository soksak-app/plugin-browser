// The fixtures of a browser view opened with openView (@soksak/plugin-api/testing). Only what leaves the plugin is answered here: the
// document region of the view is a core object, so its operations are the fixtures of composition.document, and each attach, load,
// zoom and subscription is recorded in the region. A test delivers the states and the messages of the region with view.push, as the
// host delivers them. The declarations of the plugin and the composition of the view come from the plugin manifest.
import { readFileSync } from "node:fs";
import { openView } from "@soksak/plugin-api/testing";
import { layOut } from "./layout.mjs";

const manifest = JSON.parse(readFileSync(new URL("../../plugin.json", import.meta.url), "utf8"));

/** The page module of the tab view and the page module of a section view. */
export const TAB_PAGE = new URL("../../ui/view.js", import.meta.url);
export const SECTION_PAGE = new URL("../../ui/section.js", import.meta.url);
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
  region.fixtures = {
    attach: () => ({ history: region.history }),
    // The region reports the state of each load after the load, as the document of the view does: the state is delivered in the next
    // microtask, after the call of the page has been answered.
    load: (name, url) => {
      region.loads.push(url);
      queueMicrotask(() => region.view.push("document-state", { document: name, state: documentState(url) }));
      return null;
    },
    zoom: (name, zoom) => { region.zooms.push(zoom); return null; },
    go: () => null,
    post: () => null,
    subscribe: (name, stream) => {
      if (region.refuse !== null) throw new Error(region.refuse);
      const handle = region.subscriptions.length + 1;
      region.subscriptions.push({ stream, handle, closed: false });
      return { handle };
    },
    unsubscribe: (name, handle) => {
      region.subscriptions.find((entry) => entry.handle === handle).closed = true;
      region.unsubscribed.push(handle);
      return null;
    },
    detach: () => null,
  };
  return region;
}

/**
 * The host fixtures of a tab view: the settings, the text size, the tab state, the statuses, the core commands that the page runs and the
 * composition of the region. core.tab.select is a core command the tab page runs; the other commands are given by the test.
 */
export function tabHost(region, { home = "https://home.test/", stored = null, textSize = 1, faults, statuses, commands = {}, declarations = DECLARATIONS } = {}) {
  return {
    surface: SURFACE,
    declarations,
    settings: { home },
    textSize,
    statuses,
    faults,
    commands: { "core.tab.select": () => null, ...commands },
    // The host accepts each exposure reply of the page; the reply itself is recorded in view.calls.
    native: { exposureReply: () => null },
    state: { read: () => stored, write: () => null },
    composition: {
      declaration: () => manifest.surface.composition,
      // A restored session history reports its state while the composition is placed: the host sends it before the create of the page
      // returns, and the page subscribed to the region state already.
      place: () => {
        if (region.restoredState !== null) {
          const state = region.restoredState;
          region.restoredState = null;
          region.view.push("document-state", { document: region.name, state });
        }
        return null;
      },
      document: region.fixtures,
    },
  };
}

/**
 * Opens a tab view of the browser plugin in host mode, and closes it when the test ends (close is idempotent). The page module is loaded
 * by the test with view.load(TAB_PAGE). Options: region (createRegion), start (the start values; null for none), and the host fixtures of
 * tabHost.
 */
export async function openTab(t, { region = createRegion(), start = START, declarations = DECLARATIONS, layout = {}, theme = null, ...fixtures } = {}) {
  const view = await openView("browser", {
    host: tabHost(region, { ...fixtures, declarations }),
    start,
    declarations,
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
  while (sent !== view.sent.length) {
    sent = view.sent.length;
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
  const id = ++commandRequests;
  view.window.dispatchEvent(new view.window.MessageEvent("message", { source: view.window, data: { sok: 1, id, command, params, cids } }));
  await view.settled();
  const answer = view.sent.find((message) => message.reply === id);
  if (answer === undefined) throw new Error(`the page did not reply to the command ${command}`);
  if ("error" in answer) throw new Error(answer.error.message);
  return answer.result;
}

/** The params of each call of the view named command, in order. */
export const callsOf = (view, command) => view.calls.filter((call) => call.command === command).map((call) => call.params);

/** The plugin records of the page log in order: each batch record of plugin.browser.<event>, with its event name without the prefix. */
export const pluginLogs = (view) => view.events.filter((entry) => entry.event.startsWith("plugin.browser."))
  .map(({ level, event, fields, cids }) => ({ level, event: event.slice("plugin.browser.".length), fields, ...(cids === undefined ? {} : { cids }) }));

/**
 * The host fixtures of a section view: the tab state of the section surface, the surfaces that the window holds (the surfaces of the
 * browser plugin named by surfaces), and the commands of the plugin that the section runs on the surface it follows.
 */
export function sectionHost({ stored = null, surfaces = [], commands = {}, declarations = DECLARATIONS } = {}) {
  return {
    surface: SURFACE,
    declarations,
    surfaces,
    commands: { "browser.tab.select": () => null, "browser.history.go": () => null, ...commands },
    native: { exposureReply: () => null },
    state: { read: () => stored, write: () => null },
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
  const view = await openView("browser", {
    host: sectionHost({ stored, surfaces, commands, declarations: diagnostics === null ? DECLARATIONS : DIAGNOSTIC_DECLARATIONS }),
    start: { surface: SURFACE, params: {}, origin: { directory: "/work" }, project: { id: "prj-project", root: "/project" }, diagnostics, section },
    declarations: diagnostics === null ? DECLARATIONS : DIAGNOSTIC_DECLARATIONS,
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
