import assert from "node:assert/strict";
import { test } from "node:test";

for (const [name, overrides] of Object.entries({
  "reduced motion still loads 3D": { reducedMotion: true, renderer: "Apple M5 Pro" },
  "phone with low memory still loads 3D": { small: true, renderer: "Apple GPU", navigator: { deviceMemory: 1, userAgent: "iPhone" } },
  "low core count still loads 3D": { renderer: "Apple GPU", navigator: { hardwareConcurrency: 1 } },
  "data saver still loads 3D": { renderer: "Apple GPU", navigator: { connection: { saveData: true } } },
  "2G connection still loads 3D": { renderer: "Apple GPU", navigator: { connection: { effectiveType: "2g" } } },
  "SwiftShader": { renderer: "ANGLE SwiftShader" },
  "llvmpipe": { renderer: "Mesa llvmpipe" },
  "softpipe": { renderer: "softpipe" },
  "lavapipe": { renderer: "lavapipe" },
  "basic render": { renderer: "Microsoft Basic Render Driver" },
  "generic software renderer": { renderer: "Software Rasterizer" },
  "masked software renderer": { renderer: "WebKit WebGL", unmasked: "SwiftShader" },
  "room override bypasses software detection": { renderer: "SwiftShader", search: "?room=1", force: true },
  "legacy 3D retry still works": { renderer: "SwiftShader", search: "?3d=1", force: true },
  "explicit flat overrides room": { renderer: "Apple GPU", search: "?flat=1&room=1", flat: true },
  "room cannot override missing WebGL2": { search: "?room=1", force: true },
  "no WebGL2": {},
  "WebGL context creation throws": { contextError: true },
})) {
  test(`${name}: respects capability policy and project-relative fallback`, async (t) => {
    const redirects = [];
    const warnings = [];
    const contextCalls = [];
    let sceneLoads = 0;
    t.mock.method(globalThis, "fetch", async () => {
      sceneLoads++;
      throw new Error("Scene fixture load failure");
    });
    const values = {
      navigator: { deviceMemory: 8, hardwareConcurrency: 8, ...overrides.navigator },
      matchMedia: (query) => ({
        matches: query.includes("max-width") ? !!overrides.small : !!overrides.reducedMotion,
      }),
      document: {
        getElementById: () => ({
          addEventListener: () => {},
          getContext: (type, options) => {
            contextCalls.push({ type, options });
            if (overrides.contextError) throw new Error("WebGL disabled");
            if (overrides.renderer) return {
              RENDERER: 1,
              getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
              getParameter: (key) => key === 2 ? overrides.unmasked ?? overrides.renderer : overrides.renderer,
            };
            return null;
          },
        }),
      },
      location: {
        href: `https://example.test/build-once-run-on-any-agent/${overrides.search ?? "?ignored=true"}`,
        search: overrides.search ?? "?ignored=true",
        replace: (url) => redirects.push(String(url)),
      },
    };
    for (const [key, value] of Object.entries(values)) {
      const original = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, { value, configurable: true });
      t.after(() => {
        if (original) Object.defineProperty(globalThis, key, original);
        else delete globalThis[key];
      });
    }
    t.mock.method(console, "warn", (...args) => warnings.push(args));
    const url = new URL("../site/desk/src/bootstrap.js", import.meta.url);
    url.searchParams.set("case", name);
    await import(url.href);
    assert.ok(redirects.length > 0);
    assert.ok(redirects.every((url) =>
      url === "https://example.test/build-once-run-on-any-agent/flat/"));
    assert.match(warnings[0][0], /using the flat version/);
    if (overrides.flat) {
      assert.equal(contextCalls.length, 0);
    } else {
      assert.equal(contextCalls.length, 1);
      assert.equal(contextCalls[0].type, "webgl2");
      assert.equal(contextCalls[0].options.failIfMajorPerformanceCaveat, !overrides.force);
    }
    const loads3D = !overrides.flat && overrides.renderer &&
      (overrides.force || !/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(overrides.unmasked ?? overrides.renderer));
    assert.equal(sceneLoads, loads3D ? 1 : 0);
    if (loads3D) assert.match(warnings[0][1].message, /Scene fixture load failure/);
    else if (overrides.renderer && !overrides.flat) assert.match(warnings[0][1].message, /Software renderer/);
  });
}
