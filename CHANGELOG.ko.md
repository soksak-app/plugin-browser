# 변경 기록

[English](CHANGELOG.md)

## 미배포

- P19: `make test`가 record 검사 `soksak-records`를 실행하고, CI가 push된 각 commit message의 형식을 `soksak-commits`로 검사한다.
- P18.3: `@soksak/plugin-api`를 core release 0.0.11에서 받고 `engines.soksak`은 `>=0.0.11`이므로, manifest member `events`가 받아들여지고 `make test`가 설치된 의존성의 event 가드를 실행한다.
- P18.4: plugin은 비싼 field를 만들지 않고 `cids`를 가진 입력이 없으므로, core의 gate와 `cids`에 맞춰 바꿀 것이 없다.
- P18: 전달자 `ui/events.js`가 넘기는 event 이름에 `events: forwarded`를 표시하므로, core의 catalog 검사가 `emitEvent` 호출에서 이름을 읽는다.
- P18: `events.json`이 surface의 event(`start`, `command`, `address.commit`, `history.move`, `navigation`, `load`, `region.failure`)를 선언하고, `ui/events.js`가 `context.runtime.log`로 쓴다. `make test`가 `soksak-events`를 실행하고, 이유 주석은 `(default|silent): <reason>` 형식이다. 시험: `test/events.test.mjs`, `node --test test/` 33개 중 32개 통과, manifest 항목은 core release를 기다린다(P18.3).
- P16: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.
