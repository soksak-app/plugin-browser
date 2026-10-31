// The browser view page (core docs/spec/plugins.md#view-surfaces): the host serves it at soksak://browser/ui/index.html in
// the web view of the surface, and injects the view channel script and the theme script before this page runs. The page
// builds the surface context of its view over the view channel (@soksak/plugin-api/view) and mounts the browser module
// into a shadow root of the page. Every entry of the context runs through the call route of a view (core
// docs/spec/native-surfaces.md#view-surfaces, view calls): the tab reports, the event records as the call runtime.log,
// the tab state, and the commands. The page reads the start values of the surface (the tab, its params, its origin, its
// project and the declarations of the plugin) from window.sokSurface, which the host injects before the page runs.
import { createExpose } from "@soksak/plugin-api";
import { mount } from "./browser.js";
import { createPage } from "./page.js";
import { startValues } from "./start-values.js";
import { loadDiagnostics } from "./view-diagnostics.js";

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
export function createViewContext({ bridge, start, report, diagnostics = null }) {
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
      diagnostics,
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
        // The SDK logger owns batching, level handling and refused-record reporting.
        log: runtime.log,
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

// The page: the start values, the bridge over the injected channel with the reporter and the theme (page.js), and the mount into
// the shadow root of the page body.
const start = startValues();
const diagnostics = await loadDiagnostics(start);
const { bridge, report } = createPage();
const { context } = createViewContext({ bridge, start, report, diagnostics });
const host = document.body.appendChild(document.createElement("div"));
host.style.cssText = "height:100%";
try {
  await mount(host.attachShadow({ mode: "open" }), context);
} catch (error) {
  report(`view browser: mount failed: ${error?.message ?? error}`);
}
