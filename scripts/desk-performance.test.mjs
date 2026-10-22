import assert from "node:assert/strict";
import { test } from "node:test";
import { createFrameMonitor } from "../site/desk/src/performance.js";

function fixture(initialRatio = 2) {
  let ratio = initialRatio, now = 0;
  const samples = [], fallbacks = [];
  const monitor = createFrameMonitor({
    pixelRatio: () => ratio,
    reduceResolution: () => {
      if (ratio <= 0.75) return false;
      ratio = Math.max(0.75, ratio * 0.75);
      return true;
    },
    onSample: (sample) => samples.push(sample),
    onFallback: (fps) => fallbacks.push(fps),
  });
  monitor.sample(now);
  return {
    samples, fallbacks,
    run(fps, seconds) {
      for (let i = 0; i < fps * seconds; i++) monitor.sample(now += 1000 / fps);
    },
    jump(ms, visible) { monitor.sample(now += ms, visible); },
  };
}

test("healthy Retina frame rate keeps its resolution and 3D", () => {
  const f = fixture();
  f.run(60, 30);
  assert.ok(f.samples.length > 0);
  assert.ok(f.samples.every((s) => !s.reduced && s.pixelRatio === 2));
  assert.deepEqual(f.fallbacks, []);
});

test("slow rendering lowers resolution before flat and keeps recovered quality stable", () => {
  const f = fixture();
  f.run(30, 40);
  assert.ok(f.samples.some((s) => s.reduced));
  assert.equal(f.samples.at(-1).pixelRatio, 0.75);
  f.run(120, 30);
  assert.ok(f.samples.slice(-5).every((s) => s.pixelRatio === 0.75));
  assert.deepEqual(f.fallbacks, []);
});

test("15 fps at minimum resolution no longer triggers the old 18 fps fallback", () => {
  const f = fixture(0.75);
  f.run(15, 30);
  assert.ok(f.samples.every((s) => !s.reduced));
  assert.deepEqual(f.fallbacks, []);
});

test("flat is a last resort after two very slow windows at minimum resolution", () => {
  const f = fixture();
  f.run(5, 27);
  assert.ok(f.samples.some((s) => s.reduced));
  assert.deepEqual(f.fallbacks, []);
  f.run(5, 9);
  assert.ok(f.fallbacks.length > 0);
  assert.ok(f.fallbacks.every((fps) => fps < 10));
  assert.equal(f.samples.at(-1).pixelRatio, 0.75);
});

test("recovery resets the consecutive low-frame-rate windows", () => {
  const f = fixture(0.75);
  f.run(5, 7);
  assert.deepEqual(f.fallbacks, []);
  f.run(60, 5);
  f.run(5, 4);
  assert.deepEqual(f.fallbacks, []);
});

test("startup spikes and hidden-tab gaps do not lower quality or force flat", () => {
  const f = fixture();
  f.jump(1500, true);
  f.jump(900, true);
  f.run(60, 7);
  f.jump(600000, false);
  f.jump(600000, true);
  f.run(60, 10);
  assert.ok(f.samples.every((s) => !s.reduced));
  assert.deepEqual(f.fallbacks, []);
});
