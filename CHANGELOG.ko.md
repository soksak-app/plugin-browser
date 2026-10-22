# 변경 기록

[English](CHANGELOG.md)

## 미배포

- P27.2: 히스토리, 네트워크, DOM 섹션이 declared UI `status` 섹션이 되었다. page가 섹션마다 declared UI 값을 만들어 workbench에 민다. `browser.history`는 항목이 `browser.history.go`를 실행하고 현재 항목을 고른 하나의 list다. `browser.requests`는 duration을 detail로 둔 정적 list이고 dropped 수를 status line으로 밝힌다. `browser.elements`는 깊이로 중첩된 tree이며 snapshot 잘림과 16 단계 아래 요소를 status line으로 밝힌다. 섹션 모듈 `ui/sections/history.js`, `network.js`, `dom.js`는 지워졌다. 탭 섹션은 module 섹션으로 남는다.

- P27.3: 표면이 view가 되었다. `plugin.json`이 composition `{kind: "view", page: "ui/index.html", regions: [page document native]}`을 선언하고 module은 없다. view page는 `VIEW_IMPORTS`의 정적 import map을 가지고, `window.sokSurface`의 시작 값을 읽고, `sok://browser` origin에서 `@soksak/plugin-api/view`의 `createViewBridge`로 표면 문맥을 만들고, view의 composition으로 문서 영역 `page`를 붙이고, page의 shadow root에 `ui/browser.js`를 mount한다. 선언된 모든 명령, status, dom 이름은 이름을 유지한다. 바 단추는 `icon` 경로가 view page에 없으므로 core 아이콘 경로를 직접 그린다. `@soksak/plugin-api`는 F228을 담은 core main 변경(0.0.20)에 고정되었다. tracked view case 하나가 이유와 함께 생략되어 있다. 그 core commit의 composition controller는 region `history`를 노출하지 않아(F198.19) page가 복원된 session history를 볼 수 없다. P27.5가 이를 추적한다.
- P27.6: view page의 오류 기록에 test가 생겼다. `test/view.test.mjs`의 test `the page reports a failure of the view channel as the declared record of its catalog`는 page 오류가 `runtime.log`를 거쳐 `plugin.browser.report`로 기록되는지 검사한다. Red: `ui/view.js`에서 page 오류 hook을 제거하자 case가 `the page stored no report record`로 실패했다. Green: 바뀌지 않은 page에서 통과한다.

- P26: 새 커밋의 작성자는 `min-0-max <max@blue.tools>`다. `.mailmap`이 이전 이름 `min-median-max`를 잇고, 게시된 커밋은 다시 쓰지 않는다.

## 0.0.6 (2026-10-19)

- P24: document stream(P22), 메모리 절약 선언(P23)과 그 주소 교체(P25)를 담은 version 0.0.6을 release한다. tag `v0.0.6`이 core v0.0.18의 `sok`로 만든 `browser-0.0.6.tgz`를 게시한다.
- P25: 교체. 0.0.6 이전에 열린 browser 탭은 업데이트 뒤 한 번 `home` 설정으로 열린다. 이전 release가 main page `localStorage`의 `soksak.browser.location.<tab id>`에 둔 주소는 더 읽지 않으며, 그 키는 앱의 웹 데이터를 지울 때까지 남는다. 0.0.6부터 주소는 core 탭 상태에, 세션 기록은 core 탭 세션에 유지된다.
- P23: 표면이 `surface.unload` `{format: 1, maxBytes: 16384}`를 선언하고, 주소를 `localStorage` 대신 core 탭 상태로 쓰며, 문서 영역이 세션 기록을 restore하지 않았을 때만 mount에서 load한다. `@soksak/plugin-api`와 `CORE_RELEASE`는 core 0.0.18에서 오고 `engines.soksak`이 이를 요구한다. Red: 저장한 주소 case가 `https://home.test/`를 load함; Green: `make test` 52 of 52 통과.
- P21: `make hooks`가 `.githooks`를 hook 폴더로 정해, commit message의 형식이나 용어 규칙, record 규칙을 어긴 commit이 만들어질 때 거부된다.
- P22: DOM 패널과 Network 패널, 그리고 status `browser.elements`와 `browser.requests`가 document state의 `elements`와 `requests` 대신 region의 document stream을 읽는다. core가 더 이상 보내지 않는 필드다. 잘린 snapshot은 DOM 패널이 `500 of 2000`으로 보이고, Network 패널은 요청 log와 `N dropped`를 보인다. `@soksak/plugin-api`는 stream을 담은 core revision에서 받는다.

## 0.0.5 (2026-10-13)

- P20: 이벤트 계약(P18)과 record 검사(P19)를 담은 version 0.0.5를 release한다. tag `v0.0.5`가 `browser-0.0.5.tgz`를 게시한다.
- P19: `make test`가 record 검사 `soksak-records`를 실행하고, CI가 push된 각 commit message의 형식을 `soksak-commits`로 검사한다.
- P18.3: `@soksak/plugin-api`를 core release 0.0.11에서 받고 `engines.soksak`은 `>=0.0.11`이므로, manifest member `events`가 받아들여지고 `make test`가 설치된 의존성의 event 가드를 실행한다.
- P18.4: plugin은 비싼 field를 만들지 않고 `cids`를 가진 입력이 없으므로, core의 gate와 `cids`에 맞춰 바꿀 것이 없다.
- P18: 전달자 `ui/events.js`가 넘기는 event 이름에 `events: forwarded`를 표시하므로, core의 catalog 검사가 `emitEvent` 호출에서 이름을 읽는다.
- P18: `events.json`이 surface의 event(`start`, `command`, `address.commit`, `history.move`, `navigation`, `load`, `region.failure`)를 선언하고, `ui/events.js`가 `context.runtime.log`로 쓴다. `make test`가 `soksak-events`를 실행하고, 이유 주석은 `(default|silent): <reason>` 형식이다. 시험: `test/events.test.mjs`, `node --test test/` 33개 중 32개 통과, manifest 항목은 core release를 기다린다(P18.3).
- P16: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.
