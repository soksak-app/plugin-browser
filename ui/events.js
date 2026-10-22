const LEVELS = ["error", "warn", "info", "debug", "trace"];

// Returns the entrance of this plugin to the event log (core docs/spec/plugins.md#logging). A call names the whole event
// `plugin.<plugin>.<event>`, as events.json declares it; the runtime adds the prefix and the surface.
// The text of a thrown value: the message of an Error, and the value itself otherwise (a thrown string has no message).
export const errorText = (error) => (error instanceof Error ? error.message : String(error));

// The short name of an event of this plugin: the name without the prefix, which runtime.log takes.
function shortName(pluginId, name) {
  const prefix = `plugin.${pluginId}.`;
  if (typeof name !== "string" || !name.startsWith(prefix)) throw new TypeError(`emitEvent requires a name that starts with ${prefix}`);
  return name.slice(prefix.length);
}

// The third argument of a record is {cids}, the identifiers of the operation that the record continues (core
// docs/spec/plugins.md#logging); a record without an operation passes no identifiers. The argument {operation: true}
// begins an operation of the page instead (core docs/spec/native-surfaces.md#view-operations): the record is its first
// event, stored at info, and the call returns the identifiers for the records and the calls that the operation makes.
export function createEmitter(runtime, pluginId) {
  return function emitEvent(level, name, fields, options) {
    if (!LEVELS.includes(level)) throw new TypeError(`emitEvent requires a level of ${LEVELS.join(", ")}, not ${JSON.stringify(level)}`);
    const event = shortName(pluginId, name);
    if (options?.operation === true) {
      if (level !== "info") throw new TypeError(`emitEvent begins an operation at info, not ${JSON.stringify(level)}`);
      return runtime.beginOperation(event, fields);
    }
    // events: forwarded
    runtime.log[level](event, fields, options);
    return undefined;
  };
}
