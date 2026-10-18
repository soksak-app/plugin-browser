# Changelog

[한국어](CHANGELOG.ko.md)

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
