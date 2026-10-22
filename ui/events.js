const LEVELS = ["error", "warn", "info", "debug", "trace"];

// Returns the entrance of this plugin to the event log (core docs/spec/plugins.md#logging). A call names the whole event
// `plugin.<plugin>.<event>`, as events.json declares it; the runtime adds the prefix and the surface.
// The text of a thrown value: the message of an Error, and the value itself otherwise (a thrown string has no message).
export const errorText = (error) => (error instanceof Error ? error.message : String(error));

export function createEmitter(runtime, pluginId) {
  const prefix = `plugin.${pluginId}.`;
  return function emitEvent(level, name, fields) {
    if (!LEVELS.includes(level)) throw new TypeError(`emitEvent requires a level of ${LEVELS.join(", ")}, not ${JSON.stringify(level)}`);
    if (typeof name !== "string" || !name.startsWith(prefix)) throw new TypeError(`emitEvent requires a name that starts with ${prefix}`);
    // events: forwarded
    runtime.log[level](name.slice(prefix.length), fields);
  };
}
