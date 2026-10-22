// Model of drawList of the plugin API for the section lists of the browser page. The behavior is the form of
// test/fixtures/sdk-cases/draw-list.json: an entry keeps the node of its key, each draw updates every entry, nodes are
// reordered to the entry order, and a node that no entry keeps is removed. A duplicate key removes every node of the
// list and refuses the draw.

/**
 * Draws entries into list. key(entry) names an entry, create(entry) makes its node, and update(node, entry) writes it.
 */
const registries = new WeakMap();

export function drawList(list, entries, { key, create, update }) {
  if (!registries.has(list)) registries.set(list, new Map());
  const nodes = registries.get(list);
  const seen = new Set();
  const ordered = [];
  for (const entry of entries) {
    const name = key(entry);
    if (seen.has(name)) {
      list.replaceChildren();
      nodes.clear();
      throw new Error(`drawList: key "${name}" appears twice`);
    }
    seen.add(name);
    let node = nodes.get(name);
    if (node === undefined) {
      node = create(entry);
      nodes.set(name, node);
    }
    update(node, entry);
    ordered.push(node);
  }
  for (const [name, node] of [...nodes]) {
    if (!seen.has(name)) {
      node.remove();
      nodes.delete(name);
    }
  }
  for (const child of [...list.childNodes]) {
    if (!ordered.includes(child)) child.remove();
  }
  ordered.forEach((node, index) => {
    if (list.childNodes[index] !== node) list.insertBefore(node, list.childNodes[index] ?? null);
  });
}
