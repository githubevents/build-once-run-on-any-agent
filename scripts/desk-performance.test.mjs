import assert from "node:assert/strict";
import { test } from "node:test";
import { createFrameMonitor } from "../site/desk/src/performance.js";

function fixture(initialRatio = 2) {
  let ratio = initialRatio, now = 0;
  const samples = [];
  const monitor = createFrameMonitor({
    pixelRatio: () => ratio,
    reduceResolution: () => {
      if (ratio <= 0.75) return false;
      ratio = Math.max(0.75, ratio * 0.75);
      return true;
    },
    onSample: (sample) => samples.push(sample),
  });
  monitor.sample(now);
  return {
    samples,
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
});

test("slow rendering lowers resolution and keeps recovered quality stable", () => {
  const f = fixture();
  f.run(30, 40);
  assert.ok(f.samples.some((s) => s.reduced));
  assert.equal(f.samples.at(-1).pixelRatio, 0.75);
  f.run(120, 30);
  assert.ok(f.samples.slice(-5).every((s) => s.pixelRatio === 0.75));
});

test("slow rendering at minimum resolution keeps sampling without lowering quality further", () => {
  const f = fixture(0.75);
  f.run(15, 30);
  assert.ok(f.samples.every((s) => !s.reduced));
});

test("very slow rendering stays at minimum resolution instead of replacing 3D", () => {
  const f = fixture();
  f.run(5, 27);
  assert.ok(f.samples.some((s) => s.reduced));
  f.run(5, 9);
  assert.ok(f.samples.at(-1).fps < 10);
  assert.equal(f.samples.at(-1).pixelRatio, 0.75);
});

test("startup spikes and hidden-tab gaps do not lower quality", () => {
  const f = fixture();
  f.jump(1500, true);
  f.jump(900, true);
  f.run(60, 7);
  f.jump(600000, false);
  f.jump(600000, true);
  f.run(60, 10);
  assert.ok(f.samples.every((s) => !s.reduced));
});
