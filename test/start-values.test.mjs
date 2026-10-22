import assert from "node:assert/strict";
import test from "node:test";
import { startValues } from "../build/test/ui/start-values.js";

const START = { surface: "browser-1", params: {}, origin: { directory: "/work" }, project: { root: "/project" }, declarations: {} };

// The window of the page: the start values and the host of the view.
const windowWith = (sokSurface) => ({ sokSurface, location: { host: "browser" } });

test("the start values with an origin that has a directory are accepted unchanged", () => {
  const start = windowWith(START);
  assert.equal(startValues(start), START);
});

test("the start values with an origin whose directory is null are accepted, because a tab can record no directory", () => {
  const sokSurface = { ...START, origin: { directory: null } };
  assert.equal(startValues(windowWith(sokSurface)), sokSurface);
});

test("the start values with a project of null are accepted", () => {
  const sokSurface = { ...START, project: null };
  assert.equal(startValues(windowWith(sokSurface)), sokSurface);
});

test("the start values without a surface are refused with the host of the view", () => {
  assert.throws(() => startValues(windowWith({ ...START, surface: "" })),
    /the view of browser has no start values: the host provides window\.sokSurface/);
});

for (const [label, change, field] of [
  ["without declarations", { declarations: undefined }, "declarations"],
  ["with declarations that are an array", { declarations: [] }, "declarations"],
  ["with an origin of an empty directory", { origin: { directory: "" } }, "origin"],
  ["with an origin that is text", { origin: "/work" }, "origin"],
  ["with an origin without a directory", { origin: {} }, "origin"],
  ["with a project whose root is not text", { project: { root: 1 } }, "project"],
  ["without params", { params: undefined }, "params"],
]) {
  test(`the start values ${label} are refused and the refusal names ${field}`, () => {
    assert.throws(() => startValues(windowWith({ ...START, ...change })),
      new RegExp(`the start values of the view of browser are not \\{surface, params, origin, project, declarations\\}: ${field} is`));
  });
}
