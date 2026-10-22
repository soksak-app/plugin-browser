import { createBinder } from "./binder.mjs";

// Model of createExpose of @soksak/plugin-api for the calls that the hwp view page makes: status, command and dom
// registration and the exposure requests status.get, status.watch, status.next, status.unwatch, command.run, dom.act and
// dom.rect. The wire form and the refusals are the forms of test/fixtures/sdk-cases/expose.json and
// command-registration.json, and the binder of bind in create-binder.json. A call outside this surface throws an error
// that names the call.

const ERROR = { unknownStatus: 1001, notRegistered: 1002, invalidParams: -32602, unknownMethod: -32601, failed: -32000 };

class RequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const TYPES = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  boolean: (value) => typeof value === "boolean",
  object: (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null,
};

// The params of a command.run request are checked against the declared params schema: an object schema requires params,
// and each declared property that is present has its declared type.
function checkParams(name, schema, params) {
  if (schema?.type !== "object") return;
  if (params === undefined) throw new RequestError(ERROR.invalidParams, `command.run for ${name} requires params`);
  if (!TYPES.object(params)) throw new RequestError(ERROR.invalidParams, `invalid params for ${name}`);
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (params[key] !== undefined && TYPES[property.type] && !TYPES[property.type](params[key])) {
      throw new RequestError(ERROR.invalidParams, `invalid params for ${name}`);
    }
  }
}

/**
 * Creates the exposure of one surface page. register(kind, name) posts the registration of a status, dom or command
 * and resolves when the host accepts it. onRequest(handle) subscribes to the exposure requests, and reply(id, payload)
 * answers one with {result} or {error: {code, message}}. declarations is the declared exposes of the plugin, or a
 * function that returns them.
 */
export function createExpose({ register, unregister, onRequest, reply }, declarations) {
  const declared = () => (typeof declarations === "function" ? declarations() : declarations);
  const isDeclared = (kind, name) => (declared()[kind] ?? []).some((entry) => entry.name === name);
  const statuses = new Map();
  const doms = new Map();
  const commands = new Map();
  let disposed = false;
  // The binder runs the declared commands of this page: a command that is not declared or not registered is refused.
  const binder = createBinder((name, params) => {
    const command = commands.get(name);
    if (!command) throw new Error(`command ${name} is not registered`);
    return command.run(params ?? {});
  }, {
    check(name) {
      if (!isDeclared("commands", name)) throw new Error(`command ${name} is not declared`);
    },
  });
  const refuseDisposed = () => {
    if (disposed) throw new Error("exposure is disposed");
  };

  // A status keeps the version of its value: the value that the first watch reads is version 1, and each later change
  // adds one. status.next answers with the current version when it is newer than the version of the request.
  const flush = (status) => {
    for (const waiter of [...status.waiters]) {
      if (status.version > waiter.version) {
        status.waiters.splice(status.waiters.indexOf(waiter), 1);
        waiter.resolve({ version: status.version, value: status.value });
      }
    }
  };
  const closeWaiters = (status) => {
    for (const waiter of status.waiters.splice(0)) waiter.resolve({ closed: true });
  };
  const statusOf = (name) => {
    const status = statuses.get(name);
    if (!status) throw new RequestError(ERROR.unknownStatus, `unknown status ${name}`);
    return status;
  };
  const elementOf = (name, params) => {
    const element = doms.get(name);
    if (!element) throw new RequestError(ERROR.notRegistered, `unknown dom ${name}`);
    const index = params.index ?? 0;
    if (!Number.isInteger(index) || index < 0) throw new RequestError(ERROR.invalidParams, "index must be a non-negative integer");
    if (index !== 0) throw new RequestError(ERROR.notRegistered, `dom ${name} has no element at index ${index}`);
    return element;
  };

  async function dispatch(method, params = {}) {
    switch (method) {
      case "status.get":
        return statusOf(params.name).read();
      case "status.watch": {
        const status = statusOf(params.name);
        if (status.watching) return null;
        status.watching = true;
        status.version = 1;
        status.value = status.read();
        status.settling = true;
        status.unsubscribe = status.subscribe((value) => {
          if (!status.watching) return;
          status.value = value;
          if (status.settling) return;
          status.version += 1;
          flush(status);
        });
        status.settling = false;
        return null;
      }
      case "status.next": {
        const status = statusOf(params.name);
        if (!status.watching) return { closed: true };
        if (status.version > params.version) return { version: status.version, value: status.value };
        return new Promise((resolve) => status.waiters.push({ version: params.version, resolve }));
      }
      case "status.unwatch": {
        const status = statusOf(params.name);
        if (status.watching) {
          status.watching = false;
          status.unsubscribe?.();
          closeWaiters(status);
        }
        return null;
      }
      case "dom.act": {
        const element = doms.get(params.name);
        if (!element) throw new RequestError(ERROR.notRegistered, `unknown dom ${params.name}`);
        if (params.address !== undefined) throw new RequestError(ERROR.invalidParams, `dom ${params.name} takes no address`);
        if (params.action !== "click") throw new RequestError(ERROR.invalidParams, `unknown action ${params.action}`);
        elementOf(params.name, params).click();
        return null;
      }
      case "dom.rect": {
        const box = elementOf(params.name, params).getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }
      case "command.run": {
        const command = commands.get(params.name);
        if (!command) {
          if (isDeclared("commands", params.name)) throw new RequestError(ERROR.notRegistered, `command ${params.name} is not registered`);
          throw new RequestError(ERROR.unknownStatus, `unknown command ${params.name}`);
        }
        checkParams(params.name, command.schema, params.params);
        try {
          return (await command.run(params.params)) ?? null;
        } catch (error) {
          throw new RequestError(ERROR.failed, error.message);
        }
      }
      default:
        throw new RequestError(ERROR.unknownMethod, `unknown method ${method}`);
    }
  }

  onRequest(async (event) => {
    if (disposed) return;
    let payload;
    try {
      payload = { result: await dispatch(event.method, event.params) };
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      payload = { error: { code: error.code, message: error.message } };
    }
    reply(event.id, payload);
  });

  return {
    async status(name, read, subscribe) {
      refuseDisposed();
      if (!isDeclared("status", name)) throw new Error(`status ${name} is not declared`);
      if (statuses.has(name)) throw new Error(`status ${name} is already registered`);
      statuses.set(name, { read, subscribe, version: 0, value: undefined, watching: false, waiters: [], settling: false });
      try {
        await register("status", name);
      } catch (error) {
        statuses.delete(name);
        throw error;
      }
    },
    async command(name, run) {
      refuseDisposed();
      if (!isDeclared("commands", name)) throw new Error(`command ${name} is not declared`);
      if (commands.has(name)) throw new Error(`command ${name} is already registered`);
      const schema = declared().commands.find((entry) => entry.name === name)?.params;
      commands.set(name, { run, schema });
      try {
        await register("command", name);
      } catch (error) {
        commands.delete(name);
        throw error;
      }
    },
    async dom(name, element) {
      refuseDisposed();
      if (doms.has(name)) throw new Error(`dom ${name} is already registered`);
      doms.set(name, element);
      try {
        await register("dom", name);
      } catch (error) {
        doms.delete(name);
        throw error;
      }
    },
    bind(element, name, params, options) {
      refuseDisposed();
      return binder.bind(element, name, params, options);
    },
    delegate(root) {
      refuseDisposed();
      return binder.delegate(root);
    },
    // The dispose ends the local request listener, the bindings and the declarations. A port with an unregister call
    // (the port of a document) also removes its registration; the view port has none.
    async dispose() {
      if (disposed) return;
      disposed = true;
      binder.dispose();
      await unregister?.();
    },
  };
}
