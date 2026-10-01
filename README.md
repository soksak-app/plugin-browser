# Browser plugin

[한국어](README.ko.md)

Browser plugin: an address bar and a document region that shows web pages. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests
make pack OUT=<folder> SOK=<core>/target/debug/sok   # the plugin package
```

The checklist is [docs/features.md](docs/features.md).
