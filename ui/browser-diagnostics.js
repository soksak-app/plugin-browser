// The browser document-size measurement is available only when diagnostics.json is staged.
import { observeViewDocumentFrames } from "@soksak/plugin-api/diagnostic-view-frames";

const FRAME_FIELDS = Object.freeze([
  "sequence", "width", "height", "documentTimeOriginMs", "firstResizeAtMs", "resizeAtMs", "resizeCount", "frameTimeMs",
]);

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
      stopFrames = observeFrames({
        document,
        log: { trace: (event, fields) => {
          if (!enabled) return;
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
          log(event, fields);
          sequence += 1;
        } },
        ResizeObserver: view.ResizeObserver,
        requestAnimationFrame: view.requestAnimationFrame.bind(view),
        cancelAnimationFrame: view.cancelAnimationFrame.bind(view),
        now: view.performance.now.bind(view.performance),
        timeOriginMs: view.performance.timeOrigin,
      });
      if (typeof stopFrames !== "function") throw new TypeError("shared view-frame observer did not return its stop function");
    } catch (error) {
      enabled = false;
      stopFrames = null;
      throw error;
    }
    return read();
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

export async function attach({ expose, root, readRegionHistoryEntries, log, observeFrames } = {}) {
  if (typeof expose?.command !== "function") throw new TypeError("browser diagnostics require expose.command");
  const measurement = createBrowserViewMeasurement({ root, readRegionHistoryEntries, log, observeFrames });
  await expose.command("browser.view.measure", async ({ action } = {}) => {
    if (action === "start") return measurement.start();
    if (action === "stop") return measurement.stop();
    if (action === "read") return measurement.read();
    throw new TypeError("browser.view.measure action must be start, stop or read");
  });
  return measurement.dispose;
}
