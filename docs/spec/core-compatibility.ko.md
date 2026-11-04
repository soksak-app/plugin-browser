# Core 호환성

[English](core-compatibility.md)

Browser package는 `engines.soksak: "^0.0.35"`를 선언한다. 이 범위는 core version-range 규칙에 따라 core F502-13의 release(F502-13-1)인 core release `0.0.35`를 허용하고, 이전 version 및 검증하지 않은 이후 version과의 호환성을 주장하지 않는다. `plugin.json`은 노출하는 element를 `exposes.element`에 선언한다. Core `0.0.34`와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 `element`를 거부하고, core `0.0.35`는 `exposes.dom`을 거부한다. `plugin.json`은 또 `surface.module` 없는 view surface `surface.composition.kind: "view"`와, core `docs/spec/plugins.md#sections`의 section view 형태, 즉 `composition`과 `height`를 가진 `sections`를 선언한다. Package release는 core `0.0.35`의 게시를 기다린다(P114).

진단 `plugin.browser.view.content_frame` event는 공유 view-document observer가 예약한 animation frame마다 하나의 sample을 기록한다. 해당 frame 전에 root ResizeObserver delivery가 여러 번 오면 sample은 첫 delivery를 `firstResizeAtMs`, 최신 delivery를 `resizeAtMs`, 횟수를 `resizeCount`로 기록한다. `firstResizeAtMs <= resizeAtMs <= frameTimeMs`를 요구한다. Count가 1이면 첫 시각과 최신 시각이 같아야 하며, clock 해상도가 낮으면 여러 delivery의 두 시각도 같을 수 있다. Plugin은 이 source field 전체를 검증하고 그대로 전달한다. Event는 크기 관측이며 실제 화면 표시의 증거는 아니다.
