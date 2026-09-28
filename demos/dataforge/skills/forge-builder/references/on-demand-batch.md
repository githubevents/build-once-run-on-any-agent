# Batch Processing

Loaded on demand when the user requests metrics for multiple tools (e.g., "build metrics for Incident, Release, and Escalation").

---

## Rules

1. Process one tool at a time, completing all 7 phases before starting the next
2. Each tool gets its own memory store file (separate `build_id`)
3. Do not interleave phases across tools (e.g., do not generate all schemas first, then all pipelines)
4. At each tool boundary, present a progress summary: tools completed, tools remaining
