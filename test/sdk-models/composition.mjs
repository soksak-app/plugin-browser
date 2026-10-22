// Model of the composition of a view page for the calls that the hwp page makes: composition.create over its document
// regions, region(name), region.load, region.post, region.onState, region.onMessage, region.state, region.history and
// dispose. The wire form is the form of test/fixtures/sdk-cases/view-composition.json. The trace names the regions and
// the elements in separate fields; the page passes an element per region name, and the conformance test adapts the
// trace input once.

/**
 * Creates the composition of the regions and overlays of one view page. request(command, params) posts a view call and
 * resolves with its result; subscribe(name, listener, label) subscribes to a native event of the view and resolves with
 * its remove function. options is {regions: {name: element}, overlays: {name: element}}.
 */
export async function createComposition({ request, subscribe }, { regions, overlays }) {
  const declaration = await request("composition.declaration", null);
  const documents = new Map();
  const label = Symbol("composition");
  for (const [name, element] of Object.entries(regions)) {
    const declared = declaration.regions.find((region) => region.name === name);
    if (declared?.kind !== "document") throw new Error(`surface composition has no document region "${name}"`);
    const attached = await request("document.attach", { name });
    documents.set(name, { region: createRegion(name, attached.history, request), element });
  }
  let disposed = false;
  // Each event reaches the region of its document only while the composition is attached.
  await subscribe("document-state", ({ document, state }) => {
    const entry = documents.get(document);
    if (disposed || !entry) return;
    entry.region.state = state;
    for (const listener of [...entry.region.listeners]) listener(state);
  }, label);
  await subscribe("document-message", ({ document, message }) => {
    const entry = documents.get(document);
    if (disposed || !entry) return;
    for (const listener of [...entry.region.messageListeners]) listener(message);
  }, label);
  // A stream event reaches the subscription of its handle in its document, while the subscription is open.
  await subscribe("document-stream", ({ document, handle, message }) => {
    const entry = documents.get(document);
    if (disposed || !entry) return;
    for (const stream of [...entry.region.streams]) {
      if (stream.handle === handle) stream.listener(message);
    }
  }, label);
  const rect = (element) => element.getBoundingClientRect();
  const viewport = () => ({ width: globalThis.window.innerWidth, height: globalThis.window.innerHeight });
  // right and bottom are the insets from the viewport edges, as the trace records them.
  const place = (name, element) => {
    const box = rect(element);
    const size = viewport();
    return { name, left: box.left, top: box.top, right: size.width - (box.left + box.width), bottom: size.height - (box.top + box.height), visible: true };
  };
  await request("composition.place", {
    regions: [...documents].map(([name, entry]) => place(name, entry.element)),
    overlays: Object.entries(overlays).map(([name, element]) => place(name, element)),
  });
  return {
    kind: declaration.kind,
    region(name) {
      const entry = documents.get(name);
      if (!entry) throw new Error(`surface composition has no region "${name}"`);
      return entry.region;
    },
    // A second dispose returns without a call. A refused detach is reported to the host, and the dispose then fails.
    async dispose() {
      if (disposed) return;
      disposed = true;
      const failures = [];
      for (const name of documents.keys()) {
        try {
          await request("document.detach", { name });
        } catch (error) {
          failures.push(error.message);
        }
      }
      if (failures.length > 0) {
        await request("composition.report", `surface composition cleanup failed: ${failures.join("; ")}`);
        throw new Error("surface composition cleanup failed");
      }
    },
  };
}

function createRegion(name, history, request) {
  const region = {
    name,
    history,
    state: null,
    listeners: new Set(),
    messageListeners: new Set(),
    streams: new Set(),
    onState(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    onMessage(listener) {
      this.messageListeners.add(listener);
      return () => this.messageListeners.delete(listener);
    },
    async load(url) {
      await request("document.load", { name, url });
    },
    async post(message) {
      await request("document.post", { name, message });
    },
    async zoom(zoom) {
      await request("document.zoom", { name, zoom });
    },
    back() {
      return this.go("back");
    },
    forward() {
      return this.go("forward");
    },
    reload() {
      return this.go("reload");
    },
    stop() {
      return this.go("stop");
    },
    entry(offset) {
      if (!Number.isInteger(offset) || offset === 0) throw new Error(`invalid history offset ${offset}`);
      return this.go("entry", { offset });
    },
    // The history actions of the document: back, forward, reload, stop, and entry with an offset.
    async go(action, extra = {}) {
      if (!["back", "forward", "reload", "stop", "entry"].includes(action)) throw new Error(`unknown document action ${action}`);
      await request("document.go", { name, action, ...extra });
    },
    // A stream subscription resolves to a handle, which closes the subscription with document.unsubscribe.
    async subscribe(stream, listener) {
      const handle = await request("document.subscribe", { name, stream });
      const entry = { handle, listener };
      region.streams.add(entry);
      return {
        stream,
        handle,
        async close() {
          region.streams.delete(entry);
          await request("document.unsubscribe", { name, handle });
        },
      };
    },
  };
  return region;
}
