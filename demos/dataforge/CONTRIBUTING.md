# Contributing

Outside pull requests are welcome, small ones especially. A typo fix, a
clearer error message, or a new engine adapter all count.

## Using dataforge?

Add yourself via a pull request: one row in [ADOPTERS.md](ADOPTERS.md). It
is the most useful contribution a new user can make.

## Questions and ideas

Ask in [Discussions](https://github.com/tewarishishir/dataforge/discussions)
before writing a large change, so we can agree on the shape first. Bugs go in
[Issues](https://github.com/tewarishishir/dataforge/issues).

## Changing a skill

1. Edit `skills/<name>/SKILL.md` or a file under its `references/`.
2. Do not edit `.github/agents/`, `.claude-plugin/`, or `.cursor-plugin/` by
   hand. Run `node scripts/package.mjs` and commit what it regenerates.
3. Run `scripts/leak_scan.sh`.
4. Update [CHANGELOG.md](CHANGELOG.md) when behavior changes.

The one rule: no catalog, table, domain, or zone name in `skills/` or
`assets/`. A skill that needs one reads it from the resolved manifest.
Example values in documentation come from the support-desk vocabulary only.

[AGENTS.md](AGENTS.md) has the full check list that CI runs, the layout, and
what a new platform engine has to declare.

## License

Contributions are accepted under the [MIT license](LICENSE).
