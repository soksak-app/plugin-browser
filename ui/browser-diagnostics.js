// The diagnostic entries of the browser views, available only when diagnostics.json is staged. diagnostics.json declares each name
// once for the plugin, and every view page of the plugin loads this module, so attach registers on each surface the entries that it
// serves: the tab view the document-size measurement browser.view.measure, and each section view the entries of the section view
// benchmark (core docs/spec/plugin-processes.md#section-views).
import { observeViewDocumentFrames } from "@soksak/plugin-api/diagnostic-view-frames";

const FRAME_FIELDS = Object.freeze([
  "sequence", "width", "height", "documentTimeOriginMs", "firstResizeAtMs", "resizeAtMs", "resizeCount", "frameTimeMs",
]);

/** Fails unless event and fields are the content frame number sequence of the shared view-frame observer. */
function checkFrame(event, fields, sequence) {
  if (event !== "view.content_frame" || fields === null || typeof fields !== "object" || Array.isArray(fields)) {
    throw new TypeError("shared view-frame observer returned invalid event data");
  }
  if (Object.keys(fields).length !== FRAME_FIELDS.length || FRAME_FIELDS.some((name) => !Object.hasOwn(fields, name))) {
    throw new TypeError("shared view-frame observer returned unexpected event fields");
  }
  if (!Number.isSafeInteger(fields.sequence) || fields.sequence !== sequence ||
      !Number.isFinite(fields.documentTimeOriginMs) || fields.documentTimeOriginMs < 0 ||
      !Number.isFinite(fields.firstResizeAtMs) || fields.firstResizeAtMs < 0 ||
      !Number.isFinite(fields.resizeAtMs) || fields.resizeAtMs < fields.firstResizeAtMs ||
      !Number.isSafeInteger(fields.resizeCount) || fields.resizeCount < 1 ||
      (fields.resizeCount === 1 && fields.firstResizeAtMs !== fields.resizeAtMs) ||
      !Number.isFinite(fields.frameTimeMs) || fields.frameTimeMs < fields.resizeAtMs ||
      !Number.isFinite(fields.width) || fields.width < 0 ||
      !Number.isFinite(fields.height) || fields.height < 0) {
    throw new TypeError("shared view-frame observer returned invalid sequence, clocks or dimensions");
  }
}

/** The options of the shared view-frame observer for document, whose records go to trace. */
function frameOptions(document, trace) {
  const view = document.defaultView;
  return {
    document,
    log: { trace },
    ResizeObserver: view.ResizeObserver,
    requestAnimationFrame: view.requestAnimationFrame.bind(view),
    cancelAnimationFrame: view.cancelAnimationFrame.bind(view),
    now: view.performance.now.bind(view.performance),
    timeOriginMs: view.performance.timeOrigin,
  };
}

/** The anchor of source-frame clock correlation, read from the clock of the document of view (core docs/spec/plugin-processes.md). */
const sourceClock = (view) => ({ documentTimeOriginMs: view.performance.timeOrigin, sourceNowMs: view.performance.now(), sourceResolutionMs: 1 });

function dimension(root) {
  const rect = root.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width < 0 || !Number.isFinite(rect.height) || rect.height < 0) {
    throw new Error("browser diagnostic documentElement has invalid dimensions");
  }
  return { width: rect.width, height: rect.height };
}

export function createBrowserViewMeasurement({ root, readRegionHistoryEntries, log, observeFrames = observeViewDocumentFrames }) {
  if (!root || typeof root.getBoundingClientRect !== "function" || !root.ownerDocument?.defaultView) {
    throw new TypeError("browser view measurement requires document.documentElement");
  }
  if (typeof readRegionHistoryEntries !== "function") {
    throw new TypeError("browser view measurement requires the document region history reader");
  }
  if (typeof log !== "function") throw new TypeError("browser view measurement requires an event logger");
  if (typeof observeFrames !== "function") throw new TypeError("browser view measurement requires the shared view-frame observer");
  const document = root.ownerDocument;
  const view = document.defaultView;
  let enabled = false;
  let sequence = 0;
  let stopFrames = null;

  const read = () => {
    const historyEntries = view.history?.length;
    if (!Number.isSafeInteger(historyEntries) || historyEntries < 0) {
      throw new Error("browser view measurement has an invalid window.history.length");
    }
    const regionHistoryEntries = readRegionHistoryEntries();
    if (!Number.isSafeInteger(regionHistoryEntries) || regionHistoryEntries < 0) {
      throw new Error("browser view measurement has an invalid document-region history length");
    }
    return { enabled, sequence, historyEntries, regionHistoryEntries, ...dimension(root) };
  };

  const start = () => {
    if (enabled) throw new Error("browser view measurement is already active");
    if (typeof view.ResizeObserver !== "function" || typeof view.requestAnimationFrame !== "function" ||
        typeof view.cancelAnimationFrame !== "function" || typeof view.performance?.now !== "function" ||
        !Number.isFinite(view.performance.timeOrigin)) {
      throw new Error("browser view measurement requires ResizeObserver, animation frames and a performance clock");
    }
    enabled = true;
    sequence = 0;
    try {
      stopFrames = observeFrames(frameOptions(document, (event, fields) => {
        if (!enabled) return;
        checkFrame(event, fields, sequence);
        log(event, fields);
        sequence += 1;
      }));
      if (typeof stopFrames !== "function") throw new TypeError("shared view-frame observer did not return its stop function");
    } catch (error) {
      enabled = false;
      stopFrames = null;
      throw error;
    }
    return { ...read(), sourceClock: sourceClock(view) };
  };

  const stop = () => {
    if (!enabled) throw new Error("browser view measurement is not active");
    enabled = false;
    const stopObserver = stopFrames;
    stopFrames = null;
    stopObserver?.();
    return read();
  };

  return Object.freeze({ start, stop, read, dispose: () => {
    if (enabled) stop();
  } });
}

// The paint of a section view while its content frames are observed (core docs/spec/plugin-processes.md#section-views), so the
// benchmark finds the area of the view in each captured frame. The style rule paints the root and the body, whose card background
// would cover the root, and a theme message that changes the tokens of the root does not change it.
const MARKER_COLOR = Object.freeze([255, 0, 255]);
const MARKER_RULE = `html,body{background:rgb(${MARKER_COLOR.join(", ")}) !important}`;
// The theme tokens of the colors around a view that the benchmark tells apart from the marker: the card, the background and the
// borders, which the view bridge sets on the root of the view document as #rrggbb.
const GEOMETRY_TOKENS = Object.freeze(["--card", "--bg", "--edge", "--rule", "--focus"]);

/** Fails unless the marker color differs from each geometry token on root by more than 4 in at least one channel. */
function checkMarker(root) {
  for (const token of GEOMETRY_TOKENS) {
    const value = root.style.getPropertyValue(token).trim();
    if (!/^#[0-9a-f]{6}$/iu.test(value)) throw new Error(`browser.view.frames reads the theme color ${token} as #rrggbb, not ${JSON.stringify(value)}`);
    const color = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
    if (color.every((channel, index) => Math.abs(channel - MARKER_COLOR[index]) <= 4)) {
      throw new Error(`browser.view.frames marker color ${JSON.stringify(MARKER_COLOR)} is within 4 in every channel of the theme color ${token} ${value}`);
    }
  }
}

// The ready status of each section. The exposure check of core finds a registration by the name that the source writes, so each
// section writes its name here.
const READY_STATUS = new Map([
  ["browser.dom", (expose, read, subscribe) => expose.status("browser.dom.view.ready", read, subscribe)],
  ["browser.network", (expose, read, subscribe) => expose.status("browser.network.view.ready", read, subscribe)],
  ["browser.tabs", (expose, read, subscribe) => expose.status("browser.tabs.view.ready", read, subscribe)],
  ["browser.history", (expose, read, subscribe) => expose.status("browser.history.view.ready", read, subscribe)],
]);

/** The value of a schema field that declares one string as a one-item enum, or null. */
const oneItem = (field) => (Array.isArray(field?.enum) && field.enum.length === 1 && typeof field.enum[0] === "string" ? field.enum[0] : null);

/** The content and language that the diagnostic declaration holds for the ready status of the section, the source of the two values. */
function readyContent(declaration, section) {
  const name = `${section.id}.view.ready`;
  const fields = declaration?.exposes?.status?.find((entry) => entry.name === name)?.schema?.properties;
  const content = oneItem(fields?.content);
  const language = oneItem(fields?.language);
  if (content === null || language === null) {
    throw new TypeError(`browser section diagnostics require the declaration of ${name} with a one-item enum of the strings content and language`);
  }
  return { content, language };
}

/**
 * The entries of a section view (core docs/spec/plugin-processes.md#section-views) on its own surface.
 *
 *     expose         the exposure of the section page: command(name, run) and status(name, read, subscribe)
 *     root           the documentElement of the section page
 *     section        the start value {id, sidebar, card} of the section surface
 *     declaration    the diagnostic declaration of the start values of the page
 *     log            log(event, fields) records one content frame
 *     observeFrames  the shared view-frame observer
 *
 * The benchmark runs without a connected tab, where the section view shows the empty text once core.sidebars reports its section.
 * The ready status of the section reports that text: it is true only while the body shows exactly the declared content, so it is
 * false before the first core.sidebars and while the rows of a followed surface show. Returns the function that ends the watch of
 * the content and stops an active observation.
 */
async function attachSection({ expose, root, section, declaration, log, observeFrames }) {
  const view = root?.ownerDocument?.defaultView;
  if (!view || root !== view.document.documentElement) throw new TypeError("browser section diagnostics require document.documentElement");
  if (typeof expose?.status !== "function") throw new TypeError("browser section diagnostics require expose.status");
  const registerReady = READY_STATUS.get(section.id);
  if (registerReady === undefined) throw new TypeError(`browser section diagnostics have no ready status for section ${JSON.stringify(section.id)}`);
  const { content, language } = readyContent(declaration, section);
  if (typeof log !== "function") throw new TypeError("browser section diagnostics require an event logger");
  if (typeof observeFrames !== "function") throw new TypeError("browser section diagnostics require the shared view-frame observer");

  // Ready is what the section view shows: the frame that renders the text sets it, and a change that removes the text clears it at once.
  let ready = false;
  let frame = null;
  const readyValue = () => ({ ready, content, language });
  const readyListeners = new Set();
  const setReady = (next) => {
    if (next === ready) return;
    ready = next;
    for (const listener of readyListeners) listener(readyValue());
  };
  const showsContent = () => view.document.body.textContent === content;
  const cancelFrame = () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  };
  const followContent = () => {
    if (!showsContent()) {
      cancelFrame();
      setReady(false);
    } else if (!ready && frame === null) {
      frame = view.requestAnimationFrame(() => {
        frame = null;
        setReady(showsContent());
      });
    }
  };
  const contentObserver = new view.MutationObserver(followContent);

  // The observation: the stop function of the observer and the style element of the paint while it is active.
  let active = null;
  const start = () => {
    if (active !== null) throw new Error("browser.view.frames is already active");
    if (typeof view.ResizeObserver !== "function" || typeof view.requestAnimationFrame !== "function" ||
        typeof view.cancelAnimationFrame !== "function" || typeof view.performance?.now !== "function" ||
        !Number.isFinite(view.performance.timeOrigin)) {
      throw new Error("browser.view.frames requires ResizeObserver, animation frames and a performance clock");
    }
    checkMarker(root);
    let sequence = 0;
    let observing = true;
    const stopFrames = observeFrames(frameOptions(root.ownerDocument, (event, fields) => {
      if (!observing) return;
      checkFrame(event, fields, sequence);
      log(event, fields);
      sequence += 1;
    }));
    if (typeof stopFrames !== "function") throw new TypeError("shared view-frame observer did not return its stop function");
    const paint = view.document.createElement("style");
    paint.textContent = MARKER_RULE;
    view.document.head.append(paint);
    active = { stop: () => { observing = false; stopFrames(); }, paint };
    return { enabled: true, sourceClock: sourceClock(view), markerColor: [...MARKER_COLOR] };
  };
  const stop = () => {
    if (active === null) throw new Error("browser.view.frames is not active");
    const { stop: stopObserver, paint } = active;
    active = null;
    stopObserver();
    paint.remove();
    return { enabled: false };
  };

  await Promise.all([
    expose.command("browser.view.frames", async ({ action } = {}) => {
      if (action === "start") return start();
      if (action === "stop") return stop();
      throw new TypeError("browser.view.frames action must be start or stop");
    }),
    expose.command("browser.view.history", async () => {
      const length = view.history?.length;
      if (!Number.isSafeInteger(length) || length < 1) throw new Error(`browser section view history length is invalid: ${JSON.stringify(length)}`);
      return { length };
    }),
    registerReady(expose, readyValue, (listener) => {
      readyListeners.add(listener);
      listener(readyValue());
      return () => readyListeners.delete(listener);
    }),
  ]);
  contentObserver.observe(view.document.body, { childList: true, subtree: true, characterData: true });
  followContent();
  return () => {
    contentObserver.disconnect();
    cancelFrame();
    if (active !== null) stop();
  };
}

/**
 * Registers the diagnostic entries of the surface of a view page. section is the start value section of the surface: null for the
 * tab view, which serves browser.view.measure, and {id, sidebar, card} for a section view, which serves the entries of attachSection.
 * Returns the function that disposes them.
 */
export async function attach({ expose, root, section, readRegionHistoryEntries, declaration, log, observeFrames = observeViewDocumentFrames } = {}) {
  if (typeof expose?.command !== "function") throw new TypeError("browser diagnostics require expose.command");
  if (section === undefined) throw new TypeError("browser diagnostics require the start value section of the surface, null for the tab view");
  if (section !== null) return attachSection({ expose, root, section, declaration, log, observeFrames });
  const measurement = createBrowserViewMeasurement({ root, readRegionHistoryEntries, log, observeFrames });
  await expose.command("browser.view.measure", async ({ action } = {}) => {
    if (action === "start") return measurement.start();
    if (action === "stop") return measurement.stop();
    if (action === "read") return measurement.read();
    throw new TypeError("browser.view.measure action must be start, stop or read");
  });
  return measurement.dispose;
}
