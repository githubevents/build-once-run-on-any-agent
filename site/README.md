# Talk website

Static desk landing page for GitHub Pages, with a Reveal.js deck viewer when a
deck is supplied. The laptop opens both demo recordings and skill links; the
ideas note opens the about panel and README. Other desk objects link directly
to the repository, slides folder, speakers, GitHub September updates video, a YouTube
Music playlist (headphones), Procore, and the session survey (GitHub sticker).

## Build locally

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. Requires Node.js 22 or later.

The desk lives in `site/desk/`. It is a Three.js scene built from real meshes,
not a photo or Gaussian splat, so it stays sharp at every angle:

- `desk3d.js` sets up the renderer, `RoomEnvironment` lighting, soft shadows,
  `OrbitControls`, aspect-aware camera framing, and hotspot picking.
- `parts.js` builds each desk object from Three.js geometry.
- `textures.js` and `screens.js` draw the high-DPI canvas textures: wood, the
  laptop README screen, phone feed, nameplates, notes, and stickers.

`three` is pinned in `package.json`. The build copies the files it needs into
`dist/vendor/three/`, and an import map loads them, so there is no bundler or
CDN. All site URLs are relative so Pages project subpaths work. Old `flat/`
links redirect to the same desk.

Drag to orbit, scroll or pinch to zoom, and use **Reset view** to return. The
camera fits every object, from the notebook to the phone, at any aspect ratio.
Click or tap an object to open it. The SVG hotspot links stay in the page as
accessible controls: Tab or the arrow keys move focus and highlight the
matching 3D object, and Enter opens it. Without WebGL, the page shows the
original photo (`assets/decal.jpg`) with the same hotspots. Without JavaScript,
the `<noscript>` photo is shown instead.

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
