// The fixture of @soksak/plugin-api/view for the view pages of this plugin. createViewBridge returns the bridge that the page uses, with the
// members that the page reads: calls, commands, runtime and composition. Each member records its call in the view record and answers with
// what the test arranged for that call (bridge-host.mjs); a call without an arranged answer is refused. The events that the host delivers
// reach the listeners that the page registered (deliver in the view harness).
import { recordOf } from "./bridge-host.mjs";

const LEVELS = ["error", "warn", "info", "debug", "trace"];

/** The view bridge of a page, over the handle of the view. */
export function createViewBridge({ handler, report }) {
  if (typeof report !== "function") throw new TypeError("createViewBridge requires the report function");
  const record = recordOf(handler);
  const request = (command, params) => {
    record.calls.push({ command, params });
    return new Promise((resolve) => resolve(record.answer(command, params)));
  };

  // The report function of the page receives the events of the bridge (its late replies and its other errors); a test delivers them through bridgeEvent.
  record.report = report;

  const calls = { request };

  const commands = {
    register(name, run) {
      record.commands.set(name, run);
      return request("runtime.command.register", { name });
    },
  };

  // The runtime names each record of the plugin with its prefix, plugin.<plugin>.<event>, as the plugin declares it (events.json).
  const named = (event) => `plugin.${record.plugin}.${event}`;
  const log = {};
  for (const level of LEVELS) {
    log[level] = (event, fields, options = {}) => {
      record.events.push({ level, event: named(event), fields, ...(options.cids === undefined ? {} : { cids: options.cids }) });
    };
  }

  const runtime = {
    log,
    // An operation names its first record with the identifier of the page and the count of its operations.
    beginOperation(event, fields) {
      record.operations += 1;
      const cids = [`p${record.page}.${record.operations}`];
      record.events.push({ level: "info", event: named(event), fields, cids });
      return cids;
    },
    command(name, params, options = {}) {
      if (name.startsWith("core.")) {
        record.observed.commands.push({ name, params, surface: record.surface, ...(options.cids === undefined ? {} : { cids: options.cids }) });
        return request(name, params);
      }
      const surface = options.surface ?? record.surface;
      record.observed.commands.push({ name, params, surface });
      return request("runtime.command.run", { name, params, surface });
    },
    status: {
      watch(name, listener, options = {}) {
        const key = `${options.surface ?? ""}\u0000${name}`;
        if (!record.statusListeners.has(key)) record.statusListeners.set(key, new Set());
        record.statusListeners.get(key).add(listener);
        request("runtime.status.watch", { name, surface: options.surface });
        return () => {
          record.statusListeners.get(key).delete(listener);
          request("runtime.status.unwatch", { name, surface: options.surface });
        };
      },
    },
    theme(listener) {
      record.themeListeners.add(listener);
    },
    settings: {
      read: () => request("runtime.settings.read", null),
      on(listener) {
        record.settingsListeners.add(listener);
        request("runtime.settings.on", null);
        return () => record.settingsListeners.delete(listener);
      },
    },
    textSize: {
      read: () => request("runtime.textSize.read", null),
      // The subscription is a call of the view: it resolves with the function that ends the subscription.
      on(listener) {
        record.textSizeListeners.add(listener);
        return request("runtime.textSize.on", null).then(() => () => record.textSizeListeners.delete(listener));
      },
    },
    native: {
      on(event, listener) {
        if (!record.nativeListeners.has(event)) record.nativeListeners.set(event, new Set());
        record.nativeListeners.get(event).add(listener);
        request("runtime.native.on", { event });
        return () => record.nativeListeners.get(event).delete(listener);
      },
    },
    error: (where, text) => request("runtime.error", { where, text }).then(() => {
      record.errors.push({ where, text });
      return null;
    }),
  };

  const composition = {
    async create({ regions }) {
      const declaration = await request("composition.declaration", null);
      const handles = new Map();
      for (const name of Object.keys(regions)) {
        const attached = await request("document.attach", { name });
        const entry = record.regions.get(name) ?? { state: null, listeners: new Set() };
        entry.history = attached.history;
        record.regions.set(name, entry);
        handles.set(name, regionHandle(name, entry));
      }
      await request("composition.place", { regions: Object.keys(regions).map((name) => ({ name, rect: declaration.regions?.[name] ?? null })) });
      return {
        region: (name) => handles.get(name),
        async dispose() {
          for (const name of handles.keys()) await request("document.detach", { name });
        },
      };
    },
  };

  // The handle of a document region: its state, its listeners, and the operations of the document (calls named document.<operation>).
  function regionHandle(name, entry) {
    const operation = (op, params) => request(`document.${op}`, { name, ...params });
    return {
      get state() {
        return entry.state;
      },
      get history() {
        return entry.history;
      },
      onState(listener) {
        entry.listeners.add(listener);
        return () => entry.listeners.delete(listener);
      },
      load: (url) => operation("load", { url }),
      zoom: (zoom) => operation("zoom", { zoom }),
      go: (params) => operation("go", params),
      back: () => operation("go", { delta: -1 }),
      forward: () => operation("go", { delta: 1 }),
      reload: () => operation("go", { reload: true }),
      stop: () => operation("go", { stop: true }),
      entry: (delta) => operation("go", { delta }),
      // The subscription resolves with its handle, which closes the subscription with the unsubscribe operation of the region.
      async subscribe(stream, listener) {
        const handle = await operation("subscribe", { stream });
        record.streams.set(handle, listener);
        return {
          handle,
          close: () => {
            record.streams.delete(handle);
            return operation("unsubscribe", { handle });
          },
        };
      },
    };
  }

  return { calls, commands, runtime, composition };
}
