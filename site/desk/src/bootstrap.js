import { createFrameMonitor } from "./performance.js";

const fallback = (reason, error) => {
  console.warn(`Desk: ${reason}; using the flat version.`, error ?? "");
  location.replace(new URL("flat/", location.href));
};

const force3D = new URLSearchParams(location.search).get("3d") === "1";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("scene");

if (reducedMotion && !force3D) {
  fallback("reduced motion");
} else {
  let context, contextError;
  try {
    context = canvas.getContext("webgl2", {
      antialias: false, powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: !force3D,
    });
    if (context && !force3D) {
      const debug = context.getExtension("WEBGL_debug_renderer_info");
      const renderer = [
        context.getParameter(context.RENDERER),
        debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "",
      ].join(" ");
      if (/swiftshader|llvmpipe|softpipe|lavapipe|basic render/i.test(renderer)) {
        context = null;
        contextError = new Error(`Software renderer: ${renderer}`);
      }
    }
  } catch (error) {
    context = null;
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
      const desk = await startDesk(context, (error) => fallback("rendering failed", error));
      if (!finished) {
        finished = true;
        clearTimeout(timer);
      }
      const monitor = createFrameMonitor({
        ...desk,
        onSample: (sample) => {
          window.__desk.performance = sample;
          if (sample.reduced) console.info("Desk: lowering rendering resolution.", sample);
        },
        onFallback: (fps) => {
          if (!force3D) fallback(`sustained ${fps.toFixed(1)} fps at minimum pixel ratio ${desk.pixelRatio().toFixed(2)}`);
        },
      });
      document.addEventListener("visibilitychange", monitor.reset);
      const measure = (now) => {
        monitor.sample(now, !document.hidden);
        requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
    } catch (error) {
      fail("3D scene failed to initialize", error);
    }
  }
}
