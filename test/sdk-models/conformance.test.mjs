// Conformance of the models of test/sdk-models to the published view and exposure cases recorded in
// test/fixtures/sdk-cases. Each step of a covered case is replayed against the model and its output is asserted.
// The page calls only part of each surface. EXCLUDED_CASES lists the cases that exercise an operation outside the
// page surface, with the reason. EXCLUDED_STEPS lists the steps of a covered case that exercise an operation outside the
// page surface. The test fails when a listed case or step is replayed, or when a listed item is absent from the fixtures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createBinder, INTERACTIVE } from "./binder.mjs";
import { drawList } from "./list.mjs";
import { createExpose } from "./expose.mjs";
import { createViewBridge } from "./view.mjs";

const fixtureFile = (name) => JSON.parse(readFileSync(new URL(`../fixtures/sdk-cases/${name}.json`, import.meta.url), "utf8"));
const fixture = (name) => fixtureFile(name).cases;
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const errorText = (error) => (error instanceof Error ? error.message : String(error?.message ?? error));

const EXCLUDED_CASES = {
  "binder.delegate.dispatches-declared-controls": "the page does not call expose.delegate",
  "binder.audit.reports-unbound-controls": "the page does not call expose.audit",
  "binder.run.runs-and-refuses": "the page does not call the binder run",
  "snapshot.ack.refuses-a-seq-that-is-not-in-transit": "the host sends acknowledgements of snapshots in transit only, so the page receives no refused one",
  "snapshot.peer-lost.reports-the-transit-and-the-dirty-value": "the page does not call peerLost",
  "snapshot.peer-lost.refuses-an-unknown-reason": "the page does not call peerLost",
  "snapshot.pull.returns-the-latest-value-and-refuses-a-missing-one": "the page does not call pull",
  "snapshot.receiver.acknowledges-then-delivers": "the receiver role is the workbench side; the page is the sender",
  "view.bridge.refuses-malformed-host-message": "the view channel refuses messages without the marker before the bridge receives them",
  "view.bridge.refuses-unsupported-page": "the page is always soksak://browser/, so the bridge creation check is not reached",
  "view.bridge.sidecar-subscriptions": "the page subscribes to sidecar messages only, not to runtime.sidecar.onFailure",
  "view.native.exposure-calls-and-refusals": "the page registers exposure entries through calls.request, not exposureRegister or exposureReply",
  // The steps of these cases call zoom, go, entry or stop, which the page does not call. The bridge call ids that the
  // later steps record count those calls, so a replay that skips them diverges at the next post.
};
const EXCLUDED_STEPS = {
  "view.composition.update-and-region-refusals": "the page does not call composition.update, whose step posts composition.place",
};
// A composition step outside the page surface: composition.update, which the page does not call.
const outsideComposition = (step) => step.do?.composition === "update";

/** The cases of a surface that replay: every case except the excluded ones. */
function replayable(surface) {
  return fixture(surface).filter((entry) => !EXCLUDED_CASES[entry.id]);
}

// The window of the view channel and the element rectangles that the models read.
function viewWindow() {
  const sokView = { listener: null, attach(listener) { this.listener = listener; } };
  globalThis.window = { sokView, innerWidth: 800, innerHeight: 600 };
  return sokView;
}

test("the excluded cases and steps are present in the copied fixtures", () => {
  const ids = new Set(["view-bridge", "view-native", "view-composition", "create-binder", "expose", "calls", "declared-ui-snapshot", "draw-list", "interactive", "view-commands", "view-settings"].flatMap((name) => fixture(name)).map((entry) => entry.id));
  for (const id of [...Object.keys(EXCLUDED_CASES), ...Object.keys(EXCLUDED_STEPS)]) assert.ok(ids.has(id), `excluded case ${id} is not in the fixtures`);
});

test("expose cases replay against the exposure model", async () => {
  for (const testCase of fixture("expose")) {
    const registered = [];
    const replies = [];
    const effects = [];
    const subscribers = new Set();
    const elements = new Map();
    let handle = null;
    let value = testCase.initial;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      // The traces record the unregister of the port at dispose. The view port of the page has none (view.js).
      unregister: async () => { registered.push({ kind: "unregister" }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, testCase.declarations);
    // The fake element of a selector: its click runs the listeners of the page and records the click.
    const elementOf = (selector) => {
      const name = selector.replace("#", "");
      if (!elements.has(selector)) {
        const listeners = {};
        const element = {
          id: name,
          dataset: {},
          getBoundingClientRect: () => {
            const rect = testCase.rects?.[name] ?? { left: 0, top: 0, width: 0, height: 0 };
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, x: rect.left, y: rect.top };
          },
          addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
          removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((other) => other !== fn); },
          click: () => {
            effects.push(`click ${name}`);
            for (const fn of [...(listeners.click ?? [])]) fn({ type: "click" });
          },
        };
        elements.set(selector, element);
      }
      return elements.get(selector);
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length, effects: effects.length };
      let throws = null;
      try {
        if (step.status) await expose.status(step.status.name, () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
        else if (step.dom) await expose.dom(step.dom.name, elementOf(step.dom.selector));
        else if (step.command) await expose.command(step.command.name, (params) => { effects.push(`run ${step.command.name} ${JSON.stringify(params)}`); });
        else if (step.bind) {
          const element = elementOf(step.bind.selector);
          // The trace gives paramsFromValue for params that a function reads from the value of the element at each run.
          const params = step.bind.paramsFromValue ? () => ({ value: element.value }) : step.bind.params;
          await expose.bind(element, step.bind.command, params);
        } else if (step.inspect) {
          // The inspect step reads the marking of an element and has no effect.
        } else if (step.click) {
          const element = elementOf(step.click.selector);
          if (step.click.value !== undefined) element.value = step.click.value;
          element.click();
        }
        else if (step.dispose) await expose.dispose();
        else if (step.race) {
          // The race of a registration with the dispose: the dispose has begun when the registration is made.
          const disposing = expose.dispose();
          try {
            await expose.status(step.race.name, () => value, () => () => {});
          } catch (error) {
            throws = errorText(error);
          }
          await disposing;
        } else if (step.request) handle(step.request);
        else if (step.set !== undefined) {
          value = step.set;
          for (const fn of [...subscribers]) fn(value);
        } else throw new Error(`unknown expose step in ${label}`);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      const output = {
        registered: registered.slice(before.registered),
        replies: replies.slice(before.replies),
        effects: effects.slice(before.effects),
        result: null,
        throws,
      };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("call limit cases replay against the bridge model on a mocked clock", async (t) => {
  for (const testCase of fixture("calls")) {
    // The clock of the case starts at 0 and moves only by the advance steps; the limit timers are the mocked timers.
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
    const sokView = { listener: null, attach(listener) { this.listener = listener; } };
    globalThis.window = { sokView, innerWidth: 800, innerHeight: 600, location: { host: "probe" } };
    const posted = [];
    const reports = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: (event) => reports.push(event) });
    const outcomes = new Map();
    // Each step is followed by the microtasks of the settled promises only; the mocked timers do not run them.
    const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const reportsBefore = reports.length;
      if (step.request) {
        const name = step.request.name;
        outcomes.set(name, null);
        bridge.calls.request(step.request.command, step.request.params, step.request.timeout)
          .then((value) => outcomes.set(name, { resolved: value }), (error) => outcomes.set(name, { rejected: error.message, code: error.code }));
      } else if (step.advance !== undefined) {
        t.mock.timers.tick(step.advance);
      } else if (step.reply) {
        sokView.listener({ sok: 1, ...step.reply });
      } else throw new Error(`unknown call step in ${label}`);
      await flush();
      const output = {
        sent: posted.slice(before).map(({ sok, ...rest }) => rest),
        reports: reports.slice(reportsBefore),
        outcome: outcomes.get(step.watch) ?? null,
      };
      assert.deepEqual(output, step.output, label);
    }
    t.mock.timers.reset();
  }
});

test("command registration cases replay against the exposure model", async () => {
  for (const testCase of fixture("command-registration")) {
    const registered = [];
    const replies = [];
    let handle = null;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, testCase.declarations);
    const behaviors = { echo: (params) => params, fail: () => { throw new Error("save failed"); }, none: () => undefined, context: (params, context) => context };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length };
      let throws = null;
      try {
        if (step.command) await expose.command(step.command.name, behaviors[step.command.behavior]);
        else handle(step.request);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      assert.deepEqual({ registered: registered.slice(before.registered), replies: replies.slice(before.replies), result: null, throws }, step.output, label);
    }
  }
});

test("view bridge cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-bridge")) {
    const sokView = viewWindow();
    const posted = [];
    const received = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const host = (message) => sokView.listener(JSON.parse(JSON.stringify(message)));
    const pending = new Map();
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      if (step.action === "create") assert.deepEqual({ ready: true }, step.output, label);
      else if (step.action === "request") {
        const promise = bridge.calls.request(step.input.command, step.input.params);
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "sidecar-send") {
        const promise = bridge.runtime.sidecar(step.input.sidecar).send(step.input.id, step.input.body);
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "sidecar-subscribe") {
        const promise = bridge.runtime.sidecar(step.input.sidecar).on(step.input.id, () => {});
        await settle();
        pending.set(posted[before].id, promise);
        assert.deepEqual(posted[before], step.output, label);
      } else if (step.action === "host-reply") {
        host(step.input);
        await settle();
        if (step.output !== undefined) {
          const value = await pending.get(step.input.id);
          assert.deepEqual(value, step.output, label);
        }
      } else if (step.action === "subscribe") {
        bridge.runtime.theme((data) => received.push(data));
      } else if (step.action === "host-event") {
        const count = received.length;
        host(step.input);
        await settle();
        assert.deepEqual(received[count], step.output, label);
      } else throw new Error(`unknown bridge step ${step.action} in ${label}`);
    }
  }
});

test("view native cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-native")) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const listeners = new Map();
    const removers = new Map();
    const listenerFor = (label) => {
      if (!listeners.has(label)) listeners.set(label, (data) => delivered.push({ listener: label, data }));
      return listeners.get(label);
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      if (step.on) {
        const promise = bridge.runtime.native.on(step.on.name, listenerFor(step.on.listener));
        if (step.answer) {
          await settle();
          sokView.listener({ sok: 1, id: posted.at(-1).id, ...step.answer });
        }
        try {
          const remove = await promise;
          removers.set(step.on.listener, remove);
          result = typeof remove;
        } catch (error) {
          throws = errorText(error);
        }
      } else if (step.off) {
        removers.get(step.off)();
      } else if (step.event) {
        sokView.listener({ sok: 1, event: step.event.event, data: step.event.data });
      } else throw new Error(`unknown native step in ${label}`);
      await settle();
      assert.deepEqual({ posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws }, pick(step.output, ["posted", "delivered", "result", "throws"]), label);
    }
  }
});

test("view composition cases replay against the composition model", async () => {
  const { elements: rects, cases } = fixtureFile("view-composition");
  for (const testCase of cases.filter((entry) => !EXCLUDED_CASES[entry.id])) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const elements = Object.fromEntries(Object.entries(rects).map(([name, rect]) => [name, rectElement(rect)]));
    // Answers the last posted call of the step, as the host does in posted order.
    const answer = async (payload) => {
      await settle();
      sokView.listener({ sok: 1, id: posted.at(-1).id, ...payload });
      await settle();
    };
    let composition = null;
    const subscriptions = [];
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      if (EXCLUDED_STEPS[testCase.id] && outsideComposition(step)) continue;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      try {
        if (step.create) {
          // The trace names the regions and overlays and gives their rectangles in elements; the page passes an element per name.
          const created = bridge.composition.create({
            regions: Object.fromEntries(step.create.regions.map((name) => [name, elements[name]])),
            overlays: Object.fromEntries(step.create.overlays.map((name) => [name, elements[name]])),
          });
          for (const payload of step.answers) await answer(payload);
          composition = await created;
          result = composition.kind;
        } else if (step.listen) {
          const region = composition.region(step.listen.region);
          // The trace names the listener and its kind; a message listener receives the message of each document-message event.
          const listener = step.listen.kind === "message"
            ? (message) => delivered.push({ listener: step.listen.listener, message })
            : (state) => delivered.push({ listener: step.listen.listener, state });
          result = typeof (step.listen.kind === "message" ? region.onMessage(listener) : region.onState(listener));
        } else if (step.event) {
          // A stream event carries its handle, a message event its message, and a state event its state.
          if ("handle" in step.event) {
            sokView.listener({ sok: 1, event: "document-stream", data: { document: step.event.document, handle: step.event.handle, message: step.event.message } });
          } else {
            const data = "message" in step.event
              ? { document: step.event.document, message: step.event.message }
              : { document: step.event.document, state: step.event.state };
            sokView.listener({ sok: 1, event: "message" in step.event ? "document-message" : "document-state", data });
          }
        } else if (step.dispose) {
          // The rejection is taken at once, because the answers of the step arrive before the dispose settles.
          const done = composition.dispose().then(() => null, errorText);
          for (const payload of step.answers) await answer(payload);
          throws = await done;
        } else if (step.close) {
          const done = subscriptions[step.close.subscription].close().then(() => null, errorText);
          for (const payload of step.answers) await answer(payload);
          throws = await done;
        } else if (step.do?.call === "subscribe") {
          // The trace names the listener of the subscription; the page passes a function that receives each message.
          const [stream, listenerName] = step.do.args;
          const listener = (message) => delivered.push({ listener: listenerName.replace("listener:", ""), message });
          const promise = composition.region(step.do.region).subscribe(stream, listener);
          for (const payload of step.answers) await answer(payload);
          const handle = await promise;
          subscriptions.push(handle);
          result = { stream: handle.stream, handle: handle.handle };
        } else if (step.do?.composition === "region") {
          result = composition.region(step.do.args[0]).name;
        } else if (step.do) {
          const promise = composition.region(step.do.region)[step.do.call](...step.do.args);
          for (const payload of step.answers) await answer(payload);
          await promise;
        } else throw new Error(`unknown composition step in ${label}`);
      } catch (error) {
        throws = errorText(error);
      }
      await settle();
      const state = composition ? composition.region("doc").state : null;
      const history = composition ? composition.region("doc").history : null;
      assert.deepEqual(
        { posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws, state, history },
        pick(step.output, ["posted", "delivered", "result", "throws", "state", "history"]),
        label,
      );
    }
  }
});

test("binder cases replay against the binder model", async () => {
  for (const testCase of replayable("create-binder")) {
    const { window } = new JSDOM("<div id='mount'></div>");
    const elements = new Map();
    const commands = new Map([
      ["fixture.save", (params) => { if (params?.fail) throw new Error("command failed"); return "accepted"; }],
      ["fixture.set", () => null],
    ]);
    const binder = createBinder((name, params) => commands.get(name)(params), {
      check(name) { if (!commands.has(name)) throw new Error(`command ${name} is not declared`); },
    });
    const root = window.document.createElement("div");
    window.document.body.append(root);
    const elementOf = (id, tag) => {
      if (!elements.has(id)) {
        const element = window.document.createElement(tag ?? "div");
        element.id = id;
        elements.set(id, element);
      }
      return elements.get(id);
    };
    const marking = (id) => {
      const element = elements.get(id);
      if (!element) return {};
      const fields = { command: element.dataset.command, params: element.dataset.params, value: element.dataset.value, live: element.dataset.live };
      return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      let id = null;
      let result = null;
      let error = null;
      try {
        if (step.element) {
          id = step.element.id;
          const element = elementOf(id, step.element.tag);
          (elements.get(step.element.parent) ?? root).append(element);
        } else if (step.mark) {
          id = step.mark.id;
          const element = elementOf(id, step.mark.tag);
          if (step.mark.command !== undefined) element.dataset.command = step.mark.command;
          if (step.mark.params !== undefined) element.dataset.params = JSON.stringify(step.mark.params);
          if (step.mark.valueName !== undefined) element.dataset.value = step.mark.valueName;
          if (step.mark.live) element.dataset.live = "";
          (elements.get(step.mark.parent) ?? root).append(element);
        } else if (step.bind) {
          id = step.bind.id;
          const element = elementOf(id, step.bind.tag);
          root.append(element);
          // The trace gives the when filter as the expected event fields; the page gives a predicate of the event.
          const when = step.bind.when ? (event) => Object.entries(step.bind.when).every(([key, value]) => event[key] === value) : undefined;
          // The trace gives paramsFromValue for params that a function reads from the value of the element at each run.
          const params = step.bind.paramsFromValue ? () => ({ value: element.value }) : step.bind.params;
          await binder.bind(element, step.bind.command, params, { event: step.bind.event, when, failed: () => {} });
        } else if (step.delegate) {
          await binder.delegate(root);
        } else if (step.event) {
          id = step.event.id;
          const element = elements.get(id);
          if (step.event.value !== undefined) element.value = step.event.value;
          const init = { bubbles: true, cancelable: true };
          const event = step.event.key !== undefined
            ? new window.KeyboardEvent(step.event.type, { ...init, key: step.event.key })
            : new window.Event(step.event.type, init);
          element.dispatchEvent(event);
          await new Promise((resolve) => setTimeout(resolve, 0));
        } else if (step.dispose) {
          binder.dispose();
        } else if (step.audit) {
          result = binder.audit(elements.get(step.audit.id) ?? root);
        } else if (step.run) {
          result = await binder.run(step.run.command, step.run.params);
        } else throw new Error(`unknown binder step in ${label}`);
      } catch (failure) {
        error = errorText(failure);
      }
      const state = binder.state();
      const output = {
        calls: state.calls,
        changed: state.changed,
        failed: state.failed,
        result,
        error,
        element: id === null ? null : marking(id),
      };
      assert.deepEqual(output, pick(step.output, ["calls", "changed", "failed", "result", "error", "element"]), label);
    }
  }
});

test("interactive cases replay against the binder audit", () => {
  const { window } = new JSDOM("<div></div>");
  const binder = createBinder(() => null, { check() {} });
  assert.equal(INTERACTIVE, fixtureFile("interactive").selector);
  for (const testCase of fixture("interactive")) {
    const root = window.document.createElement("div");
    root.innerHTML = testCase.markup;
    assert.deepEqual(binder.audit(root), testCase.output, testCase.id);
  }
});

test("draw list cases replay against the list model", async () => {
  for (const testCase of replayable("draw-list")) {
    const { window } = new JSDOM("<ul></ul>");
    const list = window.document.querySelector("ul");
    const created = [];
    const updated = [];
    let counter = 0;
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      let error = null;
      try {
        drawList(list, step.draw.entries, {
          key: (entry) => entry.id,
          create: (entry) => {
            created.push(entry.id);
            const node = window.document.createElement("li");
            node.id = `n${++counter}`;
            node.dataset.key = entry.id;
            return node;
          },
          update: (node, entry) => {
            updated.push(`${entry.id}:${entry.title}`);
            node.textContent = entry.title;
          },
        });
      } catch (failure) {
        error = errorText(failure);
      }
      const children = [...list.children];
      assert.deepEqual({
        order: children.map((node) => node.dataset.key),
        nodeIds: children.map((node) => node.id),
        text: children.map((node) => node.textContent),
        created: [...created],
        updated: [...updated],
        error,
      }, step.output, label);
    }
  }
});

test("declared UI snapshot cases replay against the snapshot sender", async () => {
  for (const testCase of replayable("declared-ui-snapshot")) {
    const sokView = viewWindow();
    globalThis.window.location = { host: "demo" };
    const posted = [];
    const reports = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: (event) => reports.push(event) });
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const reportsBefore = reports.length;
      let throws = null;
      try {
        if (step.push) bridge.snapshots.push(step.push.status, step.push.value);
        else if (step.ack) sokView.listener({ sok: 1, event: "declared-ui.snapshot.ack", data: { plugin: "demo", status: step.ack.status, seq: step.ack.seq } });
        else throw new Error(`unknown snapshot step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.deepEqual({ sent: posted.slice(before), reports: reports.slice(reportsBefore), delivered: [], result: null, throws }, step.output, label);
    }
  }
});

test("view settings cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-settings")) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const listeners = new Map();
    const listenerFor = (label) => {
      if (!listeners.has(label)) listeners.set(label, (data) => delivered.push({ listener: label, data }));
      return listeners.get(label);
    };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      try {
        if (step.read) {
          const promise = bridge.runtime[step.read].read();
          await settle();
          sokView.listener({ sok: 1, id: posted.at(-1).id, ...step.answer });
          result = await promise;
        } else if (step.subscribe) {
          const listener = step.subscribe.listener === null ? null : listenerFor(step.subscribe.listener);
          const promise = bridge.runtime[step.subscribe.kind].on(listener);
          if (step.answer) {
            await settle();
            sokView.listener({ sok: 1, id: posted.at(-1).id, ...step.answer });
          }
          result = typeof (await promise);
        } else if (step.event) {
          sokView.listener({ sok: 1, event: step.event.event, data: step.event.data });
        } else throw new Error(`unknown settings step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.deepEqual({ posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws }, pick(step.output, ["posted", "delivered", "result", "throws"]), label);
    }
  }
});

test("view command cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-commands")) {
    const sokView = viewWindow();
    const posted = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const behaviors = { echo: (params) => params, fail: () => { throw new Error("save failed"); }, none: () => undefined, context: (params, context) => context };
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      let result = null;
      let throws = null;
      try {
        if (step.register) {
          const run = typeof step.register.run === "string" && step.register.run in behaviors ? behaviors[step.register.run] : step.register.run;
          const promise = bridge.commands.register(step.register.name, run);
          if (step.answer ?? step.register.answer) {
            await settle();
            sokView.listener({ sok: 1, id: posted.at(-1).id, ...(step.answer ?? step.register.answer) });
          }
          result = await promise;
        } else if (step.request) {
          sokView.listener({ sok: 1, ...step.request });
        } else throw new Error(`unknown command step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.deepEqual({ posted: posted.slice(before), result, throws }, pick(step.output, ["posted", "result", "throws"]), label);
    }
  }
});

// The page origin of the operation cases: the identifiers of the cases are p$ORIGIN.<n>, and the model takes this origin.
const ORIGIN = 1700000000000;

test("view status cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-status")) {
    const sokView = viewWindow();
    const posted = [];
    const delivered = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {} });
    const stops = new Map();
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      try {
        if (step.watch) {
          const listener = step.watch.listener === null ? null : (data) => delivered.push({ listener: step.watch.listener, data });
          const stop = bridge.runtime.status.watch(step.watch.name, listener);
          if (step.watch.listener !== null) stops.set(step.watch.listener, stop);
          result = typeof stop === "function" ? "function" : stop;
        } else if (step.stop) {
          stops.get(step.stop)();
        } else if (step.event) {
          sokView.listener({ sok: 1, event: step.event.event, data: step.event.data });
        } else throw new Error(`unknown status step in ${label}`);
        for (const [id, reply] of Object.entries(step.replies ?? {})) {
          await settle();
          sokView.listener({ sok: 1, id: Number(id), ...reply });
        }
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.deepEqual({ posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws }, pick(step.output, ["posted", "delivered", "result", "throws"]), label);
    }
  }
});

test("view operation cases replay against the bridge model", async () => {
  for (const testCase of replayable("view-operations")) {
    const sokView = viewWindow();
    const posted = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) }, report: () => {}, origin: ORIGIN });
    const named = new Map();
    const resolve = (cids) => (typeof cids === "string" ? named.get(cids) : cids);
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      let result = null;
      let throws = null;
      try {
        let promise = null;
        if (step.operation) {
          result = bridge.runtime.beginOperation(step.operation.event, step.operation.fields);
          named.set(step.operation.as, result);
        } else if (step.sidecar) {
          promise = bridge.runtime.sidecar(step.sidecar.name).send(step.sidecar.id, step.sidecar.body, resolve(step.sidecar.cids));
        } else if (step.command) {
          promise = bridge.runtime.command(step.command.name, step.command.params, { cids: resolve(step.command.cids) });
        } else throw new Error(`unknown operation step in ${label}`);
        if (step.answer) {
          await settle();
          sokView.listener({ sok: 1, id: posted.at(-1).id, ...step.answer });
        }
        if (promise !== null) result = await promise;
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      const expected = JSON.parse(JSON.stringify(step.output).replaceAll("p$ORIGIN.", `p${ORIGIN}.`));
      assert.deepEqual({ posted: posted.slice(before), result, throws }, pick(expected, ["posted", "result", "throws"]), label);
    }
  }
});

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function elementOf(name, rect, effects) {
  const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, x: rect.left, y: rect.top };
  return { getBoundingClientRect: () => box, click: () => effects.push(`click ${name.split(".").pop()}`) };
}

function rectElement(rect) {
  return { getBoundingClientRect: () => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }) };
}
