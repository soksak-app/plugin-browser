# Browser plugin

[한국어](README.ko.md)

Browser plugin: an address bar and a document region that shows web pages. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make check                                  # SDK checks of the pinned core release
make pack OUT=<folder> # the plugin release
make hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` runs the census check of the events kit and the record check of the records kit that `package.json` pins. The application validates `plugin.json` when it installs the release, and the registry check compares the exposed names of the release with the declarations of each listed core.

The checklist is [docs/features.md](docs/features.md).

The specifications are [docs/spec/core-compatibility.md](docs/spec/core-compatibility.md) and [docs/spec/unload.md](docs/spec/unload.md), which states what each view keeps across an unload.
