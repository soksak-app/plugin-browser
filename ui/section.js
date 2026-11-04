// The page of a section of the browser plugin (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces).
// The host serves this page for each section surface and injects the start values with section {id, sidebar, card}; the section
// view selects the status that the section draws by its id (section-view.js). In a diagnostic build the page attaches the declared
// diagnostic module, which serves the entries of the section view benchmark (core docs/spec/plugin-processes.md#section-views).

import { callOf, createPage, createPageExposure, exposeCommand } from "./page.js";
import { startValues } from "./start-values.js";
import { createSectionView } from "./section-view.js";
import { loadDiagnostics } from "./view-diagnostics.js";

const start = startValues();
const diagnostics = await loadDiagnostics(start);
const { bridge, report } = createPage();
const expose = createPageExposure({ bridge, declarations: start.declarations, report });
// The tab state of the section surface, through the view calls that the tab page uses (view.js): each section declares unload, so
// core keeps the state that the view writes under the section surface id and gives it to the view of the restored section (core
// docs/spec/plugins.md#memory-saver). A refused write is written to the application log.
const send = callOf(bridge.calls, report);
const tabState = {
  read: () => bridge.calls.request("tab.state.read", null),
  write: (value) => send("tab.state.write", value),
};
try {
  await createSectionView({ runtime: bridge.runtime, expose, declarations: start.declarations, root: document.body, section: start.section, tabState, report });
  if (diagnostics !== null) {
    await diagnostics.attach({
      expose: { status: (name, read, subscribe) => expose.status(name, read, subscribe), command: exposeCommand(expose, bridge.commands) },
      root: document.documentElement,
      section: start.section,
      declaration: diagnostics.declaration,
      log: (_event, fields) => bridge.runtime.log.trace("view.content_frame", fields),
    });
  }
} catch (error) {
  report(`view browser: section failed: ${error?.message ?? error}`);
}
