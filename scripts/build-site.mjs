import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const recordings = ["proof-agent-narrated.mp4", "Dataforge.mp4"];

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function deckLinks({ pdf, pptx }) {
  if (!pdf) return '<p class="muted">Slides coming soon.</p>';
  return `<div class="deck-links">
    <a class="primary" href="talk.html">View the slides</a>
    <a href="slides/talk.pdf">Download PDF</a>
    ${pptx ? '<a href="slides/talk.pptx">Download PowerPoint</a>' : ""}
  </div>`;
}

export async function buildSite({ source = root, output = path.join(root, "dist") } = {}) {
  if (path.resolve(output) === path.resolve(source)) {
    throw new Error("Build output must not replace the source directory.");
  }
  const pptx = path.join(source, "slides/talk.pptx");
  const suppliedPdf = path.join(source, "slides/talk.pdf");
  const hasPptx = existsSync(pptx);
  const hasDeck = hasPptx || existsSync(suppliedPdf);
  const temporary = await mkdtemp(path.join(tmpdir(), "agent-talk-"));
  try {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    for (const file of ["theme.css", "site.css", "proof-agent.jpg", "dataforge.jpg"]) {
      await cp(path.join(source, "site", file), path.join(output, file));
    }
    for (const file of ["index.html", "styles.css", "assets", "flat"]) {
      await cp(path.join(source, "site/desk", file), path.join(output, file), { recursive: true });
    }
    await build({
      entryPoints: { app: path.join(source, "site/desk/src/bootstrap.js") },
      outdir: output,
      splitting: true,
      chunkNames: "chunks/[name]-[hash]",
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2022",
      legalComments: "linked",
      nodePaths: [path.join(root, "node_modules")],
    });
    await mkdir(path.join(output, "assets/recordings"), { recursive: true });
    for (const file of recordings) {
      await cp(path.join(source, "assets/recordings", file), path.join(output, "assets/recordings", file));
    }
    let index = await readFile(path.join(output, "index.html"), "utf8");
    index = index.replace("<!-- DECK_LINKS -->", deckLinks({ pdf: hasDeck, pptx: hasPptx }));
    await writeFile(path.join(output, "index.html"), index);
    const flatPath = path.join(output, "flat/index.html");
    const flat = await readFile(flatPath, "utf8");
    const flatDeckLinks = deckLinks({ pdf: hasDeck, pptx: hasPptx })
      .replaceAll('href="', 'href="../');
    await writeFile(flatPath, flat.replace("<!-- DECK_LINKS -->", flatDeckLinks));
    await writeFile(path.join(output, ".nojekyll"), "");

    if (!hasDeck) {
      console.log("Built talk page. No slides/talk.pptx or slides/talk.pdf yet.");
      return;
    }

    let pdf = suppliedPdf;
    if (!existsSync(pdf)) {
      const profile = pathToFileURL(path.join(temporary, "libreoffice")).href;
      execFileSync("soffice", [
        `-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf",
        "--outdir", temporary, pptx,
      ], { stdio: "inherit", timeout: 120_000 });
      pdf = path.join(temporary, "talk.pdf");
      if (!existsSync(pdf)) throw new Error("LibreOffice did not produce talk.pdf.");
    }

    const slideDir = path.join(output, "slides");
    await mkdir(slideDir);
    await cp(pdf, path.join(slideDir, "talk.pdf"));
    if (hasPptx) await cp(pptx, path.join(slideDir, "talk.pptx"));
    execFileSync("pdftoppm", [
      "-png", "-scale-to", "1920", pdf, path.join(slideDir, "slide"),
    ], { stdio: "inherit", timeout: 300_000 });
    const text = execFileSync("pdftotext", ["-layout", pdf, "-"], {
      encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
    }).split("\f");
    const images = (await readdir(slideDir)).filter((name) => /^slide-\d+\.png$/.test(name))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    if (!images.length) throw new Error("Slide conversion produced no images.");
    const sections = images.map((name, index) => {
      const description = text[index]?.replace(/\s+/g, " ").trim() || `Slide ${index + 1}`;
      return `<section aria-label="Slide ${index + 1}"><img data-src="slides/${name}" alt="${escapeHtml(description)}"></section>`;
    }).join("\n");
    const template = await readFile(path.join(source, "site/talk.html"), "utf8");
    await writeFile(path.join(output, "talk.html"), template.replace("<!-- SLIDES -->", sections));
    await cp(path.join(source, "site/talk.css"), path.join(output, "talk.css"));
    const vendor = path.join(output, "vendor/reveal");
    await mkdir(vendor, { recursive: true });
    for (const file of ["reveal.js", "reveal.css"]) {
      await cp(path.join(root, "node_modules/reveal.js/dist", file), path.join(vendor, file));
    }
    await cp(path.join(root, "node_modules/reveal.js/LICENSE"), path.join(vendor, "LICENSE"));
    console.log(`Built talk page and ${images.length} slides.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
}
