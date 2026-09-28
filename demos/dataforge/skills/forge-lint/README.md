# Forge Lint

forge-lint is rules-as-a-skill: the standards enforcer in dataforge.
It holds the naming, formatting, and safety rules that a pipeline change in a manifest-driven metric store has to satisfy, and it grades a change against them.
Without it, those rules would live only in a person's head or in scattered examples, duplicated into every generator, and each new pipeline edit would risk drifting from the conventions the rest of the store depends on.

## Getting it

forge-lint ships as part of dataforge:

```bash
git clone https://github.com/OWNER/dataforge.git
cd dataforge && node scripts/package.mjs
```

See the [repository README](../../README.md) for how to point Claude Code, Cursor, or GitHub Copilot at the generated packages.

Once installed, forge-lint mostly runs itself.
Its description tells the agent to read it before touching any pipeline code, SQL, schema, or job configuration file. Most of the time you never call it directly: editing a pipeline file is enough to bring it in.
You can also ask for it by name when you want the rules applied to something you already wrote or are reviewing:

```text
check this pipeline file against forge-lint standards
```

## What to expect

forge-lint reads the resolved dataforge manifest (`assets/dataforge.manifest.resolved.yaml`) first, so every rule it applies (naming, catalog patterns, engine configuration keys) is scoped to your project rather than hardcoded.
From there it works through a checklist covering:

- Naming and casing for columns, metrics, and CTEs
- SQL formatting (leading commas, `GROUP BY ALL`, `TO_DATE()`)
- Blocking comment-safety rules for f-string SQL (no `/* */`, no `#`, no `;`, no `{variable}` in `--` comments)
- Catalog zone suffixes and standard engine configuration keys across job configs
- ALTER script lifecycle (MODIFIED vs. EXECUTED) and `ALTER_LOG.md` upkeep
- Upstream and downstream impact of the change, including a debug pass over the edited code

It is a reference the agent applies while editing, not a separate tool: it does not run as a standalone check and does not produce a report file of its own.
Expect it to flag non-compliant code inline and to fix naming and formatting issues as it finds them, while blocking items (like the comment-safety rules or a same-day ALTER execution) stop the change until resolved.

## Related skills

- [`forge-init`](../forge-init/) generates the resolved manifest forge-lint reads on entry.
- [`forge-dbx`](../forge-dbx/) and [`forge-builder`](../forge-builder/) sit alongside it in the engineering track; forge-lint is the rule set the others' code changes still have to pass.
