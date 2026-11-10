# Calls and waits

[한국어](calls.ko.md)

The browser views follow the call rule of core 0.0.40 (core `docs/spec/plugin-processes.md`, rule 3, and `docs/spec/exposure.md`, command `timeout`).

## Calls

`plugin.json` declares no `timeout` for a command, because core refuses that member of a command declaration with `<where>: timeout is not a member of a command declaration`. A call of a view has no time limit. It ends by its reply, by its cancel or by the end of its peer, and the view starts no timer for it. A live peer that does not reply leaves the call open; core reports it in `core.plugin.open-calls`.

The model of the view bridge in `test/sdk-models/view.mjs` follows the call layer of core (`packages/plugin-api/calls.js`). A reply resolves the call, or rejects it with the message and the code of its error. An aborted signal sends `{id, cancel: true}` and rejects the call with `cancelled`; a reply that arrives after the cancel is a late reply, reported with its delay and not passed to the call. The end of the peer rejects each open call with `command <name> ended: <reason>` and reports `peer-lost` for each call and then the open calls. `test/sdk-models/conformance.test.mjs` replays the cases `calls.end.*` of the copy of core `packages/plugin-api/contract/calls.json`.

## The first read of a document stream

A read of `browser.elements` or `browser.requests` that no watch serves opens a subscription of its document stream and takes its first data message (core `docs/spec/native-surfaces.md#document-streams`). The read ends by one of these events and by no timer:

- the first data message of the subscription, which is the value of the read;
- a failure of the subscription or of a message of the stream, which rejects the read with that failure;
- the end of the page of the region: when the WebContent process of the region ends, the host reports the document state whose `error` is `the web content process ended` through `onState` of the region, and writes `error native document view: web content process terminated: <address>`; the read is rejected with `document <stream> stream ended: the web content process ended`;
- the end of the region: the dispose of the view closes the region, and the read is rejected with `document <stream> stream ended: the region closed`.

A region without a document has no stream message, so its read is the empty value at once. The subscription of the read is closed when the read ends.

## Tests

No test judges by time. The tests start no timer, mock no timer, set no time limit of their own and settle by no count of turns. The fake hosts record each occurrence that the page causes: each message that the page sends, each record of the host and each message that the host delivers. A test waits for the occurrence or the state that it asserts, in the turn in which it is recorded. A test that asserts an absence first waits for the occurrence that ends the handling, such as the reply of the command, and then asserts the absence. A wait ends only by its occurrence. The limit of the test runner, `--test-timeout=120000` in the test script of `package.json`, ends a test whose occurrence does not come, as each core test has its limit: the runner fails that test with its name.
