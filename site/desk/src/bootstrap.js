import { createFrameMonitor } from "./performance.js";

const fallback = (reason, error) => {
  console.warn(`Desk: ${reason}; using the flat version.`, error ?? "");
  location.replace(new URL("flat/", location.href));
};

const params = new URLSearchParams(location.search);
const force3D = params.get("room") === "1" || params.get("3d") === "1";
const canvas = document.getElementById("scene");

if (params.get("flat") === "1") {
  fallback("flat view requested");
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
      if (/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(renderer)) {
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
