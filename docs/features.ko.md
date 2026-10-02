# 기능

[English](features.md)

- [o] P1 — P1: 이 plugin을 자기 repository로 test하고 pack한다. 2026-10-02에 soksak core repository(그곳의 checklist 항목 R1-5-3)에서 옮겼으며, 이전 변경 이력은 core에 있다. `make test`와 `make pack`이 통과한다.
- [o] P2 — P1: 주소 막대를 각 mode의 카드 색으로 칠한다. 2026-10-02 사용자 보고: light mode에서 주소 막대가 어두웠다. 막대가 배경을 칠하지 않아 hybrid composition이 page 뒤의 어두운 색(16, 17, 23)을 보였고, 빈 화면은 `--card`를 칠했다. 2026-10-02 완료: 막대가 `var(--card)`를 칠한다. Red: core window check `the address bar paints the card colour in light and dark modes`가 두 host에서 막대를 흰 카드에 대해 (16, 17, 23)으로 쟀다. Green: core registry fixture로 이 repository를 설치한 두 host에서 통과하고 `make test`가 통과한다.
- [o] P3 — P1: soksak core 0.0.2용 version 0.0.2를 release한다. 2026-10-02 완료: `package.json`이 0.0.2와 `engines.soksak` `^0.0.2`를 선언하고, test는 core tag `v0.0.2`의 `@soksak/plugin-api`를 쓴다. macOS arm64에서 `make test`가 통과한다.
