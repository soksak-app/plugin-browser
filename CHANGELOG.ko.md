# 변경 기록

[English](CHANGELOG.md)

## 미배포

- P18: 전달자 `ui/events.js`가 넘기는 event 이름에 `events: forwarded`를 표시하므로, core의 catalog 검사가 `emitEvent` 호출에서 이름을 읽는다.
- P18: `events.json`이 surface의 event(`start`, `command`, `address.commit`, `history.move`, `navigation`, `load`, `region.failure`)를 선언하고, `ui/events.js`가 `context.runtime.log`로 쓴다. `make test`가 `soksak-events`를 실행하고, 이유 주석은 `(default|silent): <reason>` 형식이다. 시험: `test/events.test.mjs`, `node --test test/` 33개 중 32개 통과, manifest 항목은 core release를 기다린다(P18.3).
- P16: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.
