// The resolve hook of the plugin API fixtures. The application resolves the specifiers of the plugin API through the import map of each page
// (core docs/spec/plugins.md#view-surfaces); this hook maps the same specifiers to the fixture modules of this repository and to no other
// module, so every other specifier resolves as Node resolves it.
const FIXTURES = new Map([
  ["@soksak/plugin-api", "./index.mjs"],
  ["@soksak/plugin-api/view", "./view.mjs"],
  ["@soksak/plugin-api/diagnostic-view-frames", "./diagnostic-view-frames.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const fixture = FIXTURES.get(specifier);
  if (fixture === undefined) return nextResolve(specifier, context);
  return { url: new URL(fixture, import.meta.url).href, shortCircuit: true };
}

/** The specifiers that the hook maps, for the hook test. */
export const MAPPED_SPECIFIERS = [...FIXTURES.keys()];
