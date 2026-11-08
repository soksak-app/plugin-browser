// Reads the shown content of a browser view through the public value that holds it, and checks that the host presents the document
// that shows it: the empty instruction of a browser without an address (browser.content.read) in the visible root document.
import assert from "node:assert/strict";
import { valueProof, visibleDocument } from "@soksak/window-check/view-content.mjs";

/**
 * The text that the browser view of surface holds as its shown content: the empty instruction that it shows in its visible root
 * document. The caller waits for the presentation of the window (host.window.presented) after this read.
 */
export async function readBrowserContent(s, surface) {
  await visibleDocument(s, surface, "");
  const value = await s.run("browser.content.read", {}, surface);
  assert.equal(value?.kind, "empty", `browser ${surface} does not show its empty instruction: ${JSON.stringify(value)}`);
  return value.instruction;
}

/** Reads the content of surface (readBrowserContent) and returns the proof that it holds expected (valueProof). */
export async function browserContentProof(s, surface, expected) {
  return valueProof(expected, await readBrowserContent(s, surface), `browser ${surface}`);
}
