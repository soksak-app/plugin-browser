// The workflows run make check after make test (F238-c-24): ci.yml runs make test, then make check; release.yml runs ci.yml as
// its checks, then make pack.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

const WORKFLOWS = {
  "ci.yml": ["test", "check"],
  "release.yml": ["pack"],
};

/** The make targets that the run steps of a workflow file invoke, in order. */
function makeTargets(file) {
  return readFileSync(path.join(ROOT, ".github", "workflows", file), "utf8").split("\n")
    .map((line) => /^\s*-?\s*run:\s*(.*)$/.exec(line)?.[1] ?? "")
    .filter((command) => /^make(\s|$)/.test(command))
    .map((command) => command.split(/\s+/)[1]);
}

test("commit hooks run their SDK checks without replacing the linked source", { timeout: 5000 }, (t) => {
  const sdkDependencies = Object.entries(manifest.devDependencies).filter(([name]) => name === "@soksak/" + "plugin-api");
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

// The release starts on a push to main, runs ci.yml and the release gate, and downloads the sok of the declared core release;
// no workflow checks out another repository, and the dependency on core is the packed release file of that core release
// (core docs/spec/plugins.md). The package name is built from parts, as the SDK boundary of test/ requires.
const RELEASE_TEXT = readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
const PLUGIN_API = "@soksak/" + "plugin-api";

/** The core release that release.yml declares in CORE_RELEASE. */
function coreRelease() {
  const value = /^\s*CORE_RELEASE:\s*(\S+)\s*$/m.exec(RELEASE_TEXT)?.[1];
  assert.match(value ?? "", /^v\d+\.\d+\.\d+$/, `CORE_RELEASE must name a core release tag, found ${JSON.stringify(value)}`);
  return value;
}

test("the release starts on a push to main and runs ci.yml and the release gate", { timeout: 1000 }, () => {
  assert.match(RELEASE_TEXT, /^on:\n {2}push:\n {4}branches: \[main\]\n/m, "release.yml must start on a push to main");
  assert.doesNotMatch(RELEASE_TEXT, /^\s*tags:/m, "release.yml must not start on a pushed tag");
  assert.match(RELEASE_TEXT, /^\s*uses: \.\/\.github\/workflows\/ci\.yml$/m, "release.yml must run ci.yml as its checks");
  const ci = readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /^on:\n(?: {2}.+\n)* {2}workflow_call:/m, "ci.yml must be callable by release.yml");
  assert.match(RELEASE_TEXT, /soksak-release-gate package\.json docs\/features\.md/, "release.yml must run the release gate");
  assert.match(RELEASE_TEXT, /git ls-remote origin refs\/heads\/main/, "the release must require the run commit to be the head of main");
  assert.match(RELEASE_TEXT, /git ls-remote --tags origin "refs\/tags\/v\$VERSION"/, "the release must require the tag to be absent");
});

test("the release downloads the sok of the declared core release", { timeout: 1000 }, () => {
  const tag = coreRelease();
  assert.match(RELEASE_TEXT, /gh release download "\$CORE_RELEASE" --repo soksak-app\/core --pattern 'sok-\*-darwin-arm64'/,
    `release.yml must download the sok of ${tag}`);
  assert.doesNotMatch(RELEASE_TEXT, /go build/, "release.yml must not build sok from source");
});

test("no workflow checks out another repository", { timeout: 1000 }, () => {
  const folder = path.join(ROOT, ".github", "workflows");
  for (const file of readdirSync(folder).filter((name) => name.endsWith(".yml"))) {
    assert.doesNotMatch(readFileSync(path.join(folder, file), "utf8"), /^\s*repository:/m, `${file} checks out another repository`);
  }
});

test("the dependency on core is the packed release file of the declared core release", { timeout: 1000 }, () => {
  const tag = coreRelease();
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.devDependencies[PLUGIN_API],
    `https://github.com/soksak-app/core/releases/download/${tag}/soksak-plugin-api-${tag.slice(1)}.tgz`);
});
