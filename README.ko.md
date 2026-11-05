# 브라우저 plugin

[English](README.md)

Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # test
make check                                  # 고정된 core release의 SDK 검사
make pack OUT=<folder> # plugin release
make hooks                                  # clone 후 한 번: commit 때 commit message와 record를 검사
```

`make check`는 `package.json`이 pin한 kit의 census 검사와 record 검사를 실행한다. application은 release를 설치할 때 `plugin.json`을 검증하고, registry 검사는 release의 exposed 이름을 각 listed core의 선언과 비교한다.

Checklist는 [docs/features.md](docs/features.md)다.
