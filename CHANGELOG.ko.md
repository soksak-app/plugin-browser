# 변경 기록

- P126 (core F718-6): call 은 답, cancel, 상대의 끝으로 끝난다. `calls.json` copy 는 core F718-6 의 file 이고, view bridge model 은 timer 를 시작하지 않으며, document stream 의 첫 read 는 첫 message, subscription 의 실패, region 의 page 의 끝, view 의 dispose 로 끝난다. test 는 자기가 확인하는 occurrence 를 기다리고 시간 한도를 두지 않는다. Red: `calls.end.*` 재생과 stream read test 3개가 timer 와 limit 에서 실패했다. Green: 통과한다.
- P125: page test 가 선언된 command 에 P123 이 선언한 `browser.content.read`를 적는다. Red: 남는 이름에서 test 가 실패했다. Green: 통과한다.
- P123 (core F696-4-1): 화면의 빈 상태 안내와 같은 메인 뷰 모델을 읽는 공개 `browser.content.read`를 추가한다. 문서 상태는 로딩 완료를 뜻하지 않는다. reader 부재와 초기 마크업 보존 테스트의 RED 후 수정했고, 소유 테스트 13개와 유지되는 검사를 통과했다. 실제 mygo 앱에 설치한 package의 공개 응답과 원본 해상도 캡처에서 안내를 확인했다.

[English](CHANGELOG.md)

- P122: core 호환성 문서가 `^0.0.40`은 core 0.0.40부터 그 뒤의 모든 0.0 release를 허용한다고 적고, test가 이를 요구한다. Red: 이전 문장에서 test가 실패했다. Green: 통과한다.
- P113: core 0.0.35부터 0.0.39까지는 F502-13 없이 release되어 `exposes.element`를 거부하므로, `engines.soksak`은 F502-13의 core release인 `^0.0.40`이다. Red: version test가 `^0.0.39`에서 실패했다. Green: 통과한다.
- P121: `expose.json` 사본과 digest는 core main의 파일이고, exposure model은 `element.rect`에서 core의 규칙으로 element의 role을 답한다. Red: `expose.element.act-rect-and-refusals` replay가 `role` 없이 실패했고, role test가 이전 규칙에서 실패했다. Green: 통과한다.
- P119: push check와 CI가 kit의 체크리스트 이력 검사를 실행한다. `package.json`이 KR14와 KR15를 담은 kit 0.0.14를 pin하고, `make check-push`가 push 범위에 `sok-check docs --range`를 실행하며, CI가 event의 범위에 `make check-push`를 실행한다. Red: 변경 전 Makefile과 `ci.yml`에서 push check test가 실패했다. Green: 통과한다.
- P120: core 호환 문서가 `package.json`이 선언한 범위 `^0.0.39`을 적는다.
- P118: subject `docs(features): State the checklist as facts (#P16)`는 체크리스트가 P16로 적는 항목이 아니라 지워진 항목의 것이다.
- P113: core F502-13이 exposure 종류 `dom`을 `element`로 바꾸므로, plugin은 노출하는 element를 `exposes.element`에 선언하고 `expose.element`로 등록하며, binder model은 각 audit 행의 ARIA role을 보고한다. `engines.soksak`은 F502-13의 core release인 `^0.0.35`다. Red: element entry에서 test 192개 중 85개가 실패했고, binder audit replay가 tag 행에서 실패했으며, core version test가 `^0.0.34`에서 실패했다. Green: 변경이 닿는 test가 통과한다.
- P117: plugin API case 사본은 `test/fixtures/contract`에 있고, release가 싣는 `contract-copies.json`이 각 사본을 SHA-256과 함께 적으며, test가 선언과 사본을 비교한다. Red: 선언이 없어 test가 실패했다. Green: 통과한다.
- P116: core 호환성 문서는 package가 선언한 범위 `^0.0.34`를 적고, test가 두 문서를 `engines.soksak`과 비교한다. Red: test가 `^0.0.34`에 대한 `^0.0.24`로 실패했다. Green: 통과한다.
- P115: 각 section view가 core의 section view benchmark 항목을 제공한다. `browser.view.frames`는 content frame을 관찰하고 root를 marker color로 칠하며, `browser.view.history`는 session history 길이를 답하고, 자기 section의 ready status(예: `browser.tabs.view.ready`)는 browser tab이 없는 section이 보이는 텍스트 `연결된 탭 없음`을 보일 때만 true다. section view의 화면은 바뀌지 않는다.
- P112: 네 section이 `unload`를 선언하므로 core의 memory saver가 숨은 section을 unload한다. section의 view는 body의 scroll 위치를 따라가는 surface와 함께 tab state로 유지하고, restore된 section은 같은 surface의 행이 그 위치에 닿으면 그 위치로 scroll한다. 행은 따라가는 surface의 status로 돌아온다. Red: manifest test가 `browser.dom declares unload`로, restore case가 `the restored section shows the scroll position that it had`로 실패했다. Green: 통과한다.
- F497-browser: `engines.soksak`은 `^0.0.39`이고, version은 0.0.25이다.
- F494-browser: `engines.soksak`은 `^0.0.38`이고, version은 0.0.24이다.
- F479-browser: release run이 v0.0.23을 게시했고 registry가 이를 올린다.
- F479-browser: `engines.soksak`은 `^0.0.37`이고, version은 0.0.23이다.
- F476-browser: test가 선언된 version을 되풀이하지 않는다.
- F474-browser: release run이 v0.0.22을 게시했고 registry가 이를 올린다.
- F474-browser: `engines.soksak`은 `^0.0.36`이고, version은 0.0.22이다. Red: core version test가 `^0.0.35`에서 실패했다. Green: 통과한다.
- F432-browser: `engines.soksak`은 `^0.0.34`이고, version은 0.0.20이다. Red: core version test가 `^0.0.33`에서 실패했다. Green: 통과한다.
- P27: 통합 window run이 browser check를 통과한 뒤 이 항목은 측정 P27.4를 위해 보류된다.
- P111: commit hook test가 hook을 4초에 끝내지 않아, 느린 runner에서 실패하지 않는다.
- P110: core.sidebars가 더 이상 그리지 않는 section은 watch를 끝내고 보고하지 않는다.
- F402-browser: `engines.soksak`은 `^0.0.33`이고 version은 0.0.19이다. Red: core version test가 `^0.0.32`에서 실패했다. Green: 통과한다.
- P109: 이 저장소는 records kit 0.0.6을 쓰며, 그 release gate는 `Closed:` 사유가 있는 닫힌 항목을 받아들인다.
- P29: version 0.0.18이 수정을 담으므로 hold된 release 항목을 닫았다.
- F332-6-4-4: version 0.0.18을 publish하고 registry에 등록했다.
- F332-6-4-2: DOM 행의 key는 core 0.0.32의 `node` 필드로 요소를 나타내므로, 앞에 요소가 삽입되어도 유지된 행은 같은 요소를 보인다. 이 필드가 없는 요소는 거부한다. version은 0.0.18이다.
- F389-browser: `engines.soksak`은 `^0.0.32`이고, version은 0.0.17다. Red: core version test가 `^0.0.31`에서 실패했다. Green: 통과한다.
- F387-browser: `engines.soksak`은 `^0.0.31`이고, version은 0.0.16다. Red: core version test가 `^0.0.30`에서 실패했다. Green: 통과한다.
- F332-6-5: section 값은 label 전체와 DOM snapshot의 모든 단계를 담는다. section view가 그것을 그리기 때문이며, 지워진 declared UI의 제한은 없어졌다.
- F379-browser: `engines.soksak`은 `^0.0.30`이고, version은 0.0.15다. Red: core version test가 `^0.0.29`에서 실패했다. Green: 통과한다.
- F355-7-browser: 0.0.11판은 plugin release의 `pnpm pack` 형태를 설치하는 첫 core release인 core `^0.0.26`을 요구한다.
- F355-4-browser-1: release는 진단 build만 읽는 진단 module `ui/browser-diagnostics.js`를 담고, 보류된 체크리스트 항목은 core 0.0.25의 release gate가 요구하는 `원인:`과 `재시도 조건:`을 적는다.
- F355-4-browser: `make pack OUT=<folder>`는 `pnpm pack`으로 release를 쓰고, release.yml은 더 이상 core release를 내려받지 않는다. core 0.0.25는 plugin의 `pnpm pack` 파일을 설치하고 `sok plugin pack`이 없기 때문이다. release는 `diagnostics.json`을 담고, `@soksak/plugin-api`는 core release `v0.0.25`에 pin된다.
- F342-browser: view page는 watch 중인 status의 값을 `{name, value, version}`을 담은 view 호출 `changed`로 보낸다. core F342-1이 `createExpose`의 `changed` port를 요구하기 때문이다. 이 변경 전에는 모든 browser view가 `createExpose requires the port changed function`으로 로드에 실패했다. page와 exposure model에서 `status.next` 언급을 제거했고, expose case 사본은 core `contract/expose.json`을 따른다. 검증: `test/page-exposure.test.mjs`가 변경 전 `TypeError [Error]: createExpose requires the port changed function`으로 실패했고 변경 후 통과한다. `pnpm test`가 156개 중 156개를 통과한다. `@soksak/plugin-api`의 pin은 아직 `changed`보다 앞선 v0.0.24이므로, release는 core F342-1을 게시한 release를 기다린다.
- F332-6-6: section view는 따라가는 surface가 status를 아직 등록하지 않은 동안 exposure registry가 주는 null 값을 보고하지 않고 아무것도 그리지 않는다. `elements`가 없는 다른 형태의 값은 계속 보고한다. 검증: `test/section-view.test.mjs`가 변경 전 그 보고로 실패했고 변경 후 통과한다. `make test`가 155개 중 155개를 통과하고, `CORE_PLUGIN_API_DIR`를 core의 `packages/plugin-api`로 지정한 `make check`가 통과한다.
- F332-6-4-1: section의 요청과 history 행은 그 항목을 나타내는 key를 가진다. 요청 key는 마지막 reset 이후 요청 순서에서의 위치(`r<dropped + index>`)이다. 요청 항목에는 식별자가 없기 때문이다. history key는 `h<index>:<URL>`이며, URL은 선언된 key 문자만 남기고 100 code points로 자른다. 따라서 두 그리기가 모두 나열하는 key는 두 그리기에서 같은 행을 나타낸다. 검증: `test/declared-sections.test.mjs`가 변경 전 154개 중 2개 실패했고(`key r0 names another row in the later draw`, `key h0 names another row in the later draw`), 변경 후 154개 중 154개를 통과한다. `make test`가 154개 중 154개를 통과하고, `CORE_PLUGIN_API_DIR`를 core의 `packages/plugin-api`로 지정한 `make check`는 모든 검사를 통과한다. 고정된 SDK 0.0.24의 일반 `make check`는 manifest에서 실패하며, 이는 보류된 F332-6-1 조건이다. DOM 행은 `n<count>` key를 유지한다. F332-6-4-2는 core의 snapshot이 element별 정체를 담을 때까지 보류다.
- F332-6-3: section view는 다시 그려도 상호작용 요소를 유지한다. 각 그리기는 list와 tree의 행을 각 항목의 key로, 최상위 요소를 그 key로, `@soksak/plugin-api`의 `drawList`로 재조정한다. key가 남은 행과 button은 요소를 유지하고 내용과 속성만 바꾸며, 새 key는 요소를 만들고, 떠난 key는 요소를 지운다. 그리기가 끼어든 누름은 누른 요소를 그대로 두므로 놓음이 click을 보낸다. 명령이 생기거나 사라지는 label은 tag가 바뀌므로 교체한다. 검증: `test/section-view.test.mjs`가 변경 전 19개 중 2개 실패했고(`the pressed element is still in the document after the redraw`와 `the element of t2, which stayed, is kept`), 변경 후 19개 중 19개를 통과한다. `make test`가 152개 중 152개를 통과하며, `CORE_PLUGIN_API_DIR`를 core의 `packages/plugin-api`로 지정한 `make check`가 모든 검사를 통과한다. 고정된 SDK 0.0.24의 plain `make check`는 manifest에서 실패하며, 이는 보류된 F332-6-1 조건이다.
- F332-6-2: section view가 보이는 상태를 노출한다. 각 section의 행, 항목, 빈 문구, 상태 줄이 선언된 dom 이름 `browser.section.row`, `browser.section.item`, `browser.section.empty`, `browser.section.status`를 가진다. 각 이름은 provider 하나로 등록되며, provider는 그 element를 document 순서로 돌려주므로 index는 document 순서를 따르고 제거된 element는 목록에 남지 않는다. status `browser.section`은 section이 pending, empty, followed 중 어느 상태인지 보고하며, 각 항목은 `@soksak/plugin-api`의 binder로 명령을 실행한다. exposure model은 `expose.dom`의 provider 형태를 받는다. 검증: 첫 변경은 변경 전 `make test`에서 146개 중 6개가 실패했고 변경 후 146개 중 146개를 통과했다. provider 변경은 커밋된 구현에서 150개 중 4개가 실패했고 변경 후 150개 중 150개를 통과한다. `CORE_PLUGIN_API_DIR`를 core의 `packages/plugin-api`로 지정한 `make check`는 모든 검사를 통과한다. 고정된 SDK 0.0.24는 section 형태를 여전히 거부하므로, 항목은 0.0.25 pin까지 보류된다.
- F332-6-1(후속): section view는 browser plugin의 surface에서만 status를 watch한다. `core.surfaces`를 읽고 다른 plugin이면 빈 상태를 보인다. 명령은 `runtime.command(name, params, {surface})`로 따라가는 surface에서 실행한다. 탭 page는 선언 UI snapshot을 보내지 않으므로 snapshot sender, 그 fixture 사본, model을 제거했다. 검증: 해당 test가 변경 전 41개 중 7개 실패했고(`no watch of a surface of another plugin`, `core.surfaces` watch 누락, `{surface}` 없는 click, snapshot push), 변경 후 41개 중 41개를 통과한다. `make test`가 140개 중 140개를 통과하고, `CORE_PLUGIN_API_DIR`를 core의 `packages/plugin-api`로 지정한 `make check`가 통과한다. 고정된 SDK 0.0.24가 아직 section 형태를 거부하므로 항목은 0.0.25 pin까지 보류된다.
- F332-6-1: browser의 네 sidebar section이 plugin의 view다. `plugin.json`은 각 section을 `ui/section.html`의 `composition` `view`와 `height`로 선언하고, section 페이지(`ui/section-view.js`)는 `core.sidebars`가 그 section에 보고하는 surface의 status 값을 그린다. 검증: 변경 전 `test/section-view.test.mjs`는 `ui/section-view.js`에서 `ERR_MODULE_NOT_FOUND`로, `test/manifest.test.mjs`는 `browser.dom is a view of the section page`로 실패했고, 변경 후 두 파일이 12개 중 12개를 통과하며 `make test`가 138개 중 138개를 통과한다. `make check`는 아직 통과하지 않는다. 고정된 SDK 0.0.24가 section 형태를 거부하고, core의 exposure 검사가 section id를 선언되지 않은 이름으로 읽기 때문이다.
- P31: `make push-check`가 통과한다. push 범위의 commit message만 검사하고(F274-browser), `make check`는 P103이 고정한 core commit에서 통과하므로, pre-push 훅이 더 이상 이 저장소의 push를 막지 않는다.
- P9: CI와 release workflow가 완료되었다. `release.yml`이 tag `v0.0.3`부터 `v0.0.6`까지 release를 게시했고, `ci.yml`은 `.node-version`과 `packageManager`가 선언한 Node.js와 pnpm 버전으로 macOS runner에서 테스트를 실행한다.
- P108: DOM section이 자식이 있는 요소마다 `expanded: true`를 주므로 snapshot의 모든 요소를 보인다. core는 이 field가 없는 branch의 root만 그린다. 검증: `test/declared-sections.test.mjs`가 변경 전에는 `expanded`가 없는 branch를 읽었고 변경 후 통과한다.
- P107: watch가 stream 구독을 잡고 있는 동안의 `browser.elements`나 `browser.requests` 읽기는 watch의 값이다. 전에는 두 번째 구독을 열고 10000 ms까지 기다려서, load 중의 각 status watch가 늦었다.
- P106: region이 state를 보고하지 않았으면 view가 빈 history를 히스토리 section의 첫 snapshot으로 push해서, 문서가 없는 tab에서도 section이 mount된다.
- P105: 문서가 없는 region의 `browser.elements`나 `browser.requests` 읽기는 곧바로 빈 값이다. 전에는 그런 region이 보내지 않는 stream message를 10000 ms 기다렸다.
- P104: view가 각 선언 UI snapshot을 plugin 안의 status 이름(`history`, `elements`, `requests`, `tabs`)으로 push한다. core는 이것을 snapshot의 status로 읽는다. qualified 이름은 sidebar section을 빈 채로 두었다.
- F275-browser: `make install`이 고정된 의존성을 설치한다. 시험, 검사, build는 더 이상 설치하지 않는다.
- P103: `@soksak/plugin-api`와 `CORE_RELEASE`를 복사한 모든 계약 case를 공개하는 core commit에 pin한다.
- F274-browser: pre-push hook은 push가 게시하는 commit message만 검사한다. 시험과 검사는 CI가 실행한다.
- P102: view 시험 model이 core의 UUID page 식별자를 따른다. bridge model은 `window.sokView.page`를 읽고, view channel fake는 `time_origin`과 함께 UUID document를 보내며, 복사한 `view-operations.json`은 core와 같다.
- P32: view의 시작 값이 directory가 null인 origin을 받는다. core docs/spec/native-surfaces.md#view-surfaces가 이를 정한다. 시작 값 검사를 `ui/start-values.js`로 바꾸지 않고 옮겼고, `test/start-values.test.mjs`가 이를 검사한다. Red: `the start values with an origin whose directory is null are accepted, because a tab can record no directory` 검사가 `origin is {"directory":null}`로 실패했다. Green: `make test`가 109개 중 109개를 통과하고, `CORE_PLUGIN_API_DIR`로 `make check`가 통과한다.
## 미배포

- F472-browser: 명령 이름이 하는 일을 말하고, `sok-check commands`가 이를 강제한다.
- F468-browser: 저장소가 `event-sources.json`과 함께 kit의 `soksak-check docs`와 `soksak-check events`를 실행한다.
- F466-browser: 저장소가 local build log와 임시 log의 인용을 보고하는 kit release를 pin한다.
- F467-browser: 저장소가 `@soksak/kit`을 pin한다.
- F463-browser: 저장소가 checks kit과 실행 파일 하나 `soksak-check`를 쓴다.
- F462-browser: `engines.soksak`은 `^0.0.35`이고, version은 0.0.21이다. Red: core version test가 `^0.0.34`에서 실패했다. Green: 통과한다.
- F367-browser: `engines.soksak`은 `^0.0.29`이고, version은 0.0.14다. Red: core version test가 `^0.0.28`에서 실패했다. Green: 통과한다.
- F364-browser: `engines.soksak`은 `^0.0.28`이고, version은 0.0.13다. Red: core version test가 `^0.0.27`에서 실패했다. Green: 통과한다.
- F360-browser: `engines.soksak`는 `^0.0.27`이므로 core 0.0.27이 plugin을 설치하며, version은 0.0.12다. Red: `the browser package requires only core 0.0.27`가 `^0.0.26`에서 실패했다. Green: 통과한다.
- F355-3-4-browser: 검사는 core의 plugin API 대신 records kit과 events kit release에서 온다. application이 설치할 때 manifest를 검증하고 registry 검사가 exposed 이름을 각 listed core와 비교하므로, manifest, exposure, engines, case 복사본 검사와 `CORE_PLUGIN_API_DIR`는 지웠다. Red: `the checks come from the kit releases, and no check reads the plugin API of core`가 실패했다. Green: 통과하고, `make test`와 `make check`가 통과한다.
- F336-browser: 0.0.10판은 core 0.0.25가 필요하다.
- F332-6-4-3: history 행 key는 URL 전체를 담는다. 그래서 긴 공통 앞부분 뒤에서만 다르거나 문장 부호에서만 다른 두 항목은 두 행이다.
- F326-browser: version 0.0.9은 core `^0.0.24`를 요구하고 core `v0.0.24`의 plugin API release file과 `sok`를 쓴다.
- F324-browser: version 0.0.8은 core `^0.0.23`을 요구하고, core `v0.0.23`의 plugin API release file을 쓰며, core `v0.0.23` Tauri host application zip 안의 `sok`로 release를 pack한다.
- F272-browser: `main`에 push하면 tag가 없을 때 `soksak-release-gate`로 선언된 version을 core release `v0.0.21`의 `sok`와 함께 release한다. `@soksak/plugin-api`에 대한 의존은 그 release의 pack 파일이다. 어떤 workflow도 core를 checkout하지 않는다.
- P101-browser: Hook 검증을 실제 실행 방식으로 유지한다. Hook owner가 이 manifest에 선언된 plugin API source에서 연결된 package 경로를 찾고 두 hook을 실행하면서 development link가 바뀌지 않는지 확인한다. 정적 hook command mirror는 제거했다. Boundary와 workflow owner가 6/6, record checker가 69개 file 통과한다. View consumer는 재실행하지 않았다.

- P100-browser: Browser 테스트 host와 bridge model을 현재 view log contract에 맞춘다. Host fake는 clock 요청에 응답하고 batch에서 선언된 plugin event를 기록하며, 거부된 batch를 error route로 전달하고 그 route도 실패할 때만 보고한다. 집중 view owner 22/22, operation owner 2/2, operation conformance 1/1, boundary 및 workflow owner 7/7 통과한다. 집중 needle Red는 workflow test의 hook command 두 줄을 찾았으며 이제 전체 package 이름을 검사 대상 한 줄에 쓰지 않고 선언된 실행 경로를 구성한다. package 전체 suite는 재실행하지 않았다.

- P99-browser: Commit-time SDK 검사를 선언된 Node bin 파일로 직접 실행한다. Record와 commit message 검사는 hook에서 pnpm을 실행하지 않는다. 기존 `pnpm exec` hook은 lockfile SDK를 설치하고 연결된 source를 교체했다. 두 hook을 실행하는 owner는 2/2 통과하며 pre-commit은 record 69개, commit-msg는 message 하나를 통과시키고 연결된 SDK source를 유지한다.

- P98-browser: API version 0.0.21을 사용하는 같은 core source revision으로 Browser SDK dependency와 release workflow를 고정한다. Lockfile이 해당 source를 해석하고 frozen lockfile-only 검사를 통과한다. Browser consumer fake가 view call에 쓰는 page identity를 제공하며 기존 view owner는 22/22, copied contract 검사는 14개 파일을 통과한다. Browser package version 0.0.7은 공개되지 않았고 최신 remote release는 0.0.6이다.


- P97-browser: 복사한 operation case를 갱신하고 현재 API 관찰 형태로 재생한다. view model은 최소 `runtime.log` clock과 batch request를 보내고, replay는 첫 plugin event와 transport ID를 뺀 non-log request를 관찰한다. host는 각 request를 즉시 acknowledge하며 test는 operation 및 business request의 cids, 각 단계의 open call 0개, 인식 불가 report 없음을 요구한다. Red: 기존 replay가 옛 단일 기록 wire를 보내 `view.operation.begin-logs-first-event-and-carries-cids#0`에서 실패했다. Green: operation replay 집중 검사가 1/1 통과하고 `test/view.test.mjs`가 22/22 통과하며, 복사한 operation case는 설치된 current API contract와 일치한다.

- P96-browser: consumer가 `runtime.log` request를 직접 만들지 않고 view bridge logger를 사용해 browser view record와 page 오류 보고를 전달한다. 거부된 기록은 logger가 `runtime.error`로 보고하며 bridge callback 오류는 재귀 호출하지 않는 console 경로로 남긴다. Red: 변경 전 page는 void 반환 consumer logger를 무시하고 raw log route로 report를 기록했다. Green: 정확한 report fields와 거부된 log 처리를 포함한 집중 page 및 SDK model conformance test가 37/37 통과한다.

- P41: 성공한 진단 측정 시작 응답에 view document의 time origin, 즉시
  performance clock 값, 고정된 1 ms 정밀도 상한을 추가한다. Red: owner가
  응답에 source clock이 없음을 확인한다. Green: 기존 field를 보존한 채 같은
  diagnostics owner 5/5가 통과하고 current-core `make check`도 통과한다.
  Application 통합은 core F239-221에 남는다.

- P40: 현재 공유 view-frame event contract를 소비한다. 첫·최신
  ResizeObserver 시각, 양수 resize count, count 1의 동일 시각, 최신 resize
  이후인 frame 시각을 요구한다. Red: 현재 event는 consumer에 도달했지만
  catalog가 `firstResizeAtMs`를 요구하지 않았고 adapter도 count 1의 시각
  불일치를 받았다. Green: Browser diagnostics owner 5/5 및 current-core
  `make check`의 catalog·package 검사가 통과한다.

- P27.4-1: browser view document root에 명시적으로 제어하는 진단 observer를 추가한다. command는 root와 document-region history 길이 및 root 크기를 반환하고, 활성 실행은 shared ResizeObserver-to-animation-frame sample과 source clock을 event log에 기록한다. Red: `node --test test/browser-diagnostics.test.mjs`가 `ui/browser-diagnostics.js`가 없어서 실패했다. Green: `node scripts/build-test.mjs`와 `node --test test/browser-diagnostics.test.mjs test/view.test.mjs test/events.test.mjs`가 통과했으며 33/33개가 통과한다.

- F239-77-browser: 일치하는 설치 diagnostic cohort로 로컬 schema-3 catalog acceptance를 완료한다. 현재 SDK가 source 4개와 pending rule 0개, event 8개를 검사하며 양쪽 host 설치본의 catalog가 source와 정확히 일치하고 application log audit을 통과한다. Public publication은 별도다.

- F239-77-browser: Browser event catalog를 선언된 event와 field requirement를
  유지하면서 schema 3 JSON Schema로 변환한다. Red: 현재 core의 `make check`가 schema 2 catalog를
  거부하고 field map을 잘못된 schema로 판정했다. Green: Browser `make test`가
  112/112 통과하고 `CORE_PLUGIN_API_DIR` 기반 `make check`가 catalog와 package
  검사를 통과한다. Runtime acceptance에는 schema-3 core cohort의 새 설치가 필요하다.

- P39: Browser `0.0.7`은 `engines.soksak` `^0.0.21`을 선언한다. 공개 core `v0.0.20`은 `surface.module`을 요구하므로 현재 view manifest를 거부한다. Red: `test/core-version.test.mjs`가 `">=0.0.18" !== "^0.0.21"`로 실패한다. Green: 같은 test가 1/1 통과하고, 현재 core source를 `CORE_PLUGIN_API_DIR`로 지정한 candidate `make check`가 manifest, exposure, engines, events, records와 case copy 14개를 통과한다. SDK pin, plugin version, archive, registry는 바꾸지 않았으며 P29는 public release gate로 남는다.

- P37: 복사한 view case를 현재 plugin API source origin인 soksak://에 맞췄다. 변경 전 source check는 view-bridge.json과 다른 case description 여섯 개의 sok:// 때문에 실패했고 view source comment와 conformance exclusion도 오래된 scheme을 썼다. 일곱 view case 파일이 현재 source와 일치하고 활성 P27 origin이 soksak://를 사용한다. Package test의 sok:// view-host URL은 P29가 SDK release pin을 바꿀 때까지 유지한다. make test는 111개 중 111개, CORE_PLUGIN_API_DIR을 지정한 make check는 validator와 case copy 14개가 통과한다. 이는 current-source validation이며 공개 v0.0.20 호환성을 뜻하지 않는다.

- P36: 현재 source를 변경할 수 없는 공개 0.0.6 버전으로 package하지 않도록 browser package 버전을 0.0.7로 올렸다. Browser test는 111개 중 111개가 통과하고, make pack은 browser-0.0.7.tgz를 만들며, make registry는 0.0.7만 등록하고 archive digest를 확인한다. 이는 local release 준비이며 P29가 public release gate로 남는다.

- P35: view 페이지는 doctype으로 시작하고 import map을 갖지 않는다. host가 doctype 뒤에 view import map을 넣으므로(core F212.12-1-10-6), 페이지의 복사본을 뺐다. Red: view 시험이 map을 가진 page에서 `the view page holds no import map of its own`으로 실패했다. Green: `make test`가 111개 중 111개를 통과하고, core의 `checkViewPage`가 page를 받아들인다.
- P33: view 페이지 map이 core view import map의 screen-hash 항목을 가진다. `checkViewPage`가 이 항목을 요구한다. 시험의 map 복사본은 `VIEW_IMPORTS`의 다섯 항목을 가진다. Red: `the view page carries the import map of the view and the page script` 시험이 page map에 screen-hash 항목이 없어 deep-equal 차이로 실패했다. Green: `make test`가 109개 중 109개를 통과하고, `CORE_PLUGIN_API_DIR`로 `make check`가 통과한다.
- P30: pre-push 훅이 `make push-check`를 실행한다. 이것은 ci workflow와 같이 `make test`, `make check`, push 범위의 commit message 검사를 실행한다. Red: `.githooks/pre-push`가 없었고 `git push --dry-run`은 검사를 실행하지 않았다. Green: 훅이 검사를 실행한다. `make test`는 98개 중 98개를 통과하고, `make check`는 고정 SDK에서 실패하며 이것은 P31이 기록한다.
- F238-c-23-1: `make check`는 plugin API의 `validateManifest`로 `plugin.json`을 검사하며(`scripts/check-manifest.mjs`), `CORE_PLUGIN_API_DIR`가 설정되면 그 API를 읽고 SDK 도구를 그 폴더에서 실행한다. `browser.tabs` status를 page가 등록하므로 이 section은 source를 가진다. Red: manifest test는 검사 파일이 없어서, tabs test는 등록되지 않은 status로 실패했다. Green: `make test`가 98개 중 98개를 통과하며, `make check`는 core origin/main 추출본에 대해 0으로 종료된다.
- F238-c-14-1: `test/sdk-models/` model 주석은 hwp page가 아니라 browser page를 가리키며, 적합성 제외 사유는 origin `sok://browser/`를 적는다. 동작은 바뀌지 않아 이 주석에는 Red test가 해당하지 않는다. Green: `make test`가 test 96개를 통과한다.
- F238-c-14: `test/`의 어느 줄도 SDK 패키지 이름을 싣지 않는다. `test/sdk-boundary.test.mjs`는 needle을 포함한 `test/`의 줄마다 실패하며, needle은 부분 문자열에서 조립한다. model 주석은 plugin API로 적고, `test/view.test.mjs`는 import map 이름을 부분 문자열에서 조립한다. Red: guard가 일곱 줄을 나열했다. Green: `make test`가 test 96개를 통과한다.
- F238-c-24: CI workflow는 `make test` 다음에 `make check`를 실행하고, release workflow는 `make test`, `make check`, `make pack` 순서로 실행한다. `test/workflows.test.mjs`가 두 순서를 요구한다. Red: 이전 workflow에서 test가 실패했다. Green: `make test`가 95개 test를 통과한다. 고정된 `@soksak/plugin-api`의 status-only section 때문에 `make check`는 core release가 계약 파일을 게시할 때까지 실패하며, 이것이 예상된 결과다.
- P28: 탭 section은 선언된 UI status다. `plugin.json`이 `browser.tabs`를 `status` section으로 선언하며, 어느 section도 `module`을 선언하지 않는다. `ui/sections/tabs.js`를 뺐다. page는 `runtime.status.watch`로 `core.grid`를 구독하고, 표면을 가진 카드의 브라우저 탭을 선언된 목록으로 올린다. 각 행은 `browser.tab.select`를 실행하며, 이 명령은 `core.tab.select`를 부른다. manifest test는 모든 section이 선언된 status임을 요구하고, `test/tabs.test.mjs`는 값과 선택을 요구한다. release는 P29를 기다린다.
- P18.4-1: page의 작업은 식별자를 싣는다. 주소 commit은 `runtime.beginOperation`으로 작업을 시작하며, 기록 `address.commit`은 `info`로 식별자와 함께 저장된다. 중계된 명령은 요청의 식별자를 `command` 기록과 `core.tab.select`에 넘긴다. emitter는 `{operation: true}`로 작업을 시작한다. 문서 region의 상태 기록은 page의 요청을 잇지 않으므로 식별자를 싣지 않는다. `test/operations.test.mjs`가 두 가지를 요구하고, model은 `view-operations.json`과 `view-status.json`을 재생한다.

- F252-contract-browser: 복사한 command 사례를 core origin/main에 맞췄다(`view-commands.json`이 바뀌었다). replay는 command handler에 요청의 cids를 context로 전달한다.
- F252-browser: 사용자가 보아야 하는 page 오류는 tab 오류(`tab.error`)로 보낸다. 이전에는 `status.report("error")`가 아무것도 하지 않았다. Enter로 거부된 빈 주소는 표시되고 문서 영역에 닿지 않는다. 256자를 넘는 tab 제목은 자르지 않고 거부한다. 요청 목록은 region의 dropped 수를 표시하며, region이 세지 않은 항목 손실은 거부한다. 깊이가 한 단계 건너뛴 요소는 거부한다. 거부된 `runtime.log` 기록은 `runtime.error {where: "log"}`로 표시하고 콘솔에도 남긴다.
- F238-b-10-2: test 명령이 `test/` 전체를 실행하므로 `test/sdk-models/`의 conformance test가 `make test`에서 실행된다(이전 69개, 이제 83개 중 83개 통과). `test/test-script.test.mjs`는 `test/` 아래의 test 파일이 test 명령에 선택되지 않으면 실패한다.
- F238-b-10-1: core view bridge 계약 사본을 현재 core 사례 집합으로 새로 고쳤다. `view.bridge.runtime-log-without-level-query`가 `view.bridge.runtime-log-level-gate`를 대신하며, view는 level 질의를 부르지 않는다. 이 저장소에서는 conformance test(`test/sdk-models/conformance.test.mjs`)가 사례를 제외 목록에 적는다. view bridge model에 `runtime.log`가 없기 때문이다.
- P17: page는 오류를 `emitEvent`를 거쳐 `plugin.browser.report`의 emit으로 기록하며, 이 emit은 `runtime.log`에 `report` 이름을 보낸다(core docs/spec/plugins.md#logging). 변경 전에는 reporter가 접두사가 붙은 이름으로 `runtime.log`를 직접 불러 core가 접두사를 두 번 붙여 저장했고, `soksak-events`는 선언된 event의 emit site를 찾지 못했다. test `the page reports a failure of the view channel as the declared record of its catalog`는 접두사가 붙은 이름을 검사했고 이제 `report`를 검사한다. test `the page records its trace as the declared events of its catalog`는 page가 쓰는 trace event 각각이 `events.json`에 선언된 level로 선언되어 있음을 요구한다. 두 test 모두 변경 전에 실패했고 변경 후 통과한다.

- P27.5-1: browser page test는 SDK 없이 실행한다. `scripts/build-test.mjs`는 각 `@soksak/plugin-api` import를 `test/sdk-models/`의 model로 바꾼 `build/test/ui`를 만들고, `test/sdk-models/conformance.test.mjs`는 core F246과 F248부터 F248-5까지의 복사된 case 파일을 재생한다. model은 영역 zoom, 기록 동작, stream 구독, binder의 함수 params, settings와 text size 읽기, 선언 UI snapshot sender를 추가한다. Red: `test/sdk-boundary.test.mjs`가 `address-input.test.mjs`의 SDK import에서 실패했다. Green: `make test`가 66개 중 66개 통과한다. `@soksak/plugin-api`는 release `v0.0.18`에 고정했으므로, core release가 case와 status만 가진 section을 받는 검사기를 담을 때까지 `make check`의 case 복사 검사와 exposure 검사가 실패한다.
- P27.5: 생략해 둔 view 이동 case를 skip 없이 실행한다. `@soksak/plugin-api`는 view 영역에 `history`를 노출하는 core main의 commit에 고정했다(core F245). page는 복원된 영역이 구독 전에 보고한 state를 보인다. `make test`는 플러그인 test만 실행하고, `make check`는 SDK 검사를 실행한다.

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
