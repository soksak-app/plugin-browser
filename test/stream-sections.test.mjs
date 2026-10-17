// The DOM and Network sections follow the browser statuses of the document streams, and show their snapshot, entries, reset and truncation.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

function setup() {
  const dom = new JSDOM("<body><div id=root></div></body>");
  globalThis.document = dom.window.document;
  const follows = [];
  const context = {
    surface: "browser-a",
    status: (name, fn) => {
      const follow = { name, fn, stopped: false };
      follows.push(follow);
      return () => { follow.stopped = true; };
    },
  };
  const send = (name, value) => {
    for (const follow of follows) if (follow.name === name && !follow.stopped) follow.fn(value, "browser-a");
  };
  return { dom, root: dom.window.document.getElementById("root"), context, follows, send };
}

const items = (root) => [...root.querySelectorAll("li")].map((item) => item.textContent);

test("the DOM section follows browser.elements while mounted and stops following when disposed", async () => {
  const { dom, root, context, follows } = setup();
  const { mount } = await import("../ui/sections/dom.js");
  const section = mount(root, context);
  assert.deepEqual(follows.map((f) => [f.name, f.stopped]), [["browser.elements", false]]);
  section.dispose();
  assert.equal(follows[0].stopped, true, "disposing the section stops following the status");
  dom.window.close();
});

test("the DOM section lists the snapshot in document order and shows the truncation as the count of total", async () => {
  const { dom, root, context, send } = setup();
  const { mount } = await import("../ui/sections/dom.js");
  const section = mount(root, context);
  const nodes = Array.from({ length: 500 }, (_, index) => ({ depth: index === 0 ? 0 : 1, tag: "div", id: `n${index}`, class: index === 0 ? "top" : "" }));
  send("browser.elements", { nodes, total: 2000, truncated: true });
  assert.deepEqual(items(root).slice(0, 2), ["div#n0.top", "div#n1"]);
  assert.equal(items(root).at(-1), "500 of 2000");
  assert.equal(items(root).length, 501);
  send("browser.elements", { nodes: [{ depth: 0, tag: "html", id: "", class: "" }], total: 1, truncated: false });
  assert.deepEqual(items(root), ["html"], "a complete snapshot shows no count");
  section.dispose();
  dom.window.close();
});

test("the DOM section shows no element after a reset of the document", async () => {
  const { dom, root, context, send } = setup();
  const { mount } = await import("../ui/sections/dom.js");
  const section = mount(root, context);
  send("browser.elements", { nodes: [{ depth: 0, tag: "html", id: "", class: "" }], total: 1, truncated: false });
  send("browser.elements", null);
  assert.equal(root.textContent, "요소 없음");
  section.dispose();
  dom.window.close();
});

test("the Network section follows browser.requests while mounted and stops following when disposed", async () => {
  const { dom, root, context, follows } = setup();
  const { mount } = await import("../ui/sections/network.js");
  const section = mount(root, context);
  assert.deepEqual(follows.map((f) => [f.name, f.stopped]), [["browser.requests", false]]);
  section.dispose();
  assert.equal(follows[0].stopped, true, "disposing the section stops following the status");
  dom.window.close();
});

test("the Network section lists the entries it receives and shows dropped when it is not 0", async () => {
  const { dom, root, context, send } = setup();
  const { mount } = await import("../ui/sections/network.js");
  const section = mount(root, context);
  const entries = [
    { url: "https://a.test/", type: "navigation", start: 0, duration: 120.4 },
    { url: "https://a.test/app.js", type: "script", start: 30, duration: 12.6 },
  ];
  send("browser.requests", { entries, dropped: 0 });
  assert.deepEqual(items(root), ["navigation https://a.test/ 120ms", "script https://a.test/app.js 13ms"]);
  send("browser.requests", { entries, dropped: 3 });
  assert.equal(items(root).at(-1), "3 dropped");
  section.dispose();
  dom.window.close();
});

test("the Network section clears its list on reset", async () => {
  const { dom, root, context, send } = setup();
  const { mount } = await import("../ui/sections/network.js");
  const section = mount(root, context);
  send("browser.requests", { entries: [{ url: "https://a.test/", type: "navigation", start: 0, duration: 1 }], dropped: 0 });
  send("browser.requests", null);
  assert.equal(root.textContent, "요청 없음");
  section.dispose();
  dom.window.close();
});
