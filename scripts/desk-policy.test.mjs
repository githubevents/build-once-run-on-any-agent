import assert from "node:assert/strict";
import { test } from "node:test";

for (const [name, overrides] of Object.entries({
  "reduced motion": { reducedMotion: true },
  "phone with low memory still attempts WebGL": { small: true, navigator: { deviceMemory: 1 } },
  "low core count still attempts WebGL": { navigator: { hardwareConcurrency: 1 } },
  "data saver still attempts WebGL": { navigator: { connection: { saveData: true } } },
  "2G connection still attempts WebGL": { navigator: { connection: { effectiveType: "2g" } } },
  "SwiftShader": { renderer: "ANGLE SwiftShader" },
  "llvmpipe": { renderer: "Mesa llvmpipe" },
  "softpipe": { renderer: "softpipe" },
  "lavapipe": { renderer: "lavapipe" },
  "basic render": { renderer: "Microsoft Basic Render Driver" },
  "masked software renderer": { renderer: "WebKit WebGL", unmasked: "SwiftShader" },
  "forced retry attempts WebGL despite reduced motion": { reducedMotion: true, force: true },
  "no WebGL2": {},
  "WebGL context creation throws": { contextError: true },
})) {
  test(`${name}: respects capability policy and project-relative fallback`, async (t) => {
    const redirects = [];
    const warnings = [];
    const contextCalls = [];
    const values = {
      navigator: { deviceMemory: 8, hardwareConcurrency: 8, ...overrides.navigator },
      matchMedia: (query) => ({
        matches: query.includes("max-width") ? !!overrides.small : !!overrides.reducedMotion,
      }),
      document: {
        getElementById: () => ({
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
        href: `https://example.test/build-once-run-on-any-agent/${overrides.force ? "?3d=1" : "?ignored=true"}`,
        search: overrides.force ? "?3d=1" : "?ignored=true",
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
    if (overrides.reducedMotion && !overrides.force) {
      assert.equal(contextCalls.length, 0);
    } else {
      assert.equal(contextCalls.length, 1);
      assert.equal(contextCalls[0].type, "webgl2");
      assert.equal(contextCalls[0].options.failIfMajorPerformanceCaveat, !overrides.force);
    }
    if (overrides.renderer) assert.match(warnings[0][1].message, /Software renderer/);
  });
}
