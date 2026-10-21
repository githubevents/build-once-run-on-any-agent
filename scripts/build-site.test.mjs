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
});
