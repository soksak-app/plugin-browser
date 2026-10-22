// Model of createBinder of @soksak/plugin-api and of the INTERACTIVE selector for the calls that the browser page and its
// section tests make: bind, delegate, run and dispose, and the audit rows of the delegated root. The behavior is the form
// of test/fixtures/sdk-cases/create-binder.json and interactive.json. A binding marks its element with data-command and
// the params as JSON, and each event of the element or of a delegated control runs the declared command.

/** The element kinds that an audit examines (interactive.json). */
export const INTERACTIVE = 'button, input, select, textarea, [role="button"], [contenteditable]:not([contenteditable="false"])';

const TEXT_LIMIT = 40;

/**
 * Creates a binder over run(name, params), which runs a declared command and resolves with its result. check(name) throws
 * when the command is not declared; it runs before each bind and run.
 */
export function createBinder(run, { check } = {}) {
  if (typeof run !== "function") throw new TypeError("createBinder requires the run function");
  if (typeof check !== "function") throw new TypeError("createBinder requires the check function");
  const calls = [];
  const failed = [];
  const listeners = [];
  let changed = 0;

  // The run of a bound control: the call is recorded, and a failure is recorded and passed to the failed option.
  async function invoke(name, params, element, options) {
    calls.push({ name, params, element });
    try {
      await run(name, params);
    } catch (error) {
      failed.push(error.message);
      options?.failed?.(error.message);
    }
  }
  const paramsOf = (element) => (element.dataset.params === undefined ? {} : JSON.parse(element.dataset.params));

  return {
    async bind(element, name, params, options = {}) {
      check(name);
      element.dataset.command = name;
      // A function params is read at each run and is not marked on the element; object params are marked as JSON.
      if (params !== undefined && typeof params !== "function") element.dataset.params = JSON.stringify(params);
      const type = options.event ?? "click";
      const handler = async (event) => {
        if (options.when && !options.when(event)) return;
        await invoke(name, typeof params === "function" ? params() : params ?? {}, element.id, options);
      };
      element.addEventListener(type, handler);
      listeners.push({ target: element, type, handler });
      changed += 1;
    },
    // A delegated root runs the command of the marked control under the event: a click runs a control without a value
    // name, a live control runs on each input, and a control with a value name runs on its change with the value.
    async delegate(root) {
      const handler = async (event) => {
        let element = event.target;
        while (element && element !== root && element.dataset?.command === undefined) element = element.parentNode;
        if (!element || element === root) return;
        const valueName = element.dataset.value;
        if (event.type === "click" && valueName === undefined) {
          await invoke(element.dataset.command, paramsOf(element), element.id, {});
        } else if (event.type === "input" && element.dataset.live !== undefined) {
          await invoke(element.dataset.command, { ...paramsOf(element), [valueName]: event.target.value }, element.id, {});
        } else if (event.type === "change" && valueName !== undefined) {
          await invoke(element.dataset.command, { ...paramsOf(element), [valueName]: event.target.value }, element.id, {});
        }
      };
      for (const type of ["click", "input", "change"]) {
        root.addEventListener(type, handler);
        listeners.push({ target: root, type, handler });
      }
      changed += 1;
    },
    // The audit rows of root: the controls of INTERACTIVE that have no command and no dom name, in document order.
    audit(root) {
      return [...root.querySelectorAll(INTERACTIVE)]
        .filter((element) => !(element.dataset.command !== undefined && element.dataset.expose !== undefined))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          expose: element.dataset.expose ?? null,
          command: element.dataset.command ?? null,
          text: textOf(element),
        }));
    },
    async run(name, params) {
      check(name);
      calls.push({ name, params, element: null });
      return run(name, params);
    },
    dispose() {
      for (const { target, type, handler } of listeners.splice(0)) target.removeEventListener(type, handler);
    },
    // The record of the binder: the calls in order, the failures in order and the count of bindings and delegations.
    state: () => ({ calls, failed, changed }),
  };
}

// The text of an audit row: aria-label, else title, else the text content, trimmed and cut to TEXT_LIMIT characters.
function textOf(element) {
  const text = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent.trim();
  return [...text.trim()].slice(0, TEXT_LIMIT).join("");
}
