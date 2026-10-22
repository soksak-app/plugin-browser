// The start values of the view page (core docs/spec/native-surfaces.md#view-surfaces, start values). The host injects
// window.sokSurface before the page runs, and this module checks its form before the page sends anything. The module has
// no import, so the tests load it without the view channel.

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value !== "";

// The form of each start value (core docs/spec/native-surfaces.md#view-surfaces, start values): params are the tab
// parameters or null, origin is {directory} whose directory is text or null, project is {root} or null, and declarations
// are the exposes of the plugin.
const START_FORM = {
  params: (value) => value !== undefined,
  origin: (value) => isRecord(value) && (value.directory === null || isText(value.directory)),
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
