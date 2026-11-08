# Browser plugin

`browser.content.read` reads the main view model: `{kind:"empty", instruction:"주소를 입력하세요"}` for the empty view, or `{kind:"document", instruction:null}` when the document region is selected. It does not read external page text or assert loading completion; `browser.location` retains loading and error state. The reply and visible instruction use the same view model.

[한국어](README.ko.md)

Browser plugin: an address bar and a document region that shows web pages. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make check                                  # SDK checks of the pinned core release
make pack OUT=<folder> # the plugin release
make install-hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` runs the event source check and the document check of the kit that `package.json` pins. The application validates `plugin.json` when it installs the release, and the registry check compares the exposed names of the release with the declarations of each listed core.

The checklist is [docs/features.md](docs/features.md).

The specifications are [docs/spec/core-compatibility.md](docs/spec/core-compatibility.md), [docs/spec/unload.md](docs/spec/unload.md), which states what each view keeps across an unload, and [docs/spec/view-measurement.md](docs/spec/view-measurement.md), which records the DOM mount baseline of the view.
