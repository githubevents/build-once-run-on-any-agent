import assert from "node:assert/strict";
import { test } from "node:test";

for (const [name, overrides] of Object.entries({
  "small viewport": { small: true },
  "reduced motion": { reducedMotion: true },
  "low memory": { navigator: { deviceMemory: 2 } },
  "low core count": { navigator: { hardwareConcurrency: 2 } },
  "data saver": { navigator: { connection: { saveData: true } } },
  "2G connection": { navigator: { connection: { effectiveType: "2g" } } },
  "slow 2G connection": { navigator: { connection: { effectiveType: "slow-2g" } } },
  "no WebGL2": {},
  "WebGL context creation throws": { contextError: true },
})) {
  test(`${name} selects the project-relative flat fallback`, async (t) => {
    const redirects = [];
    const warnings = [];
    const values = {
      navigator: { deviceMemory: 8, hardwareConcurrency: 8, ...overrides.navigator },
      matchMedia: (query) => ({
        matches: query.includes("max-width") ? !!overrides.small : !!overrides.reducedMotion,
      }),
      document: {
        getElementById: () => ({
          getContext: () => {
            if (overrides.contextError) throw new Error("WebGL disabled");
            return null;
          },
        }),
      },
      location: {
        href: "https://example.test/build-once-run-on-any-agent/?ignored=true",
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
  });
}
