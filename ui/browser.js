import { createEmitter, errorText } from "./events.js";

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
// A text field of a declared UI value accepts 500 code points (core docs/spec/declared-ui.md#limits), so a label is cut to them.
const cutText = (text) => (text.length > 500 ? [...text].slice(0, 500).join("") : text);
// A tree accepts at most 16 levels (core docs/spec/declared-ui.md#limits); the elements below the limit are counted and stated.
const TREE_LEVELS = 16;

// 기록 단추는 카드 머리 단추(.chrome__act)와 같은 크기, 색, hover 를 쓴다. 획 폭 1.95 는 24 단위 아이콘을
// 14px 로 그릴 때 카드 머리의 16 단위 획 1.3 과 같은 굵기다.
/** The declared UI value of the 히스토리 section from the session history of the document region. */
export const declaredHistory = (history) => ({
  elements: [{
    kind: "list",
    key: "history",
    empty: "기록 없음",
    items: history.entries.map((entry, index) => ({
      key: `h${index}`,
      label: cutText(entry.title || entry.url),
      command: "browser.history.go",
      params: { index },
      selected: index === history.index,
    })),
  }],
});

/** The label of one element of the document, as the tag with its id and classes. */
const elementLabel = (node) => {
  const classes = node.class.trim().split(/\s+/).filter(Boolean).map((name) => `.${name}`).join("");
  return cutText(`${node.tag}${node.id ? `#${node.id}` : ""}${classes}`);
};

/** The declared UI value of the DOM section from one snapshot of the elements stream of the document region. */
export const declaredElements = (elements) => {
  const roots = [];
  const stack = [];
  let count = 0;
  let below = 0;
  // A node whose depth continues an earlier branch nests under it; a depth that skips a level is refused by the check below.
  for (const node of elements?.nodes ?? []) {
    if (node.depth >= TREE_LEVELS) {
      below += 1;
      continue;
    }
    // The walk lists each element after its parent, so an element is at most one level below the last open element; a deeper
    // element has no parent in the list, and it is refused rather than placed at the root.
    if (node.depth > stack.length) throw new Error(`element of depth ${node.depth} has no open parent: the open depth is ${stack.length}`);
    const item = { key: `n${count}`, label: elementLabel(node) };
    count += 1;
    const parent = stack[node.depth - 1];
    if (parent) {
      parent.children ??= [];
      parent.children.push(item);
    } else {
      roots.push(item);
    }
    stack.length = node.depth;
    stack[node.depth] = item;
  }
  const value = [{ kind: "tree", key: "elements", empty: "요소 없음", nodes: roots }];
  if (elements?.truncated) value.push({ kind: "status-line", key: "elements.cut", text: `${elements.nodes.length} of ${elements.total}` });
  if (below > 0) value.push({ kind: "status-line", key: "elements.levels", text: `16 단계 아래의 요소 ${below}개는 보이지 않음` });
  return { elements: value };
};

/** The declared UI value of the 네트워크 section from one value of the requests stream of the document region. */
export const declaredRequests = (requests) => {
  const elements = [{
    kind: "list",
    key: "requests",
    empty: "요청 없음",
    items: (requests?.entries ?? []).map((entry, index) => ({
      key: `r${index}`,
      label: cutText(`${entry.type} ${entry.url}`),
      detail: `${Math.round(entry.duration)}ms`,
    })),
  }];
  if (requests?.dropped) elements.push({ kind: "status-line", key: "requests.dropped", text: `${requests.dropped} dropped` });
  return { elements };
};

// The declared UI value of the 탭 section (#P28): one list of the browser tabs of the card that holds the surface, each row
// running browser.tab.select with its tab, and the active tab selected. Without such a card the list is empty.
const declaredTabs = (grid, surface) => {
  const card = grid?.cards.find((item) => item.tabs.some((tab) => tab.id === surface));
  const tabs = card?.tabs.filter((tab) => tab.plugin === "browser") ?? [];
  return { elements: [{
    kind: "list",
    key: "tabs",
    empty: "브라우저 탭 없음",
    // default: core.grid 의 label 은 문서가 알린 제목이며 알리기 전에는 null 이므로 탭 이름을 보인다.
    items: tabs.map((tab) => ({ key: tab.id, label: tab.label ?? tab.title, command: "browser.tab.select", params: { tab: tab.id }, selected: tab.id === card.active })),
  }] };
};

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
  let disposeDiagnostics = async () => {};
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
  // The second argument of a relayed command is {cids}, the identifiers of the operation of its request (view-commands.json).
  // The record of the command and the calls that the command makes carry them.
  const reported = (name, run) => async (params, options = {}) => {
    const started = performance.now();
    const micros = () => Math.round((performance.now() - started) * 1000);
    try {
      const result = await run(params, options);
      emitEvent("debug", "plugin.browser.command", { name, micros: micros(), ok: true }, options);
      return result;
    } catch (error) {
      emitEvent("warn", "plugin.browser.command", { name, micros: micros(), ok: false, error: `${error?.code ?? -32000}: ${error?.message ?? String(error)}` }, options);
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
  // A failure that the person must see is shown as the tab error, which the error display writes to the application log.
  // The text is cut with an ellipsis at 1024 characters, the limit of the tab error.
  const reportError = (where, error) => {
    const text = `${where} · ${errorText(error)}`;
    context.tab.error(text.length > 1024 ? `${text.slice(0, 1023)}…` : text);
  };
  // The title is the document title, or the address when the title is empty; control characters are removed. A title of more
  // than 256 characters is refused: the tab shows its name, and the refusal is shown as the tab error.
  const tabTitle = (state) => {
    const text = (state.title || state.url).replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
    const length = [...text].length;
    if (length > 256) {
      context.tab.title(null);
      reportError("document title", new Error(`the title has ${length} characters, more than the 256 that a tab title takes`));
      return;
    }
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
    const declared = declaredHistory(history);
    for (const listener of historyListeners) listener(declared);
    context.declared.push("history", declared);
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
  // onState does not replay a state that the region reported before this subscription, and region.state keeps the last one: a
  // restored session history reports its state while the composition is placed.
  if (region.state !== null) show(region.state);
  if (context.diagnostics != null) {
    disposeDiagnostics = await context.diagnostics.attach({
      expose: context.exposure,
      root: root.ownerDocument.documentElement,
      readRegionHistoryEntries: () => history.entries.length,
      log: (_event, fields) => context.runtime.log.trace("view.content_frame", fields),
    });
  }
  // 문서의 페이지 확대는 이 표면의 실제 글자 배율이다(docs/spec/text-size.md). 읽기와 구독은 뷰 채널의 호출이다.
  const textSize = context.runtime.textSize;
  await region.zoom(await textSize.read());
  const stopTextSize = textSize.on((factor) => {
    region.zoom(factor).catch((error) => reportError("page zoom", error));
  });
  context.exposure.status("browser.location", () => current, (fn) => {
    locationListeners.add(fn);
    fn(current);
    return () => locationListeners.delete(fn);
  });
  context.exposure.status("browser.history", () => declaredHistory(history), (fn) => {
    historyListeners.add(fn);
    fn(declaredHistory(history));
    return () => historyListeners.delete(fn);
  });
  // The element and request streams of the document region (docs/spec/native-surfaces.md#document-streams). A watch holds one
  // subscription of the region, and a read takes the first message of its own subscription. A reset sets the value to null.
  // The element value is the latest snapshot. The request value is the request log, which the status keeps at the bound
  // of the region log, because a status delivers only its latest value and each entries message is a batch of new entries.
  // Creates the status functions of one document stream. message.type of the data is dataType, and next(current, message) returns the
  // value after a data message. A failure of a delivered message or of the subscription is reported as a page error.
  // status is the name of the status within the plugin, under which the snapshot is pushed (core docs/spec/declared-ui.md#status-mapping).
  const documentStream = (status, stream, dataType, next, declared) => {
    const watchers = new Set();
    let latest = null;
    let subscription = null;
    const deliver = (value) => {
      latest = value;
      const view = declared(latest);
      context.declared.push(status, view);
      for (const fn of watchers) fn(view);
    };
    // A message of a subscription that is closed and not yet removed by the region is dropped, so it cannot set a stale value.
    const receive = (opening, message) => {
      if (subscription !== opening) return;
      try {
        if (message.type === "reset") return deliver(null);
        if (message.type !== dataType) throw new Error(`document ${stream} stream sent ${message.type}, not ${dataType}`);
        deliver(next(latest, message));
      } catch (error) {
        reportError(`document ${stream} stream`, error);
      }
    };
    const open = () => {
      const opening = region.subscribe(stream, (message) => receive(opening, message)).catch((error) => {
        if (subscription === opening) subscription = null;
        reportError(`document ${stream} subscription`, error);
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
      return closing.then((handle) => handle?.close()).catch((error) => { reportError(`document ${stream} close`, error); });
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
      // A region without a document has no elements and no requests, and its stream sends no message, so the read is the empty value.
      read: () => ((region.state?.url ?? "") === "" ? Promise.resolve(declared(null))
        : latest !== null ? declared(latest) : readFirst().then(declared)),
      subscribe(fn) {
        watchers.add(fn);
        fn(declared(latest));
        if (subscription === null) open();
        return () => {
          watchers.delete(fn);
          if (watchers.size === 0) close();
        };
      },
    };
  };
  const elementStream = documentStream("elements", "elements", "snapshot", (_, { nodes, total, truncated }) => ({ nodes, total, truncated }), declaredElements);
  const requestStream = documentStream("requests", "requests", "entries", (current, { entries, dropped }) => {
    if (!Number.isInteger(dropped) || dropped < 0) throw new Error(`requests entries message has dropped ${JSON.stringify(dropped)}, not a count`);
    const log = [...(current?.entries ?? []), ...entries];
    // The region counts each entry it drops since its last reset, and this status keeps the same bound. An entry that the status
    // sheds beyond the count of the region is lost without a record, so the message is refused.
    const shed = Math.max(0, log.length - REQUEST_LOG_LIMIT);
    const counted = dropped - (current?.dropped ?? 0);
    if (shed > counted) throw new Error(`requests log sheds ${shed} entries, and the region counts ${counted} dropped since the last message`);
    return { entries: log.slice(-REQUEST_LOG_LIMIT), dropped };
  }, declaredRequests);
  context.exposure.status("browser.elements", elementStream.read, elementStream.subscribe);
  context.exposure.status("browser.requests", requestStream.read, requestStream.subscribe);
  // The first snapshot of each section status is its whole value (core docs/spec/plugin-processes.md, rule 2); before the
  // first message of a stream the value is the empty form of its section.
  context.declared.push("elements", declaredElements(null));
  context.declared.push("requests", declaredRequests(null));
  // A region that reported a state before the mount pushed its history in show above; otherwise the history is empty.
  if (region.state === null) context.declared.push("history", declaredHistory(history));
  // The 탭 section follows core.grid: each value of the grid replaces the list of the section (core docs/spec/plugin-processes.md).
  // The status is registered, so the section has this page as its source (core docs/spec/declared-ui.md#status-mapping); its read
  // returns the latest value, and each value is also pushed as the declared UI snapshot of the section.
  let tabsValue = declaredTabs(null, context.surfaceId);
  const tabsListeners = new Set();
  const publishTabs = (value) => {
    tabsValue = value;
    context.declared.push("tabs", value);
    for (const listener of tabsListeners) listener(value);
  };
  context.exposure.status("browser.tabs", () => tabsValue, (fn) => {
    tabsListeners.add(fn);
    fn(tabsValue);
    return () => tabsListeners.delete(fn);
  });
  publishTabs(tabsValue);
  const stopGrid = context.runtime.status.watch("core.grid", (grid) => publishTabs(declaredTabs(grid, context.surfaceId)));
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
  // A row of the 탭 section selects its tab through core.tab.select, with the identifiers of its request.
  context.exposure.command("browser.tab.select", reported("browser.tab.select", ({ tab }, options) => {
    if (typeof tab !== "string" || tab === "") throw new Error(`browser.tab.select requires a tab, not ${JSON.stringify(tab)}`);
    return context.runtime.command("core.tab.select", { tab }, { cids: options.cids });
  }));
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
    // An empty address is passed on as empty, so that browser.navigate refuses it.
    const url = value === "" || /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    // The Enter of the address bar begins the operation of the commit; its first record carries the identifiers.
    emitEvent("info", "plugin.browser.address.commit", { value, url }, { operation: true });
    return { url };
  }, { event: "keydown", when: (event) => event.key === "Enter", failed: (error) => reportError("browser.navigate", error) });
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
    await disposeDiagnostics();
    address.removeEventListener("pointerdown", beginSelection);
    address.removeEventListener("mouseup", retainSelection);
    address.removeEventListener("input", typed);
    address.removeEventListener("focus", notifyAddress);
    address.removeEventListener("blur", left);
    addressListeners.clear();
    stopState();
    stopGrid();
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
