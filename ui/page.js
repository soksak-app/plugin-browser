// The page setup that the view pages of this plugin share: the view bridge over the injected channel, the error reporter, the
// page error hooks and the theme of the document. The tab page (view.js) and the section page (section.js) both call createPage.

import { createViewBridge } from "@soksak/plugin-api/view";
import { createEmitter } from "./events.js";

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
