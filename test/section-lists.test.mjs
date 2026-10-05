// 상태 값이 바뀌어도 바뀌지 않은 항목의 조작 요소는 문서에 남는다(core docs/spec/exposure.md, P13). 누름과 뗌
// 사이에 눌린 요소가 문서에서 빠지면 WebKit 은 click 을 보내지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

function setup(surface) {
  const dom = new JSDOM("<body><div id=root></div></body>");
  globalThis.document = dom.window.document;
  const listeners = new Map();
  const context = {
    surface,
    status: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name); },
    bind: (element, command, params) => { element.dataset.command = command; element.dataset.params = JSON.stringify(params); return element; },
  };
  const send = (name, value, source = surface) => listeners.get(name)(value, source);
  return { dom, root: dom.window.document.getElementById("root"), context, send };
}

test("the tabs section keeps the controls of its tabs when the grid changes", async () => {
  const { dom, root, context, send } = setup("tab-a");
  const { mount } = await import("../ui/sections/tabs.js");
  const section = mount(root, context);
  const grid = (active, label) => ({ cards: [{ id: "c", active, tabs: [
    { id: "tab-a", plugin: "browser", title: "브라우저", label },
    { id: "tab-b", plugin: "browser", title: "브라우저", label: "B" },
  ] }] });
  send("core.grid", grid("tab-a", "A"));
  const before = [...root.querySelectorAll("button")];
  send("core.grid", grid("tab-b", "A2"));
  assert.ok(before.every((button) => button.isConnected), "a grid change took the tab controls out of the document");
  assert.deepEqual([...root.querySelectorAll("button")].map((button) => [button.textContent, button.getAttribute("aria-current")]),
    [["A2", null], ["B", "page"]]);
  section.dispose();
  dom.window.close();
});

test("the history section keeps the controls of its entries when a page is added", async () => {
  const { dom, root, context, send } = setup("tab-a");
  const { mount } = await import("../ui/sections/history.js");
  const section = mount(root, context);
  const first = { title: "A", url: "https://a.example/" };
  send("browser.history", { index: 0, entries: [first] });
  const before = root.querySelector("button");
  send("browser.history", { index: 1, entries: [first, { title: "B", url: "https://b.example/" }] });
  assert.ok(before.isConnected, "a new history entry took the earlier entry's control out of the document");
  assert.deepEqual([...root.querySelectorAll("button")].map((button) => button.getAttribute("aria-current")), [null, "page"]);
  section.dispose();
  dom.window.close();
});
