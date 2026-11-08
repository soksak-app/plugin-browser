// Reads the shown content of a browser view through the public value that holds it, and checks that the host presents the document
// that shows it: the empty instruction of a browser without an address (browser.content.read) in the visible root document.
import assert from "node:assert/strict";
import { valueProof } from "@soksak/window-check/view-content.mjs";

/** The visible document region `document` of surface in host.window, or a failure that names what it holds. */
async function visibleDocument(s, surface, document) {
  const host = await s.get("host.window");
  const row = host.documents.find((item) => item.surface === surface && item.document === document);
  assert.ok(row?.visible && row.frame.width > 0 && row.frame.height > 0,
    `${surface} shows no document region ${JSON.stringify(document)}: ${JSON.stringify(row)}`);
  return row;
}

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
