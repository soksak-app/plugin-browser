// The workflows run make check after make test (F238-c-24): ci.yml runs make test, then make check; release.yml runs
// make test, then make check, then make pack.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

const WORKFLOWS = {
  "ci.yml": ["test", "check"],
  "release.yml": ["test", "check", "pack"],
};

/** The make targets that the run steps of a workflow file invoke, in order. */
function makeTargets(file) {
  return readFileSync(path.join(ROOT, ".github", "workflows", file), "utf8").split("\n")
    .map((line) => /^\s*-?\s*run:\s*(.*)$/.exec(line)?.[1] ?? "")
    .filter((command) => /^make(\s|$)/.test(command))
    .map((command) => command.split(/\s+/)[1]);
}

test("commit hooks run their SDK checks without replacing the linked source", { timeout: 5000 }, (t) => {
  const sdkDependencies = Object.entries(manifest.devDependencies)
    .filter(([, source]) => typeof source === "string" && source.includes("path:/packages/plugin-api"));
  assert.equal(sdkDependencies.length, 1, "the manifest declares one plugin API source");
  const [sdkPackage] = sdkDependencies[0];
  const sdkLink = path.join(ROOT, "node_modules", ...sdkPackage.split("/"));
  const linkedSource = readlinkSync(sdkLink);
  const directory = mkdtempSync(path.join(os.tmpdir(), "soksak-browser-commit-message-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const message = path.join(directory, "message.txt");
  writeFileSync(message, "chore(hooks): Run SDK checks through Node (#P99-browser)\n\nCall SDK bin files directly so hooks preserve the linked source.\n");
  for (const [hook, args] of [["pre-commit", []], ["commit-msg", [message]]]) {
    const result = spawnSync(path.join(ROOT, ".githooks", hook), args, { cwd: ROOT, encoding: "utf8", timeout: 4000 });
    assert.equal(result.status, 0, `${hook} failed: ${result.stderr || result.stdout}`);
    assert.equal(readlinkSync(sdkLink), linkedSource, `${hook} replaced the linked SDK source`);
  }
});

for (const [file, steps] of Object.entries(WORKFLOWS)) {
  test(`${file} runs ${steps.map((step) => `make ${step}`).join(", then ")} in that order`, () => {
    const targets = makeTargets(file);
    const message = `${file} make targets: ${targets.join(", ") || "none"}`;
    const positions = steps.map((step) => {
      const position = targets.indexOf(step);
      assert.ok(position !== -1, `${file} runs make ${step} (${message})`);
      return position;
    });
    for (let i = 1; i < steps.length; i++) {
      assert.ok(positions[i] > positions[i - 1], `${file} runs make ${steps[i]} after make ${steps[i - 1]} (${message})`);
    }
  });
}
