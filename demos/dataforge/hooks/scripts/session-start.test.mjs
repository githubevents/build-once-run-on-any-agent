/**
 * Unit tests for session-start.mjs and session-start-cc.mjs hook behavior.
 *
 * Tests run in isolated temp workspaces with synthetic manifest files.
 * No external systems or credentials are required.
 *
 * Run: node hooks/scripts/session-start.test.mjs
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CURSOR_HOOK = fileURLToPath(new URL("session-start.mjs", import.meta.url));
const CLAUDE_HOOK = fileURLToPath(
  new URL("session-start-cc.mjs", import.meta.url)
);
const TMP_BASE = mkdtempSync(join(tmpdir(), "dataforge-hook-test-"));

// ---------------------------------------------------------------------------
// Helper: run the hook with a given synthetic workspace and env overrides
// ---------------------------------------------------------------------------
function runHook(workspaceDir, env = {}, hookPath = CURSOR_HOOK) {
  try {
    const output = execFileSync(process.execPath, [hookPath], {
      cwd: workspaceDir,
      env: { ...process.env, ...env },
      timeout: 10_000,
    });
    return { exitCode: 0, stdout: output.toString("utf8").trim() };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? Buffer.alloc(0)).toString("utf8").trim(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: compute the cache file path for a workspace (mirrors hook logic)
// ---------------------------------------------------------------------------
function cacheFileFor(workspaceDir) {
  const hash = createHash("sha256")
    .update(workspaceDir)
    .digest("hex")
    .slice(0, 12);
  return join(tmpdir(), "dataforge-hook-cache", `session-start-${hash}.json`);
}

// ---------------------------------------------------------------------------
// Test scaffold
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function createWorkspace(name) {
  const dir = join(TMP_BASE, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function placeSeed(workspaceDir) {
  writeFileSync(join(workspaceDir, "dataforge.manifest.yaml"), "skill_version: '0.4.4'\n", { encoding: "utf8", mode: 0o600 });
}

function placeResolved(workspaceDir) {
  writeFileSync(
    join(workspaceDir, "dataforge.manifest.resolved.yaml"),
    "skill_version: '0.4.4'\n",
    { encoding: "utf8", mode: 0o600 }
  );
}

function deleteCacheFor(workspaceDir) {
  const cacheFile = cacheFileFor(workspaceDir);
  if (existsSync(cacheFile)) rmSync(cacheFile);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nDataforge session-start hook tests\n");

// Test 1: No manifest present — exits silently, no output
{
  console.log("Test 1: No manifest present");
  const ws = createWorkspace("no-manifest");
  deleteCacheFor(ws);
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert("produces no output", result.stdout === "", `stdout="${result.stdout}"`);
}

// Test 2: Seed only — emits unresolved warning once
{
  console.log("Test 2: Seed only");
  const ws = createWorkspace("seed-only");
  deleteCacheFor(ws);
  placeSeed(ws);
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert("emits additional_context JSON", result.stdout.startsWith('{"additional_context":'), `stdout="${result.stdout}"`);
  assert(
    "warns about missing resolved manifest",
    result.stdout.includes("forge-init"),
    `stdout="${result.stdout}"`
  );
}

// Test 3: Seed + resolved — emits ready message once
{
  console.log("Test 3: Seed plus resolved");
  const ws = createWorkspace("seed-plus-resolved");
  deleteCacheFor(ws);
  placeSeed(ws);
  placeResolved(ws);
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert("emits additional_context JSON", result.stdout.startsWith('{"additional_context":'), `stdout="${result.stdout}"`);
  assert(
    "reports resolved manifest present",
    result.stdout.includes("resolved manifest is present"),
    `stdout="${result.stdout}"`
  );
}

// Test 4: Second run same day — exits silently (cache hit)
{
  console.log("Test 4: Second run same day exits silently");
  const ws = createWorkspace("second-run");
  deleteCacheFor(ws);
  placeSeed(ws);
  // First run (with force to write cache regardless of prior state)
  runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  // Second run without force — should hit today's cache
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "0" });
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert("produces no output (cache hit)", result.stdout === "", `stdout="${result.stdout}"`);
}

// Test 5: DATAFORGE_HOOK_FORCE=1 bypasses cache
{
  console.log("Test 5: DATAFORGE_HOOK_FORCE=1 bypasses cache");
  const ws = createWorkspace("force-bypass");
  deleteCacheFor(ws);
  placeSeed(ws);
  // First run to populate cache
  runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  // Force run — should emit despite cached date
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" });
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert("emits output despite cache", result.stdout.startsWith('{"additional_context":'), `stdout="${result.stdout}"`);
}

// Test 6: Claude Code hook emits plain text for unresolved manifests
{
  console.log("Test 6: Claude hook with seed only");
  const ws = createWorkspace("claude-seed-only");
  deleteCacheFor(ws);
  placeSeed(ws);
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" }, CLAUDE_HOOK);
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert(
    "emits plain text",
    !result.stdout.startsWith('{"additional_context":'),
    `stdout="${result.stdout}"`
  );
  assert(
    "warns about missing resolved manifest",
    result.stdout.includes("forge-init"),
    `stdout="${result.stdout}"`
  );
}

// Test 7: Claude Code hook emits ready message for resolved manifests
{
  console.log("Test 7: Claude hook with seed plus resolved");
  const ws = createWorkspace("claude-seed-plus-resolved");
  deleteCacheFor(ws);
  placeSeed(ws);
  placeResolved(ws);
  const result = runHook(ws, { DATAFORGE_HOOK_FORCE: "1" }, CLAUDE_HOOK);
  assert("exits with code 0", result.exitCode === 0, `code=${result.exitCode}`);
  assert(
    "reports resolved manifest present",
    result.stdout.includes("resolved manifest is present"),
    `stdout="${result.stdout}"`
  );
}

// ---------------------------------------------------------------------------
// Cleanup and summary
// ---------------------------------------------------------------------------
try {
  rmSync(TMP_BASE, { recursive: true, force: true });
} catch {
  // Non-fatal cleanup failure
}

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
