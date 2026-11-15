// The host side of a view page under test, as the fixtures of this directory see it. A view handle is the value of
// window.webkit.messageHandlers["sok-view"]: the page creates its view bridge over it, and the bridge records each call of the page here.
// The test arranges the answers of the calls (answers), the events that the host delivers (deliver, through the routes of the bridge),
// and the surface that the view belongs to. A call without an arranged answer is refused, so a page call that a test did not arrange fails.
const RECORDS = new WeakMap();

/** Creates the handle of a view page. plugin names the plugin of the page, surface is the surface of the view, and answer(command, params) returns
 * the arranged answer of a call. */
export function createViewHandle({ plugin, surface, answer }) {
  const record = {
    plugin,
    surface,
    page: globalThis.crypto.randomUUID(),
    operations: 0,
    calls: [],
    events: [],
    errors: [],
    observed: { commands: [] },
    commands: new Map(),
    statusListeners: new Map(),
    textSizeListeners: new Set(),
    settingsListeners: new Set(),
    themeListeners: new Set(),
    nativeListeners: new Map(),
    regions: new Map(),
    streams: new Map(),
    answer,
  };
  const handle = {
    postMessage() {
      throw new Error("the page posted to the sok-view wire: the plugin API fixture serves the calls of the page");
    },
  };
  RECORDS.set(handle, record);
  return handle;
}

/** The record of a view handle; a handle that createViewHandle did not make is refused. */
export function recordOf(handle) {
  const record = RECORDS.get(handle);
  if (record === undefined) throw new TypeError("the view bridge fixture requires the handle of a view made by createViewHandle");
  return record;
}
