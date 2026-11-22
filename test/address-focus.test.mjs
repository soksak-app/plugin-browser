// The address field shows its focus with the border of the width and the focus color of the card focus ring of the theme, and draws
// no default focus ring of WebKit (P135).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the address field shows its focus with a theme border and no default focus ring", { timeout: 5000 }, async () => {
  const source = await readFile(new URL("../ui/browser.js", import.meta.url), "utf8");
  assert.match(source, /input\{[^}]*border:var\(--bw\) solid var\(--edge\)/, "the field border is not the theme border width");
  assert.match(source, /input:focus\{outline:none;border-color:var\(--focus\)\}/, "the focused field keeps the default ring or no focus color");
});
