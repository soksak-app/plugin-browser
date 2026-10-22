# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- P27.2: The 히스토리, 네트워크 and DOM sections are declared UI `status` sections. The page derives the declared UI value of each section and pushes it to the workbench: `browser.history` is one list whose items run `browser.history.go` and select the current entry, `browser.requests` is one static list with the duration as its detail and the dropped count in a status line, and `browser.elements` is one tree nested by depth whose snapshot cut and elements below 16 levels are stated in status lines. The section modules `ui/sections/history.js`, `network.js` and `dom.js` are removed; the 탭 section stays a module section.

- P27.3: The surface is a view. `plugin.json` declares the composition `{kind: "view", page: "ui/index.html", regions: [page document native]}` and no module; the view page carries the static import map of `VIEW_IMPORTS`, reads the start values of `window.sokSurface`, builds the surface context over `createViewBridge` of `@soksak/plugin-api/view` on the `sok://browser` origin, attaches the document region `page` through the composition of the view, and mounts `ui/browser.js` into a shadow root of the page. Every declared command, status and dom name keeps its name; the bar buttons draw the core icon paths directly, because a view page has no `icon` route. `@soksak/plugin-api` is pinned to the core main revision that holds F228 (0.0.20). One tracked view case is skipped with its reason: the composition controller of that core commit exposes no region `history` (F198.19), so the page cannot see a restored session history; P27.5 tracks it.
- P27.6: The error record of the view page has a test. The test `the page reports a failure of the view channel as the declared record of its catalog` in `test/view.test.mjs` checks that a page error is written as `plugin.browser.report` through `runtime.log`. Red: with the page error hook removed from `ui/view.js`, the case failed with `the page stored no report record`; Green: it passes with the unchanged page.

- P26: new commits are authored as `min-0-max <max@blue.tools>`; `.mailmap` maps the former name `min-median-max`, and published commits are not rewritten.

## 0.0.6 (2026-10-19)

- P24: Release version 0.0.6 with the document streams (P22), the memory saver declaration (P23) and its address replacement (P25); the tag `v0.0.6` publishes `browser-0.0.6.tgz` built with `sok` of core v0.0.18.
- P25: Replacement. Each browser tab that was open before 0.0.6 opens once at the `home` setting after the update: the address that earlier releases kept in the main page `localStorage` under `soksak.browser.location.<tab id>` is no longer read, and those keys stay in the web data of the application until it is cleared. From 0.0.6 the address persists in the core tab state and the session history in the core tab session.
- P23: The surface declares `surface.unload` `{format: 1, maxBytes: 16384}`, writes its address as the core tab state instead of `localStorage`, and loads it at mount only when its document region restored no session history; `@soksak/plugin-api` and `CORE_RELEASE` come from core 0.0.18, which `engines.soksak` requires. Red: the stored address case loaded `https://home.test/`; Green: `make test` passes 52 of 52.
- P21: `make hooks` sets `.githooks` as the hook folder, so a commit whose message breaks the commit form or the term rules, or whose records break the record rules, is refused when it is made.
- P22: The DOM and Network panels and the statuses `browser.elements` and `browser.requests` read the document streams of the region instead of `elements` and `requests` of the document state, which core no longer sends. The DOM panel shows `500 of 2000` when the snapshot is truncated, and the Network panel shows the request log and `N dropped`. `@soksak/plugin-api` comes from the core revision that carries the streams.

## 0.0.5 (2026-10-13)

- P20: Release version 0.0.5 with the event contract (P18) and the record checks (P19); the tag `v0.0.5` publishes `browser-0.0.5.tgz`.
- P19: `make test` runs the record check `soksak-records`, and CI checks the form of each pushed commit message with `soksak-commits`.
- P18.3: `@soksak/plugin-api` comes from the core release 0.0.11 and `engines.soksak` is `>=0.0.11`, so the manifest member `events` is accepted and `make test` runs the event guard from the installed dependency.
- P18.4: the plugin builds no costly field and has no input that carries `cids`, so the gate and the `cids` of core need no change here.
- P18: the forwarder `ui/events.js` marks the event name it passes with `events: forwarded`, so the catalog check of core reads the names at the calls of `emitEvent`.
- P18: `events.json` declares the events of the surface (`start`, `command`, `address.commit`, `history.move`, `navigation`, `load`, `region.failure`), which `ui/events.js` writes through `context.runtime.log`; `soksak-events` runs in `make test`; reason comments use `(default|silent): <reason>`. Tests: `test/events.test.mjs`; `node --test test/` 32 of 33 pass, the manifest case waits for the core release (P18.3).
- P16: the documents and comments call plugins, sidecars and releases by those words.
