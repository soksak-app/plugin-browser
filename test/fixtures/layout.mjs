// The scroll layout of a view document. jsdom has no layout engine: the sizes of the view are data (the layout of the host fixture), and the scroll offsets
// of an element are the layout of the document, which this fixture gives the body of a view. An offset is clamped to the scroll range of the
// content, and a change of the offset (by the page or by a change of the content) fires a scroll event at the element after the task.
// scrolled() resolves when every scroll event that the layout queued has reached the element.

/**
 * Lays out the element with a view of width by height pixels and the content of its rows: each row is 20 pixels high, and the content is
 * 400 pixels wide when the element holds a row. Returns {scrolled}.
 */
export function layOut(element, { width = 200, height = 100 } = {}) {
  const view = element.ownerDocument.defaultView;
  let queued = 0;
  const waiters = [];
  const rows = () => element.querySelectorAll("li").length;
  const limit = {
    scrollLeft: () => (rows() > 0 ? 400 : width) - width,
    scrollTop: () => Math.max(height, rows() * 20) - height,
  };
  const offsets = { scrollLeft: 0, scrollTop: 0 };
  const move = (name, value) => {
    const next = Math.max(0, Math.min(value, limit[name]()));
    if (next === offsets[name]) return;
    offsets[name] = next;
    queued += 1;
    queueMicrotask(() => {
      element.dispatchEvent(new view.Event("scroll"));
      queued -= 1;
      if (queued === 0) for (const resolve of waiters.splice(0)) resolve();
    });
  };
  for (const name of ["scrollLeft", "scrollTop"]) {
    Object.defineProperty(element, name, {
      configurable: true,
      get: () => { move(name, offsets[name]); return offsets[name]; },
      set: (value) => move(name, value),
    });
  }
  Object.defineProperty(element, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => height });
  Object.defineProperty(element, "scrollWidth", { configurable: true, get: () => width + limit.scrollLeft() });
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => height + limit.scrollTop() });
  return {
    scrolled: () => (queued === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve))),
  };
}
