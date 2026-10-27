#!/usr/bin/env node
/**
 * Dataforge session-start hook — cross-platform daily cache.
 *
 * Behavior:
 *  - Works on Windows, macOS, and Linux (no bash required).
 *  - Checks whether dataforge.manifest.yaml and/or
 *    dataforge.manifest.resolved.yaml exist in well-known candidate paths.
 *  - Emits one additional_context message at most once per local calendar day
 *    per workspace (keyed by a hash of the workspace root).
 *  - Exits silently when already notified today.
 *  - Supports DATAFORGE_HOOK_FORCE=1 to bypass the cache for troubleshooting.
 *  - Never reads manifest contents.
 *  - Never runs forge-init.
 *  - Never refreshes the manifest (that is /forge-init's job).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Resolve workspace root from CWD (Cursor sets CWD to workspace root for hooks)
// ---------------------------------------------------------------------------
const workspaceRoot = process.cwd();

// ---------------------------------------------------------------------------
// Daily cache — keyed by workspace path so each project is tracked separately
// ---------------------------------------------------------------------------
const workspaceHash = createHash("sha256")
  .update(workspaceRoot)
  .digest("hex")
  .slice(0, 12);
const cacheDir = join(tmpdir(), "dataforge-hook-cache");
const cacheFile = join(cacheDir, `session-start-${workspaceHash}.json`);
const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const forceRun = process.env.DATAFORGE_HOOK_FORCE === "1";

if (!forceRun) {
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (cache.date === today) {
        // Already emitted today — exit silently.
        process.exit(0);
      }
    } catch {
      // Corrupt cache file — proceed and overwrite.
    }
  }
}

// ---------------------------------------------------------------------------
// Probe manifest existence (no reads of contents)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Emit context message
// ---------------------------------------------------------------------------
if (!hasSeed) {
  // No manifest at all — skip silently; user has not set up dataforge.
  process.exit(0);
}

let message;
if (!hasResolved) {
  message =
    "⚠️  Dataforge: seed manifest found but resolved manifest is missing. " +
    "Run /forge-init to generate the resolved manifest before using dataforge skills.";
} else {
  message =
    "✅ Dataforge: resolved manifest is present. " +
    "Use /forge-* commands to run dataforge skills. " +
    "Run /forge-init to refresh the manifest if source schemas have changed.";
}

// Cursor hook additional_context format
console.log(JSON.stringify({ additional_context: message }));

// ---------------------------------------------------------------------------
// Write daily cache
// ---------------------------------------------------------------------------
try {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(cacheFile, JSON.stringify({ date: today, workspace: workspaceRoot }), { encoding: "utf8", mode: 0o600 });
} catch {
  // Cache write failures are non-fatal; hook output already succeeded.
}
