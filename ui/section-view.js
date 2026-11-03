// The view of one section of the browser plugin (core docs/spec/plugins.md#sections). One page serves the four sections, and the
// section id of its start values selects the status that the page draws. The page watches core.sidebars for the surface that
// its section follows, and core.surfaces for the plugin of that surface; it watches the status on the surface only when the
// surface belongs to this plugin. It draws the value as DOM, and runs the command of an item that the person clicks on the
// followed surface. The statuses are the statuses of the tab surface (plugin.json exposes.status).

import { createBinder, drawList } from "@soksak/plugin-api";

// The slots of a row of a list or a tree in document order: its label, its detail and its nested children.
const ROW_SLOTS = ["label", "detail", "children"];

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

  // The slot of a row with the name, created at its place in document order when it is missing. A slot keeps its element while
  // its tag and class stay; a slot whose tag or class changes is replaced, and the other slots are not touched.
  const slotOf = (row, name) => [...row.children].find((child) => child.dataset.slot === name);
  const keepSlot = (row, name, tag, className, exposeName) => {
    let node = slotOf(row, name);
    if (node !== undefined && (node.localName !== tag || node.className !== (className ?? ""))) {
      node.remove();
      node = undefined;
    }
    if (node === undefined) {
      node = element(tag, className, undefined, exposeName);
      node.dataset.slot = name;
      const later = ROW_SLOTS.slice(ROW_SLOTS.indexOf(name) + 1).map((other) => slotOf(row, other)).find((child) => child !== undefined);
      row.insertBefore(node, later ?? null);
    }
    return node;
  };
  const dropSlot = (row, name) => slotOf(row, name)?.remove();

  // Edits a row to match its item: its label is a button when it has a command, and its children nest under it. A label whose command
  // appears or disappears changes its tag, so that label is replaced; the row and a label with the same tag keep their elements.
  const updateRow = (row, item) => {
    if (item.selected === true) {
      row.classList.add("selected");
      row.setAttribute("aria-current", "true");
    } else {
      row.classList.remove("selected");
      row.removeAttribute("aria-current");
    }
    if (item.command === undefined) {
      keepSlot(row, "label", "span").textContent = item.label;
    } else {
      const button = keepSlot(row, "label", "button", undefined, "browser.section.item");
      button.type = "button";
      button.textContent = item.label;
      binder.mark(button, item.command, item.params);
    }
    if (item.detail === undefined) dropSlot(row, "detail");
    else keepSlot(row, "detail", "span", "detail").textContent = item.detail;
    if (item.children === undefined) dropSlot(row, "children");
    else drawRows(keepSlot(row, "children", "ul", "tree"), item.children);
  };

  // The keyed reconcile of the rows of a list or a tree is drawList of @soksak/plugin-api, which this plugin already depends on: it keeps
  // the row of a key that stays, creates a row only for a new key, and removes the row of a key that left. A key is the key of the item.
  const drawRows = (list, items) => drawList(list, items, {
    key: (item) => item.key,
    create: () => element("li", undefined, undefined, "browser.section.row"),
    update: updateRow,
  });

  // The shape of an element of a value. A list or a tree without entries is the empty text, so the shape is part of the key of the
  // element: an element whose entries change between empty and not empty is another element, and each element keeps its tag.
  const shapeOf = (value) => {
    if (value.kind === "list") return value.items.length === 0 ? "empty" : "list";
    if (value.kind === "tree") return value.nodes.length === 0 ? "empty" : "tree";
    if (value.kind === "status-line") return "status-line";
    throw new Error(`section ${section.id} draws no element of kind ${JSON.stringify(value.kind)}`);
  };
  const createElement = (value) => {
    const shape = shapeOf(value);
    if (shape === "empty") return element("p", "empty", undefined, "browser.section.empty");
    if (shape === "status-line") return element("p", "status", undefined, "browser.section.status");
    return element("ul", shape);
  };
  const updateElement = (node, value) => {
    const shape = shapeOf(value);
    if (shape === "empty") node.textContent = value.empty;
    else if (shape === "status-line") node.textContent = value.text;
    else drawRows(node, value.kind === "list" ? value.items : value.nodes);
  };

  const drawText = (text) => {
    root.replaceChildren(element("p", "empty", text, "browser.section.empty"));
  };

  const draw = (value) => {
    // The registry gives null while the followed surface has not registered the status, so the section draws nothing until the first value.
    if (value === null) {
      root.replaceChildren();
      return;
    }
    if (!Array.isArray(value?.elements)) {
      report(`section ${section.id} has no elements in the value of ${status}`);
      return;
    }
    drawList(root, value.elements, {
      key: (entry) => `${shapeOf(entry)}:${entry.key}`,
      create: createElement,
      update: updateElement,
    });
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
      // A set that leaves the sidebar changes the status before core removes the views of its sections.
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
