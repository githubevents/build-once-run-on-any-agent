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

The desk lives in `site/desk/`: the original sharp photo (`assets/decal.jpg`),
aligned SVG hotspots, and a small script for the two panels. No 3D assets,
renderer, or fallback are needed. Links and panels also work without JavaScript.
All site URLs are relative so Pages project subpaths work; old `flat/` links
redirect to the same desk.

Desktop and landscape cover the viewport without stretching the photo.
Portrait fits every hotspot and both nameplates across the available width,
preserving the photo's aspect ratio against the page background. Click, tap,
or use Tab and Enter to open a hotspot.

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
