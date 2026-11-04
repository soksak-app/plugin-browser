# Core compatibility

[한국어](core-compatibility.ko.md)

The browser package declares `engines.soksak: "^0.0.34"`, which admits core release `0.0.34` under the core version-range rules and does not claim compatibility with earlier versions or later unverified versions. Core `0.0.34` accepts its `plugin.json`: the view surface `surface.composition.kind: "view"` without `surface.module`, and the `sections` in the section view form of core `docs/spec/plugins.md#sections`, a `composition` and a `height`.

The diagnostic `plugin.browser.view.content_frame` event records one sample for each animation frame scheduled by the shared view-document observer. If multiple root ResizeObserver deliveries arrive before that frame, the sample reports the first delivery as `firstResizeAtMs`, the latest as `resizeAtMs`, and their number as `resizeCount`. Require `firstResizeAtMs <= resizeAtMs <= frameTimeMs`; a count of one requires equal first and latest timestamps, while coarser clocks may make a multi-delivery interval equal too. The plugin validates and forwards all these source fields unchanged; the event is a size observation, not proof of physical presentation.
