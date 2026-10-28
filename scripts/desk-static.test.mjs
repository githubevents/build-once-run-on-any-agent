import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/desk/app.js", import.meta.url), "utf8");

function setup({ reducedMotion = false } = {}) {
  const panels = Object.fromEntries(["demos", "about"].map((id) => {
    const dialog = new EventTarget();
    dialog.open = false;
    dialog.videos = [{ dataset: { poster: `${id}.jpg` } }];
    dialog.querySelectorAll = (selector) => (selector === "video[data-poster]" ? dialog.videos : []);
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
    const link = Object.assign(new EventTarget(), { dataset: { dialog: id } });
    const close = Object.assign(new EventTarget(), { closest: () => dialog });
    return [id, { dialog, link, close }];
  }));
  const entries = Object.values(panels);
  const style = new Map();
  const desk = { style: { setProperty: (name, value) => style.set(name, value) } };
  const stage = Object.assign(new EventTarget(), {
    querySelector: (selector) => (selector === ".desk" ? desk : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
  });
  runInNewContext(source, {
    matchMedia: () => ({ matches: reducedMotion }),
    document: {
      querySelectorAll: (selector) => ({
        "[data-dialog]": entries.map((panel) => panel.link),
        "[data-close]": entries.map((panel) => panel.close),
        dialog: entries.map((panel) => panel.dialog),
      })[selector],
      getElementById: (id) => (id === "stage" ? stage : panels[id.replace("dialog-", "")].dialog),
    },
  });
  return Object.assign(panels, { stage, style });
}

function click(element) {
  const event = new Event("click", { cancelable: true });
  element.dispatchEvent(event);
  return event;
}

test("photo panel links open their own dialog without navigating", () => {
  const panels = setup();
  for (const panel of [panels.demos, panels.about]) {
    assert.equal(click(panel.link).defaultPrevented, true);
    assert.equal(panel.dialog.open, true);
    assert.equal(click(panel.close).defaultPrevented, true);
    assert.equal(panel.dialog.open, false);
  }
});

test("video posters load only when their dialog opens", () => {
  const { demos } = setup();
  assert.equal(demos.dialog.videos[0].poster, undefined);
  click(demos.link);
  assert.equal(demos.dialog.videos[0].poster, "demos.jpg");
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

function move(stage, clientX, clientY) {
  stage.dispatchEvent(Object.assign(new Event("pointermove"), { clientX, clientY }));
}

const flat = { "--ry": "0deg", "--rx": "0deg", "--tx": "0px", "--ty": "0px" };

test("pointer tilts the desk and pointerleave resets it", () => {
  const { stage, style } = setup();
  move(stage, 200, 0);
  assert.deepEqual(Object.fromEntries(style), { "--ry": "2.5deg", "--rx": "2deg", "--tx": "-5px", "--ty": "4px" });
  stage.dispatchEvent(new Event("pointerleave"));
  assert.deepEqual(Object.fromEntries(style), flat);
});

test("opening a dialog resets the tilt and holds it flat", () => {
  const { stage, style, demos } = setup();
  move(stage, 0, 100);
  click(demos.link);
  assert.deepEqual(Object.fromEntries(style), flat);
  move(stage, 200, 0);
  assert.deepEqual(Object.fromEntries(style), flat);
});

test("reduced motion keeps the desk flat", () => {
  const { stage, style } = setup({ reducedMotion: true });
  move(stage, 200, 0);
  assert.deepEqual(Object.fromEntries(style), flat);
});
