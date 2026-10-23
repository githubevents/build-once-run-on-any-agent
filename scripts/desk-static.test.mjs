import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/desk/app.js", import.meta.url), "utf8");

function setup(extra = {}) {
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
      ...extra.document,
    },
    window: extra.window ?? {},
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

test("fallback shows the desk photo once when WebGL is unavailable", () => {
  const children = [];
  const desk = {
    dataset: { alt: "A developer's desk" },
    querySelector: () => children[0] ?? null,
    prepend: (node) => children.unshift(node),
  };
  const window = {};
  setup({
    window,
    document: { querySelector: () => desk, createElement: (tag) => ({ tag }) },
  });
  window.deskFallback();
  window.deskFallback();
  assert.equal(children.length, 1);
  assert.equal(children[0].tag, "img");
  assert.equal(children[0].src, "assets/decal.jpg");
  assert.equal(children[0].alt, "A developer's desk");
});

test("every HTML hotspot has a 3D object and no object lacks a hotspot", async () => {
  const html = await readFile(new URL("../site/desk/index.html", import.meta.url), "utf8");
  const scene = await readFile(new URL("../site/desk/desk3d.js", import.meta.url), "utf8");
  const spots = [...html.matchAll(/class="spot" data-id="([^"]+)"/g)].map((match) => match[1]);
  const returned = scene.match(/scene\.add\(laptop\.group[^;]*;\s*return \{([^}]*)\}/)[1];
  const objects = [...returned.matchAll(/^\s*(\w+)/gm)].map((match) => match[1]);
  assert.equal(spots.length, 10);
  assert.deepEqual(objects, spots);
});

test("3D scene uses meshes and no Gaussian splat assets", async () => {
  const files = ["desk3d.js", "parts.js", "textures.js", "screens.js"];
  for (const file of files) {
    const code = await readFile(new URL(`../site/desk/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /spark|\.spz|SplatMesh/i, file);
  }
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@sparkjsdev/spark"], undefined);
  assert.ok(pkg.dependencies.three);
});
