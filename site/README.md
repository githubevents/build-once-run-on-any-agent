# Talk website

Static desk landing page for GitHub Pages, with a Reveal.js deck viewer when a
deck is supplied. The laptop opens both demo recordings and skill links; the
ideas note opens the about panel and README. Other desk objects link directly
to the repository, slides folder, speakers, playlist, and Procore.
The GitHub sticker intentionally remains a marked `#survey` placeholder.

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

Drag to orbit through 360 degrees; arrow keys orbit/tilt, and Home resets the
view. Every device using the 3D view loads `desk-500k.spz`; the uncleaned 150k
scene is not included. Small viewports (under 820 px wide or 500 px high), reduced
motion, very low memory/core counts, data saver/2G, unavailable WebGL2,
initialization failures/timeouts, lost WebGL contexts, and sustained rendering
below 18 fps select `flat/`. The flat version keeps all nine hotspots and both
panels, including when JavaScript is disabled.

The original `decal-mask.png`, `decal-mask-screen.png`, and `decal-mask-base.png`
in `assets/` are used exactly as referenced by the supplied source and world
configuration. The scene, camera, and hotspot coordinates are unchanged.

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
