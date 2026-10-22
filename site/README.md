# Talk website

Static desk landing page for GitHub Pages, with a Reveal.js deck viewer when a
deck is supplied. The laptop opens both demo recordings and skill links; the
ideas note opens the about panel and README. Other desk objects link directly
to the repository, slides folder, speakers, GitHub September updates video, Procore,
and the session survey (GitHub sticker).

## Build locally

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. Requires Node.js 22 or later.

The shipped scene and flat fallback live in `site/desk/`. The build bundles
`site/desk/src/bootstrap.js` and `app.js` with the pinned Three.js, Spark, and
esbuild versions; no CDN or runtime npm access is required. All site URLs are
relative so Pages project subpaths work. The SPZ file is under 8 MB;
the repository does not use Git LFS and this does not require it.

Drag for front-facing parallax; arrow keys orbit/tilt, and Home resets the
view. Every device using the 3D view loads `desk-500k.spz`; the uncleaned 150k
scene is not included. Yaw is limited to +/-8 degrees and tilt to +/-2 degrees
around the original pose, avoiding the generated scene's distorted side views.
Touch tilt and zoom stay locked to the original downward-facing pose.
At the original pose the camera matches the source photo (`decal.jpg`), so a
camera-locked quad shows that sharp photo over the splats, below the hotspot
highlights. It fades out within about 1 degree of orbit or 2% zoom, and the view
eases back to the original pose 0.8 seconds after dragging, wheel zoom, or arrow
keys stop. In portrait its edges feather into the surrounding splat scene.
Phones and tablets use 3D by default. The fixed, edge-to-edge canvas follows its
container through a ResizeObserver; picking uses the same canvas bounds.
Portrait uses an 88-degree vertical FOV with a 2.2% horizontal lens shift
to keep the laptop, both nameplates, notebook and all hotspots near the screen edges
with a margin. It prioritizes access to every
hotspot over hiding the generated surroundings; desktop's initial framing is
unchanged. Drag horizontally or tap a visible hotspot.
Pixel ratio starts between 1 and 2 with a 4.2-million-pixel budget (except when
even DPR 1 exceeds that budget). Every
four visible seconds, sustained rendering below 45 fps lowers pixel ratio by
25%, down to 0.75 (or the initial cap if lower), without replacing the clean
500k scene. Startup and hidden-tab time are excluded. Changes are logged to
the console; the latest sample is available as `window.__desk.performance`.
Exact hotspot occlusion scans are cached by camera position and spread across
frames after damping stops completely; taps still check occlusion before opening links.
Spark uses full-precision intermediate splat centers to prevent camera-relative
repacking from making stationary details shimmer during orbit.
Idle views skip GPU redraws; camera, highlights, resize, and Spark sort updates
trigger rendering without lowering resolution.

Unavailable WebGL2, software renderers (SwiftShader, llvmpipe, softpipe, lavapipe,
Software, Basic Render), major performance caveats, scene failures/timeouts and
lost contexts select `flat/`. Screen size, touch, user agent, reduced motion,
memory/core counts, connection type and low frame rate do not select flat.
Slow rendering lowers resolution through the same monitor without replacing 3D.
Use `?room=1` to bypass software/caveat detection or `?flat=1` to select flat
explicitly (flat takes precedence). The existing `?3d=1` retry still works.
Missing WebGL2 and scene/context failures still fall back safely, even when forced.
The flat page fits the whole desk and keeps all nine hotspots and both panels,
including when JavaScript is disabled.

`decal-mask.png`, `decal-mask-screen.png`, and `decal-mask-base.png` in
`assets/` keep the supplied shapes and file names, with edges smoothed so the
shader's 0.5 cutoff follows sub-pixel contours instead of the 1280×720 pixel
staircase. The scene, camera, and hotspot coordinates are unchanged.

## Add the deck

Save the finished presentation as `slides/talk.pptx`. The build converts it to
PDF with LibreOffice, renders slide images with Poppler, and creates a Reveal.js
viewer with keyboard navigation, slide links, and fullscreen (`F`).

For the closest match to PowerPoint, also export `slides/talk.pdf` from
PowerPoint. The build prefers that PDF over automatic conversion. Refresh the
PDF whenever you change the deck, or remove it to use automatic conversion.
PDF-only input works too.

Local deck builds need `soffice`, `pdftoppm`, and `pdftotext` on `PATH`. The
Pages workflow installs these automatically. Slides are static images:
PowerPoint animations, transitions, and embedded media do not carry over.
Review fonts and layout after conversion. Extracted PDF text supplies image
descriptions; review those for accessibility as well.

Both supplied deck files become public downloads. Remove private speaker notes,
comments, and hidden slides before adding the PowerPoint.

## Publish from this repository

In **Settings > Pages > Build and deployment**, select **GitHub Actions**.
After the changes reach `main`, `.github/workflows/pages.yml` builds and
deploys only `dist/`. Pull requests build the site without publishing it.

The deployed address is shown under **Settings > Pages** once built; find it
there rather than assuming a fixed domain, since it depends on repo visibility
and the GitHub instance hosting Pages. While this repository is private, the
site requires GitHub sign-in to view. The site needs no Express server or
separate repository.
