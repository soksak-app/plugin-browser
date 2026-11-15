// The host of a view page under test. It answers the sok-view wire of the view as the view contract states it
// (core docs/spec/native-surfaces.md#view-surfaces): the injected channel script posts view.ready, the host messages reach the page
// as window messages {sok: 1, event, data} or {sok: 1, id, command, params}, and each call of the page with {sok: 1, id, command, params}
// is answered with {sok: 1, id, result} or {sok: 1, id, error: {code, message}}. The page modules load into a jsdom window whose
// names the page reads as globals (document, addEventListener, customElements, and the element classes); the page is loaded by
// openHostedView(...).load(url), which evaluates the module of the page in the window that is open.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const manifest = JSON.parse(readFileSync(new URL("../../plugin.json", import.meta.url), "utf8"));

/** The error code of a call that failed in the host (the code of an error reply of the view wire). */
const FAILED_CALL = -32000;
/** The most host messages that the channel keeps before the page attaches its listener. */
const QUEUE_LIMIT = 256;
/** The bound on the rounds that wait for the page to finish its messages; a page that never settles fails the wait. */
const SETTLE_ROUNDS = 10_000;

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

// The injected channel script of a view (the document-start script of the host): the host side of the page channel. It posts view.ready
// with the page identity and the time origin, keeps the host messages until the page attaches its listener, and refuses a message that
// has no sok marker or that does not come from the window.
function installChannel(window, plugin, handler) {
  const queue = [];
  let listener = null;
  const refuse = (reason) => handler.postMessage({ event: "view.error", plugin, reason: `${reason} for ${plugin}` });
  const pass = (message) => {
    try {
      listener(message);
    } catch (error) {
      refuse(`message failed: ${typeof error?.message === "string" ? error.message : String(error)}`);
    }
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      refuse("message from another source");
      return;
    }
    const data = event.data;
    if (typeof data !== "object" || data === null || data.sok !== 1) {
      refuse("message without the sok marker");
      return;
    }
    if (listener) {
      pass(data);
    } else if (queue.length >= QUEUE_LIMIT) {
      refuse("queue full");
    } else {
      queue.push(data);
    }
  });
  window.webkit = { messageHandlers: { "sok-view": handler } };
  const page = globalThis.crypto.randomUUID();
  const timeOrigin = window.performance.timeOrigin;
  handler.postMessage({ event: "view.ready", plugin, document: page, time_origin: timeOrigin });
  window.sokView = Object.freeze({
    page,
    timeOrigin,
    attach(next) {
      if (typeof next !== "function") throw new TypeError("attach requires a listener function");
      if (listener) throw new Error(`view channel for ${plugin} already has a message listener`);
      listener = next;
      while (queue.length > 0 && listener === next) pass(queue.shift());
    },
  });
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// The entries that the host declares for every view of a surface document, beside the entries of the plugin: the document and input statuses
// and the hit and clock commands of the surface (core docs/spec/native-surfaces.md#view-surfaces, view exposure).
const CORE_DOCUMENT_ENTRIES = {
  status: [{ name: "core.surface.document" }, { name: "core.surface.input" }],
  commands: [{ name: "core.surface.hit" }, { name: "core.surface.clock" }],
};

// The declarations of a view: the entries of the plugin, with the core entries of the surface document.
function declarationsOf(plugin) {
  return {
    ...plugin,
    status: [...(plugin.status ?? []), ...CORE_DOCUMENT_ENTRIES.status],
    commands: [...(plugin.commands ?? []), ...CORE_DOCUMENT_ENTRIES.commands],
  };
}

/**
 * Opens a view of a plugin page in the host of this fixture, and returns the view. The page module is loaded with view.load(url) and
 * runs against the window of the view.
 *
 *     plugin       the plugin id; the view is on soksak://<plugin>/ and its page is the html of the page
 *     html         the document of the page (its own html file)
 *     host         the answers of the host: surface, declarations, settings, textSize, faults, commands, state, composition, surfaces
 *                  (the surfaces of the plugin that the window holds, {plugin, surface}), and the handlers that the calls use
 *     start        the start values of the surface (window.sokSurface, with the declarations of the plugin), or null for none
 *     layout       {rect} sets the rectangle of the root element of the view document; {} for none
 *
 * Returns the view: window (the jsdom window), load(url), push(event, data), change.status(name, value, surface), change.textSize(value),
 * request(command, params), settled(), logged(event), close(), and the records calls, sent, events and observed.
 */
export function openHostedView({ plugin, html, host, start, layout = {} }) {
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
  const requests = new Map();
  let requestIds = 0;
  let pending = 0;
  let closed = false;
  // The records of the view. calls and sent hold the messages of the page in order; events holds the records that the page wrote.
  const view = {
    window,
    calls: [],
    sent: [],
    events: [],
    observed: { timers: [], commands: [], errors: [] },
  };

  // The host messages that the page receives, as window messages from the window itself.
  const deliver = (message) => {
    window.dispatchEvent(new window.MessageEvent("message", { data: message, source: window }));
  };
  // Runs a page message in a later task, as the host receives a message that the page sent: the host reads the messages of a view in its own
  // task, so an answer reaches the page after the page has run the code that follows its call.
  const later = (work) => {
    pending += 1;
    setImmediate(async () => {
      try {
        await work();
      } finally {
        pending -= 1;
      }
    });
  };

  // Times the page starts on the window: each timer and each animation frame records its delay (null for a frame).
  for (const name of ["setTimeout", "setInterval"]) {
    const base = window[name];
    window[name] = function timed(callback, delay, ...rest) {
      view.observed.timers.push({ kind: name, delay: delay ?? 0 });
      return base.call(window, callback, delay, ...rest);
    };
  }
  const baseFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function timedFrame(callback) {
    view.observed.timers.push({ kind: "requestAnimationFrame", delay: null });
    return baseFrame.call(window, callback);
  };
  window.ResizeObserver = ResizeSource;
  // The visual viewport of a web view: an event target with the size and the scale of the page, which jsdom does not provide.
  window.visualViewport = Object.assign(new window.EventTarget(), { width: window.innerWidth, height: window.innerHeight, scale: 1, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0 });
  window.sokTheme = { scheme: "light", tokens: {} };
  if (start !== null) window.sokSurface = Object.freeze({ ...start, declarations: declarationsOf(host.declarations) });
  if (layout.rect !== undefined) window.document.documentElement.getBoundingClientRect = layout.rect;

  const handler = {
    postMessage(message) {
      view.sent.push(message);
      if (typeof message.command === "string") view.calls.push(message);
      later(() => answerPage(message));
    },
  };
  installChannel(window, plugin, handler);
  openViews.push(view);

  // A message of the page: a log of a view error, the reply to a request of the host, or a call that the host answers.
  async function answerPage(message) {
    if (typeof message.event === "string") {
      if (message.event === "view.error") view.observed.errors.push(`surface ${surface} view channel: ${message.reason}`);
      return;
    }
    if (Object.hasOwn(message, "reply")) {
      const waiting = requests.get(message.reply);
      if (waiting === undefined) return;
      requests.delete(message.reply);
      if ("error" in message) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
      return;
    }
    if (typeof message.command !== "string" || !Number.isInteger(message.id)) return;
    let payload;
    try {
      payload = { result: (await runCall(message)) ?? null };
    } catch (error) {
      payload = { error: { code: FAILED_CALL, message: String(error?.message ?? error) } };
    }
    deliver({ sok: 1, id: message.id, ...payload });
  }

  // The answer of one call of the page, by its name.
  async function runCall({ command, params, cids }) {
    // A fault of a command refuses its calls. The clock of the page log is answered by the writer of the host, not by the record route, so
    // a fault of the record route (runtime.log) refuses its batches and leaves the clock answer as it is.
    const fault = host.faults?.[`command.${command}`];
    if (fault !== undefined && !(command === "runtime.log" && params.action === "clock")) throw new Error(fault);
    if (command.startsWith("core.")) {
      view.observed.commands.push({ name: command, params, surface, ...(cids === undefined ? {} : { cids }) });
      return hostCommand(command, params);
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
      case "runtime.log":
        return runtimeLog(params);
      case "runtime.error":
        view.observed.errors.push(`surface ${surface} ${params.where}: ${params.text}`);
        return null;
      case "runtime.native.on":
      case "runtime.sidecar.on":
      case "runtime.sidecar.onFailure":
      case "runtime.textSize.on":
      case "runtime.settings.on":
      case "runtime.log.levels.on":
      case "runtime.command.register":
      case "runtime.native.call":
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
      case "runtime.contributions":
        return [];
      case "runtime.command.run": {
        const target = params.surface ?? surface;
        if (!surfaces.some((entry) => entry.plugin === plugin && entry.surface === target)) {
          throw new Error(`view call runtime.command.run surface ${target} is not a surface of ${plugin}`);
        }
        view.observed.commands.push({ name: params.name, params: params.params, surface: target });
        return runPluginCommand(params.name, params.params, target);
      }
      default:
        throw new Error(`view call ${command} is not served`);
    }
  }

  // The core command of the host: the commands of the host hold one handler for each name, and a name without one is not served.
  function hostCommand(name, params) {
    const run = host.commands?.[name];
    if (run === undefined) throw new Error(`view call ${name} is not served`);
    return run(params);
  }

  function runPluginCommand(name, params, target) {
    const run = host.commands?.[name];
    if (run === undefined) throw new Error(`surface ${target} has not registered command ${name}`);
    return run(params);
  }

  // The batches of the page log: the clock request answers the host clock, and a batch stores its records in the events of the view.
  let clockReads = 0;
  function runtimeLog(params) {
    if (params.action === "clock") {
      clockReads += 1;
      return { ts_us: Date.now() * 1000 + clockReads, mono_ns: Math.round(window.performance.now() * 1e6) + clockReads };
    }
    if (params.action === "batch") {
      for (const { level, event, fields, cids } of params.events) {
        view.events.push({ level, event, fields, ...(cids === undefined ? {} : { cids }) });
      }
      return null;
    }
    throw new Error(`view call runtime.log action ${params.action} is not served`);
  }

  // Waits until the page has no message in flight and sends no new message: a round of the task queue, with no time limit.
  async function settled() {
    let sent = -1;
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      await tick();
      if (pending === 0 && view.sent.length === sent) return;
      sent = view.sent.length;
    }
    throw new Error("the view did not settle: its page keeps sending messages");
  }

  Object.assign(view, {
    /** Loads the module of the page into the window and resolves with the module (its evaluation ends the load). */
    async load(url) {
      moduleInstances += 1;
      const href = url instanceof URL ? url.href : url;
      return import(`${href}?view=${moduleInstances}`);
    },
    /** Delivers a host event with its data to the page, and waits until the page has handled it. */
    async push(event, data) {
      deliver({ sok: 1, event, data });
      await settled();
    },
    /** Delivers a host event without waiting; for a host answer that runs inside a call of the page. */
    deliverEvent(event, data) {
      deliver({ sok: 1, event, data });
    },
    change: {
      async status(name, value, statusSurface) {
        deliver({ sok: 1, event: "status", data: { name, surface: statusSurface, value } });
        await settled();
      },
      async textSize(value) {
        deliver({ sok: 1, event: "textSize", data: value });
        await settled();
      },
    },
    /** Sends a command of the host to the page and resolves with the reply of the page, or rejects with its message. */
    request(command, params) {
      requestIds += 1;
      const id = requestIds;
      const reply = new Promise((resolve, reject) => requests.set(id, { resolve, reject }));
      deliver({ sok: 1, id, command, params });
      return reply;
    },
    settled,
    /** Waits for the first record of the page with the event name, and resolves with it. */
    async logged(event) {
      for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await settled();
        const found = view.events.find((entry) => entry.event === event);
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
      openViews.splice(openViews.indexOf(view), 1);
      window.close();
    },
  });
  return view;
}
