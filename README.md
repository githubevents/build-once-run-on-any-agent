# Build once, run on any agent: a practical guide to agent skills

GitHub Universe 2026 · BLD1787B

A practical guide to agent skills, with the talk, demos, and code in one place.

## Speakers

- Andrea Griffiths — Senior Developer Advocate, GitHub
- Shishir Tewari — Senior Manager, Data Engineering, Procore

## Description

Most developers use AI the same way: open a chat, type a prompt, move on. The context disappears. The next step starts from scratch. Andrea Griffiths builds them for her own recurring work: files any coding agent can run. Shishir Tewari builds them for a data engineering team at Procore, where a skill has to encode senior-engineer judgment and survive production. Different scale, same format. The file you write for yourself tonight is the same file that runs a team’s pipeline.

You will leave with a clear model for when to build a skill instead of writing another prompt.

## Repository layout

- demos/ — Demo code and walkthroughs.
- slides/ — Presentation materials.
- assets/ — Images, diagrams, and recordings.
- resources/ — Supporting links and examples.
- site/ — Talk website and Reveal.js viewer.

## Demos

- [proof-agent](demos/proof-agent/): Andrea's independent verifier skill and
  GitHub Action, pinned to the demo's `v1.1.2`.
  Canonical repository: [AndreaGriffiths11/proof-agent](https://github.com/AndreaGriffiths11/proof-agent).
  Recording: [narrated demo](assets/recordings/proof-agent-narrated.mp4) (3:52).
- [proof-review](demos/proof-review/): Andrea's skill for verifying bugfix PRs
  under production-shaped load, with a Node.js load harness and report template.
  Canonical repository: [AndreaGriffiths11/proof-review](https://github.com/AndreaGriffiths11/proof-review).
- [dataforge](demos/dataforge/) — Shishir's four agent skills that build data
  pipelines from a project manifest, issue to pull request.
  Canonical repository: [tewarishishir/dataforge](https://github.com/tewarishishir/dataforge).
  Recording: [assets/recordings/Dataforge.mp4](assets/recordings/Dataforge.mp4).

Materials are in progress.

## Talk website

This repository builds a static Reveal.js website for GitHub Pages. The landing
page leads with the talk, followed by the two demo recordings and skill links.
Until the deck arrives, it shows "Slides coming soon."

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. Requires Node.js 22 or later.

### Add the deck

Save the finished presentation as `slides/talk.pptx`. The build converts it to
PDF with LibreOffice, renders slide images with Poppler, and creates a Reveal.js
viewer with keyboard navigation, slide links, and fullscreen (`F`).

For the closest match to PowerPoint, also export `slides/talk.pdf` from
PowerPoint. The build prefers that PDF over automatic conversion. Refresh the
PDF whenever you change the deck, or remove it to use automatic conversion.
PDF-only input works too.

Local deck builds need `soffice`, `pdftoppm`, and `pdftotext` on `PATH`.
The Pages workflow installs these automatically. Slides are static images:
PowerPoint animations, transitions, and embedded media do not carry over.
Review fonts and layout after conversion. Extracted PDF text supplies image
descriptions; review those for accessibility as well.

Both supplied deck files become public downloads. Remove private speaker notes,
comments, and hidden slides before adding the PowerPoint.

### Publish from this repository

In **Settings > Pages > Build and deployment**, select **GitHub Actions**.
After the changes reach `main`, `.github/workflows/pages.yml` builds and deploys
only `dist/`. Pull requests build the site without publishing it.

Expected address after deployment:
`https://githubevents.github.io/build-once-run-on-any-agent/`.
The site needs no Express server or separate repository.
