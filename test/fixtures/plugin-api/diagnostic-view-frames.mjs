// The fixture of @soksak/plugin-api/diagnostic-view-frames. observeViewDocumentFrames starts observing the content box of the root of the
// document on an animation frame, and writes one runtime.log.trace("view.content_frame", fields) event at the animation frame after a
// ResizeObserver delivery. One animation frame callback is pending at a time; a delivery before it runs updates the observation of that
// frame. The returned function stops the observer and cancels the pending frame.
export function observeViewDocumentFrames({ document, log, ResizeObserver, requestAnimationFrame, cancelAnimationFrame, now, timeOriginMs }) {
  const root = document.documentElement;
  let sequence = 0;
  let observation = null;
  let frame = null;
  let observer = null;
  let stopped = false;

  const emit = (frameTime) => {
    frame = null;
    if (stopped || observation === null) return;
    const fields = {
      sequence,
      ...sizeOf(root),
      documentTimeOriginMs: timeOriginMs,
      firstResizeAtMs: observation.firstResizeAtMs,
      resizeAtMs: observation.resizeAtMs,
      resizeCount: observation.resizeCount,
      frameTimeMs: frameTime,
    };
    observation = null;
    sequence += 1;
    log.trace("view.content_frame", fields);
  };

  const scheduleFrame = () => {
    if (frame === null) frame = requestAnimationFrame(emit);
  };

  observer = new ResizeObserver(() => {
    const at = now();
    if (observation === null) observation = { firstResizeAtMs: at, resizeAtMs: at, resizeCount: 0 };
    observation.resizeAtMs = at;
    observation.resizeCount += 1;
    scheduleFrame();
  });
  // The observation starts on an animation frame of its own; the frame of each record is a separate callback.
  const start = requestAnimationFrame(() => {
    if (!stopped) observer.observe(root);
  });

  return () => {
    stopped = true;
    cancelAnimationFrame(start);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    observer?.disconnect();
  };
}

function sizeOf(root) {
  const rect = root.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
