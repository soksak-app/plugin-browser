// Window checks of the sections of the browser plugin against the published core application (docs/features.md P124): the browser
// sections mount as section views of the window sidebar beside the browser tab that they follow, the DOM and network sections list the
// elements and requests of the document, and a browser tab shows the document title or the address while the tabs section is mounted.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { APPS, open } from "@soksak/window-check/app.mjs";
import { fresh } from "./start.mjs";

/** Loopback server that serves a document whose title is the path name. It is closed when the check ends. */
async function serveTitles(s) {
  const server = createServer((request, response) => {
    const name = new URL(request.url, "http://127.0.0.1").pathname.slice(1);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    // inspect has one element and one image request.
    if (name === "untitled") { response.end("<!doctype html><body>untitled"); return; }
    response.end(name === "inspect"
      ? `<!doctype html><title>inspect</title><body><div id="box" class="a b"><img src="/pixel"></div>`
      : `<!doctype html><title>${name}</title><body>${name}`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  s.cleanup(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

for (const app of Object.values(APPS)) {
  test(`${app.name}: the browser sections mount as section views beside the card's browser navigation`, async (t) => {
    const s = await open(t, app);
    await fresh(s);
    s.cleanup(() => s.run("core.settings.reset", { key: "sets" }));
    const base = await serveTitles(s);
    const sidebar = "right";
    const sections = ["browser.tabs", "browser.history"];
    const sets = (await s.get("core.settings")).values.sets;
    await s.run("core.settings.set", { patch: { sets: sets.map((set) => set.id === "set-browser" ? { ...set, sections, layout: "list" } : set) },
      scope: "common" });
    await s.run("core.card.focus", { card: "browser" });
    const of = (sidebars) => sidebars.find((item) => item.sidebar === sidebar);
    const sidebars = await s.until("core.sidebars", (value) => of(value)?.set === "set-browser"
      && sections.every((id) => of(value).sections.find((item) => item.id === id)?.mounted && of(value).sections.find((item) => item.id === id)?.phase === "ready"),
    "the right sidebar did not mount the browser section views");
    const surface = of(sidebars).surface;
    assert.ok(surface, "the browser sections received the browser tab");
    const surfaces = await s.get("core.surfaces");
    for (const { surfaceId } of of(sidebars).sections) {
      assert.ok(surfaces.some((item) => item.kind === "section" && item.sidebar === sidebar && item.surface === surfaceId),
        `core.surfaces does not list the section surface ${surfaceId}`);
    }

    // The two opened documents are the navigation of the browser tab that the sections follow.
    for (const name of ["one", "two"]) {
      await s.run("browser.navigate", { url: `${base}/${name}` }, surface);
      await s.until("browser.location", (at) => at.url === `${base}/${name}` && !at.loading && at.title === name,
        `the browser did not load ${name}`, { surface });
    }

    // The card's browser tabs list both tabs, and the added tab becomes active.
    const { tab } = await s.run("core.card.add-tab", { card: "browser", plugin: "browser" });
    await s.until("core.grid", (grid) => grid.cards.find((card) => card.id === "browser")?.active === tab,
      "the added browser tab did not become active");
    const tabs = (await s.get("core.grid")).cards.find((card) => card.id === "browser").tabs;
    assert.deepEqual(tabs.map((item) => item.id), [surface, tab]);
  });
}

for (const app of Object.values(APPS)) {
  test(`${app.name}: the browser DOM and network sections list the document's elements and requests`, async (t) => {
    const s = await open(t, app);
    await fresh(s);
    s.cleanup(() => s.run("core.settings.reset", { key: "sets" }));
    const base = await serveTitles(s);
    const sidebar = "right";
    const sections = ["browser.dom", "browser.network"];
    const sets = (await s.get("core.settings")).values.sets;
    await s.run("core.settings.set", { patch: { sets: sets.map((set) => set.id === "set-browser" ? { ...set, sections, layout: "list" } : set) },
      scope: "common" });
    await s.run("core.card.focus", { card: "browser" });
    const of = (sidebars) => sidebars.find((item) => item.sidebar === sidebar);
    const sidebars = await s.until("core.sidebars", (value) => of(value)?.set === "set-browser"
      && sections.every((id) => of(value).sections.find((item) => item.id === id)?.mounted),
    "the right sidebar did not mount the DOM and network sections");
    const surface = of(sidebars).surface;
    await s.run("browser.navigate", { url: `${base}/inspect` }, surface);
    // browser.elements is a tree of element labels nested by depth, and browser.requests is a list of `<type> <address>` items.
    const treeOf = (value) => {
      const flat = (nodes, depth) => nodes.flatMap((node) => [`${depth}:${node.label}`, ...flat(node.children ?? [], depth + 1)]);
      return flat(value.elements.find((element) => element.kind === "tree")?.nodes ?? [], 0);
    };
    const listOf = (value) => (value.elements.find((element) => element.kind === "list")?.items ?? []).map((item) => item.label);
    const elements = await s.until("browser.elements", (value) => treeOf(value).some((label) => label.includes("#box")),
      "browser.elements did not report the document's elements", { surface });
    assert.deepEqual(treeOf(elements), ["0:html", "1:head", "2:title", "1:body", "2:div#box.a.b", "3:img"]);
    const requests = await s.until("browser.requests", (value) => listOf(value).includes(`img ${base}/pixel`),
      "browser.requests did not report the image request", { surface });
    assert.deepEqual(listOf(requests), [`navigation ${base}/inspect`, `img ${base}/pixel`]);
    await s.until("core.sidebars", (value) => of(value)?.sections.every((item) => item.phase === "ready" && item.error === null),
      "the DOM and network section views did not report ready");
  });
}

for (const app of Object.values(APPS)) {
  test(`${app.name}: a browser tab shows the document title or the address and the tabs section mounts`, async (t) => {
    const s = await open(t, app);
    await fresh(s);
    s.cleanup(() => s.run("core.settings.reset", { key: "sets" }));
    const base = await serveTitles(s);
    const sets = (await s.get("core.settings")).values.sets;
    await s.run("core.settings.set", { patch: { sets: sets.map((set) => set.id === "set-browser"
      ? { ...set, sections: ["browser.tabs"], layout: "list" } : set) }, scope: "common" });
    await s.run("core.card.focus", { card: "browser" });
    const of = (sidebars) => sidebars.find((item) => item.sidebar === "right");
    const sidebars = await s.until("core.sidebars", (value) => of(value)?.sections.find((item) => item.id === "browser.tabs")?.mounted,
      "the right sidebar did not mount the tabs section");
    const surface = of(sidebars).surface;
    const label = (grid) => grid.cards.flatMap((card) => card.tabs).find((tab) => tab.id === surface)?.label;

    await s.run("browser.navigate", { url: `${base}/titled` }, surface);
    await s.until("core.grid", (grid) => label(grid) === "titled", "the tab did not show the document title");
    await s.run("browser.navigate", { url: `${base}/untitled` }, surface);
    await s.until("core.grid", (grid) => label(grid) === `${base}/untitled`, "the tab did not show the address of an untitled document");
  });
}
