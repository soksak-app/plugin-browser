# 기능

[English](features.md)

- [o] P1 — P1: 이 plugin을 자기 repository로 test하고 pack한다. 2026-10-02에 soksak core repository(그곳의 checklist 항목 R1-5-3)에서 옮겼으며, 이전 변경 이력은 core에 있다. `make test`와 `make pack`이 통과한다.
- [o] P2 — P1: 주소 막대를 각 mode의 카드 색으로 칠한다. 2026-10-02 사용자 보고: light mode에서 주소 막대가 어두웠다. 막대가 배경을 칠하지 않아 hybrid composition이 page 뒤의 어두운 색(16, 17, 23)을 보였고, 빈 화면은 `--card`를 칠했다. 2026-10-02 완료: 막대가 `var(--card)`를 칠한다. Red: core window check `the address bar paints the card colour in light and dark modes`가 두 host에서 막대를 흰 카드에 대해 (16, 17, 23)으로 쟀다. Green: core registry fixture로 이 repository를 설치한 두 host에서 통과하고 `make test`가 통과한다.
- [o] P3 — P1: soksak core 0.0.2용 version 0.0.2를 release한다. 2026-10-02 완료: `package.json`이 0.0.2와 `engines.soksak` `^0.0.2`를 선언하고, test는 core tag `v0.0.2`의 `@soksak/plugin-api`를 쓴다. macOS arm64에서 `make test`가 통과한다.
- [o] P4 — P1: 페이지와 섹션의 공개 이름을 검사한다. 2026-10-02 core checklist 항목 R1-5-5를 위해 완료: `make test`가 core tag `v0.0.2`의 `@soksak/plugin-api`의 `soksak-exposure`를 실행해 `ui/`의 모든 이름을 `plugin.json`과 core 선언에 대해 비교하며, macOS arm64에서 통과한다.
- [o] P5 — P1: 주소 없는 `browser.navigate`를 문서 영역 전에 거부한다. 2026-10-03 core 체크리스트 항목 G1.4-90-3을 위해 발견: `url` 없는 호출이 빈 주소로 host에 닿았고 host는 `only http, https, and file addresses can be opened: ""`로 거부했다. 완료: 명령은 없거나 비었거나 문자열이 아닌 주소를 `browser.navigate requires an address, not <value>`로 거부한다. 테스트 `browser.navigate refuses a missing or empty address before the document region`은 수정 전 실패했고(Red) 수정 후 통과한다(Green). 2026-10-03 `make test`가 22개 테스트를 통과한다.
- [o] P6 — P1: core 체크리스트 항목 G1.4-81을 위해 포인터 아래 링크의 주소를 카드 발의 하단 글로 알린다. 2026-10-03 완료: 페이지는 문서 상태의 `link`를 `tab.footer`로 알리고, 빈 링크에서는 지우며, 1024자보다 긴 링크는 앞 1023자와 말줄임표로 보이고, `browser.location`이 `link`를 보고한다. 테스트 `the card footer shows the address of the link under the pointer`는 변경 전 실패했고(Red) 변경 후 통과하며, `make test`가 23개 테스트를 통과하고, `e2e/browser.test.mjs`가 두 host에서 통과한다.
- [o] P7 — P0: core 체크리스트 항목 R2-1을 위해 `@soksak/plugin-api`를 공개된 core 저장소에서 받는다. 2026-10-04 완료: `package.json`은 로컬 폴더 대신 `git+https://github.com/soksak-app/core.git#v0.0.2&path:/packages/plugin-api`를 가리키고, lockfile을 GitHub에서 다시 만들었으며, macOS arm64에서 `make test`가 통과한다.
