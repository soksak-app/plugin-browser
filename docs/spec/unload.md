# Unload and restore

[한국어](unload.ko.md)

The browser surface and the four sections `browser.dom`, `browser.network`, `browser.tabs` and `browser.history` declare `unload`
`{format: 1, maxBytes: 16384}` in `plugin.json`, so the memory saver of core unloads a hidden tab or section and restores it in a new view
(core `docs/spec/plugins.md#memory-saver`). A view keeps across an unload only the tab state that it writes through `tab.state.write`;
this page states what each view stores and what it gives up.

## Browser surface

The view of the surface (`ui/browser.js`) stores `{url}`, the address of its document region. It writes the state when the region
reports an address that is not empty and differs from the address it last wrote or read. At its start it reads the state and refuses a
stored state whose `url` is not an `http` or `https` address. When the region restored the session history that core keeps for the tab
(`region.history`), the view loads nothing, because the region already shows its document; otherwise it loads the stored address, and a
tab without a stored state loads the `home` setting, or starts empty when `home` is empty.

The view gives up the text of the address field that was typed and not committed, the focus and the selection of its page, and a tab
error that it showed.

## Sections

The view of a section (`ui/section-view.js`) stores `{surface, scroll: {x, y}}`: the surface that the section follows, or `null`, and the
scroll position of the body of the section page in CSS pixels. It writes the state when the followed surface or the scroll position
changes and the value differs from the state it last wrote or read. At its start it reads the state and refuses a stored state of another
form.

A restored section draws its rows again from the status of the surface that `core.sidebars` reports for it: the rows, the selected item
and the status lines are the value of that status, which the followed surface keeps. When the section follows the surface that its state
names, it scrolls the body to the stored position once the drawn rows reach that position, because the rows arrive after the view starts
and a stream status gives its empty value first. When it follows another surface, the body starts at the top and the view writes the
state of that surface. A scroll of the person before the rows reach the stored position replaces the stored position.

The view gives up the text selection and the keyboard focus of its page, which are state of its DOM.

The rows of the 네트워크 section are the request log of the document region of the followed surface. They equal the rows before the unload
only when core keeps the request log of a region for the life of its document (core `docs/spec/native-surfaces.md#document-streams`).
While core releases the log at the end of the last subscription, the new watch of the restored section receives the entries that the
document collects again from its resource timing buffer.
