// Model of createViewBridge of @soksak/plugin-api/view for the calls that the hwp view page makes: calls.request with the
// call limit, commands.register, runtime.native.on, runtime.theme, runtime.sidecar and composition.create. The wire form
// of each call is the form that the published view and calls cases (test/fixtures/sdk-cases) record. A call outside this
// surface throws an error that names the call. The conformance test is test/sdk-models/conformance.test.mjs.
import { createComposition } from "./composition.mjs";

// The default limit of a call, in milliseconds, when the call declares none (calls.json).
const DEFAULT_LIMIT = 10000;

/**
 * Creates the bridge of one view page. The page posts through handler.postMessage and receives the host messages
 * through window.sokView.attach. report(event) receives the call-layer reports: timeout, late-reply and open-calls.
 */
export function createViewBridge({ handler, report, origin = globalThis.performance?.timeOrigin }) {
  if (typeof report !== "function") throw new TypeError("createViewBridge requires the report function");
  let sequence = 0;
  // The operations that the page begins: each takes the next identifier p<origin>.<n> (view-operations.json).
  let operations = 0;
  // The listeners of each watched status: one request serves every listener of its name (view-status.json).
  const statusListeners = new Map();
  const pending = new Map();
  const late = new Map();
  const commands = new Map();
  const nativeSubscriptions = new Map();
  const themeListeners = new Map();
  const sidecarListeners = [];
  const nativeListeners = new Map();
  const plugin = () => globalThis.window?.location?.host;
  // The declared UI snapshots of each status: one snapshot is in transit until its acknowledgement, and a value that
  // arrives in transit replaces the waiting value and is counted as skipped (declared-ui-snapshot.json).
  const snapshotStates = new Map();
  const snapshotState = (status) => {
    if (!snapshotStates.has(status)) snapshotStates.set(status, { seq: 0, transit: null, dirty: null, skipped: 0 });
    return snapshotStates.get(status);
  };

  const post = (message) => handler.postMessage(message);
  const openCalls = () => {
    const started = [...pending.values()].map((entry) => entry.startedAt);
    report({ kind: "open-calls", plugin: plugin(), count: pending.size, oldestStartedAt: started.length > 0 ? Math.min(...started) : null });
  };
  // A request posts {sok, id, command, params} and resolves with the result of the reply with the same id. A reply that
  // arrives after the limit is reported as late and is not passed to the caller.
  function request(command, params, timeout = DEFAULT_LIMIT, cids) {
    const id = ++sequence;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const entry = { command, startedAt, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        pending.delete(id);
        late.set(id, { command, startedAt });
        report({ kind: "timeout", plugin: plugin(), command, timeout });
        openCalls();
        const error = new Error(`command ${command} did not reply within ${timeout}ms`);
        error.code = -32000;
        reject(error);
      }, timeout);
      pending.set(id, entry);
      post(cids === undefined ? { sok: 1, id, command, params } : { sok: 1, id, command, params, cids });
      openCalls();
    });
  }
  const failure = (error) => ({ code: -32000, message: error instanceof Error ? error.message : String(error) });

  // A host request for a command of the view is answered by its registered run function.
  async function runCommand(message) {
    const run = commands.get(message.command);
    if (run === undefined) {
      post({ sok: 1, reply: message.id, error: { code: 1002, message: `view command ${message.command} is not registered` } });
      return;
    }
    try {
      // The handler receives the cids of the cause of the request, and an empty context when the request has none (core view.js).
      const context = message.cids === undefined ? {} : { cids: message.cids };
      const result = await run(message.params, context);
      post({ sok: 1, reply: message.id, result: result === undefined ? null : result });
    } catch (error) {
      post({ sok: 1, reply: message.id, error: failure(error) });
    }
  }

  // Each pushed value takes the next seq, so a value that waits in transit keeps the seq that its push gave it.
  const sendSnapshot = (status, state, seq, value) => {
    state.transit = seq;
    post({ event: "declared-ui.snapshot", plugin: plugin(), status, seq, value, skipped: state.skipped });
    state.skipped = 0;
  };
  const snapshots = {
    push(status, value) {
      const state = snapshotState(status);
      state.seq += 1;
      if (state.transit === null) return sendSnapshot(status, state, state.seq, value);
      if (state.dirty !== null) {
        state.skipped += 1;
        report({ kind: "skipped", plugin: plugin(), status, count: state.skipped });
      }
      state.dirty = { seq: state.seq, value };
    },
  };
  // An acknowledgement releases the snapshot in transit, and sends the waiting value when there is one.
  const acknowledge = (status, seq) => {
    const state = snapshotState(status);
    if (state.transit !== seq) throw new Error(`declared UI acknowledgement of ${status} for seq ${seq} is not in transit`);
    state.transit = null;
    if (state.dirty !== null) {
      const waiting = state.dirty;
      state.dirty = null;
      sendSnapshot(status, state, waiting.seq, waiting.value);
    }
  };

  // The host messages: replies to requests, command requests, host events and sidecar events.
  const onHost = (message) => {
    if (message.sok !== 1) return;
    if (message.event === "declared-ui.snapshot.ack") return void acknowledge(message.data.status, message.data.seq);
    if (message.command !== undefined) return void runCommand(message);
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error !== undefined) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result ?? null);
      openCalls();
      return;
    }
    if (message.id !== undefined && late.has(message.id)) {
      const entry = late.get(message.id);
      late.delete(message.id);
      report({ kind: "late-reply", plugin: plugin(), command: entry.command, delay: Date.now() - entry.startedAt });
      return;
    }
    if (message.event === "sidecar.message" || message.event === "sidecar.failure") {
      const kind = message.event === "sidecar.message" ? "message" : "failure";
      for (const listener of sidecarListeners) {
        if (listener.kind === kind && listener.id === message.data.id) listener.fn(kind === "message" ? message.data.body : message.data.reason);
      }
      return;
    }
    // A value of a watched status reaches the listeners of its name with the value only (view-status.json).
    if (message.event === "status") {
      const listeners = statusListeners.get(message.data.name);
      if (listeners) for (const listener of [...listeners.values()]) listener(message.data.value);
      return;
    }
    if (message.event === "theme") {
      for (const listener of themeListeners.values()) listener(message.data);
      return;
    }
    if (message.event !== undefined) {
      const listeners = nativeListeners.get(`native:${message.event}`);
      if (listeners) for (const listener of [...listeners.values()]) listener(message.data);
    }
  };
  if (typeof globalThis.window?.sokView?.attach !== "function") throw new Error("createViewBridge requires window.sokView.attach of the view channel");
  globalThis.window.sokView.attach(onHost);

  // A subscription posts its command once; later listeners of the same key share it. A refused subscription removes
  // its listeners, so the next listener subscribes again.
  function subscribe(key, command, params, listener, label) {
    if (!nativeListeners.has(key)) nativeListeners.set(key, new Map());
    const listeners = nativeListeners.get(key);
    listeners.set(label, listener);
    const remove = () => { listeners.delete(label); };
    if (nativeSubscriptions.has(key)) return nativeSubscriptions.get(key).then(() => remove);
    const subscribed = request(command, params).then(() => undefined, (error) => {
      nativeSubscriptions.delete(key);
      nativeListeners.delete(key);
      throw error;
    });
    nativeSubscriptions.set(key, subscribed);
    return subscribed.then(() => remove);
  }
  // The sidecar subscriptions share their request as the native subscriptions do.
  function subscribeSidecar(key, command, params) {
    if (nativeSubscriptions.has(key)) return nativeSubscriptions.get(key);
    const subscribed = request(command, params).then(() => undefined, (error) => {
      nativeSubscriptions.delete(key);
      throw error;
    });
    nativeSubscriptions.set(key, subscribed);
    return subscribed;
  }

  const runtime = {
    native: {
      on(name, listener) {
        if (typeof name !== "string" || name === "") return Promise.reject(new Error("runtime.native.on requires a non-empty name"));
        // The listener label is the listener function itself, so one listener object keeps one entry.
        return subscribe(`native:${name}`, "runtime.native.on", { name }, listener, listener);
      },
    },
    // The settings and text size of the host: each read is one call, and each subscription shares one host subscription.
    settings: {
      read: () => request("runtime.settings.read", null),
      on(listener) {
        if (typeof listener !== "function") throw new Error("settings requires a listener");
        return subscribe("native:settings", "runtime.settings.on", null, listener, listener);
      },
    },
    textSize: {
      read: () => request("runtime.textSize.read", null),
      on(listener) {
        if (typeof listener !== "function") throw new Error("textSize requires a listener");
        return subscribe("native:textSize", "runtime.textSize.on", null, listener, listener);
      },
    },
    theme(listener) {
      themeListeners.set(listener, listener);
      return () => themeListeners.delete(listener);
    },
    // An operation that starts in the page logs its first event with its identifier and returns the list of identifiers
    // (core docs/spec/native-surfaces.md#view-operations, view-operations.json).
    beginOperation(event, fields) {
      operations += 1;
      const cids = [`p${origin}.${operations}`];
      request("runtime.log", { level: "info", event, fields, cids }).then(undefined, (error) => {
        report({ kind: "operation", plugin: plugin(), status: "log refused", reason: failure(error).message });
      });
      return cids;
    },
    // A command of the host that the page calls, with the identifiers of the operation that causes it (view-operations.json).
    command(name, params, options) {
      return request(name, params, undefined, options?.cids);
    },
    // A watched status: the page sends runtime.status.watch once for each name, and each value arrives as the event status.
    status: {
      watch(name, listener) {
        if (typeof name !== "string" || name === "") throw new Error("runtime.status.watch requires a non-empty name");
        if (typeof listener !== "function") throw new Error("runtime.status.watch requires a listener");
        if (!statusListeners.has(name)) {
          statusListeners.set(name, new Map());
          request("runtime.status.watch", { name }).then(undefined, (error) => {
            // A refused watch removes its listener and writes its refusal to the application log (view-status.json).
            statusListeners.get(name)?.delete(listener);
            if (statusListeners.get(name)?.size === 0) statusListeners.delete(name);
            request("runtime.error", { where: `status ${name}`, text: error.message }).then(undefined, (logError) => {
              report({ kind: "status", plugin: plugin(), status: "error record refused", reason: failure(logError).message });
            });
          });
        }
        statusListeners.get(name).set(listener, listener);
        return () => {
          const listeners = statusListeners.get(name);
          if (!listeners || !listeners.delete(listener)) return;
          if (listeners.size === 0) {
            statusListeners.delete(name);
            request("runtime.status.unwatch", { name }).then(undefined, (error) => {
              report({ kind: "status", plugin: plugin(), status: "unwatch refused", reason: failure(error).message });
            });
          }
        };
      },
    },
    sidecar(name) {
      return {
        send(id, body, cids = []) {
          return request("runtime.sidecar.send", { id, sidecar: name, body, cids });
        },
        on(id, fn) {
          const entry = { kind: "message", id, fn };
          sidecarListeners.push(entry);
          const remove = () => { sidecarListeners.splice(sidecarListeners.indexOf(entry), 1); };
          return subscribeSidecar(`sidecar.message:${name}:${id}`, "runtime.sidecar.on", { id, sidecar: name })
            .then(() => remove);
        },
      };
    },
  };

  const bridge = {
    snapshots,
    calls: {
      request(command, params, timeout) {
        return request(command, params, timeout);
      },
    },
    runtime,
    commands: {
      register(name, run) {
        if (typeof name !== "string" || name === "") throw new Error("commands.register requires a non-empty name");
        if (typeof run !== "function") throw new Error(`commands.register requires a function for ${name}`);
        return request("runtime.command.register", { name }).then(() => {
          commands.set(name, run);
          return null;
        });
      },
    },
    composition: {
      create(options) {
        return createComposition({ request, subscribe: (name, listener, label) => subscribe(`native:${name}`, "runtime.native.on", { name }, listener, label) }, options);
      },
    },
  };
  return bridge;
}
