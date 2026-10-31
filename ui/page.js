// The page setup that the view pages of this plugin share: the view bridge over the injected channel, the error reporter, the
// page error hooks and the theme of the document. The tab page (view.js) and the section page (section.js) both call createPage.

import { createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { createEmitter } from "./events.js";

/**
 * The fire-and-forget call of a page: a refused call is written to the application log with the name of the call, so no refusal
 * is lost.
 */
export function callOf(calls, report) {
  return (command, params) => calls.request(command, params)
    .then(undefined, (error) => report(`view call ${command}: ${error?.message ?? error}`));
}

/**
 * The exposure of a view page over its bridge. The local entries answer the binds and the exposure requests, and each registration
 * goes through the channel; a command is declared by commands.register of the bridge, which registers the same handler for the
 * requests of core, so the local registration sends no declaration of its own (core docs/spec/native-surfaces.md#view-surfaces, view exposure).
 *
 *     bridge        createViewBridge() of @soksak/plugin-api/view
 *     declarations  the exposes of the plugin
 *     report        report(text): writes one record to the application log
 *
 * Returns the createExpose object of the page.
 */
export function createPageExposure({ bridge, declarations, report }) {
  const { calls, runtime } = bridge;
  const send = callOf(calls, report);
  return createExpose({
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
  }, () => declarations);
}

/**
 * The reporter of a page: each record is an emit of the catalog event plugin.browser.report, which the emitter stores through the
 * bridge logger under the name without the plugin prefix (core docs/spec/logging.md). The bridge logger reports a refused record
 * through runtime.error.
 */
export function createReporter(runtime) {
  const emitEvent = createEmitter(runtime, "browser");
  return (text) => emitEvent("error", "plugin.browser.report", { text });
}

/** Sets the theme on the root of the page, as the theme script of the view and each later theme message carry it. */
export function applyTheme(theme) {
  if (theme?.scheme !== "dark" && theme?.scheme !== "light") throw new Error("the theme must have scheme dark or light");
  document.documentElement.style.colorScheme = theme.scheme;
  for (const [token, value] of Object.entries(theme.tokens ?? {})) {
    document.documentElement.style.setProperty(token, value);
  }
}

/** The errors and unhandled rejections of this page are written to the application log when they occur. */
export function installPageErrors(report) {
  for (const [type, pick] of [["error", (event) => event.error], ["unhandledrejection", (event) => event.reason]]) {
    addEventListener(type, (event) => {
      const error = pick(event);
      report(`view browser: ${error?.message ?? String(error)}`);
    });
  }
}

/**
 * Creates the bridge, the reporter and the page hooks of a view page, and applies the theme. Returns {bridge, report}.
 */
export function createPage() {
  const bridge = createViewBridge({
    handler: window.webkit.messageHandlers["sok-view"],
    report: (event) => {
      const text = `view bridge: ${JSON.stringify(event)}`;
      if (event?.kind === "open-calls") console.debug(text);
      else console.error(text);
    },
  });
  const report = createReporter(bridge.runtime);
  installPageErrors(report);
  if (window.sokTheme) applyTheme(window.sokTheme);
  bridge.runtime.theme(applyTheme);
  return { bridge, report };
}
