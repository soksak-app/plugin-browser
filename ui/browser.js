import { createEmitter } from "./events.js";

// 이동 단추의 아이콘은 core 아이콘 표(chevron-left, chevron-right, rotate-cw)의 경로다. 뷰 페이지에는 아직
// icon(name) 경로가 없으므로(core docs/spec/plugins.md#view-surfaces) 모듈이 경로를 직접 그린다.
const ICONS = {
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

const css = `:host{display:flex;height:100%;flex-direction:column;background:var(--card);color:var(--fg);font:12px/1.4 var(--font)}#bar{display:flex;gap:4px;padding:4px 6px;border-bottom:1px solid var(--rule);background:var(--card)}#bar button{display:grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--r-xs);background:transparent;color:var(--muted);cursor:pointer}#bar button:hover:not(:disabled){background:var(--inset);color:var(--fg)}#bar svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.95;stroke-linecap:round;stroke-linejoin:round}#bar{align-items:center}input{flex:1;min-width:0;background:transparent;color:inherit;border:1px solid var(--edge);border-radius:5px;padding:3px 8px}#document,#empty{flex:1;min-height:0}#empty{display:flex;align-items:center;justify-content:center;background:var(--card);color:var(--muted);cursor:text}[hidden]{display:none!important}`;

// The document region keeps at most 200 request entries (docs/spec/native-surfaces.md#document-streams), and the status keeps the same bound.
const REQUEST_LOG_LIMIT = 200;
// A read of a document stream fails when no data message arrives within this limit (docs/spec/native-surfaces.md#document-streams).
const STREAM_READ_LIMIT_MS = 10000;

// 기록 단추는 카드 머리 단추(.chrome__act)와 같은 크기, 색, hover 를 쓴다. 획 폭 1.95 는 24 단위 아이콘을
// 14px 로 그릴 때 카드 머리의 16 단위 획 1.3 과 같은 굵기다.
export async function mount(root, context) {
  root.innerHTML = `<style>${css}</style><div id="bar"><button data-command="browser.back" aria-label="뒤로">${icon("chevron-left")}</button><button data-command="browser.forward" aria-label="앞으로">${icon("chevron-right")}</button><button data-command="browser.reload" aria-label="새로 고침">${icon("rotate-cw")}</button><input id="address" data-expose="browser.address" aria-label="주소"></div><div id="document" data-expose="browser.document"></div><div id="empty" data-expose="browser.empty" data-command="browser.address.select">주소를 입력하세요</div>`;
  const emitEvent = createEmitter(context.runtime, "browser");
  const address = root.querySelector("#address");
  const area = root.querySelector("#document");
  const empty = root.querySelector("#empty");
  // 주소가 없으면 문서 요소를 숨겨 합성이 문서 영역을 보이지 않게 배치하고, 빈 상태를 그 자리에 둔다.
  const showEmpty = (url) => {
    area.hidden = url === "";
    empty.hidden = url !== "";
  };
  // The tab state is the address of the document, which a restored or restarted tab opens (core docs/spec/plugins.md#memory-saver).
  // The read is a call of the view channel, so the page awaits it.
  // default: a new tab has no tab state and reads null.
  const stored = await context.tab.state.read();
  if (stored !== null && (typeof stored?.url !== "string" || !/^https?:\/\/[^/]/i.test(stored.url))) {
    throw new Error(`the tab state of browser tab ${context.surfaceId} has no http or https address: ${JSON.stringify(stored)}`);
  }
  // default: a new tab has no stored address.
  const restored = stored?.url ?? null;
  // 첫 클릭으로 얻은 전체 선택은 뗄 때까지 유지하고 이후 클릭은 캐럿 이동을 허용한다.
  let selecting = false;
  const beginSelection = () => { selecting = root.activeElement !== address; };
  const retainSelection = (event) => {
    if (selecting) event.preventDefault();
    selecting = false;
  };
  address.addEventListener("pointerdown", beginSelection);
  address.addEventListener("mouseup", retainSelection);
  // default: 새 탭에는 저장된 주소(restored)가 없다. 주소 없이 빈 상태를 보이고, 아래에서 home 을 연다.
  showEmpty(restored ?? "");
  const composition = await context.composition.create({ regions: { page: area }, overlays: {} });
  const region = composition.region("page");
  const locationListeners = new Set();
  const addressListeners = new Set();
  const addressText = () => ({ value: address.value, focused: root.activeElement === address });
  const notifyAddress = () => { for (const listener of addressListeners) listener(addressText()); };
  // 사용자가 입력한 글자는 이동 명령이나 초점 해제 전까지 문서 상태로 덮지 않는다.
  // 입력 뒤 Enter 로 이동해도 주소창은 초점을 유지하므로 초점이 아니라 입력 여부로 판단한다.
  let editing = false;
  const typed = () => { editing = true; notifyAddress(); };
  const left = () => { editing = false; notifyAddress(); };
  const navigated = (run) => (params) => { editing = false; return run(params); };
  // Every command states its result: ok and micros, and for a failure the code and the text (core docs/spec/logging.md#result-form).
  const reported = (name, run) => async (params) => {
    const started = performance.now();
    const micros = () => Math.round((performance.now() - started) * 1000);
    try {
      const result = await run(params);
      emitEvent("debug", "plugin.browser.command", { name, micros: micros(), ok: true });
      return result;
    } catch (error) {
      emitEvent("warn", "plugin.browser.command", { name, micros: micros(), ok: false, error: `${error?.code ?? -32000}: ${error?.message ?? String(error)}` });
      throw error;
    }
  };
  address.addEventListener("input", typed);
  address.addEventListener("focus", notifyAddress);
  address.addEventListener("blur", left);
  // default: 새 탭에는 저장된 주소(restored)가 없다. 문서를 열기 전의 위치는 빈 주소다.
  let current = { url: restored ?? "", title: "", loading: false, progress: 0, canGoBack: false, canGoForward: false, error: null, scroll: { x: 0, y: 0 } };
  // The address last written as the tab state; a state that keeps the address writes nothing.
  let written = restored;
  // 세션 기록은 문서 영역 상태의 history 다(docs/spec/native-surfaces.md#document-regions).
  let history = { entries: [], index: -1 };
  const historyListeners = new Set();
  // default: 문서 제목이 비어 있으면 주소가 탭의 식별 텍스트다. 제어 문자를 지우고 256자로 자른다.
  const tabTitle = (state) => {
    // default: 문서 제목이 비어 있으면 주소가 탭의 식별 텍스트다.
    const text = (state.title || state.url).replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, 256);
    context.tab.title(text === "" ? null : text);
  };
  // 카드 발은 포인터 아래 링크의 주소를 보인다. 1024자보다 긴 주소는 앞 1023자와 말줄임표로 보인다.
  const tabFooter = (link) => {
    if (typeof link !== "string") throw new Error("the document state has no link");
    context.tab.footer(link === "" ? null : link.length > 1024 ? `${link.slice(0, 1023)}…` : link);
  };
  // A load is the time between the state that reports loading and the next state that does not.
  let loadStarted = null;
  const observe = (state) => {
    if (state.url !== current.url) emitEvent("info", "plugin.browser.navigation", { from: current.url, to: state.url });
    if (state.loading && loadStarted === null) loadStarted = performance.now();
    if (!state.loading && loadStarted !== null) {
      emitEvent("info", "plugin.browser.load", { url: state.url, micros: Math.round((performance.now() - loadStarted) * 1000), ok: state.error === null });
      loadStarted = null;
    }
    if (state.error !== null && state.error !== current.error) {
      emitEvent("error", "plugin.browser.region.failure", { url: state.url, reason: typeof state.error === "string" ? state.error : JSON.stringify(state.error) });
    }
  };
  const show = ({ history: sessionHistory, ...state }) => {
    observe(state);
    current = state;
    tabTitle(state);
    tabFooter(state.link);
    history = sessionHistory;
    for (const listener of historyListeners) listener(history);
    showEmpty(state.url);
    if (state.url !== "" && state.url !== written) {
      written = state.url;
      context.tab.state.write({ url: state.url });
    }
    if (!editing) address.value = state.url;
    for (const listener of locationListeners) listener(current);
    notifyAddress();
  };
  const stopState = region.onState(show);
  // 문서의 페이지 확대는 이 표면의 실제 글자 배율이다(docs/spec/text-size.md). 읽기와 구독은 뷰 채널의 호출이다.
  const textSize = context.runtime.textSize;
  await region.zoom(await textSize.read());
  const stopTextSize = textSize.on((factor) => {
    region.zoom(factor).catch((error) => context.status.report("error", error));
  });
  context.exposure.status("browser.location", () => current, (fn) => {
    locationListeners.add(fn);
    fn(current);
    return () => locationListeners.delete(fn);
  });
  context.exposure.status("browser.history", () => history, (fn) => {
    historyListeners.add(fn);
    fn(history);
    return () => historyListeners.delete(fn);
  });
  // The element and request streams of the document region (docs/spec/native-surfaces.md#document-streams). A watch holds one
  // subscription of the region, and a read takes the first message of its own subscription. A reset sets the value to null.
  // The element value is the latest snapshot. The request value is the request log, which the status keeps at the bound
  // of the region log, because a status delivers only its latest value and each entries message is a batch of new entries.
  // Creates the status functions of one document stream. message.type of the data is dataType, and next(current, message) returns the
  // value after a data message. A failure of a delivered message or of the subscription is reported as a page error.
  const documentStream = (stream, dataType, next) => {
    const watchers = new Set();
    let latest = null;
    let subscription = null;
    const deliver = (value) => {
      latest = value;
      for (const fn of watchers) fn(value);
    };
    // A message of a subscription that is closed and not yet removed by the region is dropped, so it cannot set a stale value.
    const receive = (opening, message) => {
      if (subscription !== opening) return;
      try {
        if (message.type === "reset") return deliver(null);
        if (message.type !== dataType) throw new Error(`document ${stream} stream sent ${message.type}, not ${dataType}`);
        deliver(next(latest, message));
      } catch (error) {
        context.status.report("error", error);
      }
    };
    const open = () => {
      const opening = region.subscribe(stream, (message) => receive(opening, message)).catch((error) => {
        if (subscription === opening) subscription = null;
        context.status.report("error", error);
        return null;
      });
      subscription = opening;
    };
    // Ends the watched subscription and returns a promise that settles after the region has closed it.
    const close = () => {
      const closing = subscription;
      subscription = null;
      latest = null;
      if (closing === null) return Promise.resolve();
      return closing.then((handle) => handle?.close()).catch((error) => { context.status.report("error", error); });
    };
    // Reads the first data message of a new subscription. The subscription ends with the read, and the read fails when no data message
    // arrives within STREAM_READ_LIMIT_MS.
    const readFirst = async () => {
      let resolveFirst;
      let rejectFirst;
      const first = new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
      const opening = region.subscribe(stream, (message) => {
        try {
          if (message.type === dataType) resolveFirst(next(null, message));
          else if (message.type !== "reset") throw new Error(`document ${stream} stream sent ${message.type}, not ${dataType}`);
        } catch (error) {
          rejectFirst(error);
        }
      });
      opening.catch(rejectFirst);
      const timer = setTimeout(() => rejectFirst(new Error(`document ${stream} stream sent no message within ${STREAM_READ_LIMIT_MS}ms`)), STREAM_READ_LIMIT_MS);
      try {
        return await first;
      } finally {
        clearTimeout(timer);
        // default: a failed subscription has no handle to close, and its failure already rejected the read through rejectFirst.
        const handle = await opening.catch(() => null);
        if (handle !== null) await handle.close();
      }
    };
    return {
      close,
      read: () => (latest !== null ? latest : readFirst()),
      subscribe(fn) {
        watchers.add(fn);
        fn(latest);
        if (subscription === null) open();
        return () => {
          watchers.delete(fn);
          if (watchers.size === 0) close();
        };
      },
    };
  };
  const elementStream = documentStream("elements", "snapshot", (_, { nodes, total, truncated }) => ({ nodes, total, truncated }));
  const requestStream = documentStream("requests", "entries", (current, { entries, dropped }) => ({
    entries: [...(current?.entries ?? []), ...entries].slice(-REQUEST_LOG_LIMIT),
    dropped,
  }));
  context.exposure.status("browser.elements", elementStream.read, elementStream.subscribe);
  context.exposure.status("browser.requests", requestStream.read, requestStream.subscribe);
  context.exposure.command("browser.history.go", reported("browser.history.go", navigated(({ index }) => {
    if (!Number.isInteger(index) || index < 0 || index >= history.entries.length) {
      throw new Error(`history entry ${index} is outside the session history of ${history.entries.length} entries`);
    }
    if (index === history.index) return false;
    emitEvent("debug", "plugin.browser.history.move", { from: history.index, to: index });
    return region.entry(index - history.index);
  })));
  context.exposure.status("browser.address.text", addressText, (fn) => {
    addressListeners.add(fn);
    fn(addressText());
    return () => addressListeners.delete(fn);
  });
  context.exposure.command("browser.address.select", reported("browser.address.select", () => { address.focus(); address.select(); return null; }));
  context.exposure.command("browser.navigate", reported("browser.navigate", navigated(({ url }) => {
    // 주소가 없는 이동은 문서 영역에 보내지 않고 여기서 거부한다.
    if (typeof url !== "string" || url === "") throw new Error(`browser.navigate requires an address, not ${JSON.stringify(url)}`);
    return region.load(url).then(() => null);
  })));
  context.exposure.command("browser.back", reported("browser.back", navigated(() => region.back())));
  context.exposure.command("browser.forward", reported("browser.forward", navigated(() => region.forward())));
  context.exposure.command("browser.reload", reported("browser.reload", navigated(() => region.reload())));
  context.exposure.command("browser.stop", reported("browser.stop", () => region.stop()));
  context.exposure.dom("browser.address", address);
  context.exposure.dom("browser.document", area);
  context.exposure.dom("browser.empty", empty);
  context.exposure.dom("browser.back", root.querySelector('[data-command="browser.back"]'));
  context.exposure.dom("browser.forward", root.querySelector('[data-command="browser.forward"]'));
  context.exposure.dom("browser.reload", root.querySelector('[data-command="browser.reload"]'));
  await context.exposure.delegate(root);
  await context.exposure.bind(address, "browser.address.select", {}, { event: "focus" });
  await context.exposure.bind(address, "browser.navigate", () => {
    const value = address.value.trim();
    const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    emitEvent("debug", "plugin.browser.address.commit", { value, url });
    return { url };
  }, { event: "keydown", when: (event) => event.key === "Enter" });
  // A region that restored the session history of an unloaded tab already shows its document, and a load would add an entry
  // after it (core docs/spec/plugins.md#memory-saver). Otherwise the tab opens its stored address, and a new tab opens the
  // setting home; an empty home starts with the empty state.
  if (region.history) {
    emitEvent("info", "plugin.browser.start", { url: restored ?? "", source: "history" });
  } else {
    // default: a new tab has no stored address (restored) and opens the setting home. The read is a call of the view channel.
    const start = restored ?? (await context.runtime.settings.read()).home;
    emitEvent("info", "plugin.browser.start", { url: start, source: restored === null ? "home" : "restored" });
    if (start !== "") await region.load(start);
  }
  context.status.report("ready");
  return { async dispose() {
    address.removeEventListener("pointerdown", beginSelection);
    address.removeEventListener("mouseup", retainSelection);
    address.removeEventListener("input", typed);
    address.removeEventListener("focus", notifyAddress);
    address.removeEventListener("blur", left);
    addressListeners.clear();
    stopState();
    await stopTextSize.then((stop) => stop());
    locationListeners.clear();
    historyListeners.clear();
    // The watched streams end before the region closes, so each subscription is closed by its own handle.
    await Promise.all([elementStream.close(), requestStream.close()]);
    await composition.dispose();
    await context.exposure.dispose();
    root.replaceChildren();
  } };
}
