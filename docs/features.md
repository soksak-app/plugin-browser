# Features

[한국어](features.ko.md)

- [o] P1 — P1: Test and pack this plugin as its own repository. Moved on 2026-10-02 from the soksak core repository (checklist item R1-5-3 there), whose history holds the earlier changes. `make test` and `make pack` pass.
- [o] P2 — P1: Paint the address bar in the card colour of each mode. Reported by the user on 2026-10-02: in light mode the address bar stayed dark. The bar painted no background, so the hybrid composition showed the dark colour behind the page (16, 17, 23) while the empty state painted `--card`. Done on 2026-10-02: the bar paints `var(--card)`. Red: the core window check `the address bar paints the card colour in light and dark modes` measured the bar at (16, 17, 23) against a white card on both hosts; Green: it passes on both hosts with this repository installed from the core registry fixture, and `make test` passes.
- [o] P3 — P1: Release version 0.0.2 for soksak core 0.0.2. Done on 2026-10-02: `package.json` declares 0.0.2 and `engines.soksak` `^0.0.2`, and the tests resolve `@soksak/plugin-api` from the core tag `v0.0.2`; `make test` passes on macOS arm64.
