# 브라우저 plugin

`browser.content.read`는 메인 뷰 모델을 읽는다. 빈 뷰는 `{kind:"empty", instruction:"주소를 입력하세요"}`, 문서 영역은 `{kind:"document", instruction:null}`을 반환한다. 외부 페이지 본문이나 로딩 완료를 뜻하지 않으며 로딩과 오류 상태는 `browser.location`에 그대로 있다. 응답과 화면 안내는 같은 뷰 모델을 쓴다.

[English](README.md)

Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # test
make check                                  # 고정된 core release의 SDK 검사
make pack OUT=<folder> # plugin release
make install-hooks                                  # clone 후 한 번: commit 때 commit message와 record를 검사
```

`make check`는 `package.json`이 pin한 kit의 event source 검사와 document 검사를 실행한다. application은 release를 설치할 때 `plugin.json`을 검증하고, registry 검사는 release의 exposed 이름을 각 listed core의 선언과 비교한다.

Checklist는 [docs/features.md](docs/features.md)다.

Spec은 [docs/spec/core-compatibility.ko.md](docs/spec/core-compatibility.ko.md), unload 너머로 각 view가 유지하는 것을 적은 [docs/spec/unload.ko.md](docs/spec/unload.ko.md), view의 DOM mount baseline을 기록한 [docs/spec/view-measurement.ko.md](docs/spec/view-measurement.ko.md)다.
