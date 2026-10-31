// The declared UI values of the 히스토리, 네트워크 and DOM sections (#P27.2, core docs/spec/declared-ui.md): the value
// forms that the page pushes for its section statuses, and the limits that the receiver applies.
import assert from "node:assert/strict";
import test from "node:test";
import { declaredElements, declaredHistory, declaredRequests } from "../build/test/ui/browser.js";

test("browser.history is one list whose items run browser.history.go and select the current entry", () => {
  const { elements } = declaredHistory({
    entries: [{ url: "https://a.test/one", title: "One" }, { url: "https://b.test/two", title: "" }],
    index: 1,
  });
  assert.deepEqual(elements, [{
    kind: "list",
    key: "history",
    empty: "기록 없음",
    items: [
      { key: "h0:https:__a.test_one", label: "One", command: "browser.history.go", params: { index: 0 }, selected: false },
      { key: "h1:https:__b.test_two", label: "https://b.test/two", command: "browser.history.go", params: { index: 1 }, selected: true },
    ],
  }]);
  const empty = declaredHistory({ entries: [], index: -1 });
  assert.deepEqual(empty.elements[0].items, []);
});

test("browser.elements is one tree nested by depth whose cut is stated in status lines", () => {
  const { elements } = declaredElements({
    nodes: [
      { depth: 0, tag: "html", id: "", class: "" },
      { depth: 1, tag: "div", id: "box", class: " a  b " },
      { depth: 2, tag: "span", id: "", class: "" },
      { depth: 1, tag: "p", id: "", class: "" },
    ],
    total: 2000,
    truncated: true,
  });
  const [tree, cut] = elements;
  assert.equal(tree.kind, "tree");
  // Core draws the children of a branch only when its expanded field is true (core docs/spec/declared-ui.md#status-mapping).
  assert.deepEqual(tree.nodes, [{
    key: "n0", label: "html", expanded: true,
    children: [
      { key: "n1", label: "div#box.a.b", expanded: true, children: [{ key: "n2", label: "span" }] },
      { key: "n3", label: "p" },
    ],
  }]);
  assert.deepEqual(cut, { kind: "status-line", key: "elements.cut", text: "4 of 2000" });
});

test("browser.elements states the elements below the 16-level limit of a tree in a status line", () => {
  const nodes = [
    { depth: 0, tag: "html", id: "", class: "" },
    ...Array.from({ length: 15 }, (_, index) => ({ depth: index + 1, tag: "div", id: "", class: "" })),
    { depth: 16, tag: "deep", id: "", class: "" },
    { depth: 17, tag: "deeper", id: "", class: "" },
  ];
  const { elements } = declaredElements({ nodes, total: nodes.length, truncated: false });
  assert.equal(elements.length, 2);
  assert.deepEqual(elements[1], { kind: "status-line", key: "elements.levels", text: "16 단계 아래의 요소 2개는 보이지 않음" });
  let count = 0;
  const visit = (nodes) => {
    for (const node of nodes) {
      count += 1;
      assert.ok(node.children === undefined || node.children.length > 0);
      visit(node.children ?? []);
    }
  };
  visit(elements[0].nodes);
  assert.equal(count, 16, "the tree holds at most 16 levels");
});

test("browser.elements without a snapshot is the empty tree", () => {
  assert.deepEqual(declaredElements(null),
    { elements: [{ kind: "tree", key: "elements", empty: "요소 없음", nodes: [] }] });
});

test("browser.requests is one static list with the duration as its detail and dropped in a status line", () => {
  const { elements } = declaredRequests({
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
  assert.deepEqual(declaredRequests(null),
    { elements: [{ kind: "list", key: "requests", empty: "요청 없음", items: [] }] });
  assert.deepEqual(declaredRequests({ entries: [], dropped: 0 }).elements.length, 1, "no dropped count is no status line");
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
  const before = declaredRequests({ entries: [request("a"), request("b"), request("c")], dropped: 0 }).elements[0].items;
  // The region drops the oldest entry and appends one: the keys of b and c stay, and the key of a is no longer listed.
  const after = declaredRequests({ entries: [request("b"), request("c"), request("d")], dropped: 1 }).elements[0].items;
  assertKeysKeepRows(before, after);
  const keyOf = (items, name) => items.find((item) => item.label === `script https://a.test/${name}`).key;
  assert.equal(keyOf(after, "b"), keyOf(before, "b"), "the request b keeps its key");
  assert.equal(keyOf(after, "d"), "r3", "the key of a request is its position in the request sequence since the last reset");
});

test("a browser.history key names its entry by index and URL, and a history key names one row in each draw", () => {
  const entry = (name) => ({ url: `https://a.test/${name}?q=1&r=2`, title: "" });
  const before = declaredHistory({ entries: [entry("a"), entry("b"), entry("c")], index: 2 }).elements[0].items;
  // The back-forward list drops its oldest entry: each remaining entry moves to a lower index.
  const after = declaredHistory({ entries: [entry("b"), entry("c"), entry("d")], index: 1 }).elements[0].items;
  assertKeysKeepRows(before, after);
  for (const item of [...before, ...after]) {
    assert.match(item.key, /^[A-Za-z0-9._:-]{1,128}$/, `history key ${item.key} is outside the declared key form`);
  }
  const longUrl = `https://a.test/${"x".repeat(2000)}`;
  const [long] = declaredHistory({ entries: [{ url: longUrl, title: "" }], index: 0 }).elements[0].items;
  assert.match(long.key, /^[A-Za-z0-9._:-]{1,128}$/, "a long URL is cut to the key limit");
});

test("an element whose depth skips a level is refused with an error", () => {
  assert.throws(() => declaredElements({ nodes: [
    { depth: 0, tag: "html", id: "", class: "" },
    { depth: 2, tag: "span", id: "", class: "" },
  ], total: 2, truncated: false }), /depth 2/);
});
