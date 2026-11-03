// The values of the 히스토리, 네트워크 and DOM sections (#P27.2): the value forms that the page serves for its section statuses,
// which the section views draw (ui/section-view.js).
import assert from "node:assert/strict";
import test from "node:test";
import { elementsValue, historyValue, requestsValue } from "../build/test/ui/browser.js";

test("a DOM row keeps the key of its element after an insertion before it", { timeout: 1000 }, () => {
  const html = { node: 1, depth: 0, tag: "html", id: "", class: "" };
  const kept = { node: 2, depth: 1, tag: "p", id: "", class: "" };
  const inserted = { node: 3, depth: 1, tag: "div", id: "", class: "" };
  const keyOf = (nodes, label) => elementsValue({ nodes, total: nodes.length, truncated: false }).elements[0].nodes[0].children.find((row) => row.label === label).key;
  assert.equal(keyOf([html, inserted, kept], "p"), keyOf([html, kept], "p"));
});

test("an element of a snapshot without a node identity is refused", { timeout: 1000 }, () => {
  const nodes = [{ depth: 0, tag: "html", id: "", class: "" }];
  assert.throws(() => elementsValue({ nodes, total: 1, truncated: false }), /element html has no node identity: undefined/);
});

test("browser.history is one list whose items run browser.history.go and select the current entry", () => {
  const { elements } = historyValue({
    entries: [{ url: "https://a.test/one", title: "One" }, { url: "https://b.test/two", title: "" }],
    index: 1,
  });
  assert.deepEqual(elements, [{
    kind: "list",
    key: "history",
    empty: "기록 없음",
    items: [
      { key: "h0:https://a.test/one", label: "One", command: "browser.history.go", params: { index: 0 }, selected: false },
      { key: "h1:https://b.test/two", label: "https://b.test/two", command: "browser.history.go", params: { index: 1 }, selected: true },
    ],
  }]);
  const empty = historyValue({ entries: [], index: -1 });
  assert.deepEqual(empty.elements[0].items, []);
});

test("browser.elements is one tree nested by depth whose cut is stated in status lines", () => {
  const { elements } = elementsValue({
    nodes: [
      { node: 1, depth: 0, tag: "html", id: "", class: "" },
      { node: 2, depth: 1, tag: "div", id: "box", class: " a  b " },
      { node: 3, depth: 2, tag: "span", id: "", class: "" },
      { node: 4, depth: 1, tag: "p", id: "", class: "" },
    ],
    total: 2000,
    truncated: true,
  });
  const [tree, cut] = elements;
  assert.equal(tree.kind, "tree");
  // The section view shows every element of the snapshot, so each branch is expanded.
  assert.deepEqual(tree.nodes, [{
    key: "n1", label: "html", expanded: true,
    children: [
      { key: "n2", label: "div#box.a.b", expanded: true, children: [{ key: "n3", label: "span" }] },
      { key: "n4", label: "p" },
    ],
  }]);
  assert.deepEqual(cut, { kind: "status-line", key: "elements.cut", text: "4 of 2000" });
});

test("browser.elements holds every level of the snapshot, because the section view draws nested rows at any depth", () => {
  const nodes = [
    { node: 1, depth: 0, tag: "html", id: "", class: "" },
    ...Array.from({ length: 17 }, (_, index) => ({ node: index + 2, depth: index + 1, tag: "div", id: "", class: "" })),
  ];
  const { elements } = elementsValue({ nodes, total: nodes.length, truncated: false });
  assert.equal(elements.length, 1, `a status line was added: ${JSON.stringify(elements.slice(1))}`);
  let depth = 0;
  for (let level = elements[0].nodes; level?.length; level = level[0].children) depth += 1;
  assert.equal(depth, 18, "the tree holds the 18 levels of the snapshot");
});

test("a label keeps its whole text, because the section view draws the text it receives", () => {
  const url = `https://a.test/${"p".repeat(600)}`;
  assert.equal(historyValue({ entries: [{ url, title: "" }], index: 0 }).elements[0].items[0].label, url);
  const request = requestsValue({ entries: [{ type: "script", url, duration: 1 }], dropped: 0 }).elements[0].items[0];
  assert.equal(request.label, `script ${url}`);
});

test("browser.elements without a snapshot is the empty tree", () => {
  assert.deepEqual(elementsValue(null),
    { elements: [{ kind: "tree", key: "elements", empty: "요소 없음", nodes: [] }] });
});

test("browser.requests is one static list with the duration as its detail and dropped in a status line", () => {
  const { elements } = requestsValue({
    entries: [
      { url: "https://a.test/", type: "navigation", start: 0, duration: 120.4 },
      { url: "https://a.test/app.js", type: "script", start: 30, duration: 12.6 },
    ],
    dropped: 3,
  });
  assert.deepEqual(elements, [
    {
      kind: "list",
      key: "requests",
      empty: "요청 없음",
      items: [
        { key: "r3", label: "navigation https://a.test/", detail: "120ms" },
        { key: "r4", label: "script https://a.test/app.js", detail: "13ms" },
      ],
    },
    { kind: "status-line", key: "requests.dropped", text: "3 dropped" },
  ]);
  assert.deepEqual(requestsValue(null),
    { elements: [{ kind: "list", key: "requests", empty: "요청 없음", items: [] }] });
  assert.deepEqual(requestsValue({ entries: [], dropped: 0 }).elements.length, 1, "no dropped count is no status line");
});

// A key that two draws both list names the same row in both draws. A redraw keeps the element of a kept key, so a key that names
// another row in a later draw makes the kept element show that row.
const assertKeysKeepRows = (before, after) => {
  const labels = new Map(before.map((item) => [item.key, item.label]));
  for (const item of after) {
    if (labels.has(item.key)) assert.equal(item.label, labels.get(item.key), `key ${item.key} names another row in the later draw`);
  }
};

test("a browser.requests key names its request, so a request keeps its key when the log drops the entries before it", () => {
  const request = (name) => ({ url: `https://a.test/${name}`, type: "script", start: 0, duration: 1 });
  const before = requestsValue({ entries: [request("a"), request("b"), request("c")], dropped: 0 }).elements[0].items;
  // The region drops the oldest entry and appends one: the keys of b and c stay, and the key of a is no longer listed.
  const after = requestsValue({ entries: [request("b"), request("c"), request("d")], dropped: 1 }).elements[0].items;
  assertKeysKeepRows(before, after);
  const keyOf = (items, name) => items.find((item) => item.label === `script https://a.test/${name}`).key;
  assert.equal(keyOf(after, "b"), keyOf(before, "b"), "the request b keeps its key");
  assert.equal(keyOf(after, "d"), "r3", "the key of a request is its position in the request sequence since the last reset");
});

test("a browser.history key names its entry by index and URL, and a history key names one row in each draw", () => {
  const entry = (name) => ({ url: `https://a.test/${name}?q=1&r=2`, title: "" });
  const before = historyValue({ entries: [entry("a"), entry("b"), entry("c")], index: 2 }).elements[0].items;
  // The back-forward list drops its oldest entry: each remaining entry moves to a lower index.
  const after = historyValue({ entries: [entry("b"), entry("c"), entry("d")], index: 1 }).elements[0].items;
  assertKeysKeepRows(before, after);
  // drawList takes any text as a key, so the key holds the whole URL: two URLs that differ only after a long common start, or
  // only in characters outside a narrow set, name two rows.
  const prefix = `https://a.test/${"x".repeat(200)}`;
  const long = historyValue({ entries: [{ url: `${prefix}?a`, title: "" }, { url: `${prefix}?b`, title: "" }], index: 0 }).elements[0].items;
  assert.deepEqual(long.map((item) => item.key), [`h0:${prefix}?a`, `h1:${prefix}?b`]);
});

test("an element whose depth skips a level is refused with an error", () => {
  assert.throws(() => elementsValue({ nodes: [
    { node: 7, depth: 0, tag: "html", id: "", class: "" },
    { node: 8, depth: 2, tag: "span", id: "", class: "" },
  ], total: 2, truncated: false }), /depth 2/);
});
