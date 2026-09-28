# GitHub Issue Intake Reference

Phase 1 and Phase 7 reference for `gh` CLI patterns, spec challenge templates, and issue lifecycle management. All project-specific values are resolved from the manifest.

## Prerequisites

All issue operations use the `gh` CLI. Confirm it is authenticated before the first call:

```bash
gh auth status
```

If `gh` is not authenticated, stop and ask the user to run `gh auth login`. Do not fall back to unauthenticated API calls.

## Constants

| Key | Source |
| :--- | :--- |
| Repository | `manifest.project.repository`, or the current repo when unset |

When `manifest.project.repository` is null, every command below omits `--repo` and operates on the repository in the working directory.

---

## Command Patterns

### 1. Retrieve Issue

```bash
gh issue view <NUMBER> --json number,title,body,state,author,assignees,labels,comments
```

Response fields used: `title`, `body`, `state`, `author.login`, `assignees`, `labels`, `comments`.

### 2. Add Comment

```bash
gh issue comment <NUMBER> --body-file <PATH>
```

Always use `--body-file`, never inline `--body`. Multi-line markdown bodies are mangled by PowerShell quoting rules when passed inline.

### 3. Create Issue

```bash
gh issue create --title "<title>" --body-file <PATH> --label metric-build
```

`gh` fails the whole command when a label does not already exist in the
repository, rather than creating it. Confirm the label with `gh label list`
first; if it is absent, either create it with `gh label create <name>` or omit
`--label` entirely. Do not let a missing label abort intake.

Capture the URL from stdout and record it in the memory store.

### 4. Create a Task List

GitHub has no sub-task issue type. Represent sub-tasks as a markdown task list in the issue body, or as separate issues referenced from the parent:

```bash
gh issue create --title "<title>" --body-file <PATH>
gh issue comment <PARENT_NUMBER> --body "Tracking: #<CHILD_NUMBER>"
```

### 5. Link the Pull Request

Include `Closes #<NUMBER>` in the PR body to link and auto-close on merge. No separate link call is required.

### 6. Close the Issue

```bash
gh issue close <NUMBER> --comment "<completion note>"
```

To reopen after a failed deployment, use `gh issue reopen <NUMBER>`.

### 7. Search for Duplicate Issues

```bash
gh issue list --search "<tool_name> metric in:title" --state all --limit 10 --json number,title,state
```

---

## Minimum Metric Spec (7-Element Checklist)

Every metric build requires these elements. Score each as PRESENT, PARTIAL, or MISSING.

| # | Element | Critical? | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Tool Name | YES | Tool this metric belongs to | "incident", "release" |
| 2 | Metric Name(s) | YES | Explicit names or clear descriptions | "total_incident_create_count" |
| 3 | Business Definition | No | Plain-language what and why | "Total incidents opened..." |
| 4 | Source Table(s) | YES | Upstream table or data description | "incidents in service_delivery" |
| 5 | Entity ID Column | No | Unique entity column for COUNT DISTINCT | "incident_id" |
| 6 | Verb / Action | No | create, update, close, assign, etc. | "create" |
| 7 | Filter Conditions | No | Business rules for inclusion/exclusion | "Excludes archived" |

### Scoring Rules

- **Spec sufficient**: All 3 critical elements PRESENT, and agent can data-default the rest. Proceed to Phase 2.
- **Spec insufficient**: Any critical element MISSING, or 3+ total elements MISSING. Post the Spec Challenge Comment. STOP.

### Non-critical element defaults when MISSING

| Element | Default Behavior |
| :--- | :--- |
| Business Definition | Agent writes one based on metric name pattern |
| Entity ID Column | Discovered in Phase 2 via schema inspection |
| Verb / Action | Inferred from metric name (`_create_` -> create, `_update_` -> update) |
| Filter Conditions | None applied (no exclusions) |

---

## Spec Challenge Comment Template

Write the body to a temporary file and post it with `gh issue comment <NUMBER> --body-file <PATH>`. The agent fills in the `{...}` placeholders.

The fill-in template section uses indented text (4 spaces) to avoid nested code fence issues in markdown rendering.

```
## Metric Build Spec -- Information Needed

This issue has been picked up for metric implementation. However, several required specification elements are missing or incomplete. Please provide the following before engineering work can begin.

### Missing Information

| # | Element | Status | What We Need |
| :--- | :--- | :--- | :--- |
| 1 | Tool Name | {PRESENT/MISSING} | {detail or "Provided"} |
| 2 | Metric Name(s) | {PRESENT/MISSING} | {detail or "Provided"} |
| 3 | Business Definition | {PRESENT/MISSING} | {detail or "Provided"} |
| 4 | Source Table(s) | {PRESENT/MISSING} | {detail or "Provided"} |
| 5 | Entity ID Column | {PRESENT/MISSING} | {detail or "Provided"} |
| 6 | Verb / Action | {PRESENT/MISSING} | {detail or "Provided"} |
| 7 | Filter Conditions | {PRESENT/MISSING} | {detail or "Provided"} |

### Reference: Similar Metrics Already Built

For context, here are existing metrics for {tool_name}:
- {metric_name_1}: {definition_1}
- {metric_name_2}: {definition_2}

### Template (copy, fill, and paste as a comment)

    Tool Name:
    Metric Name(s):
    Business Definition:
    Source Table(s):
    Entity ID Column:
    Verb(s):
    Filter Conditions:

cc: @{author_login}
```

### Populating the Template

1. **Missing Information table**: Fill each row from the 7-element checklist evaluation
2. **Reference section**: Read existing pipeline files for the tool under `manifest.domains` and extract 2-3 metric aliases as examples
3. **Author @-mention**: Use `author.login` from the `gh issue view --json` response

---

## Issue Lifecycle Management (Phase 7)

### Progress Comment (after engineering complete)

```
## Metric Build -- Progress Update

Engineering work is complete for the following metrics:

### Artifacts Built
| File Type | Path | Metrics |
| :--- | :--- | :--- |
| Daily Pipeline | `{path}` | {metric_list} |
| Cumulative Pipeline | `{path}` | {metric_list} |
| Schema SQL | `{path}` | {N} files |
| ALTER Scripts | `{path}` | {N} files |
| Test SQL | `{path}` | {N} files |

### Next Steps
- [ ] PR created: {PR_URL}
- [ ] Schema change deployment ({zone_list from manifest.platform.deployment_order})
- [ ] Pipeline load execution
```

### Deployment Summary Comment (after deployment)

```
## Metric Build -- Deployment Complete

| Zone | Schema Change | Pipeline Load | Status |
| :--- | :--- | :--- | :--- |
{zone_rows from manifest.platform.deployment_order}

PR: {PR_URL}
Branch: `{branch_name}`
```

Zone rows are generated dynamically from `manifest.platform.deployment_order`.

### Follow-up Issues

When deployment work needs to be tracked separately, open one issue per item and reference the parent:

| Issue Title | Description |
| :--- | :--- |
| Schema Change -- {tool_name} -- {zone} | Deploy ALTER scripts to {zone} |
| Pipeline Load -- {tool_name} -- {zone} | Execute load for date range |
| PR Review -- {tool_name} | Code review and merge |
