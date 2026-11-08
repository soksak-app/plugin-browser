// Unit checks of the content reader of the browser view (e2e/view-content.mjs) over a fake session.
import assert from "node:assert/strict";
import test from "node:test";
import { browserContentProof } from "../view-content.mjs";

/** A session whose host.window shows the root document of the surface `probe`; `runs` answers each command by name. */
function session(runs, { visible = true } = {}) {
  const host = { documents: [{ surface: "probe", document: "", visible, frame: { x: 0, y: 0, width: 100, height: 50 } }] };
  return {
    get: async (name) => { assert.equal(name, "host.window"); return host; },
    run: async (name, params, surface) => {
      assert.equal(surface, "probe");
      assert.ok(name in runs, `unexpected command ${name}`);
      return runs[name](params);
    },
  };
}

test("browser content reads the empty instruction that the view shows", { timeout: 5000 }, async () => {
  assert.deepEqual(await browserContentProof(session({ "browser.content.read": () => ({ kind: "empty", instruction: "주소를 입력하세요" }) }),
    "probe", "주소를 입력하세요"), { method: "value", expected: "주소를 입력하세요", actual: "주소를 입력하세요" });
});

test("browser content refuses a document value and a hidden root document", { timeout: 5000 }, async () => {
  await assert.rejects(browserContentProof(session({ "browser.content.read": () => ({ kind: "document", instruction: null }) }),
    "probe", "주소를 입력하세요"), /does not show its empty instruction/);
  await assert.rejects(browserContentProof(session({ "browser.content.read": () => ({ kind: "empty", instruction: "주소를 입력하세요" }) },
    { visible: false }), "probe", "주소를 입력하세요"), /shows no document region ""/);
});
