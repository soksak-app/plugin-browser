// Leaves stills of the browser sections in light and dark modes for inspection at original resolution in build/section-design/. An
// image is an observation and no result of a check; the check fails when a section does not mount or reports an error.
import { copyFileSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { APPS, open } from "@soksak/window-check/app.mjs";
import { fresh } from "./start.mjs";

const OUTPUT = new URL("../build/section-design/", import.meta.url).pathname;

/** Waits until the sidebar shows every section mounted and free of errors. */
async function shown(s, sidebar, sections) {
  await s.until("core.sidebars", (bars) => {
    const bar = bars.find((item) => item.sidebar === sidebar);
    return bar !== undefined && sections.every((id) => bar.sections.find((item) => item.id === id)?.mounted)
      && bar.sections.every((item) => item.error === null);
  }, `${sidebar} did not mount ${sections.join(", ")}`);
}

for (const app of Object.values(APPS))
  test(`${app.name}: stills of the browser sections in each mode`, { timeout: 120000 }, async (t) => {
    const s = await open(t, app);
    await fresh(s);
    const card = (await s.get("core.grid")).cards.find((item) => (item.tabs ?? []).some((tab) => tab.plugin === "browser"));
    // The environment of the application declares the sets set-page (DOM, network) and set-browser (tabs, history).
    s.cleanup(() => s.run("core.card.sidebar.set", { card: card.id, side: "left", set: "inherit" }));
    s.cleanup(() => s.run("core.card.sidebar.set", { card: card.id, side: "right", set: "inherit" }));
    await s.run("core.card.sidebar.set", { card: card.id, side: "left", set: "set-page" });
    await s.run("core.card.sidebar.set", { card: card.id, side: "right", set: "set-browser" });
    await shown(s, `${card.id}:left`, ["browser.dom"]);
    await shown(s, `${card.id}:right`, ["browser.tabs"]);
    mkdirSync(OUTPUT, { recursive: true });
    for (const mode of ["light", "dark"]) {
      await s.run("core.settings.set", { patch: { mode } });
      await s.until("core.settings", (value) => value.values.mode === mode, `the mode did not become ${mode}`);
      await s.presented();
      const { path } = await s.request("diagnostics.capture.still", {});
      s.cleanup(() => rmSync(dirname(path), { recursive: true, force: true }));
      copyFileSync(path, join(OUTPUT, `${app.name}-${mode}.png`));
      unlinkSync(path);
      t.diagnostic(`still ${join(OUTPUT, `${app.name}-${mode}.png`)}`);
    }
  });
