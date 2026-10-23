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
  assert.ok(!files.includes("src"));
  assert.ok(!files.includes("chunks"));
  assert.deepEqual((await readdir(path.join(output, "assets"))).sort(),
    ["decal.jpg", "fonts", "recordings"]);
  assert.deepEqual(await readFile(path.join(output, "assets/decal.jpg")),
    await readFile(path.join(source, "site/desk/assets/decal.jpg")));
  assert.match(html, /<img [^>]*src="assets\/decal.jpg"[^>]*width="1280" height="720"/);
  assert.match(html, /<noscript><img [^>]*src="assets\/decal.jpg"/);
  assert.match(html, /<canvas id="scene" aria-hidden="true">/);
  assert.match(html, /<script type="module" src="desk3d.js">/);
  const importmap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(importmap.imports, { three: "./vendor/three/three.module.js", "three/addons/": "./vendor/three/addons/" });
  for (const file of ["desk3d.js", "parts.js", "textures.js", "screens.js"]) assert.ok(files.includes(file), `Missing ${file}`);
  for (const file of ["three.module.js", "three.core.js", "LICENSE", "addons/controls/OrbitControls.js",
    "addons/environments/RoomEnvironment.js", "addons/geometries/RoundedBoxGeometry.js"]) {
    await readFile(path.join(output, "vendor/three", file));
  }
  assert.doesNotMatch(html, /spark|\.spz/i);
  assert.deepEqual([...html.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]),
    ["laptop", "ideas", "slides", "code", "phone", "headphones", "andrea", "shishir", "procore", "github"]);
  for (const panel of ["demos", "about"]) {
    assert.ok(html.includes(`href="#dialog-${panel}"`));
    assert.ok(html.includes(`<dialog class="panel" id="dialog-${panel}"`));
  }
  const flat = await readFile(path.join(output, "flat/index.html"), "utf8");
  assert.match(flat, /http-equiv="refresh" content="0;url=\.\.\/"/);
  for (const url of [
    "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/slides",
    "https://github.com/githubevents/build-once-run-on-any-agent",
    "https://www.youtube.com/watch?v=ZQ0Qq6LlAmI",
    "https://music.youtube.com/watch?v=Frti3HfdNLw",
    "https://x.com/acolombiadev",
    "https://www.linkedin.com/in/shishir-tewari-36113514/",
    "https://www.procore.com/",
    "https://gh.io/sessionsurvey",
    "https://github.com/githubevents/build-once-run-on-any-agent/blob/main/README.md",
    "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/demos/proof-agent",
    "https://github.com/githubevents/build-once-run-on-any-agent/tree/main/demos/proof-review",
    "https://github.com/githubevents/build-once-run-on-any-agent/blob/main/demos/dataforge/examples/support-desk/DEMO.md",
  ]) assert.ok(html.includes(`href="${url}"`), `Missing link ${url}`);
  assert.doesNotMatch(html, /(?:href|src)="\//);
});
