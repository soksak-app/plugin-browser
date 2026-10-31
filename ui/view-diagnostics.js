// Loads the diagnostic declaration from the start values of the browser view (core docs/spec/plugins.md#diagnostic-declarations).
// A release build has no declaration, so its start values carry null, and the view requests no file.
export async function loadDiagnostics(start) {
  if (!Object.hasOwn(start, "diagnostics")) {
    throw new Error("the start values of the browser view have no diagnostics: window.sokSurface {surface, params, origin, project, declarations, diagnostics} carries it");
  }
  if (start.diagnostics === null) return null;
  return { declaration: start.diagnostics, attach: (await import("./browser-diagnostics.js")).attach };
}
