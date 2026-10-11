# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- P18.4: the plugin builds no costly field and has no input that carries `cids`, so the gate and the `cids` of core need no change here.
- P18: the forwarder `ui/events.js` marks the event name it passes with `events: forwarded`, so the catalog check of core reads the names at the calls of `emitEvent`.
- P18: `events.json` declares the events of the surface (`start`, `command`, `address.commit`, `history.move`, `navigation`, `load`, `region.failure`), which `ui/events.js` writes through `context.runtime.log`; `soksak-events` runs in `make test`; reason comments use `(default|silent): <reason>`. Tests: `test/events.test.mjs`; `node --test test/` 32 of 33 pass, the manifest case waits for the core release (P18.3).
- P16: the documents and comments call plugins, sidecars and releases by those words.
