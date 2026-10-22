import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/desk/app.js", import.meta.url), "utf8");

function setup() {
  const panels = Object.fromEntries(["demos", "about"].map((id) => {
    const dialog = new EventTarget();
    dialog.open = false;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
    const link = Object.assign(new EventTarget(), { dataset: { dialog: id } });
    const close = Object.assign(new EventTarget(), { closest: () => dialog });
    return [id, { dialog, link, close }];
  }));
  const entries = Object.values(panels);
  runInNewContext(source, {
    document: {
      querySelectorAll: (selector) => ({
        "[data-dialog]": entries.map((panel) => panel.link),
        "[data-close]": entries.map((panel) => panel.close),
        dialog: entries.map((panel) => panel.dialog),
      })[selector],
      getElementById: (id) => panels[id.replace("dialog-", "")].dialog,
    },
  });
  return panels;
}

function click(element) {
  const event = new Event("click", { cancelable: true });
  element.dispatchEvent(event);
  return event;
}

test("photo panel links open their own dialog without navigating", () => {
  const panels = setup();
  for (const panel of Object.values(panels)) {
    assert.equal(click(panel.link).defaultPrevented, true);
    assert.equal(panel.dialog.open, true);
    assert.equal(click(panel.close).defaultPrevented, true);
    assert.equal(panel.dialog.open, false);
  }
});

test("backdrop dismisses only when both press and release target the backdrop", () => {
  const { dialog, link } = setup().demos;
  click(link);
  dialog.dispatchEvent(new Event("pointerdown"));
  click(dialog);
  assert.equal(dialog.open, false);

  click(link);
  const content = {};
  const press = new Event("pointerdown");
  Object.defineProperty(press, "target", { value: content });
  dialog.dispatchEvent(press);
  click(dialog);
  assert.equal(dialog.open, true);

  dialog.dispatchEvent(new Event("pointerdown"));
  const release = new Event("click");
  Object.defineProperty(release, "target", { value: content });
  dialog.dispatchEvent(release);
  assert.equal(dialog.open, true);
  click(dialog);
  assert.equal(dialog.open, true);
});
