#!/usr/bin/env node
/**
 * loadharness.mjs - zero-dependency load driver for proof-review.
 * Node 18+ (global fetch). No npm install.
 *
 * Measure a scenario:
 *   node loadharness.mjs run --url http://localhost:3000/proposals \
 *     --concurrency 4,8 --requests 200 --timeout 12000 \
 *     --header "authorization: Bearer X" --json before.json
 *
 * Diff two runs into the report's markdown table:
 *   node loadharness.mjs compare before.json after.json \
 *     --label-b "After review-branch fixes"
 *
 * Rules this tool exists to enforce:
 *   - set --timeout to the REAL client timeout (find it in the consumer's code)
 *   - point --url at the deployed entrypoint, never at in-process imports
 *
 * Concurrency model: warmup runs sequentially, then the full concurrency level
 * hits at once (thundering herd). This is intentional — it's how you surface
 * pool exhaustion and lock contention. Don't add ramp-up.
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    method: { type: "string", default: "GET" },
    header: { type: "string", multiple: true, default: [] },
    body: { type: "string" },
    "body-file": { type: "string" },
    concurrency: { type: "string", default: "4" },
    requests: { type: "string", default: "100" },
    timeout: { type: "string", default: "12000" },
    warmup: { type: "string", default: "5" },
    json: { type: "string" },
    "label-a": { type: "string", default: "Before" },
    "label-b": { type: "string", default: "After review-branch fixes" },
  },
});

const mode = positionals[0] ?? "run";

// ---------- formatting ----------
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
const fmtBytes = (b) => {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)}MB`;
  if (b >= 1024) return `${Math.round(b / 1024)}KB`;
  return `${Math.round(b)}B`;
};
const fmtFail = (failures, total) =>
  failures === 0 ? "0 errors" : `${((failures / total) * 100).toFixed(1)}% failures`;

const percentile = (sortedAsc, p) => {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.min(idx, sortedAsc.length - 1)];
};

// ---------- single request ----------
async function one(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const buf = await res.arrayBuffer();
    const ms = performance.now() - start;
    return { ms, bytes: buf.byteLength, ok: res.ok, kind: res.ok ? "ok" : `http_${res.status}` };
  } catch (err) {
    const ms = performance.now() - start;
    const aborted = err.name === "AbortError" || err.name === "TimeoutError";
    const kind = aborted ? `timeout_${timeoutMs}ms` : `net_${err.cause?.code ?? err.name}`;
    return { ms, bytes: 0, ok: false, kind };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- one concurrency level ----------
async function runLevel(url, init, timeoutMs, concurrency, total) {
  const results = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      results.push(await one(url, init, timeoutMs));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const failures = results.filter((r) => !r.ok);
  const okBytes = results.filter((r) => r.ok).map((r) => r.bytes);
  const breakdown = {};
  for (const f of failures) breakdown[f.kind] = (breakdown[f.kind] ?? 0) + 1;

  return {
    concurrency,
    total: results.length,
    failures: failures.length,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    okMeanBytes: okBytes.length ? okBytes.reduce((a, b) => a + b, 0) / okBytes.length : 0,
    okMaxBytes: okBytes.length ? okBytes.reduce((m, n) => (n > m ? n : m), 0) : 0,
    breakdown,
  };
}

// ---------- run mode ----------
async function run() {
  if (!opts.url) usage("run mode requires --url");
  const headers = {};
  for (const h of opts.header) {
    const i = h.indexOf(":");
    if (i === -1) usage(`bad --header (expected "Name: value"): ${h}`);
    headers[h.slice(0, i).trim()] = h.slice(i + 1).trim();
  }
  const body = opts["body-file"] ? readFileSync(opts["body-file"], "utf8") : opts.body;
  const init = { method: opts.method, headers, ...(body ? { body } : {}) };
  const timeoutMs = Number(opts.timeout);
  const perLevel = Number(opts.requests);
  const levels = opts.concurrency.split(",").map((s) => Number(s.trim())).filter(Boolean);
  const scenario = `${opts.method} ${new URL(opts.url).pathname}`;

  for (let i = 0; i < Number(opts.warmup); i++) await one(opts.url, init, timeoutMs);

  const out = { scenario, url: opts.url, method: opts.method, timeoutMs, requestsPerLevel: perLevel, startedAt: new Date().toISOString(), levels: [] };

  for (const c of levels) {
    const lv = await runLevel(opts.url, init, timeoutMs, c, perLevel);
    out.levels.push(lv);
    console.log(
      `concurrency ${c}: ${lv.total} req | ${fmtFail(lv.failures, lv.total)} | ` +
      `p50 ${fmtMs(lv.p50)} p95 ${fmtMs(lv.p95)} p99 ${fmtMs(lv.p99)} | ` +
      `payload mean ${fmtBytes(lv.okMeanBytes)} max ${fmtBytes(lv.okMaxBytes)}`
    );
    if (lv.failures > 0) {
      const parts = Object.entries(lv.breakdown).map(([k, n]) => `${k} x${n}`).join(", ");
      console.log(`  failure breakdown: ${parts}`);
    }
  }

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${opts.json}`);
  }
}

// ---------- compare mode ----------
function compare() {
  const [, aPath, bPath] = positionals;
  if (!aPath || !bPath) usage("compare mode requires two JSON files: compare before.json after.json");
  const a = JSON.parse(readFileSync(aPath, "utf8"));
  const b = JSON.parse(readFileSync(bPath, "utf8"));

  if (a.scenario !== b.scenario) {
    console.error(`warning: scenarios differ (${a.scenario} vs ${b.scenario}) — table rows will use the 'before' scenario label`);
  }

  const rows = [];
  for (const la of a.levels) {
    const lb = b.levels.find((l) => l.concurrency === la.concurrency);
    const before = `${fmtFail(la.failures, la.total)}, p50 ${fmtMs(la.p50)}, p95 ${fmtMs(la.p95)}`;
    const after = lb
      ? `${fmtFail(lb.failures, lb.total)}, p50 ${fmtMs(lb.p50)}, p95 ${fmtMs(lb.p95)}`
      : "(no matching run)";
    rows.push([`${a.scenario}, concurrency ${la.concurrency}`, before, after]);
    if (la.okMeanBytes || lb?.okMeanBytes) {
      rows.push([
        `Payload, concurrency ${la.concurrency}`,
        fmtBytes(la.okMeanBytes),
        lb ? fmtBytes(lb.okMeanBytes) : "(no matching run)",
      ]);
    }
  }

  console.log(`| Scenario (production config) | ${opts["label-a"]} | ${opts["label-b"]} |`);
  console.log(`| --- | --- | --- |`);
  for (const r of rows) console.log(`| ${r[0]} | ${r[1]} | ${r[2]} |`);
}

function usage(err) {
  if (err) console.error(`error: ${err}\n`);
  console.error(
    `usage:\n` +
    `  node loadharness.mjs run --url URL [--method GET] [--header "Name: v"]...\n` +
    `       [--body STR | --body-file PATH] [--concurrency 4,8] [--requests 100]\n` +
    `       [--timeout 12000] [--warmup 5] [--json out.json]\n` +
    `  node loadharness.mjs compare before.json after.json [--label-b "After my fixes"]`
  );
  process.exit(err ? 1 : 0);
}

if (mode === "run") await run();
else if (mode === "compare") compare();
else usage(`unknown mode: ${mode}`);
