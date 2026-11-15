// The fixture of @soksak/plugin-api for the pages of this plugin: createExpose, createBinder and drawList. Each one does what
// docs/spec/exposure.md states for it: createBinder connects an element to a declared command on an event, marks an element with
// its command, and delegates the clicks and value changes of marked descendants; createExpose answers the exposure requests of the
// view with the status, command and element entries that the page registers; drawList keeps the element of each key in place.
// The commands run through the run function that the test or the page supplies, so a test drives each handler at this interface.

/**
 * The binder of a document. run(name, params, options) runs a declared command; options.check(name) refuses an undeclared name, which
 * the binder reports by throwing (exposure.md: binding or marking an undeclared name throws).
 */
export function createBinder(run, { check = () => {} } = {}) {
  const bound = new WeakSet();
  const roots = [];

  const invoke = (name, params) => run(name, params);

  return {
    bind(element, name, params, { event = "click", when = null, failed = null } = {}) {
      check(name);
      bound.add(element);
      element.addEventListener(event, (received) => {
        if (when !== null && !when(received)) return;
        const value = typeof params === "function" ? params(received) : params;
        Promise.resolve()
          .then(() => invoke(name, value ?? {}))
          .catch((error) => {
            if (failed !== null) failed(error);
            else throw error;
          });
      });
      return Promise.resolve();
    },
    mark(element, name, params, valueName = "value") {
      check(name);
      element.dataset.command = name;
      if (params !== undefined) element.dataset.params = JSON.stringify(params);
      if (valueName !== "value") element.dataset.value = valueName;
    },
    delegate(root) {
      const listener = (received) => {
        const target = typeof received.target?.closest === "function" ? received.target.closest("[data-command]") : null;
        if (target === null || !root.contains(target) || bound.has(target)) return;
        const params = target.dataset.params === undefined ? {} : JSON.parse(target.dataset.params);
        const valueName = target.dataset.value ?? "value";
        if (received.type === "change") params[valueName] = target.value;
        invoke(target.dataset.command, params);
      };
      root.addEventListener("click", listener);
      root.addEventListener("change", listener);
      roots.push({ root, listener });
      return Promise.resolve();
    },
    audit(root) {
      const interactive = root.querySelectorAll("button, input, select, textarea, [role=button], [contenteditable]");
      return [...interactive].filter((element) => !bound.has(element) && element.dataset.command === undefined)
        .map((element) => ({ role: element.getAttribute("role") ?? element.localName, expose: element.dataset.expose ?? null, command: null, text: element.textContent }));
    },
    dispose() {
      for (const { root, listener } of roots.splice(0)) {
        root.removeEventListener("click", listener);
        root.removeEventListener("change", listener);
      }
    },
  };
}

/**
 * The exposure of a view page over its port. port.register(kind, name) records a registration, port.onRequest(answer) receives each
 * exposure request {id, surface, method, params}, port.reply(id, payload) answers it, and port.changed(name, value, version) sends each
 * value of a watched status. declarationsOf() returns the exposes of the plugin, whose names the entries must match.
 */
export function createExpose(port, declarationsOf) {
  const statuses = new Map();
  const commands = new Map();
  const elements = new Map();
  const declared = (kind, name) => {
    const entries = declarationsOf()[kind] ?? [];
    if (!entries.some((entry) => entry.name === name)) throw new Error(`${kind} ${name} is not declared`);
  };
  const binder = createBinder((name, params) => {
    const run = commands.get(name);
    if (run === undefined) throw new Error(`command ${name} is not registered`);
    return run(params);
  }, { check: (name) => declared("commands", name) });

  // A value that differs from the last one takes the next version; a change of the same value sends nothing (exposure.md, relay).
  const emit = (entry, value) => {
    entry.sent += 1;
    port.changed(entry.name, value, entry.version);
  };
  const publish = (entry, value) => {
    if (entry.version > 0 && JSON.stringify(value) === JSON.stringify(entry.last)) return;
    entry.version += 1;
    entry.last = value;
    emit(entry, value);
  };

  port.onRequest(async ({ id, method, params }) => {
    try {
      const result = await answerOf(method, params);
      port.reply(id, { result: result ?? null });
    } catch (error) {
      port.reply(id, { error: { message: String(error?.message ?? error) } });
    }
  });

  async function answerOf(method, params) {
    switch (method) {
      case "status.get": {
        const entry = statuses.get(params.name);
        if (entry === undefined) throw new Error(`status ${params.name} is not registered`);
        return entry.read();
      }
      case "status.watch": {
        const entry = statuses.get(params.name);
        if (entry === undefined) throw new Error(`status ${params.name} is not registered`);
        entry.watchers += 1;
        const sent = entry.sent;
        if (entry.unsubscribe === null) entry.unsubscribe = entry.subscribe((value) => publish(entry, value));
        // A watch sends the current value, also when the name is already watched; a value that the subscription sent is not sent twice.
        if (entry.sent === sent) {
          const value = entry.read();
          if (entry.version === 0 || JSON.stringify(value) !== JSON.stringify(entry.last)) {
            entry.version += 1;
            entry.last = value;
          }
          emit(entry, entry.last);
        }
        return null;
      }
      case "status.unwatch": {
        const entry = statuses.get(params.name);
        if (entry === undefined) throw new Error(`status ${params.name} is not registered`);
        entry.watchers -= 1;
        if (entry.watchers === 0) {
          entry.unsubscribe();
          entry.unsubscribe = null;
        }
        return null;
      }
      case "command.run": {
        const run = commands.get(params.name);
        if (run === undefined) throw new Error(`command ${params.name} is not registered`);
        return run(params.params);
      }
      case "element.rect": {
        const provide = elements.get(params.name);
        if (provide === undefined) throw new Error(`element ${params.name} is not registered`);
        const target = typeof provide === "function" ? provide()[params.index ?? 0] : provide;
        const rect = target.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      default:
        throw new Error(`exposure method ${method} is not served by the fixture`);
    }
  }

  return {
    status(name, read, subscribe) {
      declared("status", name);
      statuses.set(name, { name, read, subscribe, unsubscribe: null, watchers: 0, version: 0, last: undefined, sent: 0 });
      return port.register("status", name);
    },
    command(name, run) {
      declared("commands", name);
      commands.set(name, run);
      return Promise.resolve();
    },
    element(name, target) {
      declared("element", name);
      elements.set(name, target);
      return port.register("element", name);
    },
    bind: binder.bind,
    mark: binder.mark,
    delegate: binder.delegate,
    audit: binder.audit,
    dispose: async () => {
      binder.dispose();
    },
  };
}

/**
 * Keeps the element of each key of a list in its place. create() makes an element for a key that is new, update(element, item) edits the
 * element of each item, and the elements of the keys that left are removed. An element moves only when its position in the list is wrong.
 */
const drawn = new WeakMap();
export function drawList(container, items, { key, create, update }) {
  const previous = drawn.get(container) ?? new Map();
  const next = new Map();
  const ordered = [];
  for (const item of items) {
    const name = key(item);
    if (next.has(name)) throw new Error(`drawList key ${name} repeats`);
    const element = previous.get(name) ?? create(item);
    previous.delete(name);
    update(element, item);
    next.set(name, element);
    ordered.push(element);
  }
  for (const element of previous.values()) element.remove();
  let anchor = null;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const element = ordered[index];
    if (element.parentNode !== container || element.nextSibling !== anchor) container.insertBefore(element, anchor);
    anchor = element;
  }
  drawn.set(container, next);
}
