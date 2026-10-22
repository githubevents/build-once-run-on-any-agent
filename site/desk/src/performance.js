export function createFrameMonitor({ pixelRatio, reduceResolution, onSample }) {
  let previous, warmup = 2000, elapsed = 0, frames = 0;
  function reset() {
    previous = undefined;
    warmup = 2000;
    elapsed = 0;
    frames = 0;
  }
  function sample(now, visible = true) {
    if (!visible) { reset(); return; }
    if (previous === undefined) { previous = now; return; }
    const delta = now - previous;
    previous = now;
    if (warmup > 0) { warmup -= delta; return; }
    elapsed += delta;
    frames++;
    if (elapsed < 4000) return;
    const fps = frames * 1000 / elapsed;
    const before = pixelRatio();
    const reduced = fps < 45 && reduceResolution();
    onSample({ fps, pixelRatio: pixelRatio(), previousPixelRatio: before, reduced });
    elapsed = 0;
    frames = 0;
    if (reduced) warmup = 2000;
  }
  return { sample, reset };
}
