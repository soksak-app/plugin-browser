// The view of one section of the browser plugin (core docs/spec/plugins.md#sections). One page serves the four sections, and the
// section id of its start values selects the status that the page draws. The page watches core.sidebars for the surface that
// its section follows, and core.surfaces for the plugin of that surface; it watches the status on the surface only when the
// surface belongs to this plugin. It draws the value as DOM, and runs the command of an item that the person clicks on the
// followed surface. The statuses are the statuses of the tab surface (plugin.json exposes.status).

import { createBinder } from "@soksak/plugin-api";

// The status that each section draws.
const STATUS_OF_SECTION = new Map([
  ["browser.dom", "browser.elements"],
  ["browser.network", "browser.requests"],
  ["browser.tabs", "browser.tabs"],
  ["browser.history", "browser.history"],
]);

// The plugin of the view: a section follows only the surfaces of this plugin.
const PLUGIN = "browser";

// The text that the section shows when it follows no surface.
const EMPTY_TEXT = "연결된 탭 없음";

/**
 * Creates the view of one section in root.
 *
 *     runtime       the view runtime of @soksak/plugin-api/view: status.watch(name, listener, {surface}) returns the function that ends
 *                   the watch, and command(name, params, {surface}) returns the promise of the reply
 *     expose        the exposure of the page (createPageExposure of page.js): status(name, read, subscribe) and dom(name, element)
 *     declarations  the exposes of the plugin: the commands that an item may run are declared
 *     root          the element that holds the body of the section
 *     section       the start value {id, sidebar, card} of the section surface
 *     report        report(text) writes one error record to the application log
 *
 * A value that the section draws is the value of its status: {elements}, whose elements are lists, trees and status lines.
 */
export function createSectionView({ runtime, expose, declarations, root, section, report }) {
  const status = STATUS_OF_SECTION.get(section?.id);
  if (status === undefined) throw new Error(`section ${section?.id} is not a section of the browser plugin`);
  if (typeof section.sidebar !== "string" || section.sidebar === "") throw new Error(`section ${section.id} has no sidebar`);
  const doc = root.ownerDocument;
  const commands = new Set((declarations.commands ?? []).map((entry) => entry.name));

  // The surface that core.sidebars reports for the section (undefined before its first value, then a surface id or null), the
  // entries of core.surfaces, and the surface whose status is watched (undefined before the first decision, then a surface id or null).
  let reported;
  let surfaces = [];
  let followed;
  let stopValue = null;

  // The state of the section and the listeners of its status.
  let state = "pending";
  const stateListeners = new Set();
  // The status browser.section: pending until core.sidebars reports the section, empty when it follows no surface of this plugin, and
  // followed when it draws the status of its section on the followed surface.
  const sectionValue = () => ({ section: section.id, state });
  const setState = (next) => {
    if (next === state) return;
    state = next;
    for (const listener of stateListeners) listener(sectionValue());
  };
  expose.status("browser.section", sectionValue, (listener) => {
    stateListeners.add(listener);
    listener(sectionValue());
    return () => stateListeners.delete(listener);
  }).catch((error) => report(`status browser.section: ${error?.message ?? error}`));

  // An element of a draw. A named element carries its dom name, which is the name of its provider.
  const element = (tag, className, text, name) => {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (name !== undefined) node.dataset.expose = name;
    return node;
  };

  // A command of the plugin runs on the surface that the section follows (docs/spec/native-surfaces.md#view-surfaces, view calls).
  const run = (name, params) => runtime.command(name, params, { surface: followed })
    .catch((error) => report(`command ${name}: ${error?.message ?? error}`));

  // The binder connects the items to their commands: a click on an item runs its command through the delegated root. The
  // command of an item is declared by the plugin, and a value that names another command is refused.
  const binder = createBinder(run, {
    check(name) {
      if (!commands.has(name)) throw new Error(`command ${name} is not declared`);
    },
  });
  binder.delegate(root);

  // Each dom name of the section has one provider: it returns the elements of the name that the root holds, in document order.
  // The elements of a draw are new, so a removed element is not held by the provider, and an index follows document order.
  for (const name of ["browser.section.row", "browser.section.item", "browser.section.empty", "browser.section.status"]) {
    expose.dom(name, () => [...root.querySelectorAll(`[data-expose="${name}"]`)])
      .catch((error) => report(`dom ${name}: ${error?.message ?? error}`));
  }

  // An item of a list or a node of a tree: its label is a button when it has a command, and its children nest under it.
  const drawItem = (item) => {
    const row = element("li", undefined, undefined, "browser.section.row");
    if (item.command === undefined) {
      row.append(element("span", undefined, item.label));
    } else {
      const button = element("button", undefined, item.label, "browser.section.item");
      button.type = "button";
      binder.mark(button, item.command, item.params);
      row.append(button);
    }
    if (item.detail !== undefined) row.append(element("span", "detail", item.detail));
    if (item.selected === true) {
      row.classList.add("selected");
      row.setAttribute("aria-current", "true");
    }
    if (item.children !== undefined) row.append(drawNodes("tree", item.children));
    return row;
  };

  const drawNodes = (className, items) => {
    const list = element("ul", className);
    for (const item of items) list.append(drawItem(item));
    return list;
  };

  const drawElement = (value) => {
    if (value.kind === "list") {
      return value.items.length === 0 ? element("p", "empty", value.empty, "browser.section.empty") : drawNodes("list", value.items);
    }
    if (value.kind === "tree") {
      return value.nodes.length === 0 ? element("p", "empty", value.empty, "browser.section.empty") : drawNodes("tree", value.nodes);
    }
    if (value.kind === "status-line") return element("p", "status", value.text, "browser.section.status");
    throw new Error(`section ${section.id} draws no element of kind ${JSON.stringify(value.kind)}`);
  };

  const drawText = (text) => {
    root.replaceChildren(element("p", "empty", text, "browser.section.empty"));
  };

  const draw = (value) => {
    if (!Array.isArray(value?.elements)) {
      report(`section ${section.id} has no elements in the value of ${status}`);
      return;
    }
    root.replaceChildren(...value.elements.map(drawElement));
  };

  const follow = (surface) => {
    if (surface === followed) return;
    stopValue?.();
    stopValue = null;
    followed = surface;
    if (surface === null) {
      setState("empty");
      drawText(EMPTY_TEXT);
      return;
    }
    setState("followed");
    root.replaceChildren();
    stopValue = runtime.status.watch(status, draw, { surface });
  };

  // The surface is watched only when core.surfaces lists it as a surface of this plugin; otherwise the section shows the empty state.
  const decide = () => {
    if (reported === undefined) return;
    const entry = reported === null ? undefined : surfaces.find((item) => item.surface === reported);
    follow(entry?.plugin === PLUGIN ? reported : null);
  };

  runtime.status.watch("core.sidebars", (sidebars) => {
    const own = sidebars.find((bar) => bar.sidebar === section.sidebar)?.sections.find((entry) => entry.id === section.id);
    if (own === undefined) {
      report(`section ${section.id} is not drawn in sidebar ${section.sidebar} of core.sidebars`);
      reported = null;
    } else if (own.surface !== null && typeof own.surface !== "string") {
      report(`section ${section.id} follows ${JSON.stringify(own.surface)} in core.sidebars, which is not a surface`);
      reported = null;
    } else {
      reported = own.surface;
    }
    decide();
  });

  runtime.status.watch("core.surfaces", (value) => {
    surfaces = value;
    decide();
  });
}
