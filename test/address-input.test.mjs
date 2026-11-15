import assert from "node:assert/strict";
import test from "node:test";
import { TAB_PAGE, callsOf, createRegion, documentState, openTab, pluginLogs, pushState } from "./fixtures/view.mjs";

// The address field of the page: its selection on the first press and its caret after it, the navigation by Enter, and the refusal of an
// empty address. The page is the real ui/view.js in the host fixture (test/fixtures/view.mjs supplies the document region).

const HOME = "https://example.test/old";

/** Opens the tab view at the home address, and returns it with its region, its address field and a dispatcher of pointer events. */
async function setup(t, { home = HOME } = {}) {
  const region = createRegion();
  const view = await openTab(t, { region, home });
  await view.load(TAB_PAGE);
  await view.logged("plugin.browser.start");
  const root = view.window.document.body.lastElementChild.shadowRoot;
  const address = root.querySelector("#address");
  const dispatch = (type) => {
    const event = new view.window.MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
    address.dispatchEvent(event);
    return event;
  };
  return { view, region, root, address, dispatch };
}

// The runs of a page command, as the page records each one in its log.
const runsOf = (view, name) => pluginLogs(view).filter((entry) => entry.event === "command" && entry.fields.name === name).length;

test("initial address focus selects all and native replacement navigates without appending", async (t) => {
  const { view, region, address, dispatch } = await setup(t);
  dispatch("pointerdown");
  address.focus();
  // The focus binding runs browser.address.select, which selects the address, after the focus event.
  await view.settled();
  assert.deepEqual([address.selectionStart, address.selectionEnd], [0, address.value.length]);
  assert.equal(dispatch("mouseup").defaultPrevented, true, "initial release must retain selection");
  await view.settled();
  assert.equal(runsOf(view, "browser.address.select"), 1);
  address.setRangeText("https://example.test/new", address.selectionStart, address.selectionEnd, "end");
  address.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await view.settled();
  assert.deepEqual(region.loads, ["https://example.test/old", "https://example.test/new"]);
  await view.close();
});

test("subsequent address clicks preserve caret editing and disposal removes handlers", async (t) => {
  const { view, address, dispatch } = await setup(t);
  address.focus();
  await view.settled();
  assert.deepEqual([address.selectionStart, address.selectionEnd], [0, address.value.length]);
  address.setSelectionRange(4, 4);
  dispatch("pointerdown");
  assert.equal(dispatch("mouseup").defaultPrevented, false, "later clicks retain normal caret placement");
  assert.deepEqual([address.selectionStart, address.selectionEnd], [4, 4]);
  view.window.document.body.insertAdjacentHTML("afterbegin", "<button id='outside'>outside</button>");
  view.window.document.querySelector("#outside").focus();
  dispatch("pointerdown");
  address.focus();
  assert.equal(dispatch("mouseup").defaultPrevented, true);
  await view.settled();
  assert.equal(runsOf(view, "browser.address.select"), 2);
  await view.close();
  dispatch("pointerdown");
  address.dispatchEvent(new view.window.FocusEvent("focus"));
  assert.equal(dispatch("mouseup").defaultPrevented, false, "disposed handlers must not cancel input");
  assert.equal(runsOf(view, "browser.address.select"), 2, "the disposed focus binding runs no command");
});

test("a navigation that did not come from typing shows its address in the focused field", async (t) => {
  const { view, root, address, region } = await setup(t);
  const type = (text) => {
    address.value = text;
    address.dispatchEvent(new view.window.Event("input", { bubbles: true }));
  };
  address.focus();
  type("https://example.test/typed");
  address.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await view.settled();
  assert.deepEqual(region.loads.at(-1), "https://example.test/typed");
  assert.equal(root.activeElement, address, "the field keeps focus after Enter");
  await view.request("browser.navigate", { url: "https://example.test/other" });
  assert.equal(address.value, "https://example.test/other");
  // 입력 중인 글자는 이동이 아닌 문서 상태 변화로 바뀌지 않는다.
  type("https://example.test/oth");
  await pushState(view, documentState("https://example.test/other", { title: "scrolled" }));
  assert.equal(address.value, "https://example.test/oth");
  await view.request("browser.back", {});
  await pushState(view, documentState("https://example.test/typed", { title: "back" }));
  assert.equal(address.value, "https://example.test/typed");
  await view.close();
});

test("browser.navigate refuses a missing or empty address before the document region", async (t) => {
  const { view, region } = await setup(t);
  const before = [...region.loads];
  for (const params of [{}, { url: "" }, { url: 7 }]) {
    await assert.rejects(view.request("browser.navigate", params), /browser\.navigate requires an address/, JSON.stringify(params));
  }
  assert.deepEqual(region.loads, before, "a refused address reached the document region");
  await view.close();
});

test("the card footer shows the address of the link under the pointer", async (t) => {
  const { view } = await setup(t, { home: "" });
  const long = `https://example.test/${"a".repeat(1100)}`;
  for (const link of ["https://example.test/next", "", long]) {
    await pushState(view, documentState("https://example.test/", { title: "t", link }));
  }
  assert.deepEqual(callsOf(view, "tab.footer"), ["https://example.test/next", null, `${long.slice(0, 1023)}…`].map((text) => text));
  await view.close();
});

test("an empty address refused by Enter is shown as the tab error and reaches no document", async (t) => {
  const { view, address, region } = await setup(t);
  const before = [...region.loads];
  address.value = "   ";
  address.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, composed: true }));
  await view.settled();
  assert.deepEqual(region.loads, before, "an empty address reached the document region");
  const errors = callsOf(view, "tab.error");
  assert.equal(errors.length, 1, `the refusal was not shown; errors ${JSON.stringify(errors)}`);
  assert.match(errors[0], /browser\.navigate requires an address/);
  await view.close();
});
