const fallback = (reason, error) => {
  console.warn(`Desk: ${reason}; using the flat version.`, error ?? "");
  location.replace(new URL("flat/", location.href));
};

const connection = navigator.connection;
const small = matchMedia("(max-width: 819px), (max-height: 499px)").matches;
const slow = navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2 ||
  connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("scene");

if (small || slow || reducedMotion) {
  fallback("small viewport, constrained device, or reduced motion");
} else {
  let context, contextError;
  try {
    context = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
  } catch (error) {
    contextError = error;
  }
  if (!context) {
    fallback("WebGL2 is unavailable", contextError);
  } else {
    let finished = false;
    let timer;
    const fail = (reason, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fallback(reason, error);
    };
    timer = setTimeout(() => fail("scene loading timed out"), 20000);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      fallback("WebGL context was lost");
    });
    try {
      const { startDesk } = await import("./app.js");
      await startDesk(context, (error) => fallback("rendering failed", error));
      if (!finished) {
        finished = true;
        clearTimeout(timer);
      }
      if (!new URLSearchParams(location.search).has("capture")) {
        // Allow shader compilation to settle before measuring sustained frame time.
        let previous = performance.now(), frames = 0, elapsed = 0, warmup = 90;
        const measure = (now) => {
          const delta = now - previous;
          previous = now;
          if (!document.hidden) {
            if (warmup > 0) warmup--;
            else { frames++; elapsed += delta; }
          }
          if (elapsed >= 4000) {
            if (frames / elapsed * 1000 < 18) fallback("sustained rendering below 18 fps");
          } else requestAnimationFrame(measure);
        };
        requestAnimationFrame(measure);
      }
    } catch (error) {
      fail("3D scene failed to initialize", error);
    }
  }
}
