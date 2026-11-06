// Model of createBinder of the plugin API and of the INTERACTIVE selector for the calls that the browser page and its
// section tests make: bind, delegate, run and dispose, and the audit rows of the delegated root. The behavior is the form
// of test/fixtures/contract/create-binder.json and interactive.json. A binding marks its element with data-command and
// the params as JSON, and each event of the element or of a delegated control runs the declared command.

/** The element kinds that an audit examines (interactive.json). */
export const INTERACTIVE = 'button, input, select, textarea, [role="button"], [contenteditable]:not([contenteditable="false"])';

const TEXT_LIMIT = 40;

// The implicit ARIA role of an input of each type (interactive.json); an input type outside this table has no role.
const INPUT_ROLES = Object.freeze({
  button: "button", image: "button", reset: "button", submit: "button", checkbox: "checkbox", radio: "radio", range: "slider",
  number: "spinbutton", search: "searchbox", email: "textbox", tel: "textbox", text: "textbox", url: "textbox",
});
// The implicit ARIA role of a tag that needs no attribute to have it (HTML-AAM), for the roles that element.rect reports.
const TAG_ROLES = Object.freeze({
  article: "article", dialog: "dialog", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading", hr: "separator",
  img: "img", li: "listitem", meter: "meter", nav: "navigation", ol: "list", progress: "progressbar", search: "search", table: "table", td: "cell",
  th: "columnheader", tr: "row", ul: "list",
});
// The input types whose implicit role is combobox when the input names a list of suggestions.
const LIST_INPUTS = new Set(["email", "search", "tel", "text", "url"]);

/**
 * The ARIA role of an element, which the audit rows and element.rect report: the first token of its role attribute, else the
 * implicit role of its tag and input type, else textbox for a contenteditable element, else null. A group only groups, so its
 * role is null (expose.json, interactive.json).
 */
export function roleOf(element) {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit === "group" ? null : explicit;
  const tag = element.tagName.toLowerCase();
  if (Object.hasOwn(TAG_ROLES, tag)) return TAG_ROLES[tag];
  if (tag === "a") return element.hasAttribute("href") ? "link" : null;
  if (tag === "button") return "button";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return element.multiple || element.size > 1 ? "listbox" : "combobox";
  if (tag === "input") {
    // An input without a known type attribute is a text input, whose type property is text.
    const type = element.type;
    if (element.hasAttribute("list") && LIST_INPUTS.has(type)) return "combobox";
    return Object.hasOwn(INPUT_ROLES, type) ? INPUT_ROLES[type] : null;
  }
  if (element.matches('[contenteditable]:not([contenteditable="false"])')) return "textbox";
  return null;
}

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
    // The audit rows of root: the controls of INTERACTIVE that lack a command or an element name, in document order, each
    // with its role, element name, command and text.
    audit(root) {
      return [...root.querySelectorAll(INTERACTIVE)]
        .filter((element) => !(element.dataset.command !== undefined && element.dataset.expose !== undefined))
        .map((element) => ({
          role: roleOf(element),
          expose: element.dataset.expose ?? null,
          command: element.dataset.command ?? null,
          text: textOf(element),
        }));
    },
    // Marks an element with a command without a listener: a delegated root runs the marked control (docs/spec/exposure.md).
    mark(element, name, params, valueName) {
      check(name);
      element.dataset.command = name;
      if (params && Object.keys(params).length) element.dataset.params = JSON.stringify(params);
      else delete element.dataset.params;
      if (valueName) element.dataset.value = valueName;
      return element;
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

// The text of an audit row: a non-empty aria-label, else a non-empty title, else the text content, trimmed and cut to
// TEXT_LIMIT characters.
function textOf(element) {
  return (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").trim().slice(0, TEXT_LIMIT);
}
