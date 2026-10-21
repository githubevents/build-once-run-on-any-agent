import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite, deckLinks, escapeHtml } from "./build-site.mjs";

test("missing deck shows no broken slide or download links", () => {
  assert.equal(deckLinks({ pdf: false, pptx: false }), '<p class="muted">Slides coming soon.</p>');
});

test("deck links work under a GitHub Pages project subpath", () => {
  const links = deckLinks({ pdf: true, pptx: true });
  assert.match(links, /href="talk.html"/);
  assert.match(links, /href="slides\/talk.pdf"/);
  assert.match(links, /href="slides\/talk.pptx"/);
  assert.doesNotMatch(links, /href="\//);
});

test("PDF-only deck does not advertise missing PowerPoint", () => {
  assert.doesNotMatch(deckLinks({ pdf: true, pptx: false }), /pptx/);
});

test("slide text is escaped before use in HTML attributes", () => {
  assert.equal(escapeHtml('<script x="a&b">\'</script>'),
    "&lt;script x=&quot;a&amp;b&quot;&gt;&#39;&lt;/script&gt;");
});

test("no-deck build includes public assets only and clears stale slides", async (t) => {
  const fixture = await mkdtemp(path.join(tmpdir(), "talk-build-test-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = path.join(fixture, "source");
  const output = path.join(fixture, "output");
  await cp(new URL("../site/", import.meta.url), path.join(source, "site"), { recursive: true });
  await mkdir(path.join(source, "assets/recordings"), { recursive: true });
  for (const name of ["Dataforge.mp4", "proof-agent-narrated.mp4"]) {
    await writeFile(path.join(source, "assets/recordings", name), "media fixture");
  }
  await writeFile(path.join(source, "private.txt"), "not a public asset");
  await mkdir(output);
  await writeFile(path.join(output, "talk.html"), "stale deck");
  await buildSite({ source, output });
  const files = await readdir(output);
  assert.ok(!files.includes("private.txt"));
  assert.ok(!files.includes("talk.html"));
  assert.ok(files.includes("proof-agent.jpg"));
  const html = await readFile(path.join(output, "index.html"), "utf8");
  assert.match(html, /Slides coming soon/);
  assert.doesNotMatch(html, /<!-- DECK_LINKS -->/);
  assert.equal((html.match(/<video /g) ?? []).length, 2);
  assert.equal(await readFile(path.join(output, "assets/recordings/Dataforge.mp4"), "utf8"), "media fixture");
  assert.ok(files.includes("app.js"));
  assert.ok(files.includes("chunks"));
  assert.ok((await readFile(path.join(output, "app.js"))).length < 10000,
    "Flat fallback detection must not download the 3D renderer");
  assert.ok(!files.includes("src"));
  assert.ok((await readFile(path.join(output, "assets/desk-500k.spz"))).length > 0);
  assert.ok((await readFile(path.join(output, "assets/desk-150k.spz"))).length > 0);
  const flat = await readFile(path.join(output, "flat/index.html"), "utf8");
  for (const page of [html, flat]) {
    for (const url of [
      "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/slides",
      "https://github.com/githubevents/build-once-run-on-any-agent",
      "https://www.youtube.com/playlist?list=PL0lo9MOBetEFHlePrJbm4e5XJV-_NSfgW",
      "https://x.com/acolombiadev",
      "https://www.linkedin.com/in/shishir-tewari-36113514/",
      "https://www.procore.com/",
      "https://github.com/githubevents/build-once-run-on-any-agent/blob/main/README.md",
      "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/demos/proof-agent",
      "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/demos/proof-review",
      "https://github.com/githubevents/build-once-run-on-any-agent/blob/main/demos/dataforge/examples/support-desk/DEMO.md",
    ]) assert.ok(page.includes(`href="${url}"`), `Missing link ${url}`);
    assert.match(page, /href="#survey"[^>]*data-placeholder="survey"|data-placeholder="survey"[^>]*href="#survey"/);
    assert.doesNotMatch(page, /(?:href|src)="\//);
    assert.doesNotMatch(page, /<!-- DECK_LINKS -->/);
    assert.equal((page.match(/<video /g) ?? []).length, 2);
  }
  assert.match(flat, /src="\.\.\/assets\/recordings\/Dataforge.mp4"/);
  assert.match(flat, /href="#dialog-demos"/);
  for (const id of ["screen", "base", "notebook", "code", "phone", "andrea", "shishir"]) {
    assert.match(await readFile(path.join(output, "assets", `decal-mask-${id}.svg`), "utf8"), /<svg /);
  }
});
