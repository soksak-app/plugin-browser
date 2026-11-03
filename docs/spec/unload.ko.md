# Unload와 restore

[English](unload.md)

Browser surface와 네 section `browser.dom`, `browser.network`, `browser.tabs`, `browser.history`는 `plugin.json`에 `unload`
`{format: 1, maxBytes: 16384}`를 선언하므로, core의 memory saver가 숨은 tab이나 section을 unload하고 새 view에서 restore한다
(core `docs/spec/plugins.md#memory-saver`). View는 `tab.state.write`로 쓴 tab state만 unload 너머로 유지한다. 이 문서는 각
view가 저장하는 것과 포기하는 것을 적는다.

## Browser surface

Surface의 view(`ui/browser.js`)는 document region의 주소인 `{url}`을 저장한다. Region이 비어 있지 않고 마지막으로 쓰거나 읽은
주소와 다른 주소를 보고하면 state를 쓴다. 시작할 때 state를 읽고, `url`이 `http`나 `https` 주소가 아닌 저장된 state를 거부한다.
Region이 core가 tab마다 유지하는 session history를 restore했으면(`region.history`) region이 이미 document를 보이므로 view는 아무것도
load하지 않는다. 그렇지 않으면 저장된 주소를 load하고, 저장된 state가 없는 tab은 `home` 설정을 load하며 `home`이 비어 있으면 빈
상태로 시작한다.

View는 주소 field에 입력하고 확정하지 않은 글자, page의 focus와 selection, 그리고 보인 tab error를 포기한다.

## Section

Section의 view(`ui/section-view.js`)는 `{surface, scroll: {x, y}}`를 저장한다. Section이 따라가는 surface 또는 `null`과, section
page body의 scroll 위치(CSS pixel)다. 따라가는 surface나 scroll 위치가 바뀌고 그 값이 마지막으로 쓰거나 읽은 state와 다르면 state를
쓴다. 시작할 때 state를 읽고, 다른 형태의 저장된 state를 거부한다.

Restore된 section은 `core.sidebars`가 보고하는 surface의 status에서 행을 다시 그린다. 행, 선택된 항목, 상태 줄은 그 status의
값이고, 따라가는 surface가 그것을 유지한다. Section이 state가 가리키는 surface를 따라가면, 그린 행이 저장된 위치에 닿을 때 body를
그 위치로 scroll한다. 행은 view가 시작한 뒤에 오고 stream status는 빈 값을 먼저 주기 때문이다. 다른 surface를 따라가면 body는
맨 위에서 시작하고 view는 그 surface의 state를 쓴다. 행이 저장된 위치에 닿기 전에 사람이 scroll하면 그 위치가 저장된 위치를
대신한다.

View는 page의 text selection과 keyboard focus를 포기한다. 둘은 DOM의 상태다.

네트워크 section의 행은 따라가는 surface의 document region이 가진 request log다. Core가 region의 request log를 그 document의 수명
동안 유지할 때만 행이 unload 전의 행과 같다(core `docs/spec/native-surfaces.md#document-streams`). Core가 마지막 subscription이 끝날
때 log를 놓는 동안에는, restore된 section의 새 watch가 document가 resource timing buffer에서 다시 모은 항목을 받는다.
