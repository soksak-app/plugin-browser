// The browser view page (core docs/spec/plugins.md#view-surfaces): the host serves it at sok://browser/ui/index.html in
// the web view of the surface, and injects the view channel script and the theme script before this page runs. The page
// builds the surface context of its view over the view channel (@soksak/plugin-api/view) and mounts the browser module
// into a shadow root of the page. Every entry of the context runs through the call route of a view (core
// docs/spec/native-surfaces.md#view-surfaces, view calls): the tab reports, the event records as the call runtime.log,
// the tab state, and the commands. The page reads the start values of the surface (the tab, its params, its origin, its
// project and the declarations of the plugin) from window.sokSurface, which the host injects before the page runs.
import { createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { mount } from "./browser.js";
import { createEmitter, errorText } from "./events.js";

const LOG_LEVELS = ["error", "warn", "info", "debug", "trace"];

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value !== "";
// The identifiers of a record or a call: the {cids} argument, which a record without an operation does not carry.
const cidsOf = (options) => (options?.cids === undefined ? {} : { cids: options.cids });

// The form of each start value (core docs/spec/native-surfaces.md#view-surfaces, start values): params are the tab
// parameters or null, origin is {directory} with a directory, project is {root} or null, and declarations
// are the exposes of the plugin.
const START_FORM = {
  params: (value) => value !== undefined,
  origin: (value) => isRecord(value) && isText(value.directory),
  project: (value) => value === null || (isRecord(value) && isText(value.root)),
  declarations: isRecord,
};

/** The frozen start values of the surface, which the host of the view injects before the page runs (#P27.3). */
export function startValues(windowRef = window) {
  const start = windowRef.sokSurface;
  if (start === null || typeof start !== "object" || !isText(start.surface)) {
    throw new Error(`the view of ${windowRef.location.host} has no start values: the host provides window.sokSurface {surface, params, origin, project, declarations} before the page runs`);
  }
  for (const [name, valid] of Object.entries(START_FORM)) {
    if (!valid(start[name])) {
      throw new Error(`the start values of the view of ${windowRef.location.host} are not {surface, params, origin, project, declarations}: ${name} is ${JSON.stringify(start[name]) ?? "undefined"}`);
    }
  }
  return start;
}

/**
 * A refused record is an error of the view: it is shown as the error line of the view (runtime.error), and the console of the
 * page keeps the line too. A refusal of the error line itself has no other route left, so the console takes it.
 */
function refusedLog(calls, event, error) {
  const text = `${event}: ${errorText(error)}`;
  console.error(`runtime.log ${text}`);
  calls.request("runtime.error", { where: "log", text })
    .then(undefined, (refusal) => console.error(`runtime.error log: ${errorText(refusal)}`));
}

/**
 * The reporter of this page: each record is an emit of the catalog event plugin.browser.report, which the emitter stores
 * through the call runtime.log under the name without the plugin prefix (core docs/spec/logging.md). A refused call is
 * written to the console of the page.
 */
function createReporter(calls) {
  const log = {
    error: (event, fields) => calls.request("runtime.log", { level: "error", event, fields })
      .then(undefined, (error) => refusedLog(calls, event, error)),
  };
  const emitEvent = createEmitter({ log }, "browser");
  return (text) => emitEvent("error", "plugin.browser.report", { text });
}

/**
 * The surface context of the view of one page, over the view bridge: every entry runs through the call route of the view,
 * and the theme arrives as the theme message.
 *
 *     bridge    createViewBridge() of @soksak/plugin-api/view over the sok-view handler of the view
 *     start     the frozen start values {surface, params, origin, project, declarations}
 *     report    report(text): writes one record to the application log
 *
 * Returns {context}.
 */
export function createViewContext({ bridge, start, report }) {
  if (typeof report !== "function") throw new TypeError("createViewContext requires the report function");
  const { calls, commands, runtime } = bridge;
  // The fire-and-forget calls of the context: a refusal of the route is a record, not a lost report.
  const send = (command, params) => calls.request(command, params)
    .then(undefined, (error) => report(`view call ${command}: ${error?.message ?? error}`));
  // The exposure of the page: the local entries answer the binds and the exposure requests, and each registration goes
  // through the channel. A command is declared by commands.register of the bridge, which registers the same handler for
  // the requests of core, so the local registration sends no declaration of its own.
  const exposure = createExpose({
    register: (kind, name) => kind === "command"
      ? Promise.resolve()
      : calls.request("runtime.native.call", { name: "registered", payload: { kind, name } }).then(() => undefined),
    // The exposure requests of the surface (status.get, status.watch, status.next, status.unwatch, command.run, dom.rect,
    // dom.act) reach the view as the host event exposure-request {id, surface, method, params} through the subscription
    // runtime.native.on (core docs/spec/native-surfaces.md#view-surfaces, view exposure), and the answer replies through
    // exposureReply.
    onRequest: (answer) => runtime.native.on("exposure-request", answer),
    reply: (id, payload) => send("runtime.native.call", { name: "exposureReply", payload: { id, ...payload } }),
    report,
  }, () => start.declarations);
  return {
    context: {
      surfaceId: start.surface,
      project: start.project,
      origin: start.origin,
      tab: {
        params: start.params ?? null,
        title: (text) => send("tab.title", text),
        footer: (text) => send("tab.footer", text),
        notify: (text, policy) => send("tab.notify", { text, policy }),
        modified: (value) => send("tab.modified", value),
        error: (text) => send("tab.error", text),
        keep: (reason, on) => send("tab.keep", { reason, on }),
        state: {
          read: () => calls.request("tab.state.read", null),
          write: (value) => send("tab.state.write", value),
        },
      },
      runtime: {
        // A command call takes {cids} as its third argument: the identifiers of the operation that the call carries out.
        command: (name, params, options) => runtime.command(name, params, options),
        // The transport of the records: the emit sites of the plugin are the callers of ui/events.js. The fields are
        // built before the send, because a call carries values and not builders. Core applies the level gate at the
        // delivery and gives the view no level query, so the fields are built while the level is off too. A record that
        // continues an operation takes {cids} as its third argument.
        log: Object.fromEntries(LOG_LEVELS.map((level) => [level,
          (event, fields, options) => send("runtime.log", { level, event, fields: typeof fields === "function" ? fields() : fields, ...cidsOf(options) })])),
        beginOperation: (event, fields) => runtime.beginOperation(event, fields),
        status: { watch: (name, listener) => runtime.status.watch(name, listener) },
        theme: runtime.theme,
        settings: runtime.settings,
        textSize: runtime.textSize,
        sidecar: runtime.sidecar,
      },
      // The composition of the declared regions and overlays of the view, whose operations reach the main page as
      // view calls (core docs/spec/native-surfaces.md#view-surfaces, regions).
      composition: bridge.composition,
      exposure: {
        status: (name, read, subscribe) => exposure.status(name, read, subscribe),
        command: (name, run) => Promise.all([exposure.command(name, run), commands.register(name, run)]).then(() => undefined),
        dom: (name, element) => exposure.dom(name, element),
        bind: exposure.bind,
        delegate: exposure.delegate,
        audit: exposure.audit,
        dispose: async () => {
          await exposure.dispose();
        },
      },
      // The declared UI values of the section statuses: the page pushes each value through the snapshot sender of the
      // bridge, and the workbench draws the declared sections from the snapshots (core docs/spec/declared-ui.md). A send
      // that fails is a record, so that a failure of the channel does not end the command that changed the value.
      declared: {
        push: (status, value) => {
          try {
            bridge.snapshots.push(status, value);
          } catch (error) {
            report(`declared UI push of ${status} failed: ${error?.message ?? error}`);
          }
        },
      },
      // The state of the surface is the state that the workbench keeps; the page of a view reports no phase.
      status: { report: () => {} },
    },
  };
}

/** Sets the theme on the root of the page, as the theme script of the view and each later theme message carry it. */
function applyTheme(theme) {
  if (theme?.scheme !== "dark" && theme?.scheme !== "light") throw new Error("the theme must have scheme dark or light");
  document.documentElement.style.colorScheme = theme.scheme;
  for (const [token, value] of Object.entries(theme.tokens ?? {})) {
    document.documentElement.style.setProperty(token, value);
  }
}

/** The errors and unhandled rejections of this page are written to the application log when they occur. */
function installPageErrors(report) {
  for (const [type, pick] of [["error", (event) => event.error], ["unhandledrejection", (event) => event.reason]]) {
    addEventListener(type, (event) => {
      const error = pick(event);
      report(`view browser: ${error?.message ?? String(error)}`);
    });
  }
}

// The page: the start values, the bridge over the injected channel, the theme of the document, and the mount into the
// shadow root of the page body.
const start = startValues();
const losses = [];
const bridge = createViewBridge({ handler: window.webkit.messageHandlers["sok-view"], report: (event) => losses.push(event) });
const report = createReporter(bridge.calls);
for (const event of losses.splice(0)) {
  report(`view calls of browser: ${event.kind} ${event.status}${event.reason === undefined ? "" : `: ${event.reason}`}`);
}
installPageErrors(report);
if (window.sokTheme) applyTheme(window.sokTheme);
bridge.runtime.theme(applyTheme);
const { context } = createViewContext({ bridge, start, report });
const host = document.body.appendChild(document.createElement("div"));
host.style.cssText = "height:100%";
try {
  await mount(host.attachShadow({ mode: "open" }), context);
} catch (error) {
  report(`view browser: mount failed: ${error?.message ?? error}`);
}
