// The dom provider of the exposure model (core docs/spec/exposure.md, dom): expose.dom(name, provide) with a function registers the
// provider once, each request reads it again, and an index addresses the elements in the order that the provider returns them.
// The model follows the registration and the request forms of core's createExpose, so the browser section views replay on it.
import assert from "node:assert/strict";
import test from "node:test";
import { createExpose } from "./expose.mjs";

// A fake element that records each click and reports its connection.
const element = (label, clicked) => ({
  label,
  isConnected: true,
  click: () => clicked.push(label),
  ownerDocument: { defaultView: { getComputedStyle: () => ({ zoom: "1" }) } },
  parentElement: null,
  getRootNode: () => ({ host: null }),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, x: 0, y: 0 }),
});

// The exposure of one page over the model, with the declared exposes and each reply of the requests in order.
function exposureOf(dom) {
  let handle = null;
  const replies = [];
  const expose = createExpose({
    register: async () => {},
    onRequest: (answer) => { handle = answer; },
    reply: (id, payload) => { replies.push({ id, payload }); },
  }, { status: [], commands: [], dom });
  const request = async (id, method, params) => {
    await handle({ id, method, params });
    return replies.find((reply) => reply.id === id).payload;
  };
  return { expose, request };
}

test("an index of a provider addresses the elements in the order that the provider returns them, read at each request", async () => {
  const clicked = [];
  const { expose, request } = exposureOf([{ name: "sample.row", description: "rows", many: true }]);
  let rows = [element("a", clicked), element("b", clicked)];
  await expose.dom("sample.row", () => rows);
  assert.deepEqual(await request(1, "dom.act", { name: "sample.row", index: 1, action: "click" }), { result: null });
  rows = [element("c", clicked), element("a", clicked)];
  await request(2, "dom.act", { name: "sample.row", index: 0, action: "click" });
  assert.deepEqual(clicked, ["b", "c"]);
});

test("a provider that returns fewer elements refuses an index beyond them", async () => {
  const clicked = [];
  const { expose, request } = exposureOf([{ name: "sample.row", description: "rows", many: true }]);
  let rows = [element("a", clicked), element("b", clicked)];
  await expose.dom("sample.row", () => rows);
  rows = [element("a", clicked)];
  const reply = await request(3, "dom.act", { name: "sample.row", index: 1, action: "click" });
  assert.equal(reply.error?.message, "dom sample.row has no element at index 1");
  assert.deepEqual(clicked, []);
});

test("a name that is not declared many is registered once", async () => {
  const { expose } = exposureOf([{ name: "sample.one", description: "one" }]);
  await expose.dom("sample.one", () => [element("a", [])]);
  await assert.rejects(expose.dom("sample.one", () => [element("b", [])]), /dom sample\.one is already registered/);
});
