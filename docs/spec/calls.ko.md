# Call 과 대기

[English](calls.md)

Browser view 는 core 0.0.40 의 call 규칙을 따른다(core `docs/spec/plugin-processes.md` rule 3, `docs/spec/exposure.md` 의 command `timeout`).

## Call

`plugin.json` 은 command 에 `timeout` 을 선언하지 않는다. core 는 command 선언의 그 member 를 `<where>: timeout is not a member of a command declaration` 으로 거부한다. view 의 call 에는 시간 한도가 없다. call 은 답, cancel, 상대의 끝으로 끝나고, view 는 그것을 위해 timer 를 시작하지 않는다. 살아 있는 상대가 답하지 않으면 call 은 열린 채로 남고, core 가 그것을 `core.plugin.open-calls` 로 알린다.

`test/sdk-models/view.mjs` 의 view bridge model 은 core 의 call layer(`packages/plugin-api/calls.js`)를 따른다. 답은 call 을 resolve 하거나, 그 error 의 message 와 code 로 reject 한다. abort 된 signal 은 `{id, cancel: true}` 를 보내고 call 을 `cancelled` 로 reject 한다. cancel 뒤에 온 답은 late reply 이며, 그 지연과 함께 알려지고 call 에 전달되지 않는다. 상대의 끝은 열린 call 을 각각 `command <name> ended: <reason>` 으로 reject 하고, call 마다 `peer-lost` 를 알린 뒤 열린 call 을 알린다. `test/sdk-models/conformance.test.mjs` 가 core `packages/plugin-api/contract/calls.json` copy 의 case `calls.end.*` 를 재생한다.

## Document stream 의 첫 read

watch 가 제공하지 않는 `browser.elements` 나 `browser.requests` 의 read 는 그 document stream 의 subscription 을 열고 첫 data message 를 받는다(core `docs/spec/native-surfaces.md#document-streams`). read 는 다음 event 중 하나로 끝나고, timer 로 끝나지 않는다.

- subscription 의 첫 data message. 그것이 read 의 값이다.
- subscription 이나 stream message 의 실패. read 는 그 실패로 reject 된다.
- region 의 page 의 끝. region 의 WebContent process 가 끝나면 host 는 region 의 `onState` 로 `error` 가 `the web content process ended` 인 document state 를 알리고 `error native document view: web content process terminated: <address>` 를 쓴다. read 는 `document <stream> stream ended: the web content process ended` 로 reject 된다.
- region 의 끝. view 의 dispose 가 region 을 닫고, read 는 `document <stream> stream ended: the region closed` 로 reject 된다.

document 가 없는 region 에는 stream message 가 없으므로 그 read 는 곧바로 빈 값이다. read 가 끝나면 그 subscription 을 닫는다.

## Test

어떤 test 도 시간으로 판정하지 않는다. test 는 timer 를 시작하지 않고, timer 를 mock 하지 않고, 자기 시간 한도를 두지 않고, 정해진 턴 수로 settle 하지 않는다. fake host 는 page 가 일으키는 각 occurrence 를 기록한다. page 가 보내는 각 message, host 의 각 기록, host 가 전달하는 각 message 다. test 는 자기가 확인하는 occurrence 나 상태를, 그것이 기록되는 턴에 기다린다. 없음을 확인하는 test 는 먼저 처리를 끝내는 occurrence(command 의 답 같은)를 기다린 뒤 없음을 확인한다. 대기는 그 occurrence 로만 끝난다. occurrence 가 오지 않는 test 는 core 의 각 test 가 한도를 갖듯 test runner 의 한도, 곧 `package.json` test script 의 `--test-timeout=120000` 이 끝낸다. runner 는 그 test 를 이름과 함께 실패시킨다.
