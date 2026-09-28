#!/usr/bin/env node
/**
 * Dataforge Claude Code SessionStart hook.
 *
 * Matches the seed/resolved-manifest detection from session-start.mjs but emits
 * plain text because Claude Code injects stdout into session context directly.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = process.cwd();

const workspaceHash = createHash("sha256")
  .update(workspaceRoot)
  .digest("hex")
  .slice(0, 12);
const cacheDir = join(tmpdir(), "dataforge-hook-cache");
const cacheFile = join(cacheDir, `session-start-${workspaceHash}.json`);
const today = new Date().toLocaleDateString("en-CA");
const forceRun = process.env.DATAFORGE_HOOK_FORCE === "1";

if (!forceRun) {
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (cache.date === today) {
        process.exit(0);
      }
    } catch {
      // Corrupt cache file — proceed and overwrite.
    }
  }
}

const candidatePaths = [
  join(workspaceRoot, "assets", "dataforge.manifest.yaml"),
  join(workspaceRoot, "dataforge.manifest.yaml"),
];
const resolvedPaths = [
  join(workspaceRoot, "assets", "dataforge.manifest.resolved.yaml"),
  join(workspaceRoot, "dataforge.manifest.resolved.yaml"),
];

const hasSeed = candidatePaths.some(existsSync);
const hasResolved = resolvedPaths.some(existsSync);

if (!hasSeed) {
  process.exit(0);
}

let message;
if (!hasResolved) {
  message =
    "Dataforge: seed manifest found but resolved manifest is missing. " +
    "Run /forge-init to generate the resolved manifest before using dataforge skills.";
} else {
  message =
    "Dataforge: resolved manifest is present. " +
    "Use /forge-* commands to run dataforge skills. " +
    "Run /forge-init to refresh the manifest if source schemas have changed.";
}

console.log(message);

try {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(
    cacheFile,
    JSON.stringify({ date: today, workspace: workspaceRoot }),
    { encoding: "utf8", mode: 0o600 }
  );
} catch {
  // Cache write failures are non-fatal; hook output already succeeded.
}
